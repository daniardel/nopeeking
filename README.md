# passClaude

**Let Claude Code log into websites and use your API keys without ever seeing them.**

[![npm](https://img.shields.io/npm/v/passclaude)](https://www.npmjs.com/package/passclaude) [![license](https://img.shields.io/npm/l/passclaude)](LICENSE)

You never paste a password into the chat. You type it once, into a popup on your PC or a one-time encrypted link on your phone. After that Claude can *use* it, but the value never enters the conversation, the transcript or the model.

- **Website logins:** Claude clicks the password box and passClaude types the password, but only on the site it belongs to.
- **API keys in commands:** Claude runs the command, the key goes in as an environment variable, and it is masked in the output.
- **Works from your phone** with Claude Code Remote Control, including saving new secrets.
- **Free and open source.** No password manager, no account. Windows.

## Install (one command)

```
claude mcp add --scope user passclaude -- npx -y passclaude
```

Then restart Claude Code. You need Windows 10 or 11, [Node.js](https://nodejs.org) 20 or newer and Claude Code. For website logins you also need Chrome with Claude in Chrome.

## What to say to Claude

| You say | What happens |
|---|---|
| "Save my Netflix password" | A password popup opens on your PC. You type it there. |
| "Save my GitHub token. I'm on my phone." | Claude shows a one-time link. You open it on your phone and type the token. |
| "Log into Netflix" | Claude opens the login page and clicks the password box. passClaude types the password. Claude clicks Sign in. |
| "List my GitHub repos with my GitHub token" | Claude runs the command with your token in `$env:GITHUB_TOKEN`. The output shows `••••(github)` where the token would be. |
| "What passwords do you have?" | Names and sites only. Never values. |

Commands run in Windows PowerShell (`powershell.exe`, version 5.1), so Claude writes PowerShell syntax such as `$env:GITHUB_TOKEN`, not `$GITHUB_TOKEN` or `%GITHUB_TOKEN%`.

## How it works

```
 You ─ type once ─▶ PC popup, or phone link (encrypted on the phone)
                        │
                        ▼
          Windows Credential Manager  (entries named passclaude:<name>)
                        │
 Claude ─ type_secret ──┼──▶ checks Chrome is on the right site and a password box is focused ──▶ types it
 Claude ─ run_with_secret ─▶ command gets the key as an env var ──▶ output is masked ──▶ Claude
```

passClaude is an MCP server that runs on your PC. Its tools never return a secret, so the secret never reaches the chat.

| Tool | What it does |
|---|---|
| `list_secrets` | Names, kinds and sites of saved secrets |
| `add_secret` | Opens a password popup on the PC |
| `add_secret_from_phone` | Gives a one-time link to type the secret on your phone |
| `check_phone_secret` | Waits up to 50 seconds for the phone to send it |
| `type_secret` | Types a website password into Chrome, only on its site |
| `run_with_secret` | Runs a Windows PowerShell command with secrets as environment variables, output masked |
| `delete_secret` | Deletes a secret |

Commands stop after 2 minutes unless Claude asks for longer (10 minutes at most). Output is cut off at 1 MB per stream.

Website passwords and command secrets are kept apart: a website password can only be typed, and only on its own site; a command secret can only be used in commands.

## Security: what it protects and what it doesn't

**Protected**
- No passClaude tool ever returns a secret. Secrets never appear in tool results, so they never reach the model, your transcripts or Anthropic's servers through passClaude.
- Website passwords are typed only when Chrome's address bar shows the site they were saved for (subdomains included, lookalikes like `netflix.com.evil.ru` refused) and only into a password box.
- Saved secrets can't be silently replaced. Claude must delete one first, and a new one can only come from you typing it.
- Phone links are end-to-end encrypted (ECDH P-256 + AES-256-GCM, done in your phone's browser). The relay ([ntfy.sh](https://ntfy.sh)) only sees scrambled data. Each link saves one secret and expires after 5 minutes.

**Not protected (please read)**
- Claude Code can run shell commands as you. A Claude that is deliberately trying, or that has been tricked by a malicious web page or file, could read Windows Credential Manager directly. The optional guard (below) blocks the obvious ways. It's a speed bump, not a wall.
- A tricked Claude could send a command secret somewhere inside the command it runs. Masking protects the output, not network calls. Keep Claude Code's approval prompt on for `run_with_secret` and read the command before you approve it.
- Masking finds the secret as it is and in its common encodings (base64, URL-encoded, hex, JSON-escaped). A command that deliberately reshapes the secret, for example by reversing it, could get it past the mask.
- Once typed, a password sits in the page's password box, where scripts on that page can read it, just like when you type it yourself.
- The phone page is served from GitHub Pages. Whoever controls that repo controls the page's code. You can host your own copy (see Configuration).
- The one-time link appears in the chat. It contains no secret: only a public key, a random relay topic, the secret's name, kind and site, when it expires, and the relay address.
- Your phone's browser might offer to save what you typed in its own password manager. Tap Never if you don't want a copy there.
- Typing needs the PC unlocked with Chrome open on it. Remote Control drives your PC; passClaude types on the PC, not on your phone.

### Optional guard

```
npx -y passclaude install-guard
```

Shows the exact change, asks first, backs up `~/.claude/settings.json`, then adds a hook that blocks shell commands which try to read saved secrets directly (`cmdkey`, the Windows credential APIs, hidden base64 PowerShell commands and similar).

The hook covers Claude Code's Bash and PowerShell tools and also passClaude's own `run_with_secret` tool. `run_with_secret` makes the same check itself, so it refuses these kinds of commands even if you never install the guard. The guard adds the same block for Claude Code's own shell tools.

## Configuration

| Environment variable | Default | What it's for |
|---|---|---|
| `PASSCLAUDE_NTFY_URL` | `https://ntfy.sh` | Relay for phone links. Point it at your own [ntfy](https://docs.ntfy.sh/install/) server if you like. |
| `PASSCLAUDE_PAGE_URL` | the project's GitHub Pages page | Where phone links open. Host the `docs/` folder yourself and point this at it. |

Example:

```
claude mcp add --env PASSCLAUDE_NTFY_URL=https://ntfy.example.com --scope user passclaude -- npx -y passclaude
```

## FAQ

**Does Claude really never see my password?**
Right. No passClaude tool returns it, and command output is masked. The project's tests check that no tool output ever contains a saved value, including base64 and URL-encoded copies. See "Not protected" above for what masking can't stop.

**Where are my secrets stored?**
In Windows Credential Manager, encrypted by Windows for your user account. You can see them in Control Panel → Credential Manager → Windows Credentials, named `passclaude:<name>`.

**How do I change a password?**
Ask Claude to delete it and save it again.

**Does it press Enter after typing?**
No. Claude clicks the sign-in button itself, so it can't log in somewhere you didn't expect without you seeing the click.

**Does it work on a work PC?**
Maybe not. passClaude runs bundled PowerShell scripts. It asks PowerShell to skip the execution policy for them, but if your organization's Group Policy forces the execution policy to AllSigned or Restricted, that setting wins, the scripts can't run and passClaude won't work.

**Can I save a very long secret from my phone?**
Almost always. A secret can be up to 1,280 characters, and the phone relay limits message size. Ordinary secrets of any allowed length fit. A very long secret made of Chinese, Japanese or Korean characters (over about 950) or emoji (over about 350) can be too big. If it is, the phone page says so. Use the PC popup (`add_secret`) instead.

**Mac or Linux?**
Not yet. Windows first.

**Edge or Firefox?**
Chrome only for now.

**Why not a password manager's Claude integration?**
If you already use one with Claude, that may suit you better. passClaude is for people who want something free, with no account, that works over Remote Control.

## Uninstall

1. Ask Claude to delete your passClaude secrets, or remove the `passclaude:` entries in Credential Manager.
2. Run `claude mcp remove passclaude --scope user`.
3. If you installed the guard: remove the passClaude entry under `hooks.PreToolUse` in `~/.claude/settings.json` (a backup was saved next to it) and delete the `~/.claude/passclaude` folder.

## Development

```
npm install
npm test
```

The design is in [`docs/superpowers/specs/`](docs/superpowers/specs/).

## License

MIT
