import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decryptBackup } from '../apps/api/src/services/hostinger-backup.js';

const [archive, output] = process.argv.slice(2);
const privateKeyFile = process.env.CRM_BACKUP_PRIVATE_KEY_FILE;
if (!archive || !output || !privateKeyFile)
  throw new Error('Provide archive and output paths and set CRM_BACKUP_PRIVATE_KEY_FILE');
const bundle = decryptBackup(
  JSON.parse(readFileSync(resolve(archive), 'utf8')),
  readFileSync(resolve(privateKeyFile), 'utf8'),
);
writeFileSync(resolve(output), `${JSON.stringify(bundle, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ ok: true, output: resolve(output) }));
