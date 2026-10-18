// `node src/cli.js migrate`: moves the secrets passClaude (NoPeeking's name before 0.2.0) saved in Credential Manager over to
// NoPeeking. The values move inside PowerShell (src/ps/cred.ps1) and never reach Node or the screen.
import { createVault } from './vault.js';

export async function migrate({ vault = createVault(), log = console.log } = {}) {
  let result;
  try {
    result = await vault.migrate();
  } catch (e) {
    log(`Couldn't move the secrets: ${e.message}`);
    return 1;
  }
  const { moved, kept } = result;
  if (moved.length === 0 && kept.length === 0) {
    log('No passClaude secrets found. Nothing to move.');
    return 0;
  }
  if (moved.length > 0) log(`Moved ${moved.length === 1 ? '1 secret' : `${moved.length} secrets`} to NoPeeking: ${moved.join(', ')}`);
  if (kept.length > 0) {
    log(`Left in place, because NoPeeking already has a secret with the same name: ${kept.join(', ')}`);
    log('Delete the NoPeeking one first (ask Claude to use delete_secret) if you want the passClaude one, then run this again.');
  }
  return 0;
}
