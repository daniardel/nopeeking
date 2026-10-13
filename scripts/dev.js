// Dev only: poke at passClaude pieces from the terminal. Never prints secret values.
import { createVault } from '../src/vault.js';
import { normalizeSite } from '../src/sitelock.js';

const [cmd, ...args] = process.argv.slice(2);
const vault = createVault();
const metaFor = (kind, site) => ({ kind, site: kind === 'web' ? normalizeSite(site) : undefined, created: new Date().toISOString() });

if (cmd === 'popup') console.log(await vault.promptPut(args[0], metaFor(args[1], args[2])));
else if (cmd === 'list') console.log(await vault.list());
else if (cmd === 'delete') console.log(await vault.delete(args[0]));
else console.log('usage: node scripts/dev.js popup <name> <web|command> [site] | list | delete <name>');
