import CryptoJS from 'crypto-js';

const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 16;
const PAYLOAD_SEPARATOR = ':';

function resolveEncryptionKey(rawKeyOverride?: string) {
  const rawKey = (rawKeyOverride ?? process.env.ENCRYPTION_KEY)?.trim();

  if (!rawKey) {
    throw new Error('ENCRYPTION_KEY environment variable is required for token encryption');
  }

  const buffer =
    rawKey.length === KEY_LENGTH_BYTES * 2 && /^[0-9a-f]+$/i.test(rawKey)
      ? Buffer.from(rawKey, 'hex')
      : Buffer.from(rawKey, 'utf8');

  if (buffer.length !== KEY_LENGTH_BYTES) {
    throw new Error('ENCRYPTION_KEY must be 32 bytes (256 bits) after decoding');
  }

  return CryptoJS.lib.WordArray.create(buffer);
}

function encodePayload(iv: CryptoJS.lib.WordArray, cipherText: CryptoJS.lib.WordArray) {
  const ivHex = CryptoJS.enc.Hex.stringify(iv);
  const cipherHex = CryptoJS.enc.Hex.stringify(cipherText);
  const joined = `${ivHex}${PAYLOAD_SEPARATOR}${cipherHex}`;
  return Buffer.from(joined, 'utf8').toString('base64');
}

function decodePayload(payload: string) {
  let decoded: string;

  try {
    decoded = Buffer.from(payload, 'base64').toString('utf8');
  } catch (error) {
    throw new Error('Encrypted token payload is not valid base64');
  }

  const [ivHex, cipherHex] = decoded.split(PAYLOAD_SEPARATOR);

  if (!ivHex || !cipherHex) {
    throw new Error('Encrypted token payload is malformed');
  }

  const iv = CryptoJS.enc.Hex.parse(ivHex);
  const cipherText = CryptoJS.enc.Hex.parse(cipherHex);

  if (iv.sigBytes !== IV_LENGTH_BYTES) {
    throw new Error('Encrypted token payload has invalid IV length');
  }

  return { iv, cipherText };
}

export function encryptToken(token: string, keyOverride?: string): string {
  if (!token) {
    throw new Error('Token value must be a non-empty string');
  }

  const key = resolveEncryptionKey(keyOverride);
  const iv = CryptoJS.lib.WordArray.random(IV_LENGTH_BYTES);

  const encrypted = CryptoJS.AES.encrypt(token, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return encodePayload(iv, encrypted.ciphertext);
}

export function decryptToken(payload: string, keyOverride?: string): string {
  if (!payload) {
    throw new Error('Encrypted payload must be a non-empty string');
  }

  const key = resolveEncryptionKey(keyOverride);
  const { iv, cipherText } = decodePayload(payload);

  const decrypted = CryptoJS.AES.decrypt(
    { ciphertext: cipherText },
    key,
    {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }
  );

  const plaintext = decrypted.toString(CryptoJS.enc.Utf8);

  if (!plaintext) {
    throw new Error('Failed to decrypt token with provided key');
  }

  return plaintext;
}

export function isEncryptionKeyConfigured(): boolean {
  return Boolean(process.env.ENCRYPTION_KEY?.trim());
}
