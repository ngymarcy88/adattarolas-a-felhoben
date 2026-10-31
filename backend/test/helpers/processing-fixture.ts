import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ProcessingStateService } from '../../src/processing/processing-state.service';
import type { CandidateMetadata, ProcessingPolicy } from '../../src/processing/processing-state.types';

export const processingOwner = '00000000-0000-4000-8000-000000000101';
export const processingFile = '00000000-0000-4000-8000-000000000102';
export const processingWorker = '00000000-0000-4000-8000-000000000103';
export const processingPolicy: ProcessingPolicy = {
  key: 'thumbnail', version: '1.0.0', implementationFingerprint: 'a'.repeat(64), supportedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
};
export const candidate: CandidateMetadata = {
  sourceSha256: 'b'.repeat(64), sourceETag: '"synthetic-source"', outputSha256: 'c'.repeat(64),
  sizeBytes: 200, width: 32, height: 16, implementationFingerprint: processingPolicy.implementationFingerprint,
};

// This is a deliberately small transactional Prisma double, not a PostgreSQL simulator.
// SQL/CHECK/FK behavior belongs to the separately authorized schema verifier.
type Row = Record<string, any>;
type Table = 'user' | 'fileObject' | 'processingJob' | 'processingAttempt' | 'derivedObject' | 'auditEvent';
type Store = Record<Table, Row[]>;
const clone = <T>(value: T): T => structuredClone(value);
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'AND') return (Array.isArray(expected) ? expected : [expected]).every((item) => matches(row, item));
    if (key === 'OR') return expected.some((item: Row) => matches(row, item));
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      if ('in' in expected) return expected.in.includes(row[key]);
      if ('equals' in expected) return row[key] === expected.equals;
      if ('not' in expected) return row[key] !== expected.not;
      if ('lte' in expected) return row[key] <= expected.lte;
      if ('gt' in expected) return row[key] > expected.gt;
      // Prisma compound unique selectors contain scalar field constraints.
      if (!(key in row)) return matches(row, expected);
    }
    if (expected instanceof Date) return +row[key] === +expected;
    return row[key] === expected;
  });
}
function apply(row: Row, data: Row): void {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('increment' in value) { row[key] += value.increment; continue; }
      if ('decrement' in value) { row[key] -= value.decrement; continue; }
      if ('set' in value) { row[key] = clone(value.set); continue; }
    }
    row[key] = clone(value);
  }
}

