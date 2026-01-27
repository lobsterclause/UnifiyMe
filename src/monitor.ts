import { UnifiClient } from './unifi/client.js';
import dotenv from 'dotenv';
import { setTimeout } from 'timers/promises';

dotenv.config();

// Configuration
const POLL_INTERVAL_MS = 60_000;
const CRITICAL_LOAD_THRESHOLD = 4.0;
const CRITICAL_MEM_THRESHOLD_MB = 1800; // ~90% of 2GB
const PENALTY_DURATION_MS = 10 * 60 * 1000; // 10 minutes for throttle
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const BW_THRESHOLD_MBPS = 15; // 15 Mbps spike threshold
const THROTTLE_RATE_KBPS = 2000; // 2 Mbps limit

interface PenaltyRecord {
    mac: string;
    hostname: string;
    unblockTime: number;
    originalGroupId?: string;
    clientId: string;
}

export class UnifiMonitor {
    private client: UnifiClient;
    private penaltyBox: Map<string, PenaltyRecord> = new Map();
    private throttledGroupId: string | null = null;
    private defaultGroupId: string | null = null;

    constructor(client?: UnifiClient) {
        this.client = client || new UnifiClient(
            process.env.UNIFI_HOST!,
            process.env.UNIFI_USERNAME!,
            process.env.UNIFI_PASSWORD!,
            process.env.UNIFI_SITE || 'default'
        );
    }

    async start() {
        console.log('Starting UniFi Active Mitigation Monitor...');
        
        try {
            await this.client.connect();
        } catch (err) {
            console.error('Initial connection failed (will retry):', err);
        }

        console.log(`Config: Load > ${CRITICAL_LOAD_THRESHOLD}, Mem > ${CRITICAL_MEM_THRESHOLD_MB}MB => Throttle (${PENALTY_DURATION_MS / 60000} mins)`);

        while (true) {
            // Ensure groups are setup if they weren't initially
            if (!this.throttledGroupId) {
                try {
                    await this.setupGroups();
                } catch (err: any) {
                    console.warn('Waiting for Gateway to establish UniFi connection for group setup...');
                }
            }

            let currentInterval = POLL_INTERVAL_MS;
            try {
                const stats = await this.cycle();
                // If load is critical, back off polling to 2 minutes to reduce router stress
                if (stats && (stats.load > CRITICAL_LOAD_THRESHOLD || stats.memUsed > CRITICAL_MEM_THRESHOLD_MB)) {
                    currentInterval = POLL_INTERVAL_MS * 2;
                }
            } catch (err) {
                console.error('Cycle error:', err);
            }
            await setTimeout(currentInterval);
        }
    }

    private async setupGroups() {
        const groups = await this.client.getUserGroups();
        const throttled = groups.find(g => g.name === 'Throttled');
        const defaultGroup = groups.find(g => g.name === 'Default');
        
        if (throttled) {
            this.throttledGroupId = throttled._id;
        } else {
            console.log('Creating "Throttled" user group (2Mbps)...');
            const newGroup = await this.client.createUserGroup('Throttled', THROTTLE_RATE_KBPS, THROTTLE_RATE_KBPS);
            if (newGroup && newGroup[0]) {
                this.throttledGroupId = newGroup[0]._id;
            } else {
                throw new Error('Failed to create or find Throttled group');
            }
        }

        if (defaultGroup) {
            this.defaultGroupId = defaultGroup._id;
        }
    }

