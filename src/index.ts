import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { UnifiClient } from './unifi/client.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

const server = new Server(
  {
    name: 'unifi-mcp-server',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Initialize Unifi client
const unifi = new UnifiClient(
  process.env.UNIFI_HOST!,
  process.env.UNIFI_USERNAME!,
  process.env.UNIFI_PASSWORD!,
  process.env.UNIFI_SITE || 'default'
);

// Helper to format bytes
function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_network_status',
      description: 'Get overall network health and status',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'list_devices',
      description: 'List all network devices (APs, switches, gateways)',
      inputSchema: {
        type: 'object',
        properties: {
          site: { type: 'string', description: 'Site ID/Name to filter by' },
          type: { type: 'string', description: 'Filter by device type (e.g., uap, ugw, usw)' }
        },
      },
    },
    {
      name: 'list_clients',
      description: 'List all connected network clients',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['online', 'offline', 'all'],
            description: 'Filter by connection status (default: online)',
          },
          search: { type: 'string', description: 'Optional search term to filter results' }
        },
      },
    },
    {
      name: 'get_device_details',
      description: 'Get detailed information about a specific device',
      inputSchema: {
        type: 'object',
        properties: {
          mac: { type: 'string', description: 'MAC address of the device' }
        },
        required: ['mac']
      },
    },
     {
      name: 'search_network',
      description: 'Search for devices or clients by IP, MAC, hostname, or alias',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query (IP, MAC, or hostname)',
          },
        },
        required: ['query'],
      },
    },
    {
        name: 'get_bandwidth_stats',
        description: 'Get top bandwidth consumers',
        inputSchema: {
            type: 'object',
            properties: {
                limit: { type: 'number', description: 'Number of top clients to return (default: 10)' }
            }
        }
    },
     {
        name: 'get_network_topology',
        description: 'Get network topology (simplified view of uplinks)',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    }
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
      // Ensure connection is established (lazy connect or reconnect could be handled here)
      // For now we assume the main connect call works, but in production we might want to check state
      
      switch (name) {
        case 'get_network_status': {
          const devices = await unifi.getDevicesBasic();
          const clients = await unifi.getClients();
          const sites = await unifi.getSites();
          
          const now = Date.now() / 1000;
          const onlineCount = clients.filter(c => c.uptime > 0 && (now - c.last_seen < 300)).length;

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  totalDevices: devices.length,
                  totalClients: clients.length,
                  onlineClientsApprox: onlineCount,
                  sites: sites.length,
                  systemStatus: 'Online',
                  cached: true // Informative for the user
                }, null, 2),
              },
            ],
          };
        }
        
        case 'list_devices': {
            const devices = await unifi.getDevices();
            const site = (args as any)?.site;
            const type = (args as any)?.type;

            let filtered = devices;
            if (site) filtered = filtered.filter(d => d.site_id === site);
            if (type) filtered = filtered.filter(d => d.type === type);

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(filtered.map(d => ({
                        name: d.name || d.model,
                        model: d.model,
                        mac: d.mac,
                        ip: d.ip,
                        type: d.type,
                        status: d.state, // '1' usually means connected/active
                        uptime: d.uptime
                    })), null, 2)
                }]
            };
        }

        case 'list_clients': {
          const clients = await unifi.getClients();
          const status = (args as any)?.status || 'online';
          const search = (args as any)?.search?.toLowerCase();

          let filtered = clients;
          
          // Filter by status
          if (status === 'online') {
              // Basic online check
              filtered = filtered.filter(c => (Date.now()/1000 - c.last_seen) < 300 ); 
          } else if (status === 'offline') {
               filtered = filtered.filter(c => (Date.now()/1000 - c.last_seen) >= 300 );
          }

          if (search) {
              filtered = filtered.filter(c => 
                c.hostname?.toLowerCase().includes(search) || 
                c.mac?.toLowerCase().includes(search) || 
                c.ip?.includes(search) ||
                c.name?.toLowerCase().includes(search)
              );
          }
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  filtered.map(c => ({
                    hostname: c.hostname || c.name || 'Unknown',
                    ip: c.ip,
                    mac: c.mac,
                    is_wired: c.is_wired,
                    is_guest: c.is_guest,
                    last_seen: new Date(c.last_seen * 1000).toISOString(),
                    rx: formatBytes(c.rx_bytes),
                    tx: formatBytes(c.tx_bytes)
                  })),
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'get_device_details': {
            const mac = (args as any)?.mac;
            const devices = await unifi.getDevices();
            const device = devices.find(d => d.mac === mac);

            if (!device) {
                return {
                    isError: true,
                    content: [{ type: 'text', text: `Device with MAC ${mac} not found.` }]
                };
            }

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(device, null, 2)
                }]
            };
        }
        
        case 'search_network': {
          const clients = await unifi.getClients();
          const devices = await unifi.getDevices();
          const query = (args as any).query.toLowerCase();
          
          // Search clients
          const matchedClients = clients.filter(c => 
            c.ip?.includes(query) ||
            c.mac?.toLowerCase().includes(query) ||
            c.hostname?.toLowerCase().includes(query) ||
            c.name?.toLowerCase().includes(query)
          ).map(c => ({ ...c, kind: 'client'}));

           // Search devices
           const matchedDevices = devices.filter(d => 
            d.ip?.includes(query) ||
            d.mac?.toLowerCase().includes(query) ||
            d.name?.toLowerCase().includes(query) ||
            d.model?.toLowerCase().includes(query)
          ).map(d => ({ ...d, kind: 'device'}));
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify([...matchedDevices, ...matchedClients], null, 2),
              },
            ],
          };
        }

        case 'get_bandwidth_stats': {
            const clients = await unifi.getClients();
            const limit = (args as any)?.limit || 10;
            
            // Sort by total usage (rx + tx)
            const sorted = clients.sort((a, b) => (b.rx_bytes + b.tx_bytes) - (a.rx_bytes + a.tx_bytes));
            const top = sorted.slice(0, limit);

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(top.map(c => ({
                        name: c.hostname || c.name || c.mac,
                        usage: formatBytes(c.rx_bytes + c.tx_bytes),
                        rx: formatBytes(c.rx_bytes),
                        tx: formatBytes(c.tx_bytes)
                    })), null, 2)
                }]
            };
        }

        case 'get_network_topology': {
            const devices = await unifi.getDevices();
            // Simplify topology: extract uplink info
            // devices usually have 'uplink' property
            const topology = devices.map(d => ({
                name: d.name || d.model,
                mac: d.mac,
                uplink: d.uplink || {},
                downlinks: d.downlink_table || [],
                ip: d.ip
            }));

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(topology, null, 2)
                }]
            };
        }
        
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
  } catch (error: any) {
      return {
          isError: true,
          content: [
              {
                  type: 'text',
                  text: `Error executing tool ${name}: ${error.message}`
              }
          ]
      }
  }
});

// Start server
async function main() {
  try {
    console.error('Connecting to Unifi Controller...');
    await unifi.connect();

    // Optimization: Monkey-patch node-unifi to skip the redundant "self" check on every request.
    // This reduces the number of requests to the router by 50%.
    const controller = (unifi as any).controller;
    const originalEnsureLoggedIn = controller._ensureLoggedIn;
    controller._ensureLoggedIn = async function() {
        if (!this._instance) {
            return originalEnsureLoggedIn.apply(this);
        }
        // Skip the heartbeat check; if the session expires, the next request will fail anyway.
        return true;
    };

    console.error('Connected to Unifi Controller (Optimized).');
    
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error('Unifi MCP Server running on stdio');
  } catch (err) {
      console.error('Failed to start server:', err);
      process.exit(1);
  }
}

main().catch(console.error);
