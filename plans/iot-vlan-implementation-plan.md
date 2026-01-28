# IoT VLAN Implementation Plan

## Goal

Reduce Suricata/IPS CPU load on the UDM Gateway by isolating IoT devices to a dedicated VLAN with strict firewall rules and DNS sinkholing. This blocks telemetry and call-home traffic BEFORE it reaches Suricata for inspection.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           UDM Gateway                                │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────┐    ┌───────────────┐  │
│  │ Firewall Rules   │ →  │ DNS Filtering    │ →  │ Suricata/IPS  │  │
│  │ Layer 3/4 DROP   │    │ Sinkhole IoT     │    │ Inspects WAN  │  │
│  │ BEFORE Suricata  │    │ telemetry        │    │ traffic only  │  │
│  └──────────────────┘    └──────────────────┘    └───────────────┘  │
│           ↑                      ↑                      ↑           │
├───────────┼──────────────────────┼──────────────────────┼───────────┤
│           │                      │                      │           │
│  ┌────────┴────────┐    ┌───────┴────────┐    ┌───────┴────────┐   │
│  │ VLAN 1 - Main   │    │ VLAN 20 - IoT  │    │ VLAN 30 - Guest│   │
│  │ 192.168.1.0/24  │    │ 192.168.20.0/24│    │ 192.168.30.0/24│   │
│  │ Full Access     │    │ Restricted     │    │ Internet Only  │   │
│  └─────────────────┘    └────────────────┘    └────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: IoT VLAN Creation

### 1.1 Network Configuration

| Setting     | Value                                 |
| ----------- | ------------------------------------- |
| Name        | `IoT Network`                         |
| VLAN ID     | `20`                                  |
| Gateway IP  | `192.168.20.1`                        |
| Subnet      | `192.168.20.0/24`                     |
| DHCP Range  | `192.168.20.10 - 192.168.20.200`      |
| Domain Name | `iot.local`                           |
| Purpose     | `Corporate` (to enable traffic rules) |

### 1.2 WiFi SSID Configuration

| Setting          | Value                                     |
| ---------------- | ----------------------------------------- |
| Name             | `IoT-Network` or hidden SSID              |
| Security         | `WPA2`                                    |
| Network          | `IoT Network (VLAN 20)`                   |
| Band             | `2.4 GHz only` (most IoT prefers 2.4)     |
| Client Isolation | `Enabled` (devices cannot see each other) |

---

## Phase 2: Firewall Rules

### 2.1 Inter-VLAN Firewall Rules

These rules prevent IoT devices from accessing your main LAN while allowing specific services.

#### Rule 1: Block IoT → Main LAN (except mDNS/Chromecast)

```
Action: REJECT
Source: IoT Network (192.168.20.0/24)
Destination: Main LAN (192.168.1.0/24)
Protocol: All
Description: Block IoT from accessing main network
```

#### Rule 2: Allow mDNS for Chromecast/AirPlay Discovery

```
Action: ACCEPT
Source: IoT Network
Destination: Main LAN
Protocol: UDP
Port: 5353
Description: Allow mDNS for device discovery
```

#### Rule 3: Allow Chromecast/AirPlay Streaming

```
Action: ACCEPT
Source: Main LAN
Destination: IoT Network
Protocol: TCP/UDP
Ports: 8008, 8009, 8443, 32469 (Chromecast), 7000, 7100 (AirPlay)
Description: Allow streaming to IoT devices
```

### 2.2 WAN Firewall Rules for IoT

These rules DROP traffic before Suricata inspection.

#### Rule 4: Block IoT Telemetry Domains (via IP groups)

```
Action: DROP
Source: IoT Network
Destination: Telemetry IP Group (see section 2.3)
Protocol: All
Description: Block known telemetry IPs before Suricata
```

#### Rule 5: Rate Limit IoT WAN Traffic

```
Action: ACCEPT with Rate Limit
Source: IoT Network
Destination: Any
Rate Limit: 5 Mbps per device
Description: Hard cap IoT bandwidth to reduce PPS
```

