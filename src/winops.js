// Windows-side Chrome checks, typing and the typed notification, via src/ps/focus.ps1, type.ps1 and toast.ps1.
import { runPs, EXIT } from './windows.js';

export function createWinOps({ run = runPs, notify = true } = {}) {
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

    /** Shows "passClaude typed your … password" in the corner for a few seconds. Never waits for it, never throws. */
    notifyTyped({ name, site }) {
      if (!notify) return;
      run('toast.ps1', [], JSON.stringify({ name, site }), { timeoutMs: 20_000 }).catch(() => {});
    },
  };
}
