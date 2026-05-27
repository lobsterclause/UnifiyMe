# MCP Tool Gap Analysis — Dispatch Manifest

**Generated:** 2026-05-26
**Scope:** Unrealized MCP tool opportunities in UnifyMe — capabilities present in `src/` (UniFi client methods, manager classes, standalone scripts, SSH commands) but not exposed via [src/index.ts](src/index.ts) `ListTools` registry.
**Sources:** [src/index.ts](src/index.ts) (tool registry), [src/unifi/client.ts](src/unifi/client.ts) (API surface), [src/unifi/ssh.ts](src/unifi/ssh.ts), 8 manager classes, ~30 standalone scripts under [src/](src/), [plans/gap-analysis-report.md](plans/gap-analysis-report.md), [plans/iot-vlan-implementation-plan.md](plans/iot-vlan-implementation-plan.md), [README.md](README.md).

---

## Executive Summary

UnifyMe currently exposes **~46 MCP tools** but the underlying codebase implements **~80+ distinct capabilities**. The largest gaps are:

1. **Full CRUD missing for write-side resources** — port-forwards, traffic rules, firewall rules, networks/VLANs, and WLANs are read-only or "ensure"-only via MCP. Update/delete paths exist in [src/unifi/client.ts](src/unifi/client.ts) but are unwired.
2. **Manager-class capabilities are CLI-only** — `LatencyOptimizer` ([src/latency-optimizer.ts](src/latency-optimizer.ts), 540 LOC) and `UnifiMonitor` ([src/monitor.ts](src/monitor.ts), 300 LOC) are full subsystems with zero MCP surface area.
3. **20+ one-shot scripts are dead-ended** — `setup-nextdns-dot`, `enable-smart-queues`, `apply-rf-fixes`, `upgrade-ap-firmware`, `optimize-wifi-settings`, `create-unfiltered-wifi`, `setup-palworld-pf`, `revert-fixes`, etc. encode real operator workflows that an LLM agent cannot trigger.
4. **SSH surface collapsed to one generic tool** — `run_ssh_command` is a sharp edge (arbitrary remote exec) where typed wrappers (`flush_dns_cache`, `inspect_firewall_ruleset`, `get_nextdns_status`) would be safer and more discoverable.

Estimated effort to close P0+P1: ~3–5 sonnet days. Severity skews High because each missing tool blocks an entire class of agent-driven operations.

---

## Dispatch Table

| GAP | Type | Severity | Effort | Agent | Depends On |
|-----|------|----------|--------|-------|------------|
| GAP-01 | Partial | High | S | haiku | — |
| GAP-02 | Partial | High | S | haiku | — |
| GAP-03 | Partial | High | M | sonnet | — |
| GAP-04 | Partial | High | M | sonnet | — |
| GAP-05 | Untracked | High | M | sonnet | — |
| GAP-06 | Untracked | High | L | sonnet | — |
| GAP-07 | Untracked | Critical | M | sonnet | — |
| GAP-08 | Untracked | Medium | S | haiku | — |
| GAP-09 | Untracked | High | M | sonnet | — |
| GAP-10 | Untracked | Medium | S | haiku | — |
| GAP-11 | Untracked | Medium | M | sonnet | — |
| GAP-12 | Untracked | Medium | S | haiku | — |
| GAP-13 | Untracked | High | M | sonnet | — |
| GAP-14 | Untracked | High | S | haiku | — |
| GAP-15 | Untracked | Medium | M | sonnet | — |
| GAP-16 | Untracked | Medium | S | haiku | — |
| GAP-17 | Untracked | Medium | M | sonnet | — |
| GAP-18 | Drift | High | S | haiku | — |
| GAP-19 | Untracked | Medium | M | sonnet | — |
| GAP-20 | Untracked | Low | XS | haiku | — |
| GAP-21 | Untracked | Medium | S | haiku | — |
| GAP-22 | Untracked | High | M | sonnet | GAP-07 |

---

## Gap Tasks

### GAP-01: Expose full port-forward CRUD (`update_port_forward_rule`, `delete_port_forward_rule`)

**Context for the agent**: [src/unifi/client.ts:475-489](src/unifi/client.ts#L475-L489) implements `updatePortForwardRule` and `deletePortForwardRule`, but [src/index.ts](src/index.ts) only registers `get_port_forward_rules` and `ensure_port_forward_rule`. Agents can create but cannot modify or remove rules — every change becomes an append, which is unsafe.

**Type**: Partial · **Severity**: High · **Effort**: S

**Read these files first**:
- [src/unifi/client.ts:459-489](src/unifi/client.ts#L459-L489) — existing CRUD methods to call
- [src/index.ts:531-560](src/index.ts#L531-L560) — current `get_port_forward_rules` / `ensure_port_forward_rule` registrations to mirror

**What to do**:
1. Add two entries to the `ListTools` registry: `update_port_forward_rule` (args: `id`, partial payload) and `delete_port_forward_rule` (args: `id`).
2. Add matching `case` branches in the `CallTool` switch that call `unifi.updatePortForwardRule(id, payload)` / `unifi.deletePortForwardRule(id)`.
3. Return the updated rule (or `{ ok: true, id }` on delete).

**Acceptance criteria**:
- [ ] `grep -nE "update_port_forward_rule|delete_port_forward_rule" src/index.ts` returns ≥4 matches (2 in ListTools, 2 in CallTool).
- [ ] `pnpm test` (or `npm test`) passes.
- [ ] `pnpm build` succeeds.

**ClickUp**: CREATE — "MCP: full CRUD for port forwards"
**GitHub**: CREATE — "Expose update/delete port-forward MCP tools"

---

### GAP-02: Expose full traffic-rule CRUD (`get_traffic_rules`, `update_traffic_rule`, `delete_traffic_rule`)

**Context for the agent**: [src/unifi/client.ts:427-457](src/unifi/client.ts#L427-L457) implements `getTrafficRules`, `updateTrafficRule`, `deleteTrafficRule`. The only exposed tool is `ensure_traffic_rule` (idempotent create). Agents cannot enumerate or remove rules they previously created — a one-way ratchet.

**Type**: Partial · **Severity**: High · **Effort**: S

**Read these files first**:
- [src/unifi/client.ts:427-457](src/unifi/client.ts#L427-L457)
- [src/index.ts:423-440](src/index.ts#L423-L440) — `ensure_traffic_rule` shape to mirror

**What to do**:
1. Register `get_traffic_rules` (no args), `update_traffic_rule` (`id`, `payload`), `delete_traffic_rule` (`id`).
2. Wire CallTool branches to the client methods.

**Acceptance criteria**:
- [ ] All three tool names appear in both `ListTools` and `CallTool` blocks.
- [ ] `pnpm build` succeeds.

**ClickUp**: CREATE — "MCP: full CRUD for traffic rules"

---

### GAP-03: Expose firewall-rule create/update/delete

**Context for the agent**: [src/unifi/client.ts:403-409](src/unifi/client.ts#L403-L409) has `createFirewallRule` but no update/delete pair, and even create is unwired. `get_firewall_rules` / `get_firewall_groups` are the only firewall surface. Add the missing client methods, then expose all three.

**Type**: Partial · **Severity**: High · **Effort**: M

**Read these files first**:
- [src/unifi/client.ts:403-425](src/unifi/client.ts#L403-L425) — current state
- [src/check-firewall-rules.ts](src/check-firewall-rules.ts) — for endpoint reference
- [src/unifi/client.ts:475-489](src/unifi/client.ts#L475-L489) — pattern for `updateX`/`deleteX` via PUT/DELETE

**What to do**:
1. Add `updateFirewallRule(id, payload)` and `deleteFirewallRule(id)` to `UnifiClient` following the port-forward update/delete pattern (`PUT /rest/firewallrule/{id}` / `DELETE /rest/firewallrule/{id}` — verify endpoint via existing code).
2. Register `create_firewall_rule`, `update_firewall_rule`, `delete_firewall_rule` tools.
3. Add a `firewall-manager.test.ts` case covering the new client methods (mock fetch).

**Acceptance criteria**:
- [ ] New methods exist in `UnifiClient` with matching tests.
- [ ] Three new tools listed in `ListTools`.
- [ ] `pnpm test` passes.

**ClickUp**: CREATE — "MCP: firewall-rule CRUD"

---

### GAP-04: Expose network/VLAN CRUD (`list_networks`, `create_network`, `update_network`)

**Context for the agent**: [src/unifi/client.ts:387-401](src/unifi/client.ts#L387-L401) has `createNetwork` / `updateNetwork` and `getNetworkConf`. `get_network_config` already wraps the getter, but create/update are unwired despite [plans/iot-vlan-implementation-plan.md](plans/iot-vlan-implementation-plan.md) explicitly calling for VLAN provisioning via MCP. Also see [src/create-iot-vlan.ts](src/create-iot-vlan.ts) for the working payload shape.

**Type**: Partial · **Severity**: High · **Effort**: M

**Read these files first**:
- [src/unifi/client.ts:379-401](src/unifi/client.ts#L379-L401)
- [src/create-iot-vlan.ts](src/create-iot-vlan.ts) — canonical VLAN payload
- [plans/iot-vlan-implementation-plan.md](plans/iot-vlan-implementation-plan.md) — design intent

**What to do**:
1. Register `create_network` (args: `name`, `vlan`, `purpose`, `subnet`, `dhcp_enabled`, optional `dhcp_range`) and `update_network` (args: `id`, partial payload).
2. CallTool branches call `unifi.createNetwork(payload)` / `unifi.updateNetwork(id, payload)`.
3. Add input validation that rejects payloads missing `name` or `vlan`.

**Acceptance criteria**:
- [ ] Calling `create_network` with the IoT VLAN payload from `create-iot-vlan.ts` succeeds against the mock client (existing test infra).
- [ ] Schema rejects payloads missing required fields.

**ClickUp**: CREATE — "MCP: network/VLAN create + update"

---

### GAP-05: Expose `audit_latency` and `optimize_latency` tools wrapping `LatencyOptimizer`

**Context for the agent**: [src/latency-optimizer.ts](src/latency-optimizer.ts) is a 540-LOC subsystem with `LatencyOptimizer.audit()` (returns ranked findings) and `.optimize(dryRun)` (applies fixes). It's invoked only via the CLI `main()` at line 507 — completely invisible to MCP clients despite being one of the highest-value workflows in the repo.

**Type**: Untracked · **Severity**: High · **Effort**: M

**Read these files first**:
- [src/latency-optimizer.ts:39-460](src/latency-optimizer.ts#L39-L460) — `LatencyOptimizer` class API
- [src/latency-optimizer.test.ts](src/latency-optimizer.test.ts) — config shape, mock setup
- [src/index.ts:37-60](src/index.ts#L37-L60) — UnifiClient bootstrap pattern

**What to do**:
1. Add `audit_latency` (no args; returns `LatencyAuditResult[]` as JSON).
2. Add `optimize_latency` (args: `{ dry_run: boolean }`, default `true`; require explicit `dry_run: false` to apply).
3. Instantiate `LatencyOptimizer` lazily with the existing `unifi` client and a sensible default `LatencyOptimizationConfig` (import from the module or surface as tool args).

**Acceptance criteria**:
- [ ] Tools appear in `ListTools`.
- [ ] `optimize_latency` with no `dry_run` returns audit results without mutating (assert via test).
- [ ] `pnpm build` clean.

**Requires human approval**: No — `dry_run` default is the guardrail.

**ClickUp**: CREATE — "MCP: expose LatencyOptimizer"

---

### GAP-06: Expose `start_monitor` / `get_monitor_state` wrapping `UnifiMonitor`

**Context for the agent**: [src/monitor.ts](src/monitor.ts) implements a long-running monitor that detects events (new clients, signal drops, IoT misclassification). It runs only as a standalone process. Agents have no way to query "what is the monitor seeing right now?"

**Type**: Untracked · **Severity**: High · **Effort**: L

**Read these files first**:
- [src/monitor.ts:32-200](src/monitor.ts#L32-L200) — class shape
- [src/monitor.test.ts](src/monitor.test.ts) — event semantics
- [src/exporter.ts](src/exporter.ts) — pattern for long-lived processes alongside MCP

**What to do**:
1. Decide architecture: either (a) singleton monitor process started on first tool call, or (b) a stateless `inspect_monitor_signals` tool that runs one detection pass on demand. Recommend (b) for MCP simplicity.
2. Register `inspect_monitor_signals` returning the structured event list from one detection pass.
3. If (a) is chosen, also add `stop_monitor` and surface state via `get_monitor_state`.

**Acceptance criteria**:
- [ ] Tool registered, returns JSON array of events.
- [ ] Does not leak a hanging timer between calls (verify in test).

**ClickUp**: CREATE — "MCP: expose UnifiMonitor signals"

---

### GAP-07: Replace generic `run_ssh_command` with typed SSH tools

**Context for the agent**: [src/index.ts:271-281](src/index.ts#L271-L281) registers `run_ssh_command` which accepts any shell string — a sharp edge that bypasses every typed safety the rest of the MCP provides. Scripts under [src/](src/) (`setup-nextdns-dot.ts`, `ssh-firewall-check.ts`, `ssh-check.ts`, `check-dns-logs.exp`, `clear-dns-cache.exp`) encode the actual operator vocabulary. Wrap each as a typed tool; keep `run_ssh_command` but gate it behind an env flag.

**Type**: Untracked (also Security) · **Severity**: Critical · **Effort**: M

**Read these files first**:
- [src/index.ts:271-281](src/index.ts#L271-L281) — current generic tool
- [src/setup-nextdns-dot.ts](src/setup-nextdns-dot.ts)
- [src/ssh-firewall-check.ts](src/ssh-firewall-check.ts)
- [src/ssh-check.ts](src/ssh-check.ts)
- [clear-dns-cache.exp](clear-dns-cache.exp), [check-dns-logs.exp](check-dns-logs.exp)

**What to do**:
1. Add typed tools: `flush_dns_cache`, `inspect_firewall_ruleset` (wraps `nft list ruleset | head -n 20`), `get_router_uptime`, `get_dns_query_logs` (last N lines), `setup_nextdns_dot` (args: `config_id`).
2. Add env var `ALLOW_RAW_SSH=true` to gate `run_ssh_command`; default off → tool throws "raw SSH disabled — use typed tool".
3. Document the change in [README.md](README.md) security section.

**Acceptance criteria**:
- [ ] 5 typed SSH tools registered.
- [ ] `run_ssh_command` throws when `ALLOW_RAW_SSH` is unset.
- [ ] Existing `ssh.execute` callsites untouched.

**Requires human approval**: Yes — the env-gate is a behavior change for existing clients. Confirm before merging.

**ClickUp**: CREATE — "MCP: typed SSH tool suite + gate raw exec"

---

### GAP-08: Expose `set_client_fixed_ip` tool

**Context for the agent**: [src/unifi/client.ts:193-205](src/unifi/client.ts#L193-L205) implements `setClientFixedIp(client_id, network_id, ip?)` for static DHCP reservations — a common LLM-driven request ("give my NAS a static IP"). No MCP exposure.

**Type**: Untracked · **Severity**: Medium · **Effort**: S

**Read these files first**:
- [src/unifi/client.ts:193-205](src/unifi/client.ts#L193-L205)
- [src/index.ts:489-512](src/index.ts#L489-L512) — `set_client_alias`/`set_client_note` pattern

**What to do**:
1. Register `set_client_fixed_ip` (args: `mac` or `client_id`, `network_id`, optional `ip`).
2. If `mac` provided, resolve to `client_id` via existing client lookup (mirror `set_client_alias`).

**Acceptance criteria**:
- [ ] Tool registered.
- [ ] Accepts `mac` and resolves correctly in test.

**ClickUp**: CREATE — "MCP: set_client_fixed_ip"

---

### GAP-09: Expose WiFi/RF management tools (`enable_smart_queues`, `apply_rf_fixes`, `optimize_wifi_settings`, `revert_fixes`)

**Context for the agent**: Four standalone scripts encode high-value WiFi tuning: [src/enable-smart-queues.ts](src/enable-smart-queues.ts), [src/apply-rf-fixes.ts](src/apply-rf-fixes.ts), [src/optimize-wifi-settings.ts](src/optimize-wifi-settings.ts), [src/revert-fixes.ts](src/revert-fixes.ts). Each is a `main()` CLI. Refactor each into an exported function and add an MCP tool.

**Type**: Untracked · **Severity**: High · **Effort**: M

**Read these files first**:
- [src/apply-rf-fixes.ts](src/apply-rf-fixes.ts), [src/enable-smart-queues.ts](src/enable-smart-queues.ts), [src/optimize-wifi-settings.ts](src/optimize-wifi-settings.ts), [src/revert-fixes.ts](src/revert-fixes.ts)
- [src/latency-optimizer.ts:335-460](src/latency-optimizer.ts#L335-L460) — pattern for a `(dryRun)` apply function

**What to do**:
1. Refactor each script: extract logic into an exported `async function applyRfFixes(client, opts)` style, keep `main()` thin.
2. Register `apply_rf_fixes`, `enable_smart_queues`, `optimize_wifi_settings`, `revert_fixes` with `dry_run` arg (default `true`).
3. Each apply tool returns an array of `{ change, before, after, applied }`.

**Acceptance criteria**:
- [ ] All four scripts have exported entrypoints (not just `main()`).
- [ ] All four tools registered with `dry_run` defaulting to true.

**Requires human approval**: No — `dry_run` default is the guard.

**ClickUp**: CREATE — "MCP: WiFi/RF tuning tool suite"

---

### GAP-10: Expose `upgrade_ap_firmware` tool

**Context for the agent**: [src/upgrade-ap-firmware.ts](src/upgrade-ap-firmware.ts) is a one-shot AP firmware upgrade. `get_firmware_status` exists for reads but no write path. Pair it.

**Type**: Untracked · **Severity**: Medium · **Effort**: S

**Read these files first**:
- [src/upgrade-ap-firmware.ts](src/upgrade-ap-firmware.ts)
- [src/index.ts:309-316](src/index.ts#L309-L316) — `get_firmware_status` shape

**What to do**:
1. Refactor `upgrade-ap-firmware.ts` to export `upgradeApFirmware(client, deviceId)`.
2. Register `upgrade_ap_firmware` (args: `mac` or `device_id`).

**Acceptance criteria**:
- [ ] Tool registered; calls the refactored function.

**Requires human approval**: Yes — firmware upgrade is destructive on failure. Confirm before merging and consider a `confirm: true` arg.

**ClickUp**: CREATE — "MCP: upgrade_ap_firmware (with confirm gate)"

---

### GAP-11: Expose unfiltered/guest WiFi provisioning (`create_unfiltered_wifi`, `swap_unfiltered_wifi`, `reconfigure_wifi`)

**Context for the agent**: Three scripts manage guest-style WLANs: [src/create-unfiltered-wifi.ts](src/create-unfiltered-wifi.ts), [src/swap-unfiltered-wifi.ts](src/swap-unfiltered-wifi.ts), [src/reconfigure-wifi.ts](src/reconfigure-wifi.ts). No MCP exposure for creating WLANs at all.

**Type**: Untracked · **Severity**: Medium · **Effort**: M

**Read these files first**:
- All three script files above
- [src/unifi/client.ts:371-378](src/unifi/client.ts#L371-L378) — `getWlanConf` (only getter exposed; need to add a `createWlan` / `updateWlan` on the client too)

**What to do**:
1. Add `createWlan(payload)` and `updateWlan(id, payload)` to `UnifiClient` (mirror network methods, endpoint `/rest/wlanconf`).
2. Refactor the three scripts to export their core functions.
3. Register `create_unfiltered_wifi`, `swap_unfiltered_wifi`, `reconfigure_wifi` tools.

**Acceptance criteria**:
- [ ] `UnifiClient` has `createWlan`/`updateWlan`.
- [ ] Three new tools listed.

**ClickUp**: CREATE — "MCP: WLAN provisioning suite"

---

### GAP-12: Expose game-server port-forward shortcuts (`setup_palworld_pf`)

**Context for the agent**: [src/setup-palworld-pf.ts](src/setup-palworld-pf.ts) and [src/check-palworld.ts](src/check-palworld.ts) encode a "open these ports for Palworld" workflow. Generalize to `setup_game_server_pf(preset)` with presets like `palworld`, `minecraft`, etc.

**Type**: Untracked · **Severity**: Medium · **Effort**: S

**Read these files first**:
- [src/setup-palworld-pf.ts](src/setup-palworld-pf.ts), [src/check-palworld.ts](src/check-palworld.ts)
- [src/index.ts:539-560](src/index.ts#L539-L560) — `ensure_port_forward_rule`

**What to do**:
1. Add `src/game-presets.ts` with a record of `{ palworld: [{ port, proto }, ...], minecraft: [...] }`.
2. Register `setup_game_server_pf` (args: `preset`, `target_ip`).
3. Iterate presets and call `unifi.ensurePortForwardRule`.

**Acceptance criteria**:
- [ ] Preset map exists and is unit-tested.
- [ ] Tool calls `ensurePortForwardRule` once per preset entry.

**ClickUp**: CREATE — "MCP: game-server PF presets"

---

### GAP-13: Expose `find_historical_client` tool

**Context for the agent**: [src/find-historical-client.ts](src/find-historical-client.ts) searches the historical client list (last N hours) for a MAC/hostname — far more useful than the current `get_client_history` (which is per-MAC). Client method `getAllUsers(withinHours)` at [src/unifi/client.ts:314-320](src/unifi/client.ts#L314-L320) is already there.

**Type**: Untracked · **Severity**: High · **Effort**: M

**Read these files first**:
- [src/find-historical-client.ts](src/find-historical-client.ts)
- [src/unifi/client.ts:314-320](src/unifi/client.ts#L314-L320)

**What to do**:
1. Register `find_historical_client` (args: `query` string, `within_hours` default `8760`).
2. Wraps `getAllUsers` and filters by MAC fragment, hostname substring, or alias.

**Acceptance criteria**:
- [ ] Tool returns matches with full historical client record.
- [ ] Returns `[]` (not throws) on no match.

**ClickUp**: CREATE — "MCP: find_historical_client"

---

### GAP-14: Expose `identify_client` tool

**Context for the agent**: [src/identify-client.ts](src/identify-client.ts) classifies a client by OUI / DPI signature ("this MAC looks like a Sonos"). Pure read-only, no UniFi mutation. High value for agents reasoning about unknown devices.

**Type**: Untracked · **Severity**: High · **Effort**: S

**Read these files first**:
- [src/identify-client.ts](src/identify-client.ts)
- [src/check-sony-tv.ts](src/check-sony-tv.ts), [src/check-roku.ts](src/check-roku.ts) — examples of device-specific identification

**What to do**:
1. Refactor `identify-client.ts` to export `identifyClient(client, mac)`.
2. Register `identify_client` (args: `mac`).

**Acceptance criteria**:
- [ ] Returns `{ vendor, likely_device_type, signals: [...] }`.

**ClickUp**: CREATE — "MCP: identify_client"

---

### GAP-15: Expose NextDNS setup/status as typed tools

**Context for the agent**: [src/setup-nextdns-dot.ts](src/setup-nextdns-dot.ts) and [src/utils/nextdns.ts](src/utils/nextdns.ts) encode NextDNS-over-TLS setup. This currently requires `run_ssh_command` with the exact install incantation.

**Type**: Untracked · **Severity**: Medium · **Effort**: M

**Read these files first**:
- [src/setup-nextdns-dot.ts](src/setup-nextdns-dot.ts)
- [src/utils/nextdns.ts](src/utils/nextdns.ts)
- [src/utils/nextdns.test.ts](src/utils/nextdns.test.ts)

**What to do**:
1. Register `setup_nextdns_dot` (args: `config_id`).
2. Register `get_nextdns_status` (runs `nextdns version` + `status`).
3. Register `format_nextdns_endpoints` (args: `device_name`, `config_id` — returns DoT/DoH URLs; wraps the utils).

**Acceptance criteria**:
- [ ] Three NextDNS tools registered.
- [ ] `format_nextdns_endpoints` returns both DoT and DoH strings.

**ClickUp**: CREATE — "MCP: NextDNS tool trio"

---

### GAP-16: Expose `get_sites` and `get_site_sysinfo` tools

**Context for the agent**: [src/unifi/client.ts:139-157](src/unifi/client.ts#L139-L157) implements `getSites()` and `getSiteSysinfo()`. Multi-site UniFi controllers can't be navigated via MCP without these.

**Type**: Untracked · **Severity**: Medium · **Effort**: S

**Read these files first**:
- [src/unifi/client.ts:139-157](src/unifi/client.ts#L139-L157)
- [src/check-sites.ts](src/check-sites.ts)

**What to do**:
1. Register `get_sites` and `get_site_sysinfo` tools (no args).

**Acceptance criteria**:
- [ ] Both tools registered.

**ClickUp**: CREATE — "MCP: site introspection tools"

---

### GAP-17: Expose `get_dpi_apps` (DPI catalog)

**Context for the agent**: [src/unifi/client.ts:491-497](src/unifi/client.ts#L491-L497) implements `getDPIApps()` — the catalog of DPI app IDs needed to construct meaningful DPI rules. Agents currently can't translate "block TikTok" into the right app ID.

**Type**: Untracked · **Severity**: Medium · **Effort**: S

**Read these files first**:
- [src/unifi/client.ts:491-497](src/unifi/client.ts#L491-L497)
- [src/check-dpi.ts](src/check-dpi.ts) — usage pattern

**What to do**:
1. Register `get_dpi_apps` tool.

**Acceptance criteria**:
- [ ] Tool returns the DPI app catalog (or cached subset).

**ClickUp**: CREATE — "MCP: get_dpi_apps"

---

### GAP-18: Fix drift in `set_client_user_group` — `set_client_tags` is missing despite `set_device_tags` existing

**Context for the agent**: [src/index.ts:518-528](src/index.ts#L518-L528) registers `set_device_tags` (for APs/switches), and [src/unifi/client.ts:223-229](src/unifi/client.ts#L223-L229) implements `setClientTags`, but no `set_client_tags` MCP tool exists. Asymmetric surface.

**Type**: Drift · **Severity**: High · **Effort**: S

**Read these files first**:
- [src/unifi/client.ts:223-229](src/unifi/client.ts#L223-L229)
- [src/index.ts:518-528](src/index.ts#L518-L528) — `set_device_tags` registration

**What to do**:
1. Register `set_client_tags` mirroring `set_device_tags` shape but resolving `mac` → `client_id`.

**Acceptance criteria**:
- [ ] Tool registered.
- [ ] Test confirms tags persist for a mocked client.

**ClickUp**: CREATE — "MCP: set_client_tags (parity with set_device_tags)"

---

### GAP-19: Expose IoT VLAN creation (`create_iot_vlan`) per implementation plan

**Context for the agent**: [plans/iot-vlan-implementation-plan.md](plans/iot-vlan-implementation-plan.md) calls for end-to-end IoT VLAN provisioning. `detect_iot_devices`, `migrate_iot_devices`, `enforce_iot_limits` are exposed, but the VLAN creation step (encoded in [src/create-iot-vlan.ts](src/create-iot-vlan.ts)) is not — agents can detect and migrate to a VLAN that doesn't exist yet.

**Type**: Untracked (against design intent) · **Severity**: Medium · **Effort**: M

**Read these files first**:
- [src/create-iot-vlan.ts](src/create-iot-vlan.ts)
- [plans/iot-vlan-implementation-plan.md](plans/iot-vlan-implementation-plan.md)
- [src/iot-vlan-manager.ts](src/iot-vlan-manager.ts)

**What to do**:
1. Once GAP-04 is done, add `create_iot_vlan` as a thin wrapper that calls `create_network` with the canonical IoT payload, returning the new network's `_id` for use in `migrate_iot_devices`.

**Acceptance criteria**:
- [ ] Tool registered.
- [ ] Returns `{ network_id }` ready to pass to `migrate_iot_devices`.

**Depends on**: GAP-04
**ClickUp**: CREATE — "MCP: create_iot_vlan one-step provisioning"

---

### GAP-20: Expose `list_traffic_rules` shortcut for `get_dpi_stats` consumers

**Context for the agent**: Minor — agents reading `get_dpi_stats` often need the matching traffic rules. Once GAP-02 ships, `get_traffic_rules` covers this. Marking Low so it can be collapsed into GAP-02.

**Type**: Untracked · **Severity**: Low · **Effort**: XS

**Read these files first**: see GAP-02.

**What to do**: Fold into GAP-02 — no separate work.

**Acceptance criteria**:
- [ ] Closed as duplicate when GAP-02 merges.

---

### GAP-21: Expose `protect_vips` arg surface (currently no-arg)

**Context for the agent**: [src/index.ts:412-422](src/index.ts#L412-L422) registers `protect_vips` but takes no args — it reads `VIP_MACS` env. Agent has no way to inspect or override the VIP list at call time. Add args: `vip_macs?: string[]`, `default_group_id?: string`.

**Type**: Untracked (drift from intent) · **Severity**: Medium · **Effort**: S

**Read these files first**:
- [src/index.ts:412-422](src/index.ts#L412-L422)
- [src/qos-manager.ts:54-90](src/qos-manager.ts#L54-L90) — `protectVIPs(clients, defaultGroupId)`

**What to do**:
1. Extend the schema to accept optional `vip_macs` array and `default_group_id`.
2. Fall back to env vars if args absent (preserve back-compat).

**Acceptance criteria**:
- [ ] Tool accepts both arg-based and env-based invocation.
- [ ] Test asserts arg overrides env.

**ClickUp**: CREATE — "MCP: protect_vips accepts explicit VIP list"

---

### GAP-22: Add `inspect_dns_logs` typed SSH tool (depends on GAP-07)

**Context for the agent**: [check-dns-logs.exp](check-dns-logs.exp) (root-level expect script) tails NextDNS logs over SSH. Worth exposing as a typed read-only tool once the SSH gate from GAP-07 lands.

**Type**: Untracked · **Severity**: High · **Effort**: M

**Read these files first**:
- [check-dns-logs.exp](check-dns-logs.exp)
- [clear-dns-cache.exp](clear-dns-cache.exp), [clear-dns-cache.js](clear-dns-cache.js)

**What to do**:
1. Translate the expect script logic into a `UnifiSSH.execute(...)` call sequence (no `expect` binary dependency at runtime).
2. Register `inspect_dns_logs` (args: `lines?: number`).
3. Register `clear_dns_cache` (no args).

**Acceptance criteria**:
- [ ] Two typed DNS tools registered.
- [ ] Works without the `expect` binary on the router/host.

**Depends on**: GAP-07
**ClickUp**: CREATE — "MCP: typed DNS log inspection + cache clear"

---

## Execution Order

### Wave 1 — Parallel, no dependencies (haiku-sized)
| GAP | Title |
|---|---|
| GAP-01 | Port-forward update/delete |
| GAP-02 | Traffic-rule full CRUD |
| GAP-08 | set_client_fixed_ip |
| GAP-10 | upgrade_ap_firmware (with confirm) |
| GAP-12 | Game-server PF presets |
| GAP-14 | identify_client |
| GAP-16 | get_sites / get_site_sysinfo |
| GAP-17 | get_dpi_apps |
| GAP-18 | set_client_tags parity |
| GAP-20 | (fold into GAP-02) |
| GAP-21 | protect_vips args |

### Wave 2 — Parallel, sonnet-sized, no cross-deps
| GAP | Title |
|---|---|
| GAP-03 | Firewall-rule CRUD |
| GAP-04 | Network/VLAN CRUD |
| GAP-05 | LatencyOptimizer tools |
| GAP-06 | Monitor signals tool |
| GAP-09 | WiFi/RF tuning suite |
| GAP-11 | WLAN provisioning suite |
| GAP-13 | find_historical_client |
| GAP-15 | NextDNS tool trio |

### Wave 3 — Depends on prior waves
| GAP | Depends On |
|---|---|
| GAP-07 | independent but Critical — schedule alongside Wave 2 |
| GAP-19 | GAP-04 |
| GAP-22 | GAP-07 |

### Human Queue
- **GAP-07**: typed SSH suite + gating `run_ssh_command` is a behavior change. Confirm the `ALLOW_RAW_SSH=true` opt-in default before merging.
- **GAP-10**: firmware upgrades are destructive on failure. Confirm whether to add a mandatory `confirm: true` arg in addition to the env gate.

---

## Source Coverage

**Analyzed**:
- [src/index.ts](src/index.ts) full tool registry (lines 1–1265).
- [src/unifi/client.ts](src/unifi/client.ts) — all 40+ methods enumerated.
- [src/unifi/ssh.ts](src/unifi/ssh.ts) — single `execute` method; expansion happens at the call sites in scripts.
- 8 manager classes: `LatencyOptimizer`, `QoSManager`, `RestrictedManager` (YouTube), `IotVlanManager`, `FirewallManager`, `UnifiMonitor`, `UnifiSSH`.
- ~30 standalone scripts under [src/](src/) (one-shot CLIs).
- Root expect scripts ([check-dns-logs.exp](check-dns-logs.exp), [clear-dns-cache.exp](clear-dns-cache.exp), [clear-dns-cache.js](clear-dns-cache.js)).
- Plans: [plans/gap-analysis-report.md](plans/gap-analysis-report.md), [plans/iot-vlan-implementation-plan.md](plans/iot-vlan-implementation-plan.md).

**Skipped / blind spots**:
- [src/gateway.ts](src/gateway.ts) (HTTP gateway, not MCP) — not in scope for this analysis; may have its own gap inventory.
- [src/exporter.ts](src/exporter.ts) (Prometheus) — same reason.
- [src/discord-bot.ts](src/discord-bot.ts) — separate surface.
- ClickUp / GitHub Issues were **not** queried this run — task IDs in the manifest are marked `CREATE`. If desired, re-run with the ClickUp MCP connector active to deduplicate against any existing tickets.
- Did not deep-audit each script's `main()` for hidden side-effects; recommended a dry-run-default for every newly exposed apply-style tool.
