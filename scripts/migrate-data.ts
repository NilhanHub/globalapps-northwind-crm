import { resolve } from 'node:path';
import { migrateDataStores } from '../apps/api/src/migration.js';

const root = resolve(process.cwd());
const destination = resolve(process.env.CRM_DATA_DIR || resolve(root, 'data'));
const result = migrateDataStores(root, destination);
for (const item of result)
  console.log(`${item.name}: ${item.status} (${item.count} records, ${item.destinationHash.slice(0, 12)})`);
