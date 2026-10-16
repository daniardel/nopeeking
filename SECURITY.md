# Security

passClaude handles passwords and API keys, so security reports are very welcome.

## Reporting a problem

Please **don't open a public issue**. Report it privately through GitHub instead:
[Report a vulnerability](https://github.com/daniardel/passclaude/security/advisories/new).

Include what you did, what happened and what you expected, and which version you used (`npm view passclaude version` shows the latest). You'll get a reply within a few days. Once a fix is out, the report is published as a GitHub security advisory, and you're credited unless you'd rather not be.

## What counts

Anything that breaks what the README promises under "Protected", for example:

- a passClaude tool returning a secret's value, or putting it in an error message;
- a password typed on a site it wasn't saved for, or outside a password box;
- a way to read or change a phone link's secret on the relay;
- masking that misses a whole secret or one of the encodings the README lists.

The limits listed under "Not protected" in the README are known. A new way around one of them is still worth reporting if it's easier than the README suggests.

## Supported versions

Only the latest version gets fixes.
