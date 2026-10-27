import { api, ApiError } from '../api/client';

/**
 * Offline-first outbox for field capture. Items are stored on the device (IndexedDB, falling back to
 * localStorage) and replayed in order when the connection returns. A 4xx reply marks an item "failed"
 * so one bad record can never block the rest; network errors leave it queued for the next attempt.
 */
export interface QueueItem {
  id: string;
  method: 'POST' | 'PUT';
  path: string;
  body: any;
  label: string;
  createdAt: string;
  status: 'queued' | 'failed';
  error?: string;
}

const DB = 'zacc-field';
const STORE = 'outbox';
const LS_KEY = 'zacc_outbox';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no idb'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function lsRead(): QueueItem[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function lsWrite(items: QueueItem[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(items)); } catch { /* storage full or blocked */ }
}

export async function listQueue(): Promise<QueueItem[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as QueueItem[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      req.onerror = () => reject(req.error);
    });
  } catch {
    return lsRead();
  }
}
async function put(item: QueueItem) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(item); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  } catch {
    const items = lsRead().filter((i) => i.id !== item.id); items.push(item); lsWrite(items);
  }
}
export async function removeFromQueue(id: string) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  } catch {
    lsWrite(lsRead().filter((i) => i.id !== id));
  }
}

export async function enqueue(method: 'POST' | 'PUT', path: string, body: any, label: string) {
  const item: QueueItem = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, method, path, body, label, createdAt: new Date().toISOString(), status: 'queued' };
  await put(item);
  return item;
}

/** Sends a request now if online, otherwise (or on a network failure) stores it for later. */
export async function sendOrQueue(method: 'POST' | 'PUT', path: string, body: any, label: string): Promise<'sent' | 'queued'> {
  if (navigator.onLine) {
    try {
      await (method === 'POST' ? api.post(path, body) : api.put(path, body));
      return 'sent';
    } catch (e) {
      if (e instanceof ApiError) throw e; // a real server answer: surface it, do not hide it in the queue
    }
  }
  await enqueue(method, path, body, label);
  return 'queued';
}

let flushing = false;
export async function flushQueue(): Promise<{ sent: number; failed: number; remaining: number }> {
  if (flushing) return { sent: 0, failed: 0, remaining: (await listQueue()).filter((i) => i.status === 'queued').length };
  flushing = true;
  let sent = 0, failed = 0;
  try {
    for (const item of await listQueue()) {
      if (item.status !== 'queued') continue;
      try {
        await (item.method === 'POST' ? api.post(item.path, item.body) : api.put(item.path, item.body));
        await removeFromQueue(item.id);
        sent++;
      } catch (e) {
        if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 401) {
          await put({ ...item, status: 'failed', error: e.message });
          failed++;
        } else break; // offline / server down / needs re-login: stop and retry later, preserving order
      }
    }
  } finally {
    flushing = false;
  }
  return { sent, failed, remaining: (await listQueue()).filter((i) => i.status === 'queued').length };
}
