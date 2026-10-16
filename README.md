<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/logo/lockup-on-violet.svg">
    <img src="brand/logo/lockup.svg" alt="passClaude" width="420">
  </picture>
</p>

<h3 align="center">Claude logs you in. Its eyes stay shut.</h3>

<p align="center">Let Claude Code log into websites and use your API keys without ever seeing them.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/passclaude"><img src="https://img.shields.io/npm/v/passclaude?color=5B2EFF" alt="npm"></a>
  <a href="https://github.com/daniardel/passclaude/actions/workflows/test.yml"><img src="https://github.com/daniardel/passclaude/actions/workflows/test.yml/badge.svg" alt="tests"></a>
  <img src="https://img.shields.io/badge/platform-Windows-17132E" alt="platform: Windows">
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/passclaude?color=FFC92E" alt="license"></a>
</p>

You never paste a password into the chat. You type it once, into a popup on your PC or a one-time encrypted link on your phone. After that Claude can *use* it, but passClaude's tools never return the value, so it stays out of the conversation, the transcript and the model. There are a few ways it can still get out: read "Not protected" below.

- **Website logins:** Claude clicks the password box and passClaude types the password, but only on the site it belongs to.
- **API keys in commands:** Claude runs the command, the key goes in as an environment variable or is typed into a login prompt, and it is masked in the output.
- **Works from your phone** with Claude Code Remote Control, including saving new secrets.
- **Free and open source.** No password manager, no account. Windows.

passClaude is an independent project. It is not made by or affiliated with Anthropic.

## Install

