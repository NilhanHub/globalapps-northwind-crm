/* global process, console */
import { spawnSync } from 'node:child_process';

if (process.env.CRM_BUILD_ON_INSTALL === '1') {
  const result = spawnSync('npm', ['run', 'build'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  const verify = spawnSync('npm', ['run', 'verify:artifacts'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (verify.status !== 0) process.exit(verify.status ?? 1);
} else {
  console.log('Northwind install complete; build skipped (set CRM_BUILD_ON_INSTALL=1 for Hostinger install builds).');
}
