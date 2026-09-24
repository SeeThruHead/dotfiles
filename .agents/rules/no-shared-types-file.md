# Share by component, never by a shared types file

Shane's rule: code is shared BY COMPONENT, not by types. A type is either
(a) a component's internal implementation detail, or (b) its public
interface (its props). There is no third category, so there is no "shared
types.ts" / neutral type module that several components import from.

Never suggest extracting a repeated shape (e.g. a row literal) into a
standalone shared interface to dedupe it. If a shape genuinely needs to be
shared, that means ONE component owns it as its public interface, and other
components consume THAT COMPONENT (or its exported props type) — the type
flows through the owning component's boundary via composition. Inline
duplication is acceptable; a type-only sharing module is not.

(Generated/codegen types are fine as an upstream source; the point is the
anti-pattern of hand-authoring a neutral types file to share between
sibling components.)

Corollary: components define their OWN props. Do NOT bind a component to a
generated type (don't make its props = CaseInvestigation, don't import the
gql type into the component). Pass generated data in indirectly: if the
gql type is structurally assignable to the component's prop shape it flows
through and TS is happy; if not, adapt/map at the call site. The
component's contract stays its own; never couple it to the data type.

Came up repeatedly on the IA-408 investigations PR. I kept proposing a
shared types.ts; stop.

Naming: never suffix a DOMAIN/feature component with "View"
(InvestigationsTableView etc.). He hates it. Use Panel/Layout/etc. or
just the noun. (Nuance: generic ui-kit LAYOUT primitives may use "View"
when natural, e.g. SplitView is fine/approved. See fe-pr-review.md.)

Do NOT pass a big bundled "state" object as a single prop to dedupe a
shared component, and do NOT pass ~12 individual props either. He rejects
both. If a shared presentational piece is warranted, feed it by
COMPOSITION (children + a couple small props), not a state bag. And don't
pre-extract a "shared" component when there's only one consumer; inline it
and extract later (via composition) once a second consumer actually exists.