### 2.3 Telemetry IP Groups to Block

Create a Firewall Group with these IP ranges:

| Provider            | IPs/Ranges                         | Purpose              |
| ------------------- | ---------------------------------- | -------------------- |
| Amazon Telemetry    | `52.94.0.0/16`                     | Alexa, Ring, Fire TV |
| Google Telemetry    | `142.250.0.0/16`, `172.217.0.0/16` | Nest, Chromecast     |
| Samsung SmartThings | `54.214.0.0/16`                    | Samsung TVs          |
| Roku Telemetry      | `23.246.0.0/16`                    | Roku analytics       |
| Generic IoT         | `35.186.0.0/16`, `34.82.0.0/16`    | Various IoT clouds   |

---

## Phase 3: DNS Sinkhole Configuration

### 3.1 UniFi Content Filtering (Ad Blocking)

Enable UniFi's built-in content filtering for the IoT VLAN:

1. Go to **Settings → Traffic & Security → Content Filtering**
2. Create a new profile: `IoT DNS Sinkhole`
3. Enable blocking categories:
   - Ads & Trackers
   - Telemetry
   - Command & Control
4. Apply to: `IoT Network (VLAN 20)`

### 3.2 Custom DNS Blocklist

Add these domains to the blocklist for aggressive IoT silencing:

```
# Smart TV Telemetry
*.samsungcloudsolution.com
*.samsungcloudsolution.net
*.tvsideloadhelper.amazon.com
data.mistat.xiaomi.com
tracking.miui.com

# Roku Telemetry
*.roku.com (except *.cdn.roku.com for updates)
logs.roku.com
cloudservices.roku.com

# Ring/Amazon
*.ring.com/api/v3/telemetry
device-metrics-us.amazon.com

# Generic IoT Telemetry
*.tuya*.com
*.smartthings.com/telemetry
*.iot.us-east-1.amazonaws.com
```

### 3.3 Alternative: Pi-hole/AdGuard for IoT VLAN Only

For more granular control:

1. Deploy Pi-hole on Docker (or LXC)
2. Set Pi-hole IP as DNS for IoT VLAN DHCP
3. Use Pi-hole's blocklists specifically for IoT
4. Main LAN continues to use normal DNS

```
IoT VLAN DHCP:
  DNS Server 1: 192.168.20.5 (Pi-hole)
  DNS Server 2: None (force Pi-hole)
```

---

## Phase 4: Device Migration Strategy

### 4.1 Automatic IoT Detection

Extend UniFiyMe to auto-detect and migrate IoT devices:

```typescript
// Proposed: src/iot-vlan-manager.ts
interface IoTDetectionCriteria {
  ouiPatterns: string[]; // MAC OUI prefixes
  hostnamePatterns: string[]; // Name keywords
  behaviorPatterns: {
    highDnsQueries: boolean; // >100 queries/hour
    constantConnections: boolean; // Always connected
    lowBandwidthSpikes: boolean; // Never >10Mbps
  };
}
```

### 4.2 Migration Phases

| Phase | Devices                        | Duration | Rollback             |
| ----- | ------------------------------ | -------- | -------------------- |
| 1     | Low-risk: Smart plugs, sensors | 1 week   | Move back to Main    |
| 2     | Medium-risk: Cameras, TVs      | 2 weeks  | Monitor connectivity |
| 3     | High-value: Roku, Chromecast   | 2 weeks  | Test streaming       |

### 4.3 IoT Device Candidates from Your Network

Based on the deep-dive output:

| Device            | MAC/ID         | Current VLAN | Action                  |
| ----------------- | -------------- | ------------ | ----------------------- |
| Smart-TV-01       | Generic-OUI-01 | Main         | Move to IoT             |
| IoT-Device-02     | Generic-OUI-02 | Main         | Move to IoT             |
| Unknown-Device-03 | Unknown        | Main         | Investigate, likely IoT |

---

## Phase 5: Monitoring & Metrics

