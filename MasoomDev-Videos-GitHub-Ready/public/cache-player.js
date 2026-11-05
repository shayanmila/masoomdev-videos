'use strict';
// Persistent, best-effort IndexedDB caching for videos up to 100 MiB.
// The video endpoint must be a same-origin, authenticated-by-share-token API.
const MAX_BYTES = 100 * 1024 * 1024;
const DB_NAME = 'masoomdev-video-cache';
const STORE = 'videos';
const $cache = id => document.getElementById(id);
let activeUrl = null;
function openCache() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function cacheOperation(mode, action) {
  const db = await openCache();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const request = action(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
const getCached = key => cacheOperation('readonly', store => store.get(key));
const saveCached = (key, blob) => cacheOperation('readwrite', store => store.put(blob, key));
const deleteCached = key => cacheOperation('readwrite', store => store.delete(key));
function setMessage(text) { $cache('cacheStatus').textContent = text; }
function showBlob(blob) {
  if (activeUrl) URL.revokeObjectURL(activeUrl);
  activeUrl = URL.createObjectURL(blob);
  const player = $cache('localPlayer');
  player.src = activeUrl;
  player.hidden = false;
  player.load();
}
async function loadCachedVideo(fileId, shareToken) {
  const key = `${fileId}:${shareToken}`;
  $cache('cacheClear').onclick = async () => {
    await deleteCached(key);
    setMessage('This video was removed from browser cache. Refresh to download it again.');
  };
  try {
    const cached = await getCached(key);
    if (cached instanceof Blob) {
      showBlob(cached);
      setMessage('Playing from browser cache. No new download needed.');
      return;
    }
    setMessage('Preparing secure video download…');
    // Backend is required: Google Drive iframe/share links are not CORS-safe raw video URLs.
    const url = `/api/videos/${encodeURIComponent(fileId)}/content?token=${encodeURIComponent(shareToken)}`;
    const response = await fetch(url, {cache:'no-store', credentials:'omit'});
    if (!response.ok) throw new Error(`Streaming service unavailable (HTTP ${response.status}).`);
    const length = Number(response.headers.get('content-length'));
    if (!Number.isSafeInteger(length) || length <= 0) throw new Error('Video size is unknown. Cannot safely cache.');
    if (length > MAX_BYTES) throw new Error('Video exceeds the 100 MB cache limit.');
    const contentType = response.headers.get('content-type') || '';
    if (!/^video\/(mp4|webm|ogg|quicktime)(?:\s*;|$)/i.test(contentType)) throw new Error('Unsupported video format from server.');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Browser does not support streaming downloads.');
    const chunks = [];
    let total = 0;
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) { await reader.cancel(); throw new Error('Video exceeds the 100 MB limit.'); }
      chunks.push(value);
      setMessage(`Downloading video to browser cache: ${Math.round(total / length * 100)}%`);
    }
    if (total !== length) throw new Error('Incomplete video download. Please retry.');
    const blob = new Blob(chunks, {type:contentType});
    await saveCached(key, blob);
    showBlob(blob);
    setMessage('Video saved in browser cache. Ready to play.');
  } catch (err) {
    setMessage(`${err.message} Google Drive preview is available below as fallback.`);
    $cache('driveFallback').hidden = false;
  }
}
window.addEventListener('pagehide', () => { if (activeUrl) URL.revokeObjectURL(activeUrl); });
