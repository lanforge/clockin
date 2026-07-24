const crypto = require('crypto');

// AES-256-GCM encryption for sensitive PII (SSN / EIN) stored at rest.
// Key comes from CONTRACT_ENC_KEY env var: either 64 hex chars (32 bytes) or a
// passphrase that we hash to 32 bytes. If the key is ever lost, previously
// encrypted values cannot be recovered and must be re-entered.

const ALGO = 'aes-256-gcm';

function getKey() {
  const raw = process.env.CONTRACT_ENC_KEY;
  if (!raw) return null;
  // 64 hex chars => treat as raw 32-byte key, otherwise derive via sha256.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

function isConfigured() {
  return !!getKey();
}

// Returns a compact string "v1:<ivHex>:<tagHex>:<cipherHex>" or null for empty input.
function encrypt(plaintext) {
  if (plaintext === undefined || plaintext === null || plaintext === '') return null;
  const key = getKey();
  if (!key) throw new Error('CONTRACT_ENC_KEY is not set; cannot encrypt sensitive data');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

// Returns the decrypted string, or null if input is empty / cannot be decrypted.
function decrypt(payload) {
  if (!payload || typeof payload !== 'string') return null;
  const key = getKey();
  if (!key) return null;
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const iv = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const data = Buffer.from(parts[3], 'hex');
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.error('Decrypt failed:', err.message);
    return null;
  }
}

// Mask all but the last 4 characters, for safe display back to the client.
function mask(plaintext, visible = 4) {
  if (!plaintext) return '';
  const str = String(plaintext);
  if (str.length <= visible) return '•'.repeat(str.length);
  return '•'.repeat(str.length - visible) + str.slice(-visible);
}

module.exports = { encrypt, decrypt, mask, isConfigured };
