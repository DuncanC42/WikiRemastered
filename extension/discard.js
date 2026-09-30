// WikiMasters submits a selected collection page (50 owned copies) to this endpoint.
// Keep that native request size; batches run sequentially and mutations are never retried.
export const DISCARD_BATCH_SIZE = 50;

/** Freeze exact owned-copy IDs and omit protected or ineligible cards. */
export function planDiscardBatches(candidateIDs, {
  rows,
  isProtected,
  viewsOf,
  threshold = 30,
  single = false,
}) {
  if (!single && (!Number.isSafeInteger(threshold) || threshold < 0)) {
    throw new Error('Le seuil de vues est invalide.');
  }

  const eligible = [];
  const skippedIds = [];
  for (const id of new Set(candidateIDs)) {
    const row = rows.get(id);
    const views = row ? viewsOf(row) : null;
    if (typeof id !== 'string' || !id || !row || row.id !== id
      || isProtected(id, row)
      || (!single && (!Number.isSafeInteger(views) || views < 0 || views >= threshold))) {
      skippedIds.push(id);
      continue;
    }
    eligible.push(id);
  }

  const batches = [];
  for (let offset = 0; offset < eligible.length; offset += DISCARD_BATCH_SIZE) {
    batches.push(eligible.slice(offset, offset + DISCARD_BATCH_SIZE));
  }
  return { batches, skippedIds };
}

/**
 * The published site client exposes a count and a failed array, not its entry schema.
 * A partial response confirms the aggregate count only. Never guess which owned
 * copies disappeared: stop and reload/reconcile the collection after that batch.
 */
export function parseDiscardBatchResult(payload, requestedIDs) {
  const discardedCount = payload?.discarded_count;
  // The native client treats an omitted failed list as empty; accept it only
  // when the count independently confirms that every requested copy succeeded.
  const failed = payload?.failed ?? (discardedCount === requestedIDs?.length ? [] : null);
  if (!Array.isArray(requestedIDs) || !requestedIDs.length
    || requestedIDs.some(id => typeof id !== 'string' || !id)
    || new Set(requestedIDs).size !== requestedIDs.length
    || !Number.isSafeInteger(discardedCount) || discardedCount < 0
    || !Array.isArray(failed)
    || discardedCount + failed.length !== requestedIDs.length) {
    const error = new Error('Résultat de défausse incomplet. Rechargez la collection avant de réessayer.');
    error.code = 'INVALID_DISCARD_RESPONSE';
    error.uncertain = true;
    throw error;
  }

  const partial = failed.length > 0;
  return {
    discardedCount,
    failedCount: failed.length,
    successfulIds: partial ? [] : [...requestedIDs],
    partial,
  };
}
