import type { z } from 'zod';
import {
  activitySchema,
  companySchema,
  importJobSchema,
  ownerProfileSchema,
  personSchema,
  routeSchema,
  workspaceSettingsSchema,
} from '@northwind/domain';

export const storeSchemas = {
  companies: companySchema,
  people: personSchema,
  routes: routeSchema,
  activities: activitySchema,
  importJobs: importJobSchema,
  owners: ownerProfileSchema,
  settings: workspaceSettingsSchema,
} as const;

export type StoreName = keyof typeof storeSchemas;
export type StoreRecord<S extends StoreName> = z.infer<(typeof storeSchemas)[S]>;
export type StoreChanges = Partial<{ [S in StoreName]: StoreRecord<S>[] }>;
export type PageQuery = {
  limit: number;
  orderBy: string;
  direction: 'asc' | 'desc';
  startAfter?: [unknown, string];
  equals?: Record<string, unknown>;
  prefix?: { field: string; value: string };
};
export type RepositoryPage<T> = { items: T[]; nextAnchor: [unknown, string] | null; hasMore: boolean };

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

export class FirestoreUnavailableError extends Error {
  readonly code = 'FIRESTORE_UNAVAILABLE';
  readonly statusCode = 503;
  constructor() {
    super('Cloud data is temporarily unavailable. No changes were saved.');
  }
}

export interface CrmRepository {
  healthCheck(): Promise<void>;
  getWorkspaceRevision(workspaceId: string): Promise<{ revision: string; updatedAt: string }>;
  list<S extends StoreName>(store: S, workspaceId: string): Promise<StoreRecord<S>[]>;
  page<S extends StoreName>(store: S, workspaceId: string, query: PageQuery): Promise<RepositoryPage<StoreRecord<S>>>;
  create<S extends StoreName>(store: S, input: Record<string, unknown>, workspaceId: string): Promise<StoreRecord<S>>;
  update<S extends StoreName>(
    store: S,
    id: string,
    patch: Record<string, unknown>,
    expectedVersion: number,
    workspaceId: string,
  ): Promise<StoreRecord<S>>;
  transaction(changes: StoreChanges): Promise<void>;
  upsertTransaction(changes: StoreChanges): Promise<void>;
  delete<S extends StoreName>(store: S, id: string, expectedVersion: number, workspaceId: string): Promise<void>;
  recover?(): void | Promise<void>;
}
