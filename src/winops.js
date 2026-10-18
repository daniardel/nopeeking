// Windows-side Chrome checks, typing, the typed notification and the QR window, via src/ps/focus.ps1, type.ps1, toast.ps1
// and qr.ps1.
import { encodeQr, qrPathData } from './qr.js';
import { runPs, EXIT } from './windows.js';

export function createWinOps({ run = runPs, notify = true } = {}) {
  let lastToast = null; // closes the note still showing when the next one opens, so they never stack
  return {
    /** Every Chrome window with the text in its address bar. */
    async chromeWindows() {
      const res = await run('focus.ps1', [], '', { timeoutMs: 20_000 });
      if (res.code !== EXIT.OK) throw new Error(`Couldn't inspect Chrome windows (exit code ${res.code}).`);
      const out = res.stdout.trim();
      if (!out) return [];
      let parsed;
      try {
        parsed = JSON.parse(out);
      } catch {
        // A JSON parse error would quote the script's output, so it is never passed on.
        throw new Error("Couldn't read the Chrome window list.");
      }
      return Array.isArray(parsed) ? parsed : [parsed];
    },

    /** 'TYPED', or the refusal code printed by type.ps1. */
    async typeInto(name, hwnd, url) {
      const res = await run('type.ps1', [], JSON.stringify({ name, hwnd, url }), { timeoutMs: 30_000 });
      const word = res.stdout.trim();
      if (res.code === EXIT.OK && word === 'TYPED') return 'TYPED';
      return word || `EXIT_${res.code}`;
    },

    /**
     * Shows the phone link as a QR code in a window on the PC, until the link expires or signal aborts (the server aborts
     * it once the secret arrives). Never waits for it, never throws. The code is drawn here and sent as path data.
     */
    showQr({ name, kind, link, expiresAt, signal }) {
      // Only the drawn code crosses to PowerShell: the link (and the key in it) stays in Node.
      const matrix = encodeQr(link);
      const stdin = JSON.stringify({ name, kind, expiresAt, path: qrPathData(matrix), modules: matrix.length + 8 });
      const timeoutMs = Math.max(0, expiresAt - Date.now()) + 10_000;
      run('qr.ps1', [], stdin, { timeoutMs, signal }).catch(() => {});
    },

    /** Shows "NoPeeking typed your … password" in the corner for a few seconds. Never waits for it, never throws. */
    notifyTyped({ name, site }) {
      if (!notify) return;
      lastToast?.abort();
      lastToast = new AbortController();
      run('toast.ps1', [], JSON.stringify({ name, site }), { timeoutMs: 20_000, signal: lastToast.signal }).catch(() => {});
    },
  };
}
