#!/usr/bin/env node
// passClaude guard: a Claude Code PreToolUse hook for the Bash and PowerShell tools.
// Blocks shell commands that try to read saved secrets directly instead of using the passClaude tools.
// A speed bump, not a wall: a determined attacker can find other ways. See the README security section.
'use strict';

const BLOCKED = [
  /passclaude:/i, // Credential Manager target names
  /cred\.ps1/i, // passClaude's own vault script
  /\bCred(Read|Enumerate)/i, // the Windows credential APIs
  /advapi32/i, // the DLL that holds them
  /\bcmdkey\b/i,
  /Get-StoredCredential/i,
  /CredentialManager/i,
  /PasswordVault/i,
  /\bvaultcmd\b/i,
  /\s-(ec|enc|encodedcommand)\b/i, // PowerShell commands hidden in base64
];

function verdict(input) {
  const command = String(input?.tool_input?.command ?? '');
  if (!BLOCKED.some((re) => re.test(command))) return null;
  return 'Blocked by passClaude guard: this command looks like it reads saved secrets directly or hides what it does. '
    + 'Use the passClaude tools instead (type_secret, run_with_secret). If this is a mistake, the user can run it themselves.';
}

module.exports = { BLOCKED, verdict };

if (require.main === module) {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { data += chunk; });
  process.stdin.on('end', () => {
    let input;
    try {
      input = JSON.parse(data);
    } catch {
      process.exit(0);
    }
    const reason = verdict(input);
    if (reason) {
      process.stderr.write(`${reason}\n`);
      process.exit(2);
    }
    process.exit(0);
  });
}
