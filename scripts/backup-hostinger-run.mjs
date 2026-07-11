/* global AbortSignal, URL, console, fetch, process */
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

const tokenFile = process.env.CRM_BACKUP_TRIGGER_TOKEN_FILE?.trim() ?? '';
if (!tokenFile || !isAbsolute(tokenFile))
  throw new Error('CRM_BACKUP_TRIGGER_TOKEN_FILE must be an absolute private path');

const token = readFileSync(tokenFile, 'utf8').trim();
if (!/^[a-zA-Z0-9_-]{43,128}$/.test(token))
  throw new Error('The backup trigger token file does not contain a strong generated token');

const baseUrl = new URL(process.env.CRM_BACKUP_URL?.trim() || 'http://127.0.0.1:8787');
const isLoopback = ['127.0.0.1', 'localhost', '::1'].includes(baseUrl.hostname);
if (baseUrl.protocol !== 'https:' && !isLoopback) throw new Error('CRM_BACKUP_URL must use HTTPS outside loopback');

const endpoint = new URL('/api/maintenance/backups/run', baseUrl);
const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'x-backup-token': token, 'content-type': 'application/json' },
  body: '{}',
  signal: AbortSignal.timeout(11 * 60_000),
});
const payload = await response.json();
if (!response.ok) throw new Error(`Backup trigger failed with HTTP ${response.status}`);
console.log(JSON.stringify(payload));
