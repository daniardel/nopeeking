#!/usr/bin/env node
// NoPeeking guard: a Claude Code PreToolUse hook for the Bash and PowerShell tools.
// Blocks shell commands that try to read saved secrets directly instead of using the NoPeeking tools.
// A speed bump, not a wall: a determined attacker can find other ways. See the README security section.
'use strict';

const BLOCKED = [
  /nopeeking:/i, // Credential Manager target names
  /passclaude:/i, // the same, saved by passClaude (the old name) before 0.2.0
  /cred\.ps1/i, // NoPeeking's own vault script
  /\bCred(Read|Enumerate)/i, // the Windows credential APIs
  /advapi32/i, // the DLL that holds them
  /\bcmdkey\b/i,
  /Get-StoredCredential/i,
  /CredentialManager/i,
  /PasswordVault/i,
  /\bvaultcmd\b/i,
  /\s-(ec|enc|encodedcommand)\b/i, // PowerShell commands hidden in base64
  // powershell.exe and pwsh take any start of -EncodedCommand (-e, -en, -enco ...), with - or /, also quoted in an argument list.
  /\b(powershell|pwsh)\b.*[\s"',][-/](ec|e(n(c(o(d(e(d(c(o(m(m(a(n(d)?)?)?)?)?)?)?)?)?)?)?)?)?)(?=$|[\s"',])/is,
];

function verdict(input) {
  const command = String(input?.tool_input?.command ?? '');
  if (!BLOCKED.some((re) => re.test(command))) return null;
  return 'Blocked by NoPeeking guard: this command looks like it reads saved secrets directly or hides what it does. '
    + 'Use the NoPeeking tools instead (type_secret, run_with_secret). If this is a mistake, the user can run it themselves.';
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
