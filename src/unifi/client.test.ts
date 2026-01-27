import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnifiClient } from './client.js';

// Mock node-unifi
vi.mock('node-unifi', () => {
  const Controller = vi.fn();
  Controller.prototype.login = vi.fn().mockResolvedValue(true);
  Controller.prototype.getAccessDevices = vi.fn().mockResolvedValue([]);
  Controller.prototype.getClientDevices = vi.fn().mockResolvedValue([]);
  Controller.prototype.customApiRequest = vi.fn();
  
  return {
    default: {
      Controller
    }
  };
});

describe('UnifiClient Traffic Rules', () => {
  let client: UnifiClient;

  beforeEach(async () => {
    client = new UnifiClient('https://localhost', 'user', 'pass', 'default');
    await client.connect();
  });

  it('should call customApiRequest for getTrafficRules', async () => {
    const mockRules = [{ _id: 'rule1', name: 'Block YouTube' }];
    (client.controller as any).customApiRequest.mockResolvedValue(mockRules);
    
    const rules = await client.getTrafficRules();
    
    expect(client.controller.customApiRequest).toHaveBeenCalledWith('/api/s/default/rest/trafficrule');
    expect(rules).toEqual(mockRules);
  });

  it('should call customApiRequest for createTrafficRule', async () => {
    const payload = { name: 'Block YouTube' };
    (client.controller as any).customApiRequest.mockResolvedValue({ _id: 'new_rule' });
    
    const result = await client.createTrafficRule(payload);
    
    expect(client.controller.customApiRequest).toHaveBeenCalledWith('/api/s/default/rest/trafficrule', 'POST', payload);
    expect(result).toEqual({ _id: 'new_rule' });
  });

  it('should call customApiRequest for updateTrafficRule', async () => {
    const payload = { enabled: false };
    (client.controller as any).customApiRequest.mockResolvedValue({ _id: 'rule1' });
    
    const result = await client.updateTrafficRule('rule1', payload);
    
    expect(client.controller.customApiRequest).toHaveBeenCalledWith('/api/s/default/rest/trafficrule/rule1', 'PUT', payload);
    expect(result).toEqual({ _id: 'rule1' });
  });

  it('should call customApiRequest for deleteTrafficRule', async () => {
    (client.controller as any).customApiRequest.mockResolvedValue({});
    
    await client.deleteTrafficRule('rule1');
    
    expect(client.controller.customApiRequest).toHaveBeenCalledWith('/api/s/default/rest/trafficrule/rule1', 'DELETE');
  });
});
