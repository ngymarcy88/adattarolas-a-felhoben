import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export const MAX_PASSWORD_BYTES = 1024;
const COST = 131072;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const MAX_MEMORY_BYTES = 256 * 1024 * 1024;
const PREFIX = `scrypt$v1$${COST}$${BLOCK_SIZE}$${PARALLELISM}`;

// Preserve whitespace and Unicode exactly; reject invalid UTF-16 instead of
// silently replacing lone surrogates during UTF-8 conversion.
function isValidPassword(password: string): boolean {
  return typeof password === 'string' && password.length > 0 &&
    password.length <= MAX_PASSWORD_BYTES &&
    Buffer.byteLength(password, 'utf8') <= MAX_PASSWORD_BYTES &&
    Buffer.from(password, 'utf8').toString('utf8') === password;
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, {
      N: COST, r: BLOCK_SIZE, p: PARALLELISM, maxmem: MAX_MEMORY_BYTES,
    }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    if (!isValidPassword(password)) throw new Error('Invalid password input.');
    try {
      const salt = randomBytes(SALT_BYTES);
      const key = await deriveKey(password, salt);
      return `${PREFIX}$${salt.toString('hex')}$${key.toString('hex')}`;
    } catch {
      throw new Error('Password hashing failed.');
    }
  }

  async verify(password: string, storedHash: string): Promise<boolean> {
    if (!isValidPassword(password) || typeof storedHash !== 'string' || storedHash.length > 255) {
      return false;
    }
    const parts = storedHash.split('$');
    if (parts.length !== 7 || parts.slice(0, 5).join('$') !== PREFIX ||
        parts[5].length !== SALT_BYTES * 2 || parts[6].length !== KEY_BYTES * 2 ||
        !/^[0-9a-f]{32}$/.test(parts[5]) || !/^[0-9a-f]{128}$/.test(parts[6])) {
      return false;
    }
    // Stored input cannot select arbitrary costs, key lengths or memory usage.
    const salt = Buffer.from(parts[5], 'hex');
    const expected = Buffer.from(parts[6], 'hex');
    try {
      const actual = await deriveKey(password, salt);
      return timingSafeEqual(actual, expected);
    } catch {
      throw new Error('Password verification failed.');
    }
  }
}
