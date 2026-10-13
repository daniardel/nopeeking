// Dev only: call passClaude tools from the terminal the way Claude would. Never prints secret values.
//   node scripts/dev.js <tool> '<json args>'   e.g. node scripts/dev.js add_secret '{"name":"demo","kind":"command"}'
//   node scripts/dev.js phone '<json args>'    add_secret_from_phone, then keep waiting until saved or expired
//   node scripts/dev.js put-dummy <name> <web|command> [site]
//   node scripts/dev.js windows
import { createDeps } from '../src/server.js';
import { createHandlers } from '../src/tools.js';
import { normalizeSite } from '../src/sitelock.js';

// Dummy value for the typing spike. Matches EXPECTED in test/fixtures/login.html.
const DUMMY = 'Spike-"Test"-$1-ü-🔑';

const [cmd, ...args] = process.argv.slice(2);
const deps = createDeps();
const tools = createHandlers(deps);
const json = (text) => JSON.parse(text ?? '{}');

try {
  if (cmd === 'put-dummy') {
    const [name, kind, site] = args;
    await deps.vault.put(name, { kind, site: kind === 'web' ? normalizeSite(site) : undefined, created: new Date().toISOString() }, DUMMY);
    console.log('saved dummy');
  } else if (cmd === 'windows') {
    console.log(await deps.win.chromeWindows());
  } else if (cmd === 'phone') {
    const input = json(args[0]);
    console.log(await tools.add_secret_from_phone(input));
    let status;
    do {
      status = await tools.check_phone_secret({ name: input.name });
      console.log(status);
    } while (status.startsWith('Still waiting'));
  } else if (Object.hasOwn(tools, cmd ?? '')) {
    console.log(await tools[cmd](json(args[0])));
  } else {
    console.log(`usage: node scripts/dev.js <${Object.keys(tools).join('|')}> '<json>' | phone '<json>' | put-dummy <name> <web|command> [site] | windows`);
  }
} catch (e) {
  console.log(`ERROR: ${e.message}`);
  process.exitCode = 1;
}
deps.phone.close();
process.exit();