    private async cycle(): Promise<{ load: number, memUsed: number } | void> {
        // 1. Manage Penalty Box (Restore original groups)
        const now = Date.now();
        for (const [mac, record] of this.penaltyBox.entries()) {
            if (now >= record.unblockTime) {
                console.log(`Restoring ${record.hostname} (${mac}) to original group...`);
                await this.client.setUserGroup(record.clientId, record.originalGroupId || this.defaultGroupId || '');
                this.penaltyBox.delete(mac);
                await this.notifyDiscord(`✅ **RESTORED** Client **${record.hostname}** (${mac}) speed limits removed.`);
            }
        }

        // 2. Fetch Metrics
        const devices = await this.client.getDevices();
        const udm = devices.find((d: any) => d.model === 'UDM');
        
        let load = 0;
        let memUsed = 0;
        
        if (udm && udm.sys_stats) {
            load = parseFloat(udm.sys_stats.loadavg_1 || '0');
            const rawMem = udm.sys_stats.mem_used;
            memUsed = (typeof rawMem === 'number' ? rawMem : parseInt(rawMem || '0', 10)) / 1024 / 1024;
        }

        console.log(`[Heartbeat] Load: ${load.toFixed(2)} | Mem: ${Math.round(memUsed)} MB | Boxed: ${this.penaltyBox.size}`);

        // 3. Evaluate Critical State
        if (load > CRITICAL_LOAD_THRESHOLD || memUsed > CRITICAL_MEM_THRESHOLD_MB) {
            console.warn('⚠️  CRITICAL SYSTEM STATE DETECTED');
            await this.diagnoseAndMitigate(load, memUsed);
        }

        return { load, memUsed };
    }

    private async diagnoseAndMitigate(load: number, memUsed: number) {
        const clients = await this.client.getClients();
        
        // Diagnostic: Log top 5 bandwidth users with context
        const topClients = [...clients]
            .sort((a, b) => ((b.rx_rate || 0) + (b.tx_rate || 0)) - ((a.rx_rate || 0) + (a.tx_rate || 0)))
            .slice(0, 5);

        console.log('Top bandwidth users during spike:');
        topClients.forEach(c => {
            const rateMbps = (((c.rx_rate || 0) + (c.tx_rate || 0)) / 1024 / 1024 * 8).toFixed(2);
            console.log(`- ${c.name || c.hostname || c.mac} (${c.oui || 'Unknown'}): ${rateMbps} Mbps`);
        });

        // Mitigation: Throttle high bandwidth offenders
        const offenders = clients.filter(c => {
            const rateMbps = (((c.rx_rate || 0) + (c.tx_rate || 0)) / 1024 / 1024 * 8);
            return rateMbps > BW_THRESHOLD_MBPS && !this.penaltyBox.has(c.mac);
        });

        for (const offender of offenders) {
            const rateMbps = (((offender.rx_rate || 0) + (offender.tx_rate || 0)) / 1024 / 1024 * 8).toFixed(2);
            console.log(`Throttling ${offender.name || offender.mac} to 2Mbps due to spike (${rateMbps} Mbps).`);
            await this.enforceThrottle(offender, `High Bandwidth Spike (${rateMbps} Mbps) during Critical Load`);
        }
    }

    private async enforceThrottle(client: any, reason: string) {
        if (!this.throttledGroupId) return;

        const mac = client.mac;
        const name = client.name || client.hostname || mac;
        const originalGroupId = client.usergroup_id || this.defaultGroupId;
        
        try {
            await this.client.setUserGroup(client._id, this.throttledGroupId);
            
            this.penaltyBox.set(mac, {
                mac,
                hostname: name,
                clientId: client._id,
                originalGroupId,
                unblockTime: Date.now() + PENALTY_DURATION_MS
            });
            
            await this.notifyDiscord(`📉 **THROTTLED** Client **${name}** (${mac}) to 2Mbps for 10 mins.\n` +
                `Context: ${client.oui || 'Unknown'} device.\n` +
                `Reason: ${reason}`);
                
        } catch (err) {
            console.error(`Failed to throttle ${mac}:`, err);
        }
    }

    private async notifyDiscord(message: string) {
        if (!DISCORD_WEBHOOK_URL) {
            console.log('[Discord Mock]: ' + message);
            return;
        }
        
        try {
            await fetch(DISCORD_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: message })
            });
        } catch (err) {
            console.error('Discord notification failed:', err);
        }
    }
}

if (import.meta.url.endsWith('src/monitor.ts') || import.meta.url.endsWith('dist/monitor.js')) {
    new UnifiMonitor().start();
}
