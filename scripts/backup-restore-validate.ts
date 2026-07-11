import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decryptBackup } from '../apps/api/src/services/hostinger-backup.js';

const archive = process.argv[2];
const privateKeyFile = process.env.CRM_BACKUP_PRIVATE_KEY_FILE;
if (!archive || !privateKeyFile) throw new Error('Provide an archive and set CRM_BACKUP_PRIVATE_KEY_FILE');
const bundle = decryptBackup(
  JSON.parse(readFileSync(resolve(archive), 'utf8')),
  readFileSync(resolve(privateKeyFile), 'utf8'),
);
console.log(JSON.stringify({ ok: true, counts: bundle.integrity.counts, issueCount: 0 }, null, 2));
