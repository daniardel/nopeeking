import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import guard from '../hook/guard.cjs';

const GUARD = fileURLToPath(new URL('../hook/guard.cjs', import.meta.url));
const hookInput = (command, toolName = 'Bash') => ({ hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: { command } });

test('blocks commands that reach for saved secrets directly', () => {
  for (const command of [
    'cmdkey /list',
    'CMDKEY /list',
    'powershell -File C:/x/node_modules/passclaude/src/ps/cred.ps1 get netflix',
    '[PassClaude.Cred]::GetSecret("passclaude:netflix")',
    'Add-Type -MemberDefinition "[DllImport(\\"advapi32.dll\\")] public static extern bool CredReadW();"',
    'Get-StoredCredential -Target x',
    'Install-Module CredentialManager',
    '[Windows.Security.Credentials.PasswordVault]::new()',
    'vaultcmd /listcreds:"Windows Credentials"',
    'CredEnumerate',
    'powershell -EncodedCommand ZQBjAGgAbwA=',
    'pwsh -enc ZQBjAGgAbwA=',
  ]) {
    assert.match(guard.verdict(hookInput(command)) ?? '', /Blocked by passClaude guard/, command);
  }
});

test('allows everyday commands', () => {
  for (const command of [
    'git status', 'npm test', 'npx -y passclaude install-guard', 'Get-ChildItem', 'echo "type your password"',
    'ffmpeg -encoders', 'openssl enc -d -in x',
  ]) {
    assert.equal(guard.verdict(hookInput(command)), null, command);
  }
  assert.equal(guard.verdict({}), null);
});

test('as a hook: exit 2 with the reason on stderr when blocked, exit 0 otherwise', () => {
  const run = (input) => spawnSync(process.execPath, [GUARD], { input, encoding: 'utf8' });
  const blocked = run(JSON.stringify(hookInput('cmdkey /list', 'PowerShell')));
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /Blocked by passClaude guard/);
  assert.equal(run(JSON.stringify(hookInput('git status'))).status, 0);
  assert.equal(run('not json').status, 0);
});