You need Windows 10 or 11, [Node.js](https://nodejs.org) 20 or newer and [Claude Code](https://docs.claude.com/en/docs/claude-code/setup). For website logins you also need Chrome with Claude in Chrome.

**One click:** download [install-passclaude.cmd](https://github.com/daniardel/passclaude/releases/latest/download/install-passclaude.cmd) and double-click it. It checks that Node.js and Claude Code are there and adds passClaude. Windows may warn that the file comes from the internet: choose "More info", then "Run anyway". It's a short text file, so you can open it in Notepad to read it first.

**One command:**

```
claude mcp add --scope user passclaude -- npx -y passclaude
```

**Or ask Claude:** paste this into Claude Code: *Install passClaude for me by running `claude mcp add --scope user passclaude -- npx -y passclaude`.*

Then restart Claude Code.

## What to say to Claude

| You say | What happens |
|---|---|
| "Save my Netflix password" | A password popup opens on your PC. You type it there. |
| "Save my GitHub token. I'm on my phone." | Claude shows a one-time link. You open it on your phone and type the token. |
| "Log into Netflix" | Claude opens the login page and clicks the password box. passClaude types the password. Claude clicks Sign in. |
| "List my GitHub repos with my GitHub token" | Claude runs the command with your token in `$env:GITHUB_TOKEN`. The output shows `••••(github)` where the token would be. |
| "Log the GitHub CLI in with my GitHub token" | Claude runs `gh auth login --with-token` and passClaude types the token into it, the way you would at the prompt. Works for any command that reads a token or password from its input, like `docker login --password-stdin`. |
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

passClaude is an MCP server that runs on your PC. Its tools never return a secret, so passClaude never puts one in the chat. It can't stop every other way a secret can leak: see "Not protected" below.

| Tool | What it does |
|---|---|
| `list_secrets` | Names, kinds and sites of saved secrets |
| `add_secret` | Opens a password popup on the PC |
| `add_secret_from_phone` | Gives a one-time link to type the secret on your phone |
| `check_phone_secret` | Waits up to 50 seconds for the phone to send it |
| `type_secret` | Types a website password into Chrome, only on its site |
| `run_with_secret` | Runs a Windows PowerShell command with secrets as environment variables or typed into its input, output masked |
| `delete_secret` | Deletes a secret |

Commands stop after 2 minutes unless Claude asks for longer (10 minutes at most). Output is cut off at 1 MB per stream.

Website passwords and command secrets are kept apart: a website password can only be typed, and only on its own site; a command secret can only be used in commands.

## Security: what it protects and what it doesn't

**Protected**
- No passClaude tool returns a secret. Secrets don't appear in tool results, so passClaude itself never sends them to the model, your transcripts or Anthropic's servers. The ways a secret can still get out are listed under "Not protected".
- Website passwords are typed only when Chrome's address bar shows the site they were saved for (subdomains included, lookalikes like `netflix.com.evil.ru` refused) and only into a password box.
- A saved secret is never replaced without a delete first.
- Phone links are end-to-end encrypted (ECDH P-256 + AES-256-GCM, done in your phone's browser). The relay ([ntfy.sh](https://ntfy.sh)) only sees scrambled data. Each link saves one secret and expires after 5 minutes (but see the link note below).

**Not protected (please read)**
- Claude Code can run shell commands as you. A Claude that is deliberately trying, or that has been tricked by a malicious web page or file, could read Windows Credential Manager directly. The optional guard (below) blocks the obvious ways. It's a speed bump, not a wall.
- A tricked Claude could send a command secret somewhere inside the command it runs. Masking protects the output, not network calls. Keep Claude Code's approval prompt on for `run_with_secret` and read the command before you approve it.
- Masking hides the whole secret in the output, its common encodings (base64, URL-encoded, hex, JSON-escaped), and any piece of 8 or more characters of them, also when Windows PowerShell wraps a long value onto the next line or shortens it with `...`. It can't catch pieces shorter than 8 characters, other encodings, or a value that the command deliberately reshapes, for example by reversing it, splitting it up or re-encoding it. Because it masks pieces, masking can occasionally also hide ordinary text that happens to match part of a secret. Read the command before you approve it.
- Once typed, a password sits in the page's password box. Scripts on that page can read it, just like when you type it yourself. So can Claude's own browser tools: Claude in Chrome can run JavaScript on the page, or click "show password" and take a screenshot, and that puts the password in the chat. passClaude can't stop this. The site lock only limits where the password is typed. Watch what Claude does on the page after it types.
- The phone page is served from GitHub Pages ([daniardel/passclaude-phone](https://github.com/daniardel/passclaude-phone)). Whoever controls that repo controls the page's code. You can host your own copy (see Configuration).
- The site lock reads Chrome's address bar. It is tested with English Chrome. Other languages use a fallback that finds the address bar as the first text box outside the web page, which has not been tested in a non-English Chrome yet.
- The one-time link appears in the chat. It contains no secret: only a public key, a random relay topic, the secret's name, kind and site, when it expires, and the relay address. But the link works like a key: anyone who sees it before you use it could send their own value to it within its 5 minutes. Open it right away. After you send, your phone page must say "Saved". If Claude says it saved but your phone page didn't, delete the secret and try again.
- A tricked Claude could show you a fake phone link that sends what you type to someone else. The phone page can't tell a real link from a fake one. Only open a phone link right after you asked Claude to save a secret, and check the name and site it shows.
- Claude chooses a secret's name and site. Check the site shown in the popup or on the phone page before you type. A password saved for the wrong site is typed on that wrong site.
- Your phone's browser might offer to save what you typed in its own password manager. Tap Never if you don't want a copy there.
- Typing needs the PC unlocked, with the login page as the visible tab of a Chrome window that isn't minimized or completely covered (for example by a full-screen game). Claude in Chrome sometimes opens pages in a background tab: if passClaude says Chrome is showing another site, switch to the login tab. Remote Control drives your PC; passClaude types on the PC, not on your phone.

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
| `PASSCLAUDE_PAGE_URL` | `https://daniardel.github.io/passclaude-phone/` | Where phone links open. Host the page yourself and point this at it. |

A custom relay must use https and be reachable from your phone. The page URL must be https too, because the page needs a secure connection to encrypt. To host the page yourself, copy `index.html`, `style.css`, `app.js`, `link.js`, `e2e.js` and the `brand` folder from the `docs/` folder of the GitHub repo. The page loads nothing from other sites, fonts included. The npm package only ships `docs/e2e.js`.

Example:

```
claude mcp add --env PASSCLAUDE_NTFY_URL=https://ntfy.example.com --scope user passclaude -- npx -y passclaude
```

## FAQ

**Does Claude really never see my password?**
No passClaude tool returns it, and command output is masked. The project's tests check that no tool output contains a saved value, including base64 and URL-encoded copies. That is not the same as a promise that it can't leak: see "Not protected" above, for example for Claude's own browser tools and for what masking can't catch.

**Where are my secrets stored?**
In Windows Credential Manager, encrypted by Windows for your user account. You can see them in Control Panel → Credential Manager → Windows Credentials, named `passclaude:<name>`.

**How do I change a password?**
Ask Claude to delete it and save it again.

**Does it press Enter after typing?**
No. Claude clicks the sign-in button itself. That makes the login a separate step that shows up in the chat, so you can see it. With Remote Control you may not be watching the PC while it types.

**Does it work on a work PC?**
Maybe not. passClaude runs bundled PowerShell scripts. It asks PowerShell to skip the execution policy for them, but if your organization's Group Policy forces the execution policy to AllSigned or Restricted, that setting wins, the scripts can't run and passClaude won't work. AppLocker or Windows Defender Application Control (WDAC) rules can also put PowerShell in Constrained Language Mode, which blocks the C# code the scripts compile. And if your organization turns on PowerShell logging or transcription by policy, commands run with `run_with_secret` may be recorded in Windows logs, including what they print, before passClaude masks it.

**Can I save a very long secret from my phone?**
Almost always. A secret can be up to 1,280 characters, and the phone relay limits message size. Ordinary secrets of any allowed length fit. A very long secret made of Chinese, Japanese or Korean characters (over about 950) or emoji (over about 350) can be too big. If it is, the phone page says so. Use the PC popup (`add_secret`) instead.

**What if my PC can't reach the phone relay?**
Before it gives you a link, passClaude checks that your PC can connect to the relay (ntfy.sh, or your own). If it can't within 8 seconds, it says so right away instead of giving you a link whose secret could never reach your PC. Use the PC popup (`add_secret`) instead.

**What should I do while it types?**
Leave the mouse and keyboard alone for a moment. If another window comes to the front, typing stops and the password box may be partly filled: clear it and try again. A click into another box of the same window is not caught.

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
git clone https://github.com/daniardel/passclaude.git
cd passclaude
npm install
npm test
```

To try your copy in Claude Code: `claude mcp add --scope user passclaude -- node "<this folder>\src\cli.js"`.

The phone page is `docs/index.html`, `docs/style.css`, `docs/app.js`, `docs/link.js`, `docs/e2e.js` and `docs/brand/`. The live copy is in the public [passclaude-phone](https://github.com/daniardel/passclaude-phone) repo. After changing any of these files, copy them there and push, or phone links keep opening the old page. To try it locally: `node scripts/serve.js docs`.

The look (colours, fonts, the padlock) lives in [`brand/`](brand/README.md). After changing it, run `npm run brand` and commit what it writes; it also refreshes `docs/brand/`.

## Reporting a security problem

Please don't open a public issue. See [SECURITY.md](SECURITY.md).

## License

MIT
