// registry.ts — real Arduino library registry index.
//
// Fetches the official index (gzipped ~4.9 MB, CORS-open), decompresses it in
// the browser, and groups the ~7k libraries to their latest version. Cached in
// memory for the session and in localStorage for 24h so it loads instantly on
// return. Works in the browser preview and in the Tauri Android webview.
//
// In the eventual build-server architecture this same shape can be served by
// `arduino-cli lib search` instead of fetching the whole index on-device.

const INDEX_GZ = "https://downloads.arduino.cc/libraries/library_index.json.gz";
const CACHE_KEY = "fb-lib-registry-v1";
const CACHE_TS_KEY = "fb-lib-registry-ts";
const TTL_MS = 24 * 60 * 60 * 1000;

export interface RegLib {
  name: string;
  author: string;
  /** latest version */
  version: string;
  /** all versions, newest first */
  versions: string[];
  desc: string;
  category?: string;
}

interface RawLib {
  name: string;
  version: string;
  author?: string;
  sentence?: string;
  category?: string;
}

let memCache: RegLib[] | null = null;
let inflight: Promise<RegLib[]> | null = null;

export function getCachedRegistry(): RegLib[] | null {
  return memCache ?? readLocal();
}

/** SemVer-ish compare: numeric base segments, and a pre-release ranks LOWER
 *  than the same base without one (1.0.0-rc2 < 1.0.0-rc10 < 1.0.0). */
export function cmpVer(a: string, b: string): number {
  const [abase, ...aPre] = a.split("-");
  const [bbase, ...bPre] = b.split("-");
  const pa = abase.split(/[.+]/);
  const pb = bbase.split(/[.+]/);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = parseInt(pa[i] ?? "0", 10) || 0;
    const y = parseInt(pb[i] ?? "0", 10) || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  const ap = aPre.join("-");
  const bp = bPre.join("-");
  if (ap === bp) return 0;
  if (!ap) return 1; // a is final, b is pre-release → a is newer
  if (!bp) return -1;
  const an = parseInt(ap.replace(/\D/g, ""), 10);
  const bn = parseInt(bp.replace(/\D/g, ""), 10);
  if (!Number.isNaN(an) && !Number.isNaN(bn) && an !== bn) return an < bn ? -1 : 1;
  return ap < bp ? -1 : ap > bp ? 1 : 0;
}

function cleanAuthor(a: string | undefined): string {
  return (a ?? "").replace(/<[^>]*>/g, "").split(",")[0].trim() || "—";
}

function readLocal(): RegLib[] | null {
  try {
    const ts = Number(localStorage.getItem(CACHE_TS_KEY) ?? "0");
    if (!ts || Date.now() - ts > TTL_MS) return null;
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw) as Omit<RegLib, "versions">[];
    memCache = arr.map((x) => ({ ...x, versions: [x.version] }));
    return memCache;
  } catch {
    return null;
  }
}

function writeLocal(libs: RegLib[]) {
  try {
    const trimmed = libs.map((l) => ({ name: l.name, author: l.author, version: l.version, desc: l.desc, category: l.category }));
    localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
    localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
  } catch {
    /* quota exceeded — fine, memory cache still serves the session */
  }
}

async function fetchIndexText(): Promise<string> {
  const res = await fetch(INDEX_GZ);
  if (!res.ok) throw new Error(`registry HTTP ${res.status}`);
  // The .gz is served as a raw gzip body (no Content-Encoding), so decompress it
  // ourselves with the Compression Streams API.
  const hasDS = typeof (globalThis as { DecompressionStream?: unknown }).DecompressionStream !== "undefined";
  if (res.body && hasDS) {
    const ds = new DecompressionStream("gzip");
    return await new Response(res.body.pipeThrough(ds)).text();
  }
  // Fallback: maybe the layer already decompressed it.
  return await res.text();
}

export function loadRegistry(): Promise<RegLib[]> {
  if (memCache) return Promise.resolve(memCache);
  const local = readLocal();
  if (local) return Promise.resolve(local);
  if (inflight) return inflight;

  inflight = (async () => {
    const text = await fetchIndexText();
    const json = JSON.parse(text) as { libraries: RawLib[] };
    const map = new Map<string, RegLib>();
    for (const l of json.libraries) {
      if (!l.name || !l.version) continue;
      const ex = map.get(l.name);
      if (!ex) {
        map.set(l.name, {
          name: l.name,
          author: cleanAuthor(l.author),
          version: l.version,
          versions: [l.version],
          desc: l.sentence ?? "",
          category: l.category,
        });
      } else {
        ex.versions.push(l.version);
        if (cmpVer(l.version, ex.version) > 0) {
          ex.version = l.version;
          if (l.sentence) ex.desc = l.sentence;
        }
      }
    }
    const out = [...map.values()];
    for (const r of out) r.versions.sort((a, b) => cmpVer(b, a));
    out.sort((a, b) => a.name.localeCompare(b.name));
    memCache = out;
    writeLocal(out);
    return out;
  })();

  // Clear the in-flight handle on failure so a later call can retry the fetch
  // (otherwise a permanently-rejected promise would block every retry).
  inflight.catch(() => {
    inflight = null;
  });

  return inflight;
}
