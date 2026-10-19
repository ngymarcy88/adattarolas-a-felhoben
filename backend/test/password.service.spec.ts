import crypto from 'node:crypto';
import { MAX_PASSWORD_BYTES, PasswordService } from '../src/auth/password.service';

const password = 'unit-only-password-with-árvíztűrő';
const service = new PasswordService();
let storedHash: string;

// Real, production-cost scrypt calls run sequentially; no reduced test cost.
jest.setTimeout(15000);
beforeAll(async () => { storedHash = await service.hash(password); });
afterEach(() => jest.restoreAllMocks());

describe('PasswordService', () => {
  it('produces a versioned, salted hash that fits the database field', () => {
    expect(storedHash).toMatch(/^scrypt\$v1\$131072\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(storedHash.length).toBeLessThanOrEqual(255);
    expect(storedHash).not.toContain(password);
  });

  // Independent synthetic fixture generated with Python hashlib.scrypt.
  it('verifies an independently generated scrypt fixture', async () => {
    const fixture = 'scrypt$v1$131072$8$1$000102030405060708090a0b0c0d0e0f$0e289120333bde436358e1cb8c1e462c847fbb57b75ed683204f01b90f3a7e9ec3198f6f2a0bec44c746d8650b13e66e02efa662aa2219ed5caed9c5b568e7ab';
    await expect(service.verify('unit-known-password', fixture)).resolves.toBe(true);
  });

  it('uses a fresh random salt for the same password', async () => {
    const other = await service.hash(password);
    expect(other).not.toBe(storedHash);
    expect(other.split('$')[5]).not.toBe(storedHash.split('$')[5]);
    await expect(service.verify(password, other)).resolves.toBe(true);
  });

  it('accepts the correct password and rejects an incorrect one', async () => {
    await expect(service.verify(password, storedHash)).resolves.toBe(true);
    await expect(service.verify(`${password}!`, storedHash)).resolves.toBe(false);
  });

  it('preserves whitespace rather than trimming it', async () => {
    const hash = await service.hash('  unit-only-password  ');
    await expect(service.verify('  unit-only-password  ', hash)).resolves.toBe(true);
    await expect(service.verify('unit-only-password', hash)).resolves.toBe(false);
  });

  it('does not normalize different Unicode sequences', async () => {
    const hash = await service.hash('unit-only-caf\u00e9');
    await expect(service.verify('unit-only-caf\u00e9', hash)).resolves.toBe(true);
    await expect(service.verify('unit-only-cafe\u0301', hash)).resolves.toBe(false);
  });

  it('checks characters after byte 72 without truncation', async () => {
    const prefix = 'a'.repeat(100);
    const hash = await service.hash(`${prefix}x`);
    await expect(service.verify(`${prefix}x`, hash)).resolves.toBe(true);
    await expect(service.verify(`${prefix}y`, hash)).resolves.toBe(false);
  });

  it.each(['a'.repeat(MAX_PASSWORD_BYTES), '🙂'.repeat(MAX_PASSWORD_BYTES / 4)])
    ('supports the UTF-8 byte boundary %#', async (input) => {
      const hash = await service.hash(input);
      await expect(service.verify(input, hash)).resolves.toBe(true);
    });

  it.each(['', 'a'.repeat(MAX_PASSWORD_BYTES + 1), '🙂'.repeat(257), '\ud800', '\udc00', null, undefined, 42])
    ('rejects invalid password input %# without invoking scrypt', async (input) => {
      const derive = jest.spyOn(crypto, 'scrypt');
      await expect(service.hash(input as string)).rejects.toThrow('Invalid password input.');
      await expect(service.verify(input as string, storedHash)).resolves.toBe(false);
      expect(derive).not.toHaveBeenCalled();
    });

  it.each([
    '', 'plaintext', 'x'.repeat(256), null, undefined,
    'scrypt$v2$131072$8$1$',
    'scrypt$v1$1073741824$8$1$',
    'scrypt$v1$131072$8$999$',
  ])('rejects malformed, unknown or excessive-cost stored hashes %# without scrypt', async (input) => {
    const derive = jest.spyOn(crypto, 'scrypt');
    await expect(service.verify(password, input as string)).resolves.toBe(false);
    expect(derive).not.toHaveBeenCalled();
  });

  it('rejects a tampered digest with the correct shape', async () => {
    const parts = storedHash.split('$');
    parts[6] = '0'.repeat(128);
    await expect(service.verify(password, parts.join('$'))).resolves.toBe(false);
  });

  it.each(['invalid-salt', 'short-digest', 'extra-field', 'huge-cost', 'salt-newline', 'digest-newline'])
    ('rejects malformed fields on an otherwise complete record: %s', async (change) => {
      const parts = storedHash.split('$');
      if (change === 'invalid-salt') parts[5] = 'z'.repeat(32);
      if (change === 'short-digest') parts[6] = '0'.repeat(126);
      if (change === 'extra-field') parts.push('extra');
      if (change === 'huge-cost') parts[2] = '1073741824';
      if (change === 'salt-newline') parts[5] += '\n';
      if (change === 'digest-newline') parts[6] += '\n';
      const derive = jest.spyOn(crypto, 'scrypt');
      await expect(service.verify(password, parts.join('$'))).resolves.toBe(false);
      expect(derive).not.toHaveBeenCalled();
    });

  it('sanitizes random source failures', async () => {
    jest.spyOn(crypto, 'randomBytes').mockImplementation(() => { throw new Error('private random-source details'); });
    await expect(service.hash(password)).rejects.toThrow(/^Password hashing failed\.$/);
  });

  it('sanitizes hashing failures', async () => {
    jest.spyOn(crypto, 'scrypt').mockImplementation((...args: unknown[]) => {
      (args[4] as (error: Error) => void)(new Error('private crypto-provider details'));
    });
    await expect(service.hash(password)).rejects.toThrow(/^Password hashing failed\.$/);
  });

  it('reports crypto failure distinctly from an incorrect password', async () => {
    jest.spyOn(crypto, 'scrypt').mockImplementation((...args: unknown[]) => {
      (args[4] as (error: Error) => void)(new Error('private crypto-provider details'));
    });
    await expect(service.verify(password, storedHash)).rejects.toThrow(/^Password verification failed\.$/);
  });
});
