// passClaude MCP server: registers the seven tools and serves them over stdio.
import fs from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createHandlers, MAX_TIMEOUT_SEC } from './tools.js';
import { createVault } from './vault.js';
import { createWinOps } from './winops.js';
import { createNtfy } from './ntfy.js';
import { createPhone } from './phone.js';
import { runCommand, stopAll } from './runner.js';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const INSTRUCTIONS = [
  "passClaude lets you use the user's website passwords and API keys without ever seeing them.",
  'Never ask the user to paste a password, API key or token into the chat. To save one, call add_secret (a popup on the PC),',
  'or add_secret_from_phone when the user is away from the PC (for example on their phone through Remote Control).',
  'To log in to a website: open the login page in Chrome, click the password box, then call type_secret.',
  'To use an API key in a command, call run_with_secret. Call list_secrets to see what is saved.',
].join(' ');

const secretName = z.string().describe('Secret name: lowercase letters, digits, dots, dashes or underscores, e.g. netflix or github-token.');
const newSecret = {
  name: secretName,
  kind: z.enum(['web', 'command']).describe('"web" = a website password, typed only on its site. "command" = an API key or token, used only in commands.'),
  site: z.string().optional().describe('Required for web secrets: the site it belongs to, e.g. netflix.com. Leave out for command secrets.'),
};

const TOOLS = {
  list_secrets: {
    description: 'List saved secrets: name, kind, site and date. Values are never shown.',
    annotations: { readOnlyHint: true },
  },
  add_secret: {
    description: "Save a new secret. A password popup opens on the user's PC; the user types the value there and you never see it. If the user is not at the PC, use add_secret_from_phone instead. To replace a secret, delete it first.",
    inputSchema: newSecret,
  },
  add_secret_from_phone: {
    description: 'Save a new secret from the user\'s phone. Returns a one-time link right away: show it to the user, who opens it on their phone and types the secret there (end-to-end encrypted; you never see it). Send the link, then end your turn: the user may only see your message once your turn ends. When they say they sent it, call check_phone_secret.',
    inputSchema: newSecret,
  },
  check_phone_secret: {
    description: 'Wait up to 50 seconds for the secret the user is sending from their phone link. Call again while it says it is still waiting.',
    inputSchema: { name: secretName },
    annotations: { readOnlyHint: true },
  },
  type_secret: {
    description: "Type a saved website password into Chrome. First open the secret's site in Chrome and click its password box. passClaude checks the site and that a password box is focused, then types. It does not press Enter: click the sign-in button yourself. The PC must be unlocked.",
    inputSchema: { name: secretName },
  },
  run_with_secret: {
    description: 'Run a Windows PowerShell command with saved command secrets as environment variables. Example: env {"GITHUB_TOKEN": "github"}, then use $env:GITHUB_TOKEN in the command. Secret values in the output are masked as ••••(name). Only send a secret to the service it is meant for.',
    inputSchema: {
      command: z.string().min(1).describe('PowerShell command to run.'),
      env: z.record(z.string(), z.string()).describe('Environment variable name -> saved secret name, e.g. {"GITHUB_TOKEN": "github"}.'),
      cwd: z.string().optional().describe('Folder to run in (absolute path). Defaults to where passClaude was started.'),
      timeout_sec: z.number().int().min(1).max(MAX_TIMEOUT_SEC).optional().describe('Stop the command after this many seconds (default 120).'),
    },
  },
  delete_secret: {
    description: 'Delete a saved secret.',
    inputSchema: { name: secretName },
    annotations: { destructiveHint: true },
  },
};

export function createServer(deps) {
  const handlers = createHandlers(deps);
  const server = new McpServer({ name: 'passclaude', version: pkg.version }, { instructions: INSTRUCTIONS });
  for (const [toolName, def] of Object.entries(TOOLS)) {
    server.registerTool(toolName, def, async (...args) => {
      const input = def.inputSchema ? args[0] : {};
      try {
        return { content: [{ type: 'text', text: await handlers[toolName](input) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: e?.message || 'Something went wrong.' }], isError: true };
      }
    });
  }
  return server;
}

export function createDeps(env = process.env) {
  const config = {
    ntfyUrl: (env.PASSCLAUDE_NTFY_URL || 'https://ntfy.sh').replace(/\/+$/, ''),
    pageUrl: env.PASSCLAUDE_PAGE_URL || pkg.passclaude?.pageUrl || '',
  };
  const vault = createVault();
  const ntfy = createNtfy({ baseUrl: config.ntfyUrl });
  return { config, vault, win: createWinOps(), phone: createPhone({ vault, ntfy, pageUrl: config.pageUrl }), runCommand };
}

export async function startServer() {
  const deps = createDeps();
  const server = createServer(deps);
  process.stdin.on('end', async () => {
    // On Windows a child outlives its parent: stop any running command first, so it does not keep its secrets or its script file.
    stopAll();
    await deps.phone.close(); // let a phone confirmation that is already on its way reach the relay
    process.exit(0);
  });
  await server.connect(new StdioServerTransport());
}
