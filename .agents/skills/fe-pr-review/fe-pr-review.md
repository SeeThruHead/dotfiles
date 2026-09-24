# Front-end criteria (canonical)

Single source of truth for front-end standards. Loaded by the `fe-pr-review`
skill (review time) and symlinked as `~/.claude/_rules/fe-pr-review.md`
(write time), so the two never drift. Self-contained; no external refs.

## Architecture

- **Pure components.** Props in, UI out. This is what lets them render
  honestly in Storybook. A component that owns real data/effects isn't pure.
- **State hidden in hooks.** Don't sprinkle `useState` through components.
  Push state/logic into custom hooks. Exception: a SINGLE `useState` inline is
  fine; multiple = extract a hook.
- **Prefer hook helpers** (`useToggle`, `useDebounce`, etc.) over raw
  `useState`/`useEffect` boilerplate. Missing helper = add it, don't reinvent.
- **Triad: pure component + custom hook + container.** The container is the
  ONLY glue between hook and component. Containers do NOT go in Storybook;
  they render in the real app. Stories wire fake state into the pure
  component.
- **Forms as a single controlled form with `onChange`.** Define even
  multi-part / multi-step forms as one form shape (value + `onChange`), not a
  pile of per-field `useState`.

## State & effects

- **Don't duplicate external state internally.** Copying props / caller state
  into local `useState` is a code smell. Pass the value as a parameter at the
  moment it's needed (e.g. pass the selected rows into the open handler) rather
  than mirroring it in the hook. Mirrored state has to be kept in sync, which is
  where bugs live.
- **Derive, don't store.** If a boolean is a function of state you already have,
  compute it (`isOpen = openAction != null`), don't carry a separate flag. A
  redundant flag is another thing to keep in sync.
- **Tie side effects to user actions, not to other state changes.** Avoid
  imperative chains ("on open, set X"; effect that fires a mutation because some
  other state flipped). Each mutation/reset should hang off the direct action
  that caused it. `useEffect` that reacts to internal state to trigger another
  state change is the smell.
- **Reset transient state at the right edge.** Clear error/submitting state on
  CLOSE (or via a reset on the data layer), not on open. Resetting on open is an
  imperative-chain workaround for state that outlived its owner.
- **Collapse always-together state into one object.** Values that are always
  set and cleared as a unit (e.g. `openAction` + the selected rows) should be a
  single object, not parallel `useState` that can drift apart.
- **Mutation / action state belongs in the data-access hook.** Submitting,
  error, and the `onConfirm`/mutation itself come from the data hook. Don't
  re-declare them inside a UI/modal hook; the modal hook wires and presents,
  it doesn't own the mutation.
- **Prefer closures / partial application over threading IDs through props.**
  Bind the id at the call site (a handler closed over the row) instead of
  passing an id down and re-looking-it-up. Partial application over prop-drilling.

## ui-kit

- **ui-kit first.** The design is built from ui-kit (the Figma IS the design
  system), so the implementation should be ~100% ui-kit.
- **Never a raw `<button>`.** Use `Button` / `ButtonUtility` / `CloseButton`.
- **Don't hand-roll ui-kit primitives:** cards (`Card`), alerts/banners
  (`AlertFullWidth`/`AlertFloating`), tables/rows (`Table`/`TableCard`), chips
  (`Tags`/`Badge`), spinner (`Spinner`), file upload (`FileUploadTrigger`),
  inputs (`Input`/`Select`/`TextArea`/`Form`).
- `div`/`span`/`header`/`footer`/`section` are ONLY thin layout wrappers. Lots
  of bare structural elements in one component = it's rebuilding a primitive.
  Benchmark against already-merged sibling components, not against the messy
  area.
- **"Not in ui-kit yet" is a claim to VERIFY**, not accept. Check
  `packages/ui-kit/src/components/base/index.ts` and `.../application/index.ts`.
- **Spot missing REUSABLE primitives and push them INTO ui-kit.** Hand-rolled
  structure (a card shell with header/body/footer + dividers; a side-by-side
  split with a separator) is an obvious ui-kit component (composed `Card`,
  `SplitView`). Propose the primitive, make the feature component collapse to
  slot-filling, and backport already-merged hand-rolls onto it.
