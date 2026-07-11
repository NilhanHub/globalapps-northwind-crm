import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { verifyBackupEnvelope } from '../apps/api/src/services/hostinger-backup.js';

const archive = process.argv[2];
if (!archive) throw new Error('Provide a .nwbackup archive path');
const envelope = verifyBackupEnvelope(JSON.parse(readFileSync(resolve(archive), 'utf8')));
console.log(
  JSON.stringify({
    ok: true,
    archive: resolve(archive),
    createdAt: envelope.createdAt,
    workspaceId: envelope.workspaceId,
  }),
);
