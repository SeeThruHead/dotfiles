# gh-dash (aliased as `dash`)

GitHub dashboard TUI reference. Use when the user asks about gh-dash, dash, GitHub dashboard keybindings, or PR/issue management shortcuts.

Alias: `dash`

## Global

| Key | Action |
|-----|--------|
| `?` | Toggle help |
| `/` | Search/filter current section |
| `s` | Switch view (PRs ↔ Issues) |
| `r` | Refresh section |
| `R` | Refresh all |
| `q` | Quit |

## Navigation

| Key | Action |
|-----|--------|
| `j/k` `↑/↓` | Up / down |
| `h/l` `←/→` | Prev / next section |
| `g` / `G` | First / last item |

## Any Selected Item

| Key | Action |
|-----|--------|
| `o` | Open in browser |
| `y` | Copy number |
| `Y` | Copy URL |
| `p` | Toggle preview pane |

## Preview Pane

| Key | Action |
|-----|--------|
| `Ctrl+d` | Page down |
| `Ctrl+u` | Page up |
| `[` / `]` | Next / prev tab |

## Selected PR

| Key | Action |
|-----|--------|
| `a` / `A` | Assign / unassign |
| `c` | Comment |
| `C` | Checkout locally |
| `d` | View diff |
| `e` | Expand description |
| `m` | Merge |
| `u` | Update branch |
| `v` | Approve |
| `w` | Watch checks |
| `W` | **Mark ready for review** |
| `x` / `X` | Close / reopen |

## Selected Issue

| Key | Action |
|-----|--------|
| `a` / `A` | Assign / unassign |
| `c` | Comment |
| `x` / `X` | Close / reopen |

## Selected Notification

| Key | Action |
|-----|--------|
| `D` | Mark done |
| `Alt+d` | Mark all done |
| `m` / `M` | Mark read / mark all read |
| `u` | Unsubscribe |
| `b` | Toggle bookmark |
| `t` | Smart filter (current repo) |
| `S` | Sort by repo |
| `Enter` | View (fetches content, marks read) |

PR/Issue keybindings also work in notification preview.

## Text Inputs

- `Ctrl+d` — submit
- `Ctrl+c` / `Esc` — cancel
