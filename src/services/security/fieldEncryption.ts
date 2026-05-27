import crypto from 'crypto';
import { getServerEnv } from '../../lib/env';

type EncryptedPayload = {
  iv: string;
  tag: string;
  value: string;
};

function getEncryptionKey() {
  const secret = getServerEnv().JWT_SECRET;
  return crypto.createHash('sha256').update(`${secret}:profile-encryption`).digest();
}

export function encryptSensitiveValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(trimmed, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload: EncryptedPayload = {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    value: encrypted.toString('base64'),
  };

  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

export function decryptSensitiveValue(payload: string | null | undefined) {
  if (!payload) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as EncryptedPayload;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getEncryptionKey(),
      Buffer.from(decoded.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(decoded.tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(decoded.value, 'base64')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

export function redactSensitiveValue(value: string | null | undefined) {
  const plain = value ? decryptSensitiveValue(value) || value : '';
  const normalized = plain.replace(/\s+/g, '');
  if (!normalized) return null;
  const last4 = normalized.slice(-4);
  return `****${last4}`;
}
