import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashPassword } from '../apps/api/src/auth/auth-service.js';

const dataDir = mkdtempSync(join(tmpdir(), 'northwind-e2e-'));
for (const store of ['companies', 'people', 'routes', 'activities'])
  writeFileSync(join(dataDir, `${store}.json`), '[]\n');
process.env.CRM_DATA_DIR = dataDir;
process.env.CRM_USERNAME = 'northwind-e2e';
process.env.CRM_PASSWORD_SCRYPT = await hashPassword('northwind-e2e-passphrase');
process.env.HOST = '127.0.0.1';
process.env.PORT = '18791';
process.env.NODE_ENV = 'test';
await import('../apps/api/src/index.js');
