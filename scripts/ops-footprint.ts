import { readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const root = resolve(process.env.CRM_DEPLOY_ROOT || process.cwd());
const capacityBytes = Number(process.env.CRM_DISK_CAPACITY_BYTES || 0);
const capacityInodes = Number(process.env.CRM_INODE_CAPACITY || 0);
const categories = new Map<string, { bytes: number; files: number }>();
let bytes = 0;
let files = 0;

function visit(path: string) {
  const stat = statSync(path);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) visit(resolve(path, entry));
    return;
  }
  files += 1;
  bytes += stat.size;
  const rel = relative(root, path).replaceAll('\\', '/');
  const category = rel.includes('node_modules/')
    ? 'dependencies'
    : rel.includes('/dist/') || rel.startsWith('dist/')
      ? 'builds'
      : /(^|\/)(logs?|npm-cache|\.cache)(\/|$)/.test(rel)
        ? 'cache-or-logs'
        : 'source-and-data';
  const current = categories.get(category) ?? { bytes: 0, files: 0 };
  current.bytes += stat.size;
  current.files += 1;
  categories.set(category, current);
}

visit(root);
const diskPercent = capacityBytes ? (bytes / capacityBytes) * 100 : null;
const inodePercent = capacityInodes ? (files / capacityInodes) * 100 : null;
const report = {
  generatedAt: new Date().toISOString(),
  root,
  bytes,
  files,
  diskPercent,
  inodePercent,
  thresholdPercent: 70,
  warningThresholdPercent: 60,
  status:
    (diskPercent && diskPercent >= 70) || (inodePercent && inodePercent >= 70)
      ? 'alert'
      : (diskPercent && diskPercent >= 60) || (inodePercent && inodePercent >= 60)
        ? 'warning'
        : 'ok',
  alert: Boolean((diskPercent && diskPercent >= 70) || (inodePercent && inodePercent >= 70)),
  categories: Object.fromEntries([...categories.entries()].sort(([a], [b]) => a.localeCompare(b))),
};
console.log(JSON.stringify(report, null, 2));
if (report.alert) process.exitCode = 2;