### 5.1 New Prometheus Metrics

Add to `src/exporter.ts`:

```typescript
const iotVlanTraffic = new Gauge({
  name: "unifi_iot_vlan_traffic_bps",
  help: "Total traffic from IoT VLAN",
});

const iotBlockedConnections = new Counter({
  name: "unifi_iot_blocked_connections_total",
  help: "Number of blocked IoT connections",
});

const dnsBlockedQueries = new Counter({
  name: "unifi_dns_blocked_queries_total",
  help: "DNS queries blocked by sinkhole",
  labelNames: ["vlan"],
});
```

### 5.2 Grafana Dashboard Panels

Add to `unifi-overview.json`:

1. **IoT VLAN Traffic vs CPU Load** - Correlation panel
2. **Blocked IoT Connections** - Counter showing firewall effectiveness
3. **DNS Sinkhole Hits** - Shows how much telemetry is being blocked

---

## Phase 6: Verification Plan

### 6.1 Success Criteria

| Metric                | Before  | Target | Measurement   |
| --------------------- | ------- | ------ | ------------- |
| Gateway CPU Load      | 6.8%    | <5%    | UDM Dashboard |
| Gateway Memory        | 92.7%   | <85%   | UDM Dashboard |
| IoT WAN Traffic       | Unknown | -50%   | Prometheus    |
| Suricata Alerts (IoT) | ~5/day  | <1/day | Alarms API    |

### 6.2 Testing Checklist

- [ ] Roku can stream (Netflix, YouTube)
- [ ] Chromecast casting works from Main LAN
- [ ] Smart plugs respond to app commands
- [ ] Cameras can be viewed locally
- [ ] IoT devices cannot ping Main LAN
- [ ] CPU load reduced during peak hours

### 6.3 Rollback Procedure

If issues occur:

1. Move affected device back to Main VLAN via UniFi UI
2. Disable inter-VLAN firewall rule temporarily
3. Re-evaluate device compatibility

---

## Implementation Checklist

- [ ] **Phase 1**: Create IoT VLAN (192.168.20.0/24) in UniFi
- [ ] **Phase 1**: Create IoT WiFi SSID
- [ ] **Phase 2**: Configure inter-VLAN firewall rules
- [ ] **Phase 2**: Create telemetry IP blocklist group
- [ ] **Phase 3**: Enable DNS content filtering for IoT
- [ ] **Phase 3**: (Optional) Deploy Pi-hole for IoT DNS
- [ ] **Phase 4**: Migrate first batch of IoT devices
- [ ] **Phase 5**: Add monitoring metrics to exporter
- [ ] **Phase 5**: Update Grafana dashboard
- [ ] **Phase 6**: Verify CPU reduction
- [ ] **Phase 6**: Test device connectivity

---

## Automation via UniFiyMe

After manual validation, automate with new modules:

| File                           | Purpose                             |
| ------------------------------ | ----------------------------------- |
| `src/iot-vlan-manager.ts`      | Auto-detect and migrate IoT devices |
| `src/iot-vlan-manager.test.ts` | TDD tests                           |
| `src/firewall-manager.ts`      | Manage firewall rules via API       |

---

## Timeline Estimate

| Phase                       | Duration               |
| --------------------------- | ---------------------- |
| Phase 1-2 (VLAN + Firewall) | 1-2 hours manual setup |
| Phase 3 (DNS Sinkhole)      | 30 minutes             |
| Phase 4 (Migration)         | 2-4 weeks gradual      |
| Phase 5 (Monitoring)        | 2-3 hours development  |
| Phase 6 (Verification)      | 1 week observation     |

---

## Next Steps

1. **Manual Setup**: Create VLAN and firewall rules via UniFi UI first
2. **Test**: Move one low-risk IoT device and verify
3. **Automate**: Implement `iot-vlan-manager.ts` for ongoing management
4. **Monitor**: Watch CPU metrics post-migration

Would you like to proceed with the Code mode implementation of the automation components?
