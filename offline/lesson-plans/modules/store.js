// modules/store.js — the ONLY file that talks to a backend.
//
// Today that is a Google Apps Script web app over a Google Sheet. Swapping in
// Supabase later means rewriting this file and nothing else.
//
// Paste the deployed /exec URL below. See docs/apps-script.gs for setup.
const EXEC_URL = '';

const KEY_STORE = 'lessonPlansKey';
const WHO_STORE = 'lessonPlansWho';
const LOCAL_DB  = 'lessonPlansLocalDb';

export const configured = () => !!EXEC_URL;

export const getKey = () => localStorage.getItem(KEY_STORE) || '';
export const setKey = k => localStorage.setItem(KEY_STORE, k);
export const clearKey = () => localStorage.removeItem(KEY_STORE);

export const getWho = () => localStorage.getItem(WHO_STORE) || '';
export const setWho = n => localStorage.setItem(WHO_STORE, n);

/** Thrown for anything the caller should show the user verbatim. */
export class StoreError extends Error {
  constructor(code, detail) { super(code); this.code = code; this.detail = detail || {}; }
}

async function call(action, payload = {}) {
  if (!EXEC_URL) return local(action, payload);

  let res;
  try {
    // No Content-Type header on purpose: that keeps this a "simple" request, so
    // the browser skips the CORS preflight Apps Script cannot answer.
    res = await fetch(EXEC_URL, {
      method: 'POST',
      body: JSON.stringify({ ...payload, action, key: getKey() }),
    });
  } catch {
    throw new StoreError('offline');
  }
  if (!res.ok) throw new StoreError('http', { status: res.status });

  let data;
  try { data = await res.json(); } catch { throw new StoreError('bad-response'); }
  if (data.error) throw new StoreError(data.error, data);
  return data;
}

// ---------------------------------------------------------------- API

export const list     = ()                 => call('list').then(r => r.plans);
export const get      = id                 => call('get', { id });
export const remove   = id                 => call('remove', { id });
export const versions = id                 => call('versions', { id }).then(r => r.versions);
export const version  = (id, v)            => call('version', { id, version: v }).then(r => r.plan);
export const people   = ()                 => call('people').then(r => r.people).catch(() => []);

export const save = (plan, baseVersion, force = false) =>
  call('save', { plan, baseVersion, who: getWho(), force });

/** Verify the shared key by making the cheapest real call there is. */
export async function verifyKey(key) {
  const previous = getKey();
  setKey(key);
  try { await list(); return true; }
  catch (e) { setKey(previous); if (e.code === 'bad-key') return false; throw e; }
}

/**
 * Downscale in the browser before upload: a 12MP phone photo is ~5MB of base64
 * that Apps Script will choke on, and nobody needs more than 1600px in a plan.
 */
export async function uploadImage(file) {
  const dataUrl = await downscale(file, 1600);
  const r = await call('upload', { filename: file.name, dataUrl });
  return r.url;
}

function downscale(file, maxEdge) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new StoreError('bad-image'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new StoreError('bad-image'));
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        if (scale === 1 && file.size < 1_000_000) return resolve(reader.result);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------- local fallback
//
// ponytail: with no EXEC_URL set, everything runs against localStorage so the
// app is usable and demoable before the Sheet exists. Same shapes, same version
// and conflict semantics — it is just not shared with anyone. Delete this block
// once the backend is live, or leave it as an offline sandbox.

function db() {
  try { return JSON.parse(localStorage.getItem(LOCAL_DB)) || { plans: {}, versions: [] }; }
  catch { return { plans: {}, versions: [] }; }
}
function writeDb(d) { localStorage.setItem(LOCAL_DB, JSON.stringify(d)); }

function local(action, p) {
  const d = db();
  const who = getWho() || 'you';
  switch (action) {
    case 'list':
      return Promise.resolve({ plans: Object.values(d.plans).map(row => ({
        id: row.plan.id, title: row.plan.title || '(untitled)',
        status: row.plan.metadata.status, updatedAt: row.plan.metadata.updatedAt,
        updatedBy: row.plan.metadata.updatedBy || row.plan.metadata.author, version: row.version,
      })) });

    case 'get': {
      const row = d.plans[p.id];
      return row ? Promise.resolve({ plan: row.plan, version: row.version })
                 : Promise.reject(new StoreError('not-found'));
    }

    case 'save': {
      const row = d.plans[p.plan.id];
      const current = row ? row.version : 0;
      if (row && Number(p.baseVersion) !== current && !p.force) {
        return Promise.reject(new StoreError('conflict', { current, currentBy: row.plan.metadata.updatedBy }));
      }
      if (row) d.versions.push({ id: p.plan.id, version: current, savedAt: row.plan.metadata.updatedAt, savedBy: row.plan.metadata.updatedBy || '', plan: row.plan });
      const plan = structuredClone(p.plan);
      plan.metadata.updatedAt = new Date().toISOString();
      plan.metadata.updatedBy = who;
      plan.metadata.version = current + 1;
      if (!plan.metadata.author) plan.metadata.author = who;
      plan.metadata.editors = [...new Set([...(plan.metadata.editors || []), who])];
      d.plans[plan.id] = { plan, version: current + 1 };
      writeDb(d);
      return Promise.resolve({ ok: true, version: current + 1, plan });
    }

    case 'remove':
      delete d.plans[p.id]; writeDb(d);
      return Promise.resolve({ ok: true });

    case 'versions':
      return Promise.resolve({ versions: d.versions.filter(v => v.id === p.id)
        .map(({ version, savedAt, savedBy }) => ({ version, savedAt, savedBy }))
        .sort((a, b) => b.version - a.version) });

    case 'version': {
      const hit = d.versions.find(v => v.id === p.id && v.version === Number(p.version));
      return hit ? Promise.resolve({ plan: hit.plan }) : Promise.reject(new StoreError('not-found'));
    }

    case 'upload':
      // No Drive to upload to; the data URL is its own address.
      return Promise.resolve({ ok: true, url: p.dataUrl });

    case 'people':
      return Promise.resolve({ people: [...new Set(Object.values(d.plans)
        .map(r => r.plan.metadata.updatedBy).filter(Boolean))].sort() });

    default:
      return Promise.reject(new StoreError('unknown-action'));
  }
}
