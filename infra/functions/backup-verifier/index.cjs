function evaluateFreshness(objects, now = new Date(), maximumAgeHours = 30) {
  const timestamps = objects
    .map((object) => Date.parse(String(object.updated || object.timeCreated || '')))
    .filter(Number.isFinite)
    .sort((left, right) => right - left);
  if (!timestamps.length) return { fresh: false, objectCount: objects.length, latestAgeHours: null };
  const latestAgeHours = Math.round(((now.getTime() - timestamps[0]) / 3_600_000) * 100) / 100;
  return { fresh: latestAgeHours <= maximumAgeHours, objectCount: objects.length, latestAgeHours };
}

async function verifyBackupFreshness(_request, response) {
  const bucketName = process.env.BACKUP_BUCKET || '';
  if (!bucketName) {
    console.error(JSON.stringify({ severity: 'ERROR', event: 'backup_freshness', error: 'BACKUP_BUCKET missing' }));
    return response.status(500).json({ status: 'configuration_error' });
  }
  const tokenResponse = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    { headers: { 'Metadata-Flavor': 'Google' } },
  );
  if (!tokenResponse.ok) throw new Error('Could not obtain the verifier runtime credential');
  const { access_token: accessToken } = await tokenResponse.json();
  const listResponse = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}/o`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listResponse.ok) throw new Error('Could not read backup metadata');
  const listing = await listResponse.json();
  const result = evaluateFreshness(Array.isArray(listing.items) ? listing.items : []);
  const payload = {
    severity: result.fresh ? 'INFO' : 'ERROR',
    event: 'backup_freshness',
    bucket: bucketName,
    ...result,
  };
  console.log(JSON.stringify(payload));
  return response.status(result.fresh ? 200 : 503).json({ status: result.fresh ? 'ok' : 'stale', ...result });
}

module.exports = { evaluateFreshness, verifyBackupFreshness };
