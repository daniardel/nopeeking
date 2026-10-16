# passClaude brand kit

The look of passClaude: a violet-and-yellow "sticker" style and a padlock that keeps its eyes shut, because Claude
never sees your passwords. passClaude is an independent project; nothing here is Anthropic's.

## What's here

| Path | What |
|---|---|
| `tokens.json` | Colours, corner radii, outline, shadows and fonts. The source of truth. |
| `web/tokens.css` | Generated from `tokens.json`: `--pc-*` custom properties and `@font-face` rules. |
| `web/fonts/` | Self-hosted `.woff2` fonts for the phone page and landing page, with their licences. |
| `logo/mark.svg` | The padlock. `mark-yellow.svg` for violet grounds, `mark-mono.svg` in one colour (`currentColor`). |
| `logo/face-*.svg` | The padlock's moods: `saved` (smiling), `error` (worried), `expired` (asleep). |
| `logo/lockup*.svg` | Generated: padlock + "passClaude" wordmark, as outlines. |
| `social-preview.png` | Generated: upload it in the repo's Settings → Social preview. |
| `../assets/` | What the installed app uses: `passclaude.ico` and `.ttf` fonts. This is the only part in the npm package. |

## Colours

| Token | Hex | Use |
|---|---|---|
| violet | `#5B2EFF` | Main brand colour, big grounds |
| yellow | `#FFC92E` | Primary buttons, highlights |
| ink | `#17132E` | Text, outlines, sticker shadows |
| paper | `#F3EFFF` | Light background |
| mint | `#0E9F6E` | Done |
| coral | `#E5432A` | Errors |

The rest (`violet-deep`, `lilac-200`, `lilac-300`, `muted`, `muted-on-dark`, `white`) are in `tokens.json`.

## Fonts

Bricolage Grotesque 800 for headings and buttons, DM Sans 400/500/700 for text, JetBrains Mono 500/700 for code and
labels. All three are under the SIL Open Font License 1.1; keep each `OFL-*.txt` next to its font files.

## Using the padlock

- Keep the face white on violet, or ink on yellow. Don't recolour the eyes or mouth separately.
- Leave clear space of at least a quarter of the mark's width around it.
- Smallest size: 16 px.

## Regenerating

- Changed `tokens.json` or a logo SVG: run `npm run brand`, then commit what it wrote.
- Changing fonts or the outlined text: see the instructions at the top of `scripts/brand/make-fonts.py` (needs Python
  in a throwaway virtualenv), then run `npm run brand`.
