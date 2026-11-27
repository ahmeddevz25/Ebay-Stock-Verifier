// src/historyDB.js - Local IndexedDB Storage for Verification History & 3-Day Backup

const DB_NAME = 'stockline_db';
const DB_VERSION = 1;
const STORE_NAME = 'verification_history';
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
export const ACTIVE_SESSION_ID = '__active_session__';

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSessionToHistory(session) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // Auto-prune sessions older than 3 days (exclude active working session)
    const now = Date.now();
    const getAllReq = store.getAll();
    getAllReq.onsuccess = () => {
      const list = getAllReq.result || [];
      for (const item of list) {
        if (item.id !== ACTIVE_SESSION_ID && now - item.timestamp > THREE_DAYS_MS) {
          store.delete(item.id);
        }
      }
    };

    store.put(session);
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('Failed to save to history:', err);
    return false;
  }
}

export async function getHistorySessions() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    return new Promise((resolve) => {
      req.onsuccess = () => {
        const now = Date.now();
        // filter out any records older than 3 days and exclude active session
        const list = (req.result || []).filter(
          (s) => s.id !== ACTIVE_SESSION_ID && now - s.timestamp <= THREE_DAYS_MS
        );
        // sort newest first
        list.sort((a, b) => b.timestamp - a.timestamp);
        resolve(list);
      };
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    return [];
  }
}

export async function deleteHistorySession(id) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    return false;
  }
}

export async function clearAllHistorySessions() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    return false;
  }
}

// Active Working Session Persistence (Survives Page Refresh, Net drops, F5)
export async function saveActiveSession(session) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({
      ...session,
      id: ACTIVE_SESSION_ID,
      timestamp: Date.now()
    });
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('Failed to save active session:', err);
    return false;
  }
}

export async function getActiveSession() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(ACTIVE_SESSION_ID);
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

export async function clearActiveSession() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(ACTIVE_SESSION_ID);
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    return false;
  }
}
