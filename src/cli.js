#!/usr/bin/env node
// Entry point for `npx passclaude`. No arguments: run the MCP server over stdio (Claude Code starts this).
// Never print to stdout in server mode: stdout carries the MCP protocol.

const HELP = `passClaude - let Claude Code use your passwords and API keys without ever seeing them.

Add it to Claude Code (one time):
  claude mcp add --scope user passclaude -- npx -y passclaude

Commands:
  npx passclaude          run the MCP server (Claude Code does this for you)
  npx passclaude help     show this help`;

const [cmd] = process.argv.slice(2);

if (process.platform !== 'win32') {
  console.error('passClaude currently works on Windows only.');
  process.exitCode = 1;
} else if (!cmd) {
  const { startServer } = await import('./server.js');
  await startServer();
} else if (['help', '--help', '-h'].includes(cmd)) {
  console.log(HELP);
} else {
  console.error(`Unknown command "${cmd}".\n\n${HELP}`);
  process.exitCode = 1;
}
