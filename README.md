# UnifiyMe

A Model Context Protocol (MCP) server for UniFi Network Controllers. This server allows you to interact with your UniFi network infrastructure through LLMs, providing both high-level monitoring and deep system-level control.

## Features

- **Network Monitoring**: Quick overview of devices, clients, and site health.
- **Client Management**: Block/unblock clients, force reconnections, and search historical connection data.
- **Physical Control**: Power cycle PoE ports and flash device LEDs for easy location.
- **Advanced Analytics**: Deep Packet Inspection (DPI) stats, subsystem health, and alarm tracking.
- **Guest Access**: Create guest WiFi vouchers on the fly.
- **SSH Diagnostics**: Execute commands directly on the router and fetch system logs for deep troubleshooting.
- **Discord Integration**: Manage and monitor your network directly from Discord.
- **Prometheus Exporter**: Export UniFi metrics to Prometheus for long-term monitoring and alerting.
- **Grafana Dashboards**: Pre-configured dashboards for visualizing network health and performance.
- **Restricted YouTube Blocker**: Specialized tools for managing YouTube access via UniFi firewall rules.

## Optimization

This server includes specialized optimizations for UniFi controllers:

- **Monkey-patched Session Management**: Reduces redundant heartbeat checks, cutting request overhead by up to 50%.
- **Intelligent Caching**: 10-second TTL cache for frequent lookups to improve responsiveness and reduce controller load.

## Setup

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with your UniFi credentials:

   ```env
   UNIFI_HOST=https://your-unifi-controller-ip
   UNIFI_USERNAME=your-username
   UNIFI_PASSWORD=your-password
   UNIFI_SITE=default

   # Optional: SSH Credentials for diagnostics
   SSH_HOST=192.168.1.1
   SSH_USERNAME=root
   SSH_PASSWORD=your-ssh-password

   # Optional: Discord Bot Configuration
   DISCORD_TOKEN=your-discord-bot-token
   DISCORD_CLIENT_ID=your-discord-client-id
   ```

4. Build the project:
   ```bash
   npm run build
   ```

## Usage

### MCP Server (Claude Desktop)

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "unifyme": {
      "command": "node",
      "args": ["/path/to/UnifiyMe/dist/index.js"],
      "env": {
        "UNIFI_HOST": "...",
        "UNIFI_USERNAME": "...",
        "UNIFI_PASSWORD": "...",
        "UNIFI_SITE": "default",
        "SSH_HOST": "...",
        "SSH_USERNAME": "...",
        "SSH_PASSWORD": "..."
      }
    }
  }
}
```

### Discord Bot

To start the Discord bot:

```bash
npm run start # If built
# OR
npm run dev   # For development
```

### Prometheus Exporter

The server automatically starts a Prometheus exporter on port 9090 (configurable). Metrics are available at `/metrics`.

### Docker Support

You can run the entire stack (UnifiyMe, Prometheus, Grafana) using Docker Compose:

```bash
docker-compose up -d
```

## Tools

### Monitoring & Discovery

- `get_network_status`: Get overall network health and status.
- `list_devices`: List all network devices (APs, switches, gateways).
- `list_clients`: List all connected network clients.
- `get_device_details`: Get detailed information about a specific device.
- `search_network`: Search for devices or clients by IP, MAC, hostname, or alias.
- `get_bandwidth_stats`: Get top bandwidth consumers.
- `get_network_topology`: Get network topology (simplified view of uplinks).
- `get_client_history`: Search historical client data.
- `get_network_health`: Get detailed subsystem health status.
- `get_alarms`: List recent alerts and IPS/IDS events.
- `get_dpi_stats`: Get application usage statistics.
- `get_wlan_config`: Get WiFi network configurations (SSIDs, security, etc.).
- `get_network_config`: Get logical network configurations (VLANs, subnets, DHCP).
- `get_firmware_status`: Check for available firmware updates across all devices.
- `get_firewall_rules`: Get all configured firewall rules.
- `get_firewall_groups`: Get all configured firewall groups (IP, Port).

### Control & Management

- `reboot_device`: Restart a device by MAC address.
- `cycle_poe_port`: Power cycle a PoE port on a switch.
- `locate_device`: Flash/Stop flashing the LED on a device.
- `block_client` / `unblock_client`: Manage network access for clients.
- `reconnect_client`: Force a client to reconnect.
- `create_voucher`: Create guest WiFi vouchers.

### Diagnostics (SSH)

- `run_ssh_command`: Execute a command directly on the router.
- `get_router_logs`: Fetch system logs from the router.

## License

ISC
