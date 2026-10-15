#!/usr/bin/env node
// Entry point for `node src/cli.js`. No arguments: run the MCP server over stdio (Claude Code starts this).
// Never print to stdout in server mode: stdout carries the MCP protocol.
import { fileURLToPath } from 'node:url';

const RUN = `node "${fileURLToPath(import.meta.url)}"`;

const HELP = `passClaude - let Claude Code use your passwords and API keys without ever seeing them.

Add it to Claude Code (one time):
  claude mcp add --scope user passclaude -- ${RUN}

Commands:
  ${RUN}
      run the MCP server (Claude Code does this for you)
  ${RUN} install-guard
      optional: block shell commands that read saved secrets directly
  ${RUN} help
      show this help`;

const [cmd] = process.argv.slice(2);

if (process.platform !== 'win32') {
  console.error('passClaude currently works on Windows only.');
  process.exitCode = 1;
} else if (!cmd) {
  const { startServer } = await import('./server.js');
  await startServer();
} else if (cmd === 'install-guard') {
  const { installGuard } = await import('./install-guard.js');
  process.exitCode = await installGuard();
} else if (['help', '--help', '-h'].includes(cmd)) {
  console.log(HELP);
} else {
  console.error(`Unknown command "${cmd}".\n\n${HELP}`);
  process.exitCode = 1;
}
