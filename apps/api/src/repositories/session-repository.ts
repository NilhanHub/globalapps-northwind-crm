import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function createFileSessionRepository(file: string) {
  return {
    async list(): Promise<Array<Record<string, unknown>>> {
      if (!existsSync(file)) return [];
      try {
        const value = JSON.parse(readFileSync(file, 'utf8')) as unknown;
        return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
      } catch {
        return [];
      }
    },
    async replace(sessions: Array<Record<string, unknown>>) {
      mkdirSync(dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
      writeFileSync(temp, `${JSON.stringify(sessions, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      renameSync(temp, file);
    },
  };
}