export function processingFixture() {
  const fixture = {
    now: new Date('2026-10-30T12:00:00.000Z'),
    store: {
      user: [{ id: processingOwner, usedStorageBytes: 100n, reservedStorageBytes: 0n, storageLimitBytes: 10000n }],
      fileObject: [{ id: processingFile, ownerId: processingOwner, status: 'ACTIVE', originalName: 'synthetic.png',
        storageKey: `originals/${processingOwner}/${processingFile}`, sizeBytes: 100n, mimeType: 'image/png', detectedMimeType: 'image/png',
        deletedAt: null, purgeAfter: null, checksum: null }],
      processingJob: [], processingAttempt: [], derivedObject: [], auditEvent: [],
    } as Store,
    log: [] as string[],
    writes: 0,
    failWrite: 0,
    loseCommitResponse: false,
    onWrite: undefined as undefined | ((operation: string) => void),
    get user() { return this.store.user[0]!; },
    get file() { return this.store.fileObject[0]!; },
    get jobs() { return this.store.processingJob; },
    get attempts() { return this.store.processingAttempt; },
    get results() { return this.store.derivedObject; },
    get audits() { return this.store.auditEvent; },
    advance(ms: number) { this.now = new Date(+this.now + ms); },
  };
  const beforeWrite = (operation: string) => {
    fixture.log.push(operation); fixture.writes++; fixture.onWrite?.(operation);
    if (fixture.failWrite && fixture.writes === fixture.failWrite) throw new Error('synthetic database failure');
  };
  const defaults = (table: Table): Row => {
    const common = { id: randomUUID(), createdAt: clone(fixture.now), updatedAt: clone(fixture.now) };
    if (table === 'processingJob') return { ...common, state: 'QUEUED', leaseOwner: null, leaseUntil: null, fence: 0n,
      cycleAttemptCount: 0, totalAttemptCount: 0, recoveryProbeCount: 0, retryRevision: 0, nextAttemptAt: null,
      lastErrorCode: null, retryable: false, finishedAt: null };
    if (table === 'processingAttempt') return { ...common, phase: 'PREPARING', sourceSha256: null, sourceETag: null,
      outputSha256: null, mimeType: null, width: null, height: null, outputBytes: null, reservedBytes: 0n,
      writeStartedAt: null, writeSettledAt: null, writesClosedAt: null, closureEvidenceType: null, closureEvidenceRef: null,
      objectAbsentAt: null, reservationReleasedAt: null, finalizedAt: null, cleanupRetryAfter: null, cleanupAttemptCount: 0 };
    if (table === 'derivedObject') return { ...common, state: 'READY', purgedAt: null };
    return common;
  };
  const model = (table: Table) => ({
    findUnique: jest.fn(async ({ where }: Row) => clone(fixture.store[table].find((row) => matches(row, where)) ?? null)),
    findFirst: jest.fn(async ({ where = {} }: Row = {}) => clone(fixture.store[table].find((row) => matches(row, where)) ?? null)),
    findMany: jest.fn(async ({ where = {}, orderBy, take, select }: Row = {}) => {
      let rows = fixture.store[table].filter((row) => matches(row, where));
      for (const ordering of (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []).reverse()) {
        const [key, direction] = Object.entries(ordering)[0]!;
        rows = rows.slice().sort((a, b) => (a[key]! < b[key]! ? -1 : a[key]! > b[key]! ? 1 : 0) * (direction === 'desc' ? -1 : 1));
      }
      if (take !== undefined) rows = rows.slice(0, take);
      if (select) rows = rows.map(row => Object.fromEntries(Object.keys(select).filter(key => select[key]).map(key => [key, row[key]])));
      return clone(rows);
    }),
    create: jest.fn(async ({ data }: Row) => {
      beforeWrite(`${table}.create`);
      const row = { ...defaults(table), ...clone(data) };
      fixture.store[table].push(row); return clone(row);
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      beforeWrite(`${table}.update`);
      const row = fixture.store[table].find((item) => matches(item, where));
      if (!row) throw new Error('synthetic missing row');
      apply(row, data); return clone(row);
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      beforeWrite(`${table}.updateMany`);
      const rows = fixture.store[table].filter((row) => matches(row, where));
      rows.forEach((row) => apply(row, data)); return { count: rows.length };
    }),
    upsert: jest.fn(async ({ where, create, update }: Row) => {
      beforeWrite(`${table}.upsert`);
      const row = fixture.store[table].find((item) => matches(item, where));
      if (row) { apply(row, update); return clone(row); }
      const next = { ...defaults(table), ...clone(create) }; fixture.store[table].push(next); return clone(next);
    }),
  });
  const tx = {
    $executeRaw: jest.fn(async (_parts: TemplateStringsArray, ..._values: unknown[]) => 0),
    $queryRaw: jest.fn(async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const sql = parts.join('?');
      if (/clock_timestamp/i.test(sql)) { fixture.log.push('clock'); return [{ now: new Date(fixture.now.getTime()) }]; }
      const table = /FROM\s+"(User|FileObject|ProcessingJob|ProcessingAttempt|DerivedObject)"/.exec(sql)?.[1];
      fixture.log.push(`lock:${table ?? 'unknown'}`);
      const tables: Record<string, Table> = { User: 'user', FileObject: 'fileObject', ProcessingJob: 'processingJob', ProcessingAttempt: 'processingAttempt', DerivedObject: 'derivedObject' };
      const tableKey = tables[table ?? ''];
      if (!tableKey) throw new Error('unsupported synthetic SQL');
      const fields = [...sql.matchAll(/"([A-Za-z]+)"\s*=\s*\?/g)].map((match) => match[1]!);
      return clone(fixture.store[tableKey].filter((row) => fields.every((field, index) => row[field] === values[index])));
    }),
    user: model('user'), fileObject: model('fileObject'), processingJob: model('processingJob'),
    processingAttempt: model('processingAttempt'), derivedObject: model('derivedObject'), auditEvent: model('auditEvent'),
  };
  let tail = Promise.resolve();
  const db = {
    ...tx,
    $transaction: jest.fn((action: (client: typeof tx) => Promise<unknown>) => {
      const current = tail.then(async () => {
        const before = clone(fixture.store);
        let result: unknown;
        try { result = await action(tx); }
        catch (error) { fixture.store = before; throw error; }
        if (fixture.loseCommitResponse) { fixture.loseCommitResponse = false; throw new Error('synthetic response lost after commit'); }
        return result;
      });
      tail = current.then(() => undefined, () => undefined);
      return current;
    }),
  };
  const config = { getOrThrow: () => ({ allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], maxUploadBytes: 104857600 }) } as unknown as ConfigService;
  return Object.assign(fixture, { tx, db, config,
    service: new ProcessingStateService(db as unknown as PrismaService, config, processingPolicy) });
}
