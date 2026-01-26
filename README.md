# UnifiyMe

A Model Context Protocol (MCP) server for UniFi Network Controllers. This server allows you to interact with your UniFi network infrastructure through LLMs.

## Features

- **Get Network Status**: Quick overview of devices, clients, and site health.
- **List Devices**: Detailed list of access points, switches, and gateways.
- **List Clients**: View currently connected clients with bandwidth usage.
- **Device Details**: Deep dive into specific device configurations and status.
- **Search Network**: Find any device or client by IP, MAC, or name.
- **Bandwidth Stats**: Identify top bandwidth consumers on your network.
- **Network Topology**: Visualize device uplinks and connections.

## Optimization

This server includes a specialized optimization for UniFi controllers:

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
   ```
4. Build the project:
   ```bash
   npm run build
   ```

## Usage with Claude Desktop

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
        "UNIFI_SITE": "default"
      }
    }
  }
}
```

## Tools

- `get_network_status`: Get overall network health and status.
- `list_devices`: List all network devices (APs, switches, gateways).
- `list_clients`: List all connected network clients.
- `get_device_details`: Get detailed information about a specific device.
- `search_network`: Search for devices or clients by IP, MAC, hostname, or alias.
- `get_bandwidth_stats`: Get top bandwidth consumers.
- `get_network_topology`: Get network topology (simplified view of uplinks).

## License

ISC
