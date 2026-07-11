/* global console, process */
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const output = resolve(process.argv[2] || 'Evidence/backup-key-transfer/backup-trigger.token');
mkdirSync(dirname(output), { recursive: true });
const token = randomBytes(32).toString('base64url');
writeFileSync(output, `${token}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
console.log(
  JSON.stringify({
    output,
    triggerHash: createHash('sha256').update(token).digest('hex'),
    tokenBits: 256,
    tokenPrinted: false,
  }),
);
