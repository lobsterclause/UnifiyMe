import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { UnifiClient } from './unifi/client.js';
import { UnifiSSH } from './unifi/ssh.js';
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

// Initialize SSH client (optional, based on env)
const ssh = process.env.SSH_HOST ? new UnifiSSH(
  process.env.SSH_HOST,
  process.env.SSH_USERNAME || 'root',
  process.env.SSH_PASSWORD || ''
) : null;

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
    },
    {
      name: 'reboot_device',
      description: 'Restart a Unifi device',
      inputSchema: {
        type: 'object',
        properties: {
          mac: { type: 'string', description: 'MAC address of the device to restart' }
        },
        required: ['mac']
      },
    },
    {
      name: 'get_client_history',
      description: 'Search for clients in the controller history',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (IP, MAC, or hostname)' },
          hours: { type: 'number', description: 'Number of hours to look back (default: 8760/1 year)' }
        },
        required: ['query']
      },
    },
    {
      name: 'get_network_health',
      description: 'Get detailed health status of network subsystems',
      inputSchema: {
        type: 'object',
        properties: {}
      },
    },
    {
      name: 'get_alarms',
      description: 'List recent network alarms and threats',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of alarms to return (default: 10)' },
          archived: { type: 'boolean', description: 'Whether to include archived alarms (default: false)' }
        }
      },
    },
    {
      name: 'get_dpi_stats',
      description: 'Get Deep Packet Inspection (DPI) statistics for applications',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of top applications to return (default: 10)' }
        }
      },
    },
    {
      name: 'cycle_poe_port',
      description: 'Power cycle a PoE port on a switch',
      inputSchema: {
        type: 'object',
        properties: {
          mac: { type: 'string', description: 'MAC address of the switch' },
          port: { type: 'number', description: 'Port index (1-based)' }
        },
        required: ['mac', 'port']
      },
    },
    {
      name: 'locate_device',
      description: 'Flash the LED on a device to locate it',
      inputSchema: {
        type: 'object',
        properties: {
          mac: { type: 'string', description: 'MAC address of the device' },
          enable: { type: 'boolean', description: 'Whether to enable or disable flashing (default: true)' }
        },
        required: ['mac']
      },
    },
    {
      name: 'block_client',
      description: 'Block a client device from the network',
      inputSchema: {
        type: 'object',
        properties: {
          mac: { type: 'string', description: 'MAC address of the client to block' }
        },
        required: ['mac']
      },
    },
    {
      name: 'unblock_client',
      description: 'Unblock a previously blocked client device',
      inputSchema: {
        type: 'object',
        properties: {
          mac: { type: 'string', description: 'MAC address of the client to unblock' }
        },
        required: ['mac']
      },
    },
    {
      name: 'reconnect_client',
      description: 'Force a client to reconnect (useful for roaming)',
      inputSchema: {
        type: 'object',
        properties: {
          mac: { type: 'string', description: 'MAC address of the client to reconnect' }
        },
        required: ['mac']
      },
    },
    {
      name: 'create_voucher',
      description: 'Create a guest WiFi voucher',
      inputSchema: {
        type: 'object',
        properties: {
          minutes: { type: 'number', description: 'Duration in minutes' },
          count: { type: 'number', description: 'Number of vouchers to create (default: 1)' },
          note: { type: 'string', description: 'Optional note for the voucher' }
        },
        required: ['minutes']
      },
    },
    {
      name: 'run_ssh_command',
      description: 'Execute a command directly on the router via SSH',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to execute (e.g., top -n 1, info, dmesg)' }
        },
        required: ['command']
      },
    },
    {
      name: 'get_router_logs',
      description: 'Fetch recent system logs from the router via SSH',
      inputSchema: {
        type: 'object',
        properties: {
          lines: { type: 'number', description: 'Number of lines to fetch (default: 50)' },
          filter: { type: 'string', description: 'Optional regex filter' }
        }
      },
    },
    {
      name: 'get_wlan_config',
      description: 'Get WiFi network configurations (SSIDs, security, etc.)',
      inputSchema: {
        type: 'object',
        properties: {}
      },
    },
    {
      name: 'get_network_config',
      description: 'Get logical network configurations (VLANs, subnets, DHCP)',
      inputSchema: {
        type: 'object',
        properties: {}
      },
    },
    {
      name: 'get_firmware_status',
      description: 'Check for available firmware updates across all devices',
      inputSchema: {
        type: 'object',
        properties: {}
      },
    },
    {
      name: 'get_firewall_rules',
      description: 'Get all configured firewall rules',
      inputSchema: {
        type: 'object',
        properties: {}
      },
    },
    {
      name: 'get_firewall_groups',
      description: 'Get all configured firewall groups (IP, Port)',
      inputSchema: {
        type: 'object',
        properties: {}
      },
    },
    {
      name: 'get_client_dpi',
      description: 'Get Deep Packet Inspection (DPI) statistics for a specific client',
      inputSchema: {
        type: 'object',
        properties: {
          mac: { type: 'string', description: 'MAC address of the client' },
          limit: { type: 'number', description: 'Number of top applications to return (default: 10)' }
        },
        required: ['mac']
      },
    },
    {
      name: 'get_client_details',
      description: 'Get comprehensive details about a specific network client',
      inputSchema: {
        type: 'object',
        properties: {
          mac: { type: 'string', description: 'MAC address of the client' }
        },
        required: ['mac']
      },
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
                    rx_total: formatBytes(c.rx_bytes),
                    tx_total: formatBytes(c.tx_bytes),
                    rx_rate: formatBytes(c.rx_rate || 0) + '/s',
                    tx_rate: formatBytes(c.tx_rate || 0) + '/s'
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

        case 'reboot_device': {
          const mac = (args as any).mac;
          await unifi.restartDevice(mac);
          return {
            content: [{ type: 'text', text: `Successfully sent restart command to device ${mac}` }]
          };
        }

        case 'get_client_history': {
          const query = (args as any).query.toLowerCase();
          const hours = (args as any).hours || 8760;
          const allUsers = await unifi.getAllUsers(hours);
          
          const matches = allUsers.filter((u: any) =>
            u.ip?.includes(query) ||
            u.last_ip?.includes(query) ||
            u.mac?.toLowerCase().includes(query) ||
            u.hostname?.toLowerCase().includes(query) ||
            u.name?.toLowerCase().includes(query)
          );

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(matches.map(u => ({
                name: u.name || u.hostname || 'Unknown',
                mac: u.mac,
                last_ip: u.last_ip || u.ip,
                first_seen: new Date(u.first_seen * 1000).toISOString(),
                last_seen: new Date(u.last_seen * 1000).toISOString(),
                oui: u.oui
              })), null, 2)
            }]
          };
        }

        case 'get_network_health': {
          const health = await unifi.getHealth();
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(health.map(h => ({
                subsystem: h.subsystem,
                status: h.status,
                num_user: h.num_user,
                num_guest: h.num_guest,
                num_iot: h.num_iot,
                details: h.details
              })), null, 2)
            }]
          };
        }

        case 'get_alarms': {
          const limit = (args as any).limit || 10;
          const archived = (args as any).archived || false;
          const alarms = await unifi.getAlarms();
          
          let filtered = alarms;
          if (!archived) {
            filtered = filtered.filter(a => !a.archived);
          }
          
          const result = filtered.slice(0, limit).map(a => ({
            datetime: a.datetime,
            msg: a.msg,
            subsystem: a.subsystem,
            archived: a.archived
          }));

          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          };
        }

        case 'get_dpi_stats': {
          const limit = (args as any).limit || 10;
          const dpi = await unifi.getDPIStats();
          
          if (!Array.isArray(dpi)) {
            return { content: [{ type: 'text', text: 'DPI statistics not available.' }] };
          }

          const sorted = dpi.sort((a: any, b: any) => (b.rx_bytes + b.tx_bytes) - (a.rx_bytes + a.tx_bytes));
          const result = sorted.slice(0, limit).map(d => ({
            app: d.app || 'Unknown',
            category: d.cat || 'Unknown',
            total_traffic: formatBytes(d.rx_bytes + d.tx_bytes),
            rx: formatBytes(d.rx_bytes),
            tx: formatBytes(d.tx_bytes)
          }));

          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          };
        }

        case 'cycle_poe_port': {
          const { mac, port } = args as any;
          await unifi.powerCyclePort(mac, port);
          return { content: [{ type: 'text', text: `Power cycle command sent to ${mac} port ${port}` }] };
        }

        case 'locate_device': {
          const { mac, enable = true } = args as any;
          await unifi.setLocate(mac, enable);
          return { content: [{ type: 'text', text: `${enable ? 'Started' : 'Stopped'} locate flashing on ${mac}` }] };
        }

        case 'block_client': {
          const { mac } = args as any;
          await unifi.blockClient(mac);
          return { content: [{ type: 'text', text: `Blocked client ${mac}` }] };
        }

        case 'unblock_client': {
          const { mac } = args as any;
          await unifi.unblockClient(mac);
          return { content: [{ type: 'text', text: `Unblocked client ${mac}` }] };
        }

        case 'reconnect_client': {
          const { mac } = args as any;
          await unifi.reconnectClient(mac);
          return { content: [{ type: 'text', text: `Reconnect command sent to client ${mac}` }] };
        }

        case 'create_voucher': {
          const { minutes, count = 1, note } = args as any;
          const vouchers = await unifi.createVoucher(minutes, count, 0, note);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(vouchers, null, 2)
            }]
          };
        }

        case 'run_ssh_command': {
          if (!ssh) throw new Error('SSH is not configured. Please set SSH_HOST, SSH_USERNAME, and SSH_PASSWORD in .env');
          const { command } = args as any;
          const output = await ssh.execute(command);
          return { content: [{ type: 'text', text: output }] };
        }

        case 'get_router_logs': {
          if (!ssh) throw new Error('SSH is not configured. Please set SSH_HOST, SSH_USERNAME, and SSH_PASSWORD in .env');
          const { lines = 50, filter } = args as any;
          let command = `tail -n ${lines} /var/log/messages`;
          if (filter) {
            command += ` | grep -E "${filter}"`;
          }
          const output = await ssh.execute(command);
          return { content: [{ type: 'text', text: output }] };
        }

        case 'get_wlan_config': {
          const config = await unifi.getWlanConf();
          return { content: [{ type: 'text', text: JSON.stringify(config, null, 2) }] };
        }

        case 'get_network_config': {
          const config = await unifi.getNetworkConf();
          return { content: [{ type: 'text', text: JSON.stringify(config, null, 2) }] };
        }

        case 'get_firmware_status': {
          const devices = await unifi.getDevices();
          const status = devices.map(d => ({
            name: d.name || d.model,
            model: d.model,
            current_version: d.version,
            upgradable: d.upgradable,
            upgrade_to: d.upgrade_to_version || 'N/A'
          }));
          return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
        }

        case 'get_firewall_rules': {
          const rules = await unifi.getFirewallRules();
          return { content: [{ type: 'text', text: JSON.stringify(rules, null, 2) }] };
        }

        case 'get_firewall_groups': {
          const groups = await unifi.getFirewallGroups();
          return { content: [{ type: 'text', text: JSON.stringify(groups, null, 2) }] };
        }

        case 'get_client_dpi': {
          const { mac, limit = 10 } = args as any;
          const controller = (unifi as any).controller;
          const clientDpi = await controller.customApiRequest(`/api/s/default/stat/dpi-user-app?mac=${mac}`);
          
          if (!Array.isArray(clientDpi)) {
            return { content: [{ type: 'text', text: 'No DPI statistics available for this client.' }] };
          }

          const sorted = clientDpi.sort((a: any, b: any) => (b.rx_bytes + b.tx_bytes) - (a.rx_bytes + a.tx_bytes));
          const result = sorted.slice(0, limit).map(d => ({
            app: d.app || 'Unknown',
            category: d.cat || 'Unknown',
            total_traffic: formatBytes(d.rx_bytes + d.tx_bytes),
            rx: formatBytes(d.rx_bytes),
            tx: formatBytes(d.tx_bytes)
          }));

          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          };
        }

        case 'get_client_details': {
            const mac = (args as any)?.mac;
            const clients = await unifi.getClients();
            const client = clients.find(c => c.mac === mac);

            if (!client) {
                return {
                    isError: true,
                    content: [{ type: 'text', text: `Client with MAC ${mac} not found.` }]
                };
            }

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        ...client,
                        rx_total_human: formatBytes(client.rx_bytes),
                        tx_total_human: formatBytes(client.tx_bytes),
                        rx_rate_human: formatBytes(client.rx_rate || 0) + '/s',
                        tx_rate_human: formatBytes(client.tx_rate || 0) + '/s',
                        last_seen_human: new Date(client.last_seen * 1000).toISOString()
                    }, null, 2)
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

    console.error('Connected to Unifi Controller (Optimized via UnifiClient).');
    
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error('Unifi MCP Server running on stdio');
  } catch (err) {
      console.error('Failed to start server:', err);
      process.exit(1);
  }
}

main().catch(console.error);
