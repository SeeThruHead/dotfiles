---
name: debounce-input-fields
description: "Always debounce input fields that drive side effects (search queries, auto-save, network calls)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: cd54558c-da02-4627-9dc6-9bd0e4a60253
---

When wiring an input field whose value drives a side effect (a GQL/RPC query, auto-save, any network call), debounce it — don't fire on every keystroke.

**Why:** per-keystroke requests hammer the backend (e.g. the investigations trader search was firing a Crystal GQL `users` query on every character) and cause excess re-renders. The user explicitly flagged this.

**How to apply:** debounce ~300ms for search inputs, ~600ms for auto-save. A small `useState` + `useEffect`/`setTimeout` debounced value before passing to the query hook is enough (or `useDebounce` from `@uidotdev/usehooks`, already a dep in `apps/admin`). Auto-save effects should also compare against the loaded value so they don't fire on initial populate. See [[investigations-effect-rpc-slice]].
