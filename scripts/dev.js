// Dev only: poke at passClaude pieces from the terminal. Never prints secret values.
import { createVault } from '../src/vault.js';
import { createWinOps } from '../src/winops.js';
import { normalizeSite } from '../src/sitelock.js';
import { typeSecret } from '../src/typer.js';

// Dummy value for the typing spike. Matches EXPECTED in test/fixtures/login.html.
const DUMMY = 'Spike-"Test"-$1-ü-🔑';

const [cmd, ...args] = process.argv.slice(2);
const vault = createVault();
const metaFor = (kind, site) => ({ kind, site: kind === 'web' ? normalizeSite(site) : undefined, created: new Date().toISOString() });

if (cmd === 'popup') console.log(await vault.promptPut(args[0], metaFor(args[1], args[2])));
else if (cmd === 'put-dummy') { await vault.put(args[0], metaFor(args[1], args[2]), DUMMY); console.log('saved dummy'); }
else if (cmd === 'windows') console.log(await createWinOps().chromeWindows());
else if (cmd === 'type') console.log(await typeSecret({ name: args[0], vault, win: createWinOps() }));
else if (cmd === 'list') console.log(await vault.list());
else if (cmd === 'delete') console.log(await vault.delete(args[0]));
else console.log('usage: node scripts/dev.js popup|put-dummy <name> <web|command> [site] | windows | type <name> | list | delete <name>');
