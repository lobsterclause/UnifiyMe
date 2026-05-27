import { describe, it, expect } from 'vitest';
import { formatDoH, formatDoT } from './nextdns.js';

describe('NextDNS utility', () => {
  const configId = '6ca463';

  describe('formatDoT', () => {
    it('should format simple names correctly', () => {
      expect(formatDoT('John Router', configId)).toBe('John--Router-6ca463.dns.nextdns.io');
    });

    it('should handle names with special characters by stripping them (except a-z, A-Z, 0-9 and -)', () => {
      expect(formatDoT("John's Router!", configId)).toBe('Johns--Router-6ca463.dns.nextdns.io');
    });

    it('should replace spaces with --', () => {
      expect(formatDoT('My Device Name', configId)).toBe('My--Device--Name-6ca463.dns.nextdns.io');
    });

    it('should handle names with multiple consecutive spaces', () => {
      expect(formatDoT('John  Router', configId)).toBe('John----Router-6ca463.dns.nextdns.io');
    });

    it('should handle names that already contain dashes', () => {
      expect(formatDoT('My-Device', configId)).toBe('My-Device-6ca463.dns.nextdns.io');
    });
  });

  describe('formatDoH', () => {
    it('should format simple names correctly', () => {
      expect(formatDoH("John's Firefox", configId)).toBe('https://dns.nextdns.io/6ca463/John\'s%20Firefox');
    });

    it('should URL encode the device name', () => {
      expect(formatDoH('My iPhone & iPad', configId)).toBe('https://dns.nextdns.io/6ca463/My%20iPhone%20%26%20iPad');
    });
  });
});
