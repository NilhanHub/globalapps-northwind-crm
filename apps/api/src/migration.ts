import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const STORE_NAMES = ['companies', 'people', 'routes', 'activities'] as const;

function fileHash(file: string) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function validateArrayFile(file: string) {
  const value = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  if (!Array.isArray(value)) throw new Error(`${file} must contain a JSON array`);
  return value.length;
}

export function migrateDataStores(rootDir: string, destinationDir: string) {
  mkdirSync(destinationDir, { recursive: true });
  return STORE_NAMES.map((name) => {
    const source = join(rootDir, `${name}.json`);
    const destination = join(destinationDir, `${name}.json`);
    if (!existsSync(source)) throw new Error(`Missing source store: ${source}`);
    const count = validateArrayFile(source);
    const sourceHash = fileHash(source);
    if (existsSync(destination)) {
      validateArrayFile(destination);
      const destinationHash = fileHash(destination);
      if (destinationHash !== sourceHash) throw new Error(`Destination differs from source: ${destination}`);
      return { name, count, sourceHash, destinationHash, status: 'unchanged' as const };
    }
    copyFileSync(source, destination);
    const destinationHash = fileHash(destination);
    if (destinationHash !== sourceHash) throw new Error(`Hash verification failed: ${destination}`);
    return { name, count, sourceHash, destinationHash, status: 'copied' as const };
  });
}
