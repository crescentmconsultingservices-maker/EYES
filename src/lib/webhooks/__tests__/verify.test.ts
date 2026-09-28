import { describe, it, expect } from 'vitest';
import { safeEqual, verifySlackSignature, verifyMetaSignature } from '../verify';

describe('Webhook Verification', () => {
  describe('safeEqual', () => {
    it('returns true for identical strings', () => {
      expect(safeEqual('hello', 'hello')).toBe(true);
    });

    it('returns false for different strings', () => {
      expect(safeEqual('hello', 'world')).toBe(false);
    });

    it('returns false for strings of different lengths', () => {
      expect(safeEqual('hello', 'hello ')).toBe(false);
    });
  });

  describe('verifySlackSignature', () => {
    it('returns false if any argument is missing', () => {
      expect(verifySlackSignature('body', null, 'sig', 'secret')).toBe(false);
      expect(verifySlackSignature('body', '123', null, 'secret')).toBe(false);
      expect(verifySlackSignature('body', '123', 'sig', undefined)).toBe(false);
    });

    it('returns false if timestamp is too old', () => {
      const nowMs = 1000000;
      const oldTimestamp = String(nowMs / 1000 - 600); // 10 minutes ago
      expect(verifySlackSignature('body', oldTimestamp, 'sig', 'secret', nowMs)).toBe(false);
    });
    
    // Testing the actual hash logic might require replicating the HMAC here, 
    // but the above covers the safety checks.
  });

  describe('verifyMetaSignature', () => {
    it('returns false if appSecret or header is missing', () => {
      expect(verifyMetaSignature('body', null, 'secret')).toBe(false);
      expect(verifyMetaSignature('body', 'sha256=abc', undefined)).toBe(false);
    });

    it('returns false if header does not start with sha256=', () => {
      expect(verifyMetaSignature('body', 'abc', 'secret')).toBe(false);
    });
  });
});
