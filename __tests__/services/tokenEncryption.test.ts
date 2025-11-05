import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { decryptToken, encryptToken } from '@/lib/services/tokenEncryption';

const HEX_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('tokenEncryption service', () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = HEX_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.ENCRYPTION_KEY;
    } else {
      process.env.ENCRYPTION_KEY = originalKey;
    }
  });

  it('encrypts and decrypts a token using the configured key', () => {
    const token = 'ya29.a0AfB_byExampleToken';

    const encrypted = encryptToken(token);
    expect(encrypted).not.toBe(token);

    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(token);
  });

  it('throws when decrypting with an incorrect key override', () => {
    const token = 'prev-refresh-token';
    const encrypted = encryptToken(token);

    expect(() => decryptToken(encrypted, 'b'.repeat(32))).toThrowError(
      /Failed to decrypt token/i
    );
  });

  it('rejects encryption when ENCRYPTION_KEY is not configured', () => {
    delete process.env.ENCRYPTION_KEY;

    expect(() => encryptToken('token')).toThrowError(/ENCRYPTION_KEY environment variable is required/i);
  });
});
