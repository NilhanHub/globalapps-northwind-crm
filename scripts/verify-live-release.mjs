import { argv, exit, stdout } from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

const [baseUrl, expectedSha, attemptsInput = '45', intervalSecondsInput = '20'] = argv.slice(2);
if (!baseUrl || !/^https:\/\//.test(baseUrl)) throw new Error('An HTTPS application URL is required');
if (!/^[a-f0-9]{40}$/i.test(expectedSha ?? '')) throw new Error('A full expected commit SHA is required');
const attempts = Math.max(1, Number(attemptsInput));
const intervalMilliseconds = Math.max(1, Number(intervalSecondsInput)) * 1000;
let lastFailure = 'No verification attempt completed';

async function verify() {
  const healthResponse = await globalThis.fetch(new globalThis.URL('/api/health', baseUrl), {
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
  });
  if (!healthResponse.ok) throw new Error(`health returned HTTP ${healthResponse.status}`);
  if (!String(healthResponse.headers.get('cache-control')).includes('no-store'))
    throw new Error('health response is cacheable');
  const health = await healthResponse.json();
  const valid =
    health.status === 'ok' &&
    health.readiness === 'ready' &&
    health.repository === 'available' &&
    health.repositoryType === 'firestore' &&
    health.repositoryDatabaseId === '(default)' &&
    health.commitSha === expectedSha &&
    health.backup?.state === 'healthy' &&
    health.backup?.count === 2;
  if (!valid)
    throw new Error(
      `release is not ready (sha=${String(health.commitSha)}, readiness=${String(health.readiness)}, repository=${String(health.repositoryType)}, backups=${String(health.backup?.count)})`,
    );

  const htmlResponse = await globalThis.fetch(new globalThis.URL('/', baseUrl), {
    headers: { 'cache-control': 'no-cache' },
  });
  if (!htmlResponse.ok) throw new Error(`application shell returned HTTP ${htmlResponse.status}`);
  if (!String(htmlResponse.headers.get('cache-control')).includes('no-store'))
    throw new Error('application shell is cacheable');
  const html = await htmlResponse.text();
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map((match) => match[1]);
  if (!assets.length) throw new Error('application shell has no fingerprinted assets');
  for (const asset of assets) {
    const response = await globalThis.fetch(new globalThis.URL(asset, baseUrl), { method: 'HEAD' });
    if (!response.ok) throw new Error(`asset ${asset} returned HTTP ${response.status}`);
  }
  return {
    ok: true,
    url: baseUrl,
    commitSha: health.commitSha,
    readiness: health.readiness,
    repositoryType: health.repositoryType,
    backupCount: health.backup.count,
    assetCount: assets.length,
  };
}

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    stdout.write(`${JSON.stringify(await verify())}\n`);
    exit(0);
  } catch (error) {
    lastFailure = error instanceof Error ? error.message : 'Unknown verification failure';
    stdout.write(`${JSON.stringify({ ok: false, attempt, attempts, reason: lastFailure })}\n`);
    if (attempt < attempts) await sleep(intervalMilliseconds);
  }
}
throw new Error(`Live release verification failed: ${lastFailure}`);
