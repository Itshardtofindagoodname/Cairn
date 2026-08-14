/**
 * Client-side encrypted storage for a user's personal Kaggle API credentials.
 *
 * The key pair never touches the network or the server (the server only ever
 * sees it as request-scoped headers on a single /api/search POST, and never
 * persists it). It IS persisted on the device so the user doesn't have to
 * re-paste it every visit:
 *
 *   - The Kaggle key is AES-256-GCM encrypted.
 *   - The symmetric key lives in IndexedDB (never in localStorage).
 *   - The ciphertext lives in localStorage.
 *
 * If either side is missing, the store reads as "no credentials" and the UI
 * simply re-prompts.
 */

const LS_KEY = "cairn.kaggle.encrypted";
const IDB_NAME = "cairn-keys";
const IDB_STORE = "kaggle";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(): Promise<CryptoKey | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get("aes-key");
    req.onsuccess = () => resolve((req.result as CryptoKey | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: CryptoKey): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(key, "aes-key");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete("aes-key");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function saveKaggleCredentials(username: string, key: string): Promise<boolean> {
  const cipher = await (async () => {
    const existing = await idbGet();
    const aesKey = existing ?? (await generateKey());
    if (!existing) await idbPut(aesKey);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify({ username, key }));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      plaintext,
    );
    return { iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)) };
  })();
  localStorage.setItem(LS_KEY, JSON.stringify(cipher));

  // Round-trip self-check: the exact string the caller supplied must come back
  // out of storage. If the AES-GCM key in IndexedDB was lost, overwritten, or
  // the ciphertext corrupted, this returns false so the caller can surface a
  // real error instead of silently storing garbage that later reads as "no
  // credentials" (or worse, sends a corrupted key to Kaggle).
  const round = await loadKaggleCredentials();
  return round?.username === username && round?.key === key;
}

export async function loadKaggleCredentials(): Promise<{ username: string; key: string } | null> {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return null;
  try {
    const aesKey = await idbGet();
    if (!aesKey) return null;
    const { iv, data } = JSON.parse(raw) as { iv: number[]; data: number[] };
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(iv) },
      aesKey,
      new Uint8Array(data),
    );
    const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as {
      username?: string;
      key?: string;
    };
    if (!parsed.username || !parsed.key) return null;
    return { username: parsed.username, key: parsed.key };
  } catch {
    return null;
  }
}

export async function clearKaggleCredentials(): Promise<void> {
  localStorage.removeItem(LS_KEY);
  try {
    await idbDelete();
  } catch {
    /* IndexedDB may be unavailable (private mode) — localStorage removal suffices */
  }
}