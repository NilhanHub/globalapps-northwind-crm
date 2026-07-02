import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { activitySchema, companySchema, normalizeRecordScope, personSchema, routeSchema } from '@northwind/domain';
import type { z } from 'zod';

const schemas = {
  companies: companySchema,
  people: personSchema,
  routes: routeSchema,
  activities: activitySchema,
} as const;
export type StoreName = keyof typeof schemas;
type StoreRecord<S extends StoreName> = z.infer<(typeof schemas)[S]>;

export class VersionConflictError extends Error {
  readonly code = 'VERSION_CONFLICT';
  constructor(readonly currentVersion: number) {
    super('This record changed after it was loaded. Refresh and try again.');
  }
}

export class RecordNotFoundError extends Error {
  readonly code = 'NOT_FOUND';
  constructor(id: string) {
    super(`Record not found: ${id}`);
  }
}

function atomicWrite(file: string, value: unknown) {
  mkdirSync(join(file, '..'), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temp, file);
}

export function createJsonRepository(dataDir: string) {
  const journalFile = join(dataDir, '.crm-transaction.json');
  const backupDir = join(dataDir, '.backups');
  let mutationTail: Promise<unknown> = Promise.resolve();

  mkdirSync(dataDir, { recursive: true });

  const fileFor = (store: StoreName) => join(dataDir, `${store}.json`);

  function recover() {
    if (!existsSync(journalFile)) return;
    const journal = JSON.parse(readFileSync(journalFile, 'utf8')) as { after?: Partial<Record<StoreName, unknown[]>> };
    if (!journal.after) throw new Error('Invalid transaction recovery journal');
    for (const [store, records] of Object.entries(journal.after)) atomicWrite(fileFor(store as StoreName), records);
    rmSync(journalFile, { force: true });
  }

  function read<S extends StoreName>(store: S): StoreRecord<S>[] {
    recover();
    const file = fileFor(store);
    if (!existsSync(file)) atomicWrite(file, []);
    const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    if (!Array.isArray(raw)) throw new Error(`${basename(file)} must contain an array`);
    return raw.map((record) =>
      schemas[store].parse(normalizeRecordScope(record as Record<string, unknown>)),
    ) as StoreRecord<S>[];
  }

  function backup(store: StoreName) {
    const file = fileFor(store);
    if (!existsSync(file)) return;
    mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    copyFileSync(file, join(backupDir, `${stamp}-${store}.json`));
    const backups = readdirSync(backupDir)
      .filter((name) => name.endsWith(`-${store}.json`))
      .sort()
      .reverse();
    for (const old of backups.slice(10)) unlinkSync(join(backupDir, old));
  }

  function writeMany(changes: Partial<Record<StoreName, unknown[]>>) {
    const validated: Partial<Record<StoreName, unknown[]>> = {};
    for (const [store, records] of Object.entries(changes)) {
      if (!Array.isArray(records)) throw new Error(`Invalid store payload: ${store}`);
      validated[store as StoreName] = records.map((record) =>
        schemas[store as StoreName].parse(normalizeRecordScope(record as Record<string, unknown>)),
      );
    }
    const before: Partial<Record<StoreName, unknown[]>> = {};
    for (const store of Object.keys(validated) as StoreName[]) {
      before[store] = read(store);
      backup(store);
    }
    atomicWrite(journalFile, {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      before,
      after: validated,
    });
    try {
      for (const [store, records] of Object.entries(validated)) atomicWrite(fileFor(store as StoreName), records);
      rmSync(journalFile, { force: true });
    } catch (error) {
      for (const [store, records] of Object.entries(before)) atomicWrite(fileFor(store as StoreName), records);
      rmSync(journalFile, { force: true });
      throw error;
    }
  }

  function serialize<T>(operation: () => T | Promise<T>): Promise<T> {
    const next = mutationTail.then(operation, operation);
    mutationTail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  return {
    async list<S extends StoreName>(store: S, workspaceId: string): Promise<StoreRecord<S>[]> {
      return read(store).filter((record) => record.workspaceId === workspaceId);
    },

    create<S extends StoreName>(
      store: S,
      input: Record<string, unknown>,
      workspaceId: string,
    ): Promise<StoreRecord<S>> {
      return serialize(() => {
        const records = read(store);
        if (records.some((record) => record.id === input.id && record.workspaceId === workspaceId))
          throw new Error(`Duplicate record id: ${input.id}`);
        const record = schemas[store].parse(
          normalizeRecordScope({ ...input, workspaceId, version: 1 }),
        ) as StoreRecord<S>;
        writeMany({ [store]: [...records, record] });
        return record;
      });
    },

    update<S extends StoreName>(
      store: S,
      id: string,
      patch: Record<string, unknown>,
      expectedVersion: number,
      workspaceId: string,
    ): Promise<StoreRecord<S>> {
      return serialize(() => {
        const records = read(store);
        const index = records.findIndex((record) => record.id === id && record.workspaceId === workspaceId);
        if (index < 0) throw new RecordNotFoundError(id);
        const current = records[index]!;
        if (current.version !== expectedVersion) throw new VersionConflictError(current.version);
        const updated = schemas[store].parse({
          ...current,
          ...patch,
          id,
          workspaceId,
          version: current.version + 1,
        }) as StoreRecord<S>;
        records[index] = updated;
        writeMany({ [store]: records });
        return updated;
      });
    },

    transaction(changes: Partial<Record<StoreName, unknown[]>>): Promise<void> {
      return serialize(() => writeMany(changes));
    },

    recover,
  };
}

export type JsonRepository = ReturnType<typeof createJsonRepository>;
