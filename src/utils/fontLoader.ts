import { FONT_URL_PRIMARY, FONT_URL_FALLBACK, FONT_LOAD_TIMEOUT_MS } from "../types";

let fontReady: Promise<ArrayBuffer> | null = null;

function fetchWithTimeout(url: string, timeoutMs: number): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Font load timeout after ${timeoutMs}ms: ${url}`));
    }, timeoutMs);

    fetch(url, { signal: controller.signal })
      .then((res) => {
        clearTimeout(timer);
        if (!res.ok) throw new Error(`Font download failed: ${res.status}`);
        return res.arrayBuffer();
      })
      .then(resolve)
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function fetchFont(): Promise<ArrayBuffer> {
  try {
    return await fetchWithTimeout(FONT_URL_PRIMARY, FONT_LOAD_TIMEOUT_MS);
  } catch (e) {
    console.warn("Primary font source failed, falling back to OSS:", e);
    const res = await fetch(FONT_URL_FALLBACK);
    if (!res.ok) throw new Error(`Font download failed: ${res.status}`);
    return res.arrayBuffer();
  }
}

async function registerFontFace(buf: ArrayBuffer) {
  const face = new FontFace("Source Han Serif SC", buf);
  document.fonts.add(face);
  await face.load();
}

export function preloadFont(): Promise<ArrayBuffer> {
  if (!fontReady) {
    fontReady = fetchFont().then(async (buf) => {
      await registerFontFace(buf.slice(0));
      return buf;
    });
  }
  return fontReady;
}

export async function getFontBuffer(): Promise<ArrayBuffer> {
  return preloadFont();
}
