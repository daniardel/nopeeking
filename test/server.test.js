import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createDeps, createServer } from '../src/server.js';
import { memoryVault } from './helpers.js';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function fakeDeps(vault = memoryVault()) {
  return {
    vault,
    win: { chromeWindows: async () => [], typeInto: async () => 'TYPED' },
    phone: { start: async () => ({ link: 'https://x.test/#v=1', expiresAt: Date.now() + 300_000 }), check: async () => 'waiting', close() {} },
    runCommand: async () => ({ exitCode: 0, timedOut: false, stdout: '', stderr: '', truncated: { stdout: false, stderr: false } }),
  };
}

async function connect(deps) {
  const server = createServer(deps);
  const client = new Client({ name: 'test', version: '1.0.0' });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

test('serves the seven tools and tells Claude never to ask for secrets in chat', async () => {
  const client = await connect(fakeDeps());
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    'add_secret', 'add_secret_from_phone', 'check_phone_secret', 'delete_secret', 'list_secrets', 'run_with_secret', 'type_secret',
  ]);
  const run = tools.find((t) => t.name === 'run_with_secret');
  // env or stdin, or both: the tool itself refuses a call with neither.
  assert.deepEqual(run.inputSchema.required, ['command']);
  assert.ok(run.inputSchema.properties.env && run.inputSchema.properties.stdin);
  assert.match(client.getInstructions(), /Never ask the user to paste/);
  // check_phone_secret must answer before the MCP client's default 60 second request timeout.
  assert.match(tools.find((t) => t.name === 'check_phone_secret').description, /Wait up to 50 seconds/);
  assert.match(tools.find((t) => t.name === 'add_secret_from_phone').description, /end your turn/i);
  assert.match(tools.find((t) => t.name === 'type_secret').description, /visible tab/);
  await client.close();
});

test('tool results are text; refusals and invalid input come back marked as errors', async () => {
  const vault = memoryVault();
  await vault.put('github', { kind: 'command', created: '2026-10-13T00:00:00.000Z' }, 'ghp_TOKENVALUE1234');
  const client = await connect(fakeDeps(vault));
  const ok = await client.callTool({ name: 'list_secrets', arguments: {} });
  assert.equal(ok.isError, undefined);
  assert.match(ok.content[0].text, /github: command secret/);
  const refused = await client.callTool({ name: 'type_secret', arguments: { name: 'github' } });
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /command secret/);
  const invalid = await client.callTool({ name: 'run_with_secret', arguments: { command: 'x', env: { T: 'github' }, timeout_sec: 9999 } });
  assert.equal(invalid.isError, true);
  await client.close();
});

test('PASSCLAUDE_NOTIFY=off turns the typed notification off', () => {
  assert.equal(createDeps({}).config.notify, true);
  assert.equal(createDeps({ PASSCLAUDE_NOTIFY: 'off' }).config.notify, false);
  assert.equal(createDeps({ PASSCLAUDE_NOTIFY: 'OFF' }).config.notify, false);
  assert.equal(createDeps({ PASSCLAUDE_NOTIFY: 'on' }).config.notify, true);
});

test('createDeps reads the relay and page from the environment, then package.json', () => {
  const deps = createDeps({ PASSCLAUDE_NTFY_URL: 'https://relay.example/', PASSCLAUDE_PAGE_URL: 'https://page.example/' });
  assert.equal(deps.config.ntfyUrl, 'https://relay.example');
  assert.equal(deps.config.pageUrl, 'https://page.example/');
  const defaults = createDeps({});
  assert.equal(defaults.config.ntfyUrl, 'https://ntfy.sh');
  assert.equal(defaults.config.pageUrl, pkg.passclaude.pageUrl);
});
