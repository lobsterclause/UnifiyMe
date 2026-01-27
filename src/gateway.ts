import express from 'express';
import { UnifiClient } from './unifi/client.js';
import retry from 'async-retry';
import { Registry, Gauge } from 'prom-client';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const register = new Registry();

// Gateway Metrics
const gatewayUp = new Gauge({
    name: 'unifi_gateway_up',
    help: 'UniFi Gateway connection status (1 = Connected, 0 = Disconnected)',
    registers: [register]
});

const gatewayBackoff = new Gauge({
    name: 'unifi_gateway_backoff_multiplier',
    help: 'Current exponential backoff multiplier for UniFi connection',
    registers: [register]
});

const processMemory = new Gauge({
    name: 'unifi_process_memory_percent',
    help: 'Memory usage percentage per process on the router',
    labelNames: ['command', 'pid'],
    registers: [register]
});

const mitigationActions = new Gauge({
    name: 'unifi_mitigation_actions_total',
    help: 'Total number of mitigation actions (throttles/blocks) performed',
    labelNames: ['type'],
    registers: [register]
});

const unifi = new UnifiClient(
  process.env.UNIFI_HOST!,
  process.env.UNIFI_USERNAME!,
  process.env.UNIFI_PASSWORD!,
  process.env.UNIFI_SITE || 'default'
);

let isConnecting = false;
let currentBackoff = 1;

async function ensureConnected() {
    const controller = (unifi as any).controller;
    if (controller?._instance) {
        gatewayUp.set(1);
        gatewayBackoff.set(1);
        return;
    }

    if (isConnecting) {
        // Wait for existing connection attempt
        while (isConnecting) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return;
    }

    isConnecting = true;
    gatewayUp.set(0);
    try {
        await retry(
            async (bail) => {
                console.log('[Gateway] Attempting connection to UniFi...');
                try {
                    await unifi.connect();
                    console.log('[Gateway] Connected successfully.');
                    currentBackoff = 1;
                    gatewayUp.set(1);
                    gatewayBackoff.set(1);
                } catch (err: any) {
                    const status = err.response?.status;
                    if (status === 401 || status === 429) {
                        throw err;
                    }
                    bail(err);
                }
            },
            {
                retries: 20,
                minTimeout: 60_000,
                maxTimeout: 30 * 60_000,
                factor: 2,
                onRetry: (err: any, attempt: number) => {
                    currentBackoff = Math.pow(2, attempt);
                    gatewayBackoff.set(currentBackoff);
                    console.log(`[Gateway] Retry attempt ${attempt} (Backoff ${currentBackoff}x) due to: ${err.message}`);
                }
            }
        );
    } finally {
        isConnecting = false;
    }
}

// Cached data
let cache: any = {
    devices: [],
    clients: [],
    alarms: [],
    groups: [],
    timestamp: 0
};
const CACHE_TTL = 45_000;
let pendingFetch: Promise<any> | null = null;

async function getCachedData() {
    const now = Date.now();
    if (now - cache.timestamp < CACHE_TTL && cache.devices.length > 0) {
        return cache;
    }

    if (pendingFetch) {
        return pendingFetch;
    }

    pendingFetch = (async () => {
        try {
            await ensureConnected();
            
            console.log('[Gateway] Fetching fresh data from router...');
            const [devices, clients, alarms, groups] = await Promise.all([
                unifi.getDevices(),
                unifi.getClients(),
                unifi.getAlarms({ within: 1 }),
                unifi.getUserGroups()
            ]);

            // Optional: Fetch process list via SSH if configured
            if (process.env.SSH_PASSWORD) {
                try {
                    const { execSync } = await import('child_process');
                    const output = execSync('expect ssh_diag.exp', { encoding: 'utf-8' });
                    const lines = output.split('\n');
                    processMemory.reset();
                    lines.forEach(line => {
                        const match = line.trim().match(/^\s*(\d+)\s+\w+\s+\d+\s+-?\d+\s+\d+\s+\d+\s+\d+\s+\w\s+\d+\.\d+\s+(\d+\.\d+)\s+[\d:.]+\s+(.+)$/);
                        if (match) {
                            const pid = match[1];
                            const mem = parseFloat(match[2]);
                            const cmd = match[3].trim();
                            if (mem > 0.5) { // Only track processes using > 0.5% memory
                                processMemory.set({ command: cmd, pid }, mem);
                            }
                        }
                    });
                } catch (e: any) {
                    console.warn('[Gateway] SSH Process fetch failed:', e.message);
                }
            }

            cache = { devices, clients, alarms, groups, timestamp: Date.now() };
            return cache;
        } catch (err: any) {
            if (err.response?.status === 401) {
                console.warn('[Gateway] Session expired during fetch. Clearing.');
                (unifi as any).controller._instance = null;
                gatewayUp.set(0);
            }
            throw err;
        } finally {
            pendingFetch = null;
        }
    })();

    return pendingFetch;
}

app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});

app.get('/status', async (req, res) => {
    try {
        const data = await getCachedData();
        res.json(data);
    } catch (err: any) {
        if (cache.devices.length > 0) {
            return res.json({ ...cache, stale: true, error: err.message });
        }
        res.status(503).json({ error: err.message, backoff: currentBackoff });
    }
});

app.post('/action/:type', async (req, res) => {
    try {
        await ensureConnected();
        const { type } = req.params;
        const { mac, clientId, groupId } = req.body;

        switch (type) {
            case 'block':
                await unifi.blockClient(mac);
                mitigationActions.inc({ type: 'block' });
                break;
            case 'unblock':
                await unifi.unblockClient(mac);
                break;
            case 'throttle':
                await unifi.setUserGroup(clientId, groupId);
                mitigationActions.inc({ type: 'throttle' });
                break;
            case 'createGroup':
                const result = await unifi.createUserGroup(req.body.name, req.body.down, req.body.up);
                return res.json({ success: true, result });
            default: return res.status(400).json({ error: 'Unknown action type' });
        }

        cache.timestamp = 0;
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.GATEWAY_PORT || 8080;
app.listen(PORT, () => {
    console.log(`[Gateway] UniFi Centralized API running on port ${PORT}`);
});
