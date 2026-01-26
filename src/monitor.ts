import { UnifiClient } from './unifi/client.js';
import dotenv from 'dotenv';
import { setTimeout } from 'timers/promises';

dotenv.config();

// Configuration
const POLL_INTERVAL_MS = 60_000;
const CRITICAL_LOAD_THRESHOLD = 4.0;
const CRITICAL_MEM_THRESHOLD_MB = 1800; // ~90% of 2GB
const PENALTY_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

interface PenaltyRecord {
    mac: string;
    hostname: string;
    unblockTime: number;
}

class UnifiMonitor {
    private client: UnifiClient;
    private penaltyBox: Map<string, PenaltyRecord> = new Map();

    constructor() {
        this.client = new UnifiClient(
            process.env.UNIFI_HOST!,
            process.env.UNIFI_USERNAME!,
            process.env.UNIFI_PASSWORD!,
            process.env.UNIFI_SITE || 'default'
        );
    }

    async start() {
        console.log('Starting UniFi Active Mitigation Monitor...');
        console.log(`Config: Load > ${CRITICAL_LOAD_THRESHOLD}, Mem > ${CRITICAL_MEM_THRESHOLD_MB}MB => Penalty Box (${PENALTY_DURATION_MS / 60000} mins)`);
        
        try {
            await this.client.connect();
        } catch (err) {
            console.error('Failed to connect:', err);
            return;
        }

        while (true) {
            try {
                await this.cycle();
            } catch (err) {
                console.error('Cycle error:', err);
            }
            await setTimeout(POLL_INTERVAL_MS);
        }
    }

    private async cycle() {
        // 1. Manage Penalty Box (Release prisoners)
        const now = Date.now();
        for (const [mac, record] of this.penaltyBox.entries()) {
            if (now >= record.unblockTime) {
                console.log(`Releasing ${record.hostname} (${mac}) from penalty box...`);
                await this.client.unblockClient(mac);
                this.penaltyBox.delete(mac);
                await this.notifyDiscord(`✅ **RELEASED** Client **${record.hostname}** (${mac}) from penalty box.`);
            }
        }

        // 2. Add Caching context for this cycle
        const sysInfo = await this.client.getSiteSysinfo();
        const subsystem = sysInfo[0]?.subsystem;
        
        // Extract Metrics
        // Note: 'loadavg' is usually [1m, 5m, 15m], typically scaled by 100 or as float depending on version
        // But for UDM-Base via node-unifi 'sys_stats' might be better. 
        // Let's rely on what we saw in get-status: "Load: 1.45"
        
        // Fetch devices to get accurate load
        const devices = await this.client.getDevices();
        const udm = devices.find((d: any) => d.model === 'UDM'); // Assuming UDM-Base
        
        let load = 0;
        let memUsed = 0;
        
        if (udm && udm.sys_stats) {
            load = parseFloat(udm.sys_stats.loadavg_1 || '0');
            memUsed = parseInt(udm.sys_stats.mem_used || '0', 10) / 1024 / 1024; // Bytes to MB
        } else if (udm) {
            console.log('DEBUG UDM object:', JSON.stringify(udm, null, 2)); // Debug stats path
        }

        console.log(`[Heartbeat] Load: ${load.toFixed(2)} | Mem: ${Math.round(memUsed)} MB | Boxed: ${this.penaltyBox.size}`);

        // 3. Evaluate Critical State
        if (load > CRITICAL_LOAD_THRESHOLD || memUsed > CRITICAL_MEM_THRESHOLD_MB) {
            console.warn('⚠️  CRITICAL SYSTEM STATE DETECTED');
            await this.mitigateThreats(load, memUsed);
        }
    }

    private async mitigateThreats(load: number, memUsed: number) {
        // Fetch recent alerts (last 24 hours, but we will filter by mostly recent)
        // Note: node-unifi getAlarms() doesn't strictly filter by time easily in valid params without testing
        // We'll fetch and filter in memory.
        const alarms = await this.client.getAlarms({ within: 1 }); // Last 1 hour
        
        // Filter for P2P/IPS threats in the last 10 minutes
        const tenMinsAgo = Date.now() - (10 * 60 * 1000);
        const threats = alarms.filter((a: any) => {
            const time = new Date(a.time).getTime();
            const isRecent = time > tenMinsAgo;
            const msg = (a.msg || '').toLowerCase();
            const key = (a.key || '').toLowerCase();
            const isThreat = key.includes('ips') || msg.includes('p2p') || msg.includes('corporate privacy');
            return isRecent && isThreat;
        });

        if (threats.length === 0) {
            console.log('High load detected, but no recent IPS/P2P threats found to mitigate.');
            return;
        }

        // Identify Offenders
        const offenders = new Set<string>(); // MACs
        threats.forEach((t: any) => {
            // Some alerts have source_mac or similar fields?
            // Usually 'mac' field in alarm refers to the AP or device, check specific payload structure
            // IPS alerts often contain 'src_ip' or 'inner_alert_source_ip'.
            // We need to map IP to MAC.
            // For now, let's assume alarm object might have specific client mac if properly associated.
            // If not, we iterate active clients to match IPs.
            // This is complex. Let's simplify: 
            // Most UniFi IPS alarms don't link directly to a client object in the alarm.
            // But if we saw "From: 192.168.1.x", we can look that up.
            
            // Extract IP from message if possible (node-unifi result structure dependent)
            // Let's assume we can't reliably parse raw text easily without regex.
            // But we can check known keys.
        });

        // Simplified Approach: If ANY P2P alert exists, check active clients for HIGH BANDWIDTH + MATCHING TRAFFIC TYPE?
        // Actually, let's use the 'identify-client' logic.
        
        // Since we can't perfectly parse every alert format blindly:
        // Let's finding the most recent IPS alert, extract IP if possible.
        // Actually, to be safe and simple:
        // We will just alert the user via Discord for now if we can't 100% ID the client.
        // BUT the user asked to "Pause traffic".
        
        // Let's try to extract IP from the `msg` field using regex we saw: "From: 1.2.3.4"
        const recentThreatIPs = new Set<string>();
        threats.forEach((t: any) => {
             const match = (t.msg || '').match(/From: (\d+\.\d+\.\d+\.\d+)/);
             if (match) recentThreatIPs.add(match[1]);
        });

        if (recentThreatIPs.size > 0) {
            const clients = await this.client.getClients();
            
            for (const ip of recentThreatIPs) {
                const client = clients.find((c: any) => c.ip === ip);
                if (client && !this.penaltyBox.has(client.mac)) {
                     // FOUND OFFENDER
                     console.log(`Mitigating traffic from ${client.name} (${client.mac}) due to high load + threat.`);
                     await this.enforcePenalty(client);
                }
            }
        }
    }

    private async enforcePenalty(client: any) {
        const mac = client.mac;
        const name = client.name || client.hostname || mac;
        
        try {
            await this.client.blockClient(mac);
            
            this.penaltyBox.set(mac, {
                mac,
                hostname: name,
                unblockTime: Date.now() + PENALTY_DURATION_MS
            });
            
            await this.notifyDiscord(`🛑 **PAUSED** Client **${name}** ` +
                `(${mac}) for 5 mins.\n` +
                `Reason: High Router Load + IPS Detected.`);
                
        } catch (err) {
            console.error(`Failed to block ${mac}:`, err);
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

new UnifiMonitor().start();
