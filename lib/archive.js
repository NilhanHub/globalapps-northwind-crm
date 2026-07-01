function archiveError(message) {
  const error = new Error(message);
  error.code = 'BAD_INPUT';
  return error;
}

function archiveRecord(record, actor, reason, operationId) {
  return { ...record, archivedAt: new Date().toISOString(), archivedBy: actor, archiveReason: reason, archiveOperationId: operationId };
}

function restoreRecord(record) {
  const restored = { ...record };
  delete restored.archivedAt;
  delete restored.archivedBy;
  delete restored.archiveReason;
  delete restored.archiveOperationId;
  return restored;
}

function archiveInput(body) {
  const actor = String(body?.actor ?? '').trim();
  const reason = String(body?.reason ?? '').trim();
  if (!actor) throw archiveError('actor is required');
  if (!reason) throw archiveError('archive reason is required');
  return { actor, reason };
}

module.exports = { archiveRecord, restoreRecord, archiveInput };
