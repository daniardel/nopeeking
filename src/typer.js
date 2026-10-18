// type_secret: pick the right Chrome window, enforce the site lock, then let type.ps1 type the secret.
import { hostOf, siteMatches } from './sitelock.js';

const REASONS = {
  NO_FOCUS: "Couldn't bring Chrome to the front. The PC must be unlocked for typing to work. Nothing was typed.",
  URL_CHANGED: 'The page changed while typing was being prepared. Nothing was typed. Try again.',
  NOT_PASSWORD_FIELD: 'The focused box in Chrome is not a password field. Click the password box first, then try again. Nothing was typed.',
  NOT_FOUND: 'The secret disappeared from the vault. Nothing was typed.',
  INTERRUPTED: 'Another window took focus while typing. The password box may be partly filled: clear it and try again.',
  FOCUS_MOVED: 'The password box lost focus while typing, so typing stopped. The box may be partly filled: clear it, click it, and try again.',
  NOT_HTTPS: "This page isn't encrypted (it isn't https), so anyone on the network could read a password typed into it. Nothing was typed. Open the https version of the login page.",
  OTHER_FRAME: 'The focused password box belongs to a frame from another website, not the locked site. Nothing was typed.',
  PAGE_UNKNOWN: "Couldn't read the address of the page the password box is in. Nothing was typed. Try again.",
};

// Address-bar text can hold anything the user typed, so refusals only ever name real-looking web hosts.
function describeWindow(url) {
  const host = hostOf(url);
  return host && (host.includes('.') || host === 'localhost') ? host : 'a non-web page';
}

export async function typeSecret({ name, vault, win }) {
  const meta = await vault.meta(name);
  if (!meta) return { ok: false, reason: `No secret named "${name}".` };
  if (meta.kind !== 'web') return { ok: false, reason: `"${name}" is a command secret and can only be used with run_with_secret.` };

  const windows = await win.chromeWindows();
  if (windows.length === 0) return { ok: false, reason: "Couldn't read any Chrome window. Open the login page in Chrome, make it the visible tab, and bring Chrome to the front: NoPeeking can't read a Chrome window that is minimized or completely covered." };

  const matching = windows.filter((w) => siteMatches(w.url, meta.site));
  const target = matching.find((w) => w.foreground) ?? (matching.length === 1 ? matching[0] : null);
  if (!target) {
    if (matching.length > 1) {
      return { ok: false, reason: `Several Chrome windows are on ${meta.site}. Bring the right one to the front or close the others, then try again.` };
    }
    const shown = [...new Set(windows.map((w) => describeWindow(w.url)))].join(', ');
    return { ok: false, reason: `Site lock: "${name}" is locked to ${meta.site}, but Chrome is showing ${shown}. Nothing was typed. NoPeeking reads the tab each Chrome window is showing: make the login page the visible tab, then try again.` };
  }

  const result = await win.typeInto(name, target.hwnd, target.url, meta.site);
  if (result === 'TYPED') return { ok: true, site: meta.site };
  return { ok: false, reason: REASONS[result] ?? `Typing failed (${result}). The password box may be partly filled: clear it and try again.` };
}