- **Fix component-library gaps IN ui-kit, not per-consumer.** If a shared
  component lacks a capability (e.g. ComboBox missing `isLoading`, an empty
  slot, declarative open), add it there. Don't hang sentinel rows, imperative
  `useImperativeHandle`, or state-bridge refs off every consumer. Prefer
  DECLARATIVE / DERIVED state over imperative refs AND over controlled props
  (open = f(query, results), not an `isOpen` prop or a ref handle).
- **Check whether the component already does the behavior before hand-rolling
  it.** ui-kit components wrap a lib (react-aria); behaviors like selection,
  sorting, expansion are often already exposed as props on the component. A
  behavior re-implemented in a raw element next to the component (a bespoke
  checkbox, a manual toggle) is a per-consumer-workaround smell, verify the
  native path first. Hand-rolled workarounds also tend to break the styling /
  alignment the native path gives you for free, so the reimplementation looks
  subtly off on top of being redundant.

## Code

- **Data:** gql-rq / react-query `useQuery` with a debounced query key over
  hand-rolled `useMemo(debounce)` + try/catch/finally + manual loading flags.
  NEVER swallow errors in an empty `catch` (a failed fetch must be
  distinguishable from "no results").
- **No shared `types.ts`.** Types are a component's internal detail or its
  public props. Share BY COMPONENT (compose and consume the owning
  component/its props type), never a neutral type module several siblings
  import. Derive backend-shaped fields from generated types; hand-author only
  UI-only fields, on the owning component.
- **Inline props types** in the component signature
  (`({ a, b }: { a: string; b: () => void }) => ...`). Don't declare a
  separate named `FooProps` just to annotate one component. Name/export a
  props type ONLY when another component must consume it.
- **No optional prop** that every real caller passes (tests/stories omitting
  it doesn't count). Callback names match the affordance (`onRemove` for an X,
  not `onClick`).
- **Honest UI states:** don't enable a no-op action; a submit's enabled state
  must mean it will actually submit.
- **Functional:** no for/while loops (map/filter/find/some/reduce); no
  mutation (const only, no reassignment, no push/splice/in-place).
- **Composition over duplication.** N near-identical components that differ
  only in a header and a form body are ONE component with a discriminant prop
  (e.g. `openAction`) that branches the content, plus a slot/child for the
  variable part. Copy-pasted siblings are the smell; unify them, don't reach
  for inheritance. Composition over inheritance.
- **No redundant guard clauses.** Don't re-check a precondition the caller
  already enforces (guarding on `traders.length === 0` when the trigger button
  is already disabled). The concern belongs to whoever owns the trigger, not
  the downstream component; a dead guard just hides where the invariant lives.
- **Naming:** no `View` suffix on DOMAIN/feature components
  (`InvestigationsTableView`); use Panel/Layout/the noun. Generic ui-kit
  LAYOUT primitives may use `View` when natural (`SplitView` is fine).

## Review mechanics

- No severity prefixes (`blocking:`/`nit:`) unless explicitly asked.
- Post as ONE review, inline comments, submitted as "Comment" (not
  Approve/Request-changes) unless told. ALWAYS walk through the comments with
  Shane and get his explicit approval before posting; never post unreviewed,
  even on internal repos.
- **Shane strongly prefers array methods over loops (a strong preference, not a
  hard rule).** Default to map/filter/reduce/find/some; a `for`/`while` loop is
  fine only when clearly superior to the method version (a real perf need, or a
  much cleaner early-exit), and the burden is on the loop to earn that. When the
  rewrite is merely equivalent, prefer the method and raise it as worth doing in
  THIS PR, not "a follow-up if the team prefers." Same for in-place mutation.
  Pitch it as the strong preference it is: don't undersell it as "style-only, no
  behavior change" (equivalent is exactly why the method wins), and don't
  oversell it as required/blocking.
- **When the author likely hit a real constraint** (a hand-rolled workaround
  usually means the clean path fought them), phrase the comment as a question
  about that ("was this to get around X?"), name the fix you believe works, and
  offer to be wrong. Don't assume they didn't try the obvious thing.
