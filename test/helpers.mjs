/* Helper pengujian: bangun aplikasi lengkap di jsdom + util interaksi. */
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const SCRIPTS = ['js/i18n.js', 'js/storage.js', 'js/icons.js', 'js/text.js', 'js/export.js', 'js/app.js'];

/**
 * Muat aplikasi nyata (index.html + semua skrip) ke jsdom.
 * `seed` = isi awal localStorage['novel-writer-data'].
 */
export async function createApp({ seed = null } = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'http://localhost:8000/'
  });
  const w = dom.window;
  w.__errors = [];
  w.addEventListener('error', (e) => w.__errors.push(String(e.message || e)));
  if (seed) w.localStorage.setItem('novel-writer-data', JSON.stringify(seed));

  const bundle = SCRIPTS
    .map((f) => `/* == ${f} == */\n` + fs.readFileSync(path.join(ROOT, f), 'utf8'))
    .join('\n;\n')
    + '\n;window.NW = { Storage, TextUtil, Exporter, I18N, Icons, t, applyLanguage };';
  w.eval(bundle);

  if (w.document.readyState === 'loading') {
    await new Promise((r) => w.document.addEventListener('DOMContentLoaded', r));
  }
  await wait(60); // beri waktu init()

  return {
    w,
    dom,
    $: (s) => w.document.querySelector(s),
    $$: (s) => [...w.document.querySelectorAll(s)],
    S: w.NW.Storage,
    nw: w.NovelWriter,
  };
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const click = (w, el) => el.dispatchEvent(new w.Event('click', { bubbles: true }));

export const key = (w, target, init) =>
  target.dispatchEvent(new w.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));

export const type = (w, editor, text) => {
  editor.value = text;
  editor.dispatchEvent(new w.Event('input', { bubbles: true }));
};

/** Beri nilai file pada <input type="file"> (jsdom tidak mengizinkan set langsung). */
export function setFileInput(w, input, name, text, mime = 'application/json') {
  const file = new w.File([text], name, { type: mime });
  Object.defineProperty(input, 'files', {
    configurable: true,
    get: () => {
      const list = [file];
      list.item = (i) => list[i] ?? null;
      return list;
    }
  });
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
}

/** Muat modul logika murni (storage/text/export) ke konteks Node + vm. */
export async function loadLogic() {
  const vm = await import('node:vm');
  const store = new Map();
  const sandbox = {
    console,
    crypto: globalThis.crypto,
    setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      _store: store
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of ['js/storage.js', 'js/text.js', 'js/export.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  const refs = vm.runInContext('({ Storage, TextUtil, Exporter })', sandbox);
  return { ...refs, sandbox };
}

/**
 * jsdom membungkus Storage dengan proxy: defineProperty pada instance
 * diabaikan. Patch PROTOTIPE agar setItem bisa dibuat gagal (simulasi
 * kuota localStorage penuh).
 */
export function breakStorageSetItem(w) {
  const proto = Object.getPrototypeOf(w.localStorage);
  const orig = proto.setItem;
  Object.defineProperty(proto, 'setItem', {
    configurable: true,
    value: () => { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
  });
  return () => { Object.defineProperty(proto, 'setItem', { configurable: true, value: orig }); };
}
