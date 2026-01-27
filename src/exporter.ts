import express from 'express';
import { Registry, Gauge, collectDefaultMetrics } from 'prom-client';
import { UnifiClient } from './unifi/client.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const register = new Registry();

// Default metrics (CPU, Memory of the exporter itself)
collectDefaultMetrics({ register });

// UniFi Metrics
const routerLoad = new Gauge({
  name: 'unifi_router_load',
  help: 'UniFi Router Load Average (1m)',
  labelNames: ['model', 'ip'],
  registers: [register]
});

const routerMemory = new Gauge({
  name: 'unifi_router_memory_percent',
  help: 'UniFi Router Memory Usage Percentage',
  labelNames: ['model', 'ip'],
  registers: [register]
});

const clientCount = new Gauge({
  name: 'unifi_client_count',
  help: 'Number of connected clients',
  registers: [register]
});

const clientTraffic = new Gauge({
  name: 'unifi_client_traffic_bps',
  help: 'Real-time traffic rate per client in bits per second',
  labelNames: ['mac', 'hostname', 'type'],
  registers: [register]
});

const clientRxTraffic = new Gauge({
  name: 'unifi_client_rx_bps',
  help: 'Real-time receive rate per client in bits per second',
  labelNames: ['mac', 'hostname', 'type'],
  registers: [register]
});

const clientTxTraffic = new Gauge({
  name: 'unifi_client_tx_bps',
  help: 'Real-time transmit rate per client in bits per second',
  labelNames: ['mac', 'hostname', 'type'],
  registers: [register]
});

const throttledCount = new Gauge({
  name: 'unifi_throttled_client_count',
  help: 'Number of clients currently throttled',
  registers: [register]
});

const unifi = new UnifiClient(
  process.env.UNIFI_HOST!,
  process.env.UNIFI_USERNAME!,
  process.env.UNIFI_PASSWORD!,
  process.env.UNIFI_SITE || 'default'
);

let lastUpdate = 0;
const CACHE_TTL = 55_000; // 55 seconds

async function updateMetrics() {
  const now = Date.now();
  if (now - lastUpdate < CACHE_TTL) return;

  try {
    // Check connection state safely
    const controller = (unifi as any).controller;
    const isUsingGateway = (unifi as any).gatewayUrl;

    // Only connect if we are NOT using a gateway AND we don't have a session instance
    if (!isUsingGateway && (!controller || !controller._instance)) {
        console.log('Connecting to UniFi...');
        await unifi.connect();
    }

    const devices = await unifi.getDevices();
    const udm = devices.find((d: any) => d.model === 'UDM');
    
    if (udm && udm.sys_stats) {
      routerLoad.set({ model: udm.model, ip: udm.ip }, parseFloat(udm.sys_stats.loadavg_1 || '0'));
      
      const memUsed = udm.sys_stats.mem_used;
      const memTotal = udm.sys_stats.mem_total;
      if (memUsed && memTotal) {
          routerMemory.set({ model: udm.model, ip: udm.ip }, (memUsed / memTotal) * 100);
      }
    }

    const clients = await unifi.getClients();
    if (!clients || !Array.isArray(clients)) {
        throw new Error('Failed to fetch clients');
    }
    clientCount.set(clients.length);

    const groups = await unifi.getUserGroups();
    const throttledGroup = groups.find(g => g.name === 'Throttled');
    if (throttledGroup) {
        const throttled = clients.filter(c => c.usergroup_id === throttledGroup._id);
        throttledCount.set(throttled.length);
    }

    // Update traffic for top 20 clients (to avoid metric explosion)
    const topClients = clients
        .sort((a, b) => ((b.rx_rate || 0) + (b.tx_rate || 0)) - ((a.rx_rate || 0) + (a.tx_rate || 0)))
        .slice(0, 20);

    // Reset old traffic metrics to handle clients that went offline
    clientTraffic.reset();
    clientRxTraffic.reset();
    clientTxTraffic.reset();
    
    topClients.forEach(c => {
        const rxBps = (c.rx_rate || 0) * 8;
        const txBps = (c.tx_rate || 0) * 8;
        const totalBps = rxBps + txBps;
        
        const labels = {
            mac: c.mac,
            hostname: c.hostname || c.name || c.mac,
            type: c.is_wired ? 'wired' : 'wireless'
        };

        clientTraffic.set(labels, totalBps);
        clientRxTraffic.set(labels, rxBps);
        clientTxTraffic.set(labels, txBps);
    });

    lastUpdate = Date.now();

  } catch (err: any) {
    const status = err.response?.status;
    console.error('Error updating metrics:', err.message || err);
    
    // If unauthorized (401), clear session to trigger re-login next time
    if (status === 401) {
        console.warn('Session expired (401). Clearing session for re-login.');
        const controller = (unifi as any).controller;
        if (controller) {
            controller._instance = null;
        }
    }

    // If rate limited (429), back off significantly
    if (status === 429) {
        lastUpdate = Date.now() + 300_000; // 5 minute penalty backoff
        console.warn('Rate limit hit. Backing off for 5 minutes.');
    }
  }
}

app.get('/metrics', async (req, res) => {
  await updateMetrics();
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

const PORT = process.env.METRICS_PORT || 9100;
app.listen(PORT, () => {
  console.log(`Prometheus exporter running on port ${PORT}`);
});
