import 'dotenv/config';
import { readFileSync } from 'node:fs';

const baseUrl = process.env.CRM_BACKUP_URL?.replace(/\/$/, '') || 'http://127.0.0.1:8787';
const token =
  process.env.CRM_BACKUP_TRIGGER_TOKEN?.trim() ||
  (process.env.CRM_BACKUP_TRIGGER_TOKEN_FILE
    ? readFileSync(process.env.CRM_BACKUP_TRIGGER_TOKEN_FILE, 'utf8').trim()
    : '');
if (!token) throw new Error('CRM_BACKUP_TRIGGER_TOKEN or CRM_BACKUP_TRIGGER_TOKEN_FILE is required');
const response = await fetch(`${baseUrl}/api/maintenance/backups/run`, {
  method: 'POST',
  headers: { 'x-backup-token': token, 'content-type': 'application/json' },
  body: '{}',
});
const payload = (await response.json()) as Record<string, unknown>;
if (!response.ok) throw new Error(`Backup trigger failed with HTTP ${response.status}`);
console.log(JSON.stringify(payload, null, 2));
