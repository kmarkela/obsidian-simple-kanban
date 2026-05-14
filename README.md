# Simple Kanban

A minimal Kanban board plugin for [Obsidian](https://obsidian.md). Provides a global board stored in `kanban.md` and turns any note with `kanban: true` frontmatter into a board view.

## Features

- **Global board** — single `kanban.md` at the vault root with four default columns: Plan, Todo, In Progress, Done.
- **Per-note boards** — any markdown note with `kanban: true` in its frontmatter renders as a board; columns come from `##` headings, cards from `-` list items.
- **Wikilink cards** — cards containing `[[Note Name]]` or `[[Note Name|Alias]]` are clickable. Inline links (`Do [[task]] today`) are also supported.
- **Drag and drop** between columns.
- **Double-click to edit**, `×` to delete, `+ Add card` with `[[` autocomplete against vault notes.
- **Color coding by path pattern** — cards whose linked note path matches a pattern get a custom background/text color. Defaults match `0p0`, `0p1`, `0p2`, `0p3` — edit `COLOR_RULES` in `main.js` to customize.

## Installation

1. Locate your vault's plugin folder: `<YourVault>/.obsidian/plugins/`
2. Create a folder named `simple-kanban` inside it.
3. Copy `main.js` and `manifest.json` into that folder.
4. In Obsidian: Settings → Community plugins → disable Restricted mode if on → click *Reload plugins* (or restart Obsidian) → toggle **Simple Kanban** on.

For live development, symlink the repo instead of copying:

```sh
ln -s /absolute/path/to/simple-kanban "<YourVault>/.obsidian/plugins/simple-kanban"
```

## Usage

### Global board

- Ribbon icon (dashboard) or command palette → **Open Kanban Board**.
- Creates `kanban.md` at the vault root on first open.

### Per-note board

Add frontmatter to any markdown note:

```markdown
---
kanban: true
---

## Backlog

- [[Some Note]]
- Plain text card

## Doing

- [[Other Note|Friendly Label]]

## Done
```

Opening the note renders it as a board. Columns match the `##` headings in the file. Or run the command **Open current note as Kanban board** to force the view on the active file.

### Card syntax

| Form | Example | Behavior |
|---|---|---|
| Plain text | `fix the bug` | Non-linked card |
| Full wikilink | `[[My Note]]` | Card label is the note name, opens note |
| Aliased link | `[[My Note\|Title]]` | Card label is `Title`, opens `My Note` |
| Inline link | `Review [[My Note]] today` | Full text shown, link portion clickable |

Click `↗` to open the linked note in a new tab.

## Customizing colors

Edit `COLOR_RULES` near the top of `main.js`:

```js
const COLOR_RULES = [
  { pattern: '0p0', bg: '#e3b719', text: 'black' },
  { pattern: '0p1', bg: '#c8e319', text: 'black' },
];
```

A rule matches if `pattern` is a substring of the linked file's full path, or of the raw card text. First match wins. Reload the plugin after editing.

## Files

- `main.js` — plugin source (single file, no build step).
- `manifest.json` — plugin manifest required by Obsidian.
