# Pi Extension Development Notes

## Keyboard Shortcuts

### Alt+symbol shortcuts don't work in legacy terminal mode

The pi key parser only supports `alt+letter` (a-z) in legacy mode. `alt+symbol` (e.g., `alt+.`, `alt+,`, `alt+[`, `alt+]`) requires the Kitty keyboard protocol (CSI u sequences) to be active, which isn't always reliable.

**Rule:** Always use `alt+letter` combos for extension shortcuts, not `alt+symbol`.

```typescript
import { Key } from "@mariozechner/pi-tui";

// ✅ Works reliably
pi.registerShortcut(Key.alt("n"), { ... });

// ❌ Only works with Kitty protocol active
pi.registerShortcut(Key.alt("."), { ... });
pi.registerShortcut("alt+.", { ... });
```

### `alt+[` and `alt+]` are unusable

`ESC+[` is the CSI prefix and `ESC+]` is the OSC prefix — these are used by all terminal escape sequences. Never bind to these.

### Use `Key` helpers from `@mariozechner/pi-tui`

The examples all use `Key.alt("x")`, `Key.ctrl("x")`, `Key.ctrlShift("x")`, etc. Use these instead of raw strings for consistency.

### Free alt+letter bindings (not used by pi defaults)

`alt+a`, `alt+c`, `alt+e`, `alt+g`, `alt+h`, `alt+i`, `alt+j`, `alt+k`, `alt+l`, `alt+m`, `alt+n`, `alt+o`, `alt+p`, `alt+q`, `alt+r`, `alt+s`, `alt+t`, `alt+u`, `alt+v`, `alt+w`, `alt+x`, `alt+z`

Already taken: `alt+b` (cursorWordLeft), `alt+d` (deleteWordForward), `alt+f` (cursorWordRight), `alt+y` (yankPop), `alt+enter` (followUp), `alt+up` (dequeue), `alt+backspace` (deleteWordBackward)
