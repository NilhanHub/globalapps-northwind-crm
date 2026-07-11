import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireExternalAbsoluteOutputPath } from './lib/secure-output-path.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = requireExternalAbsoluteOutputPath(process.argv[2], repositoryRoot);
mkdirSync(output, { recursive: true });
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 4096,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
writeFileSync(resolve(output, 'northwind-backup-public.pem'), publicKey, { mode: 0o644, flag: 'wx' });
writeFileSync(resolve(output, 'northwind-backup-private.pem'), privateKey, { mode: 0o600, flag: 'wx' });
console.log(
  JSON.stringify({ output, publicKey: 'northwind-backup-public.pem', privateKey: 'northwind-backup-private.pem' }),
);
