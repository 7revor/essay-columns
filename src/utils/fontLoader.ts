import { FONT_URL_LOCAL, FONT_URL_OSS, FONT_CACHE_KEY } from "../types";

const DB_NAME = "essay-columns-fonts";
const DB_VERSION = 1;
const STORE_NAME = "fonts";
const LOCAL_TIMEOUT_MS = 10_000;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getFromCache(key: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

async function saveToCache(key: string, buf: ArrayBuffer): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(buf, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // cache write failure is non-fatal
  }
}

function fetchWithTimeout(url: string, timeoutMs: number): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Font fetch timed out after ${timeoutMs}ms: ${url}`));
    }, timeoutMs);

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Font download failed: ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buf) => { clearTimeout(timer); resolve(buf); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

async function loadFont(): Promise<ArrayBuffer> {
  const cached = await getFromCache(FONT_CACHE_KEY);
  if (cached) return cached;

  let buf: ArrayBuffer;
  try {
    buf = await fetchWithTimeout(FONT_URL_LOCAL, LOCAL_TIMEOUT_MS);
  } catch {
    // Local server timed out or failed — fallback to OSS
    const res = await fetch(FONT_URL_OSS);
    if (!res.ok) throw new Error(`Font download failed: ${res.status}`);
    buf = await res.arrayBuffer();
  }

  saveToCache(FONT_CACHE_KEY, buf.slice(0)); // fire-and-forget
  return buf;
}

let fontReady: Promise<ArrayBuffer> | null = null;

async function registerFontFace(buf: ArrayBuffer) {
  const face = new FontFace("Source Han Serif SC", buf);
  document.fonts.add(face);
  await face.load();
}

export function preloadFont(): Promise<ArrayBuffer> {
  if (!fontReady) {
    fontReady = loadFont().then(async (buf) => {
      await registerFontFace(buf.slice(0));
      return buf;
    });
  }
  return fontReady;
}

export async function getFontBuffer(): Promise<ArrayBuffer> {
  return preloadFont();
}
