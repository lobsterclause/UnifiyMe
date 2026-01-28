import { UnifiClientDevice, UnifiClient } from './unifi/client.js';

export class RestrictedManager {
  private BLOCK_RULE_DESCRIPTION = 'Block YouTube for Restricted (Baseline)';
  private ALLOW_RULE_DESCRIPTION = 'Allow YouTube for Restricted (Temporary Override)';

  identifyRestrictedDevices(clients: UnifiClientDevice[]): UnifiClientDevice[] {
    return clients.filter(client => {
      const name = (client.name || '').toLowerCase();
      const hostname = (client.hostname || '').toLowerCase();
      return name.includes('restricted') || hostname.includes('restricted');
    });
  }

  async setupRules(unifi: UnifiClient): Promise<void> {
    const networks = await unifi.getNetworkConf();
    const restrictedNetwork = networks.find(n => n.name === 'Restricted');
    
    const clients = await unifi.getClients();
    const restrictedDevices = this.identifyRestrictedDevices(clients);
    
    if (!restrictedNetwork && restrictedDevices.length === 0) return;

    const apps = await unifi.getDPIApps();
    const youtubeApp = apps.find(a => a.name.toLowerCase() === 'youtube');
    if (!youtubeApp) {
      throw new Error('YouTube app not found in UniFi DPI apps');
    }

    const rules = await unifi.getTrafficRules();
    
    const targetPayload: any = {};
    if (restrictedNetwork) {
      targetPayload.target_network_ids = [restrictedNetwork._id];
    } else {
      targetPayload.target_devices = restrictedDevices.map(d => d.mac);
    }

    // 1. Ensure Baseline Block Rule
    let blockRule = rules.find(r => r.description === this.BLOCK_RULE_DESCRIPTION);
    if (!blockRule) {
      await unifi.createTrafficRule({
        description: this.BLOCK_RULE_DESCRIPTION,
        enabled: true,
        action: 'BLOCK',
        matching_target: 'APP',
        target_app_ids: [youtubeApp._id],
        ...targetPayload
      });
    } else if (!blockRule.enabled) {
      await unifi.updateTrafficRule(blockRule._id, { ...blockRule, enabled: true });
    }

    // 2. Ensure Temporary Allow Rule (starts disabled)
    let allowRule = rules.find(r => r.description === this.ALLOW_RULE_DESCRIPTION);
    if (!allowRule) {
      await unifi.createTrafficRule({
        description: this.ALLOW_RULE_DESCRIPTION,
        enabled: false,
        action: 'ALLOW',
        matching_target: 'APP',
        target_app_ids: [youtubeApp._id],
        ...targetPayload
      });
    }
  }

  async blockYouTube(unifi: UnifiClient): Promise<void> {
    await this.setupRules(unifi);
    const rules = await unifi.getTrafficRules();
    const allowRule = rules.find(r => r.description === this.ALLOW_RULE_DESCRIPTION);
    if (allowRule && allowRule.enabled) {
      await unifi.updateTrafficRule(allowRule._id, { ...allowRule, enabled: false });
    }
  }

  async unblockYouTube(unifi: UnifiClient): Promise<void> {
    await this.setupRules(unifi);
    const rules = await unifi.getTrafficRules();
    const allowRule = rules.find(r => r.description === this.ALLOW_RULE_DESCRIPTION);
    if (allowRule && !allowRule.enabled) {
      await unifi.updateTrafficRule(allowRule._id, { ...allowRule, enabled: true });
    }
  }

  async isYouTubeBlocked(unifi: UnifiClient): Promise<boolean> {
    const rules = await unifi.getTrafficRules();
    const allowRule = rules.find(r => r.description === this.ALLOW_RULE_DESCRIPTION);
    return !(allowRule && allowRule.enabled);
  }

  /**
   * Periodically called to ensure the baseline blocking rules exist and are enabled.
   */
  async reEnforceBlocking(unifi: UnifiClient): Promise<void> {
    await this.setupRules(unifi);
  }
}
