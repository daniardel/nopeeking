#!/usr/bin/env node
// Entry point for `npx nopeeking`. No arguments: run the MCP server over stdio (Claude Code starts this).
// Never print to stdout in server mode: stdout carries the MCP protocol.

const HELP = `NoPeeking - let Claude Code use your passwords and API keys without ever seeing them.

Add it to Claude Code (one time):
  claude mcp add --scope user nopeeking -- npx -y nopeeking

Commands:
  npx nopeeking                 run the MCP server (Claude Code does this for you)
  npx nopeeking install-guard   optional: block shell commands that read saved secrets directly
  npx nopeeking migrate         move secrets saved by passClaude (NoPeeking's old name) over to NoPeeking
  npx nopeeking help            show this help`;

const [cmd] = process.argv.slice(2);

if (process.platform !== 'win32') {
  console.error('NoPeeking currently works on Windows only.');
  process.exitCode = 1;
} else if (!cmd) {
  const { startServer } = await import('./server.js');
  await startServer();
} else if (cmd === 'install-guard') {
  const { installGuard } = await import('./install-guard.js');
  process.exitCode = await installGuard();
} else if (cmd === 'migrate') {
  const { migrate } = await import('./migrate.js');
  process.exitCode = await migrate();
} else if (['help', '--help', '-h'].includes(cmd)) {
  console.log(HELP);
} else {
  console.error(`Unknown command "${cmd}".\n\n${HELP}`);
  process.exitCode = 1;
}
