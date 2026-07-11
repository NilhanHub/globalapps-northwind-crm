import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const output = resolve(process.argv[2] || 'Evidence/backup-key-transfer');
mkdirSync(output, { recursive: true });
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 4096,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
writeFileSync(resolve(output, 'northwind-backup-public.pem'), publicKey, { mode: 0o644 });
writeFileSync(resolve(output, 'northwind-backup-private.pem'), privateKey, { mode: 0o600 });
console.log(
  JSON.stringify({ output, publicKey: 'northwind-backup-public.pem', privateKey: 'northwind-backup-private.pem' }),
);
