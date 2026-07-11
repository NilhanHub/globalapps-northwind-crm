import 'dotenv/config';
import { createConnection } from 'node:net';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

type Check = { name: string; status: 'pass' | 'warn' | 'fail'; detail: string };

function portAvailable(port: number) {
  return new Promise<boolean>((done) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(350);
    socket.once('connect', () => {
      socket.destroy();
      done(false);
    });
    const available = () => {
      socket.destroy();
      done(true);
    };
    socket.once('error', available);
    socket.once('timeout', available);
  });
}

const checks: Check[] = [];
const major = Number(process.versions.node.split('.')[0]);
checks.push({
  name: 'node',
  status: major === 22 ? 'pass' : 'fail',
  detail: major === 22 ? `Node ${process.versions.node}` : `Node 22 required; found ${process.versions.node}`,
});
checks.push({
  name: 'npm-lock',
  status: existsSync(resolve('package-lock.json')) ? 'pass' : 'fail',
  detail: 'package-lock.json',
});
checks.push({
  name: 'repository',
  status: ['json', 'firestore'].includes(process.env.CRM_REPOSITORY || 'json') ? 'pass' : 'fail',
  detail: process.env.CRM_REPOSITORY === 'firestore' ? 'Firestore selected' : 'JSON development repository selected',
});
for (const key of ['CRM_USERNAME', 'CRM_PASSWORD_SCRYPT', 'CRM_PASSWORD_SCRYPT_BASE64']) {
  checks.push({
    name: `env:${key}`,
    status: process.env[key] ? 'pass' : key === 'CRM_USERNAME' ? 'warn' : 'warn',
    detail: process.env[key] ? 'present' : 'absent',
  });
}
for (const port of [5173, 8080, 8787]) {
  const available = await portAvailable(port);
  checks.push({
    name: `port:${port}`,
    status: available ? 'pass' : 'warn',
    detail: available ? 'available' : 'in use',
  });
}
const result = { generatedAt: new Date().toISOString(), checks };
console.log(JSON.stringify(result, null, 2));
if (checks.some((check) => check.status === 'fail')) process.exitCode = 1;
