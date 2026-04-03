import { FONT_URL } from "../types";

let fontReady: Promise<ArrayBuffer> | null = null;

async function fetchFont(): Promise<ArrayBuffer> {
  const res = await fetch(FONT_URL);
  if (!res.ok) throw new Error(`Font download failed: ${res.status}`);
  return res.arrayBuffer();
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
  const buf = await preloadFont();
  return buf.slice(0);
}
