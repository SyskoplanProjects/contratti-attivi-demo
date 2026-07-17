const crypto = require('crypto');

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const _store = new Map();

function put(data, ttlMs = DEFAULT_TTL_MS) {
  const id = crypto.randomUUID();
  _store.set(id, { data, expiresAt: Date.now() + ttlMs });
  return id;
}

function get(previewID) {
  const entry = _store.get(previewID);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _store.delete(previewID);
    return null;
  }
  return entry.data;
}

function remove(previewID) {
  _store.delete(previewID);
}

function update(previewID, patch) {
  const entry = _store.get(previewID);
  if (!entry) return false;
  Object.assign(entry.data, patch);
  return true;
}

module.exports = { put, get, remove, update };
