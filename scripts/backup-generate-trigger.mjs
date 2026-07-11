/* global console, process */
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireExternalAbsoluteOutputPath } from './lib/secure-output-path.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = requireExternalAbsoluteOutputPath(process.argv[2], repositoryRoot);
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
