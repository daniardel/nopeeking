import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const skip = process.platform !== 'win32';
const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));

test('passclaude help prints the install command', { skip }, () => {
  const out = execFileSync(process.execPath, [CLI, 'help'], { encoding: 'utf8' });
  assert.match(out, /claude mcp add --scope user passclaude -- npx -y passclaude/);
});

test('passclaude with no arguments speaks MCP over stdio and nothing else', { skip }, async () => {
  const client = new Client({ name: 'smoke', version: '1.0.0' });
  // The client does not throw on a line of stdout that is not MCP: it reports it here and carries on.
  const errors = [];
  client.onerror = (e) => errors.push(e);
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [CLI] }));
  const { tools } = await client.listTools();
  assert.equal(tools.length, 7);
  await client.close();
  assert.deepEqual(errors.map(String), [], 'the server wrote something other than MCP messages to stdout');
});
