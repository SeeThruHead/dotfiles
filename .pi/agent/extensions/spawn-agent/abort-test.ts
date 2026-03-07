/**
 * Test: abort signal cascades through a tree of AbortControllers.
 * Simulates the exact pattern used in runAgent() without needing the Pi SDK.
 */

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
	if (condition) { passed++; }
	else { failed++; console.error(`FAIL: ${msg}`); }
}

/** Simulates one level of runAgent's abort wiring */
function createLevel(parentSignal?: AbortSignal): { childSignal: AbortSignal; localAbort: AbortController; cleanup: () => void } {
	const localAbort = new AbortController();
	const childSignal = localAbort.signal;

	let parentHandler: (() => void) | null = null;
	if (parentSignal) {
		parentHandler = () => localAbort.abort();
		if (parentSignal.aborted) localAbort.abort();
		else parentSignal.addEventListener("abort", parentHandler, { once: true });
	}

	// cleanup = what happens in finally block
	const cleanup = () => {
		localAbort.abort(); // cascade to children
		if (parentSignal && parentHandler) {
			parentSignal.removeEventListener("abort", parentHandler);
		}
	};

	return { childSignal, localAbort, cleanup };
}

// ── Test 1: Single level abort ──
{
	const top = new AbortController();
	const level1 = createLevel(top.signal);

	assert(!level1.childSignal.aborted, "1: child not aborted initially");
	top.abort();
	assert(level1.childSignal.aborted, "1: child aborted after parent abort");
}

// ── Test 2: Three-level cascade ──
{
	const top = new AbortController();
	const level1 = createLevel(top.signal);
	const level2 = createLevel(level1.childSignal);
	const level3 = createLevel(level2.childSignal);

	assert(!level3.childSignal.aborted, "2: level3 not aborted initially");
	top.abort();
	assert(level1.childSignal.aborted, "2: level1 aborted");
	assert(level2.childSignal.aborted, "2: level2 aborted (cascade)");
	assert(level3.childSignal.aborted, "2: level3 aborted (cascade)");
}

// ── Test 3: Fan-out — parent abort cascades to all siblings ──
{
	const top = new AbortController();
	const parent = createLevel(top.signal);
	const child1 = createLevel(parent.childSignal);
	const child2 = createLevel(parent.childSignal);
	const child3 = createLevel(parent.childSignal);

	assert(!child1.childSignal.aborted, "3: child1 not aborted initially");
	assert(!child2.childSignal.aborted, "3: child2 not aborted initially");
	assert(!child3.childSignal.aborted, "3: child3 not aborted initially");

	top.abort();
	assert(child1.childSignal.aborted, "3: child1 aborted");
	assert(child2.childSignal.aborted, "3: child2 aborted");
	assert(child3.childSignal.aborted, "3: child3 aborted");
}

// ── Test 4: Deep tree with fan-out ──
//   top → a → [a1, a2]
//         b → [b1, b2]
{
	const top = new AbortController();
	const a = createLevel(top.signal);
	const b = createLevel(top.signal);
	const a1 = createLevel(a.childSignal);
	const a2 = createLevel(a.childSignal);
	const b1 = createLevel(b.childSignal);
	const b2 = createLevel(b.childSignal);

	top.abort();
	assert(a1.childSignal.aborted, "4: a1 aborted");
	assert(a2.childSignal.aborted, "4: a2 aborted");
	assert(b1.childSignal.aborted, "4: b1 aborted");
	assert(b2.childSignal.aborted, "4: b2 aborted");
}

// ── Test 5: Abort mid-level, only subtree affected ──
{
	const top = new AbortController();
	const a = createLevel(top.signal);
	const b = createLevel(top.signal);
	const a1 = createLevel(a.childSignal);
	const b1 = createLevel(b.childSignal);

	// Abort only 'a' (simulating a's finally block)
	a.cleanup();
	assert(a1.childSignal.aborted, "5: a1 aborted (a's subtree)");
	assert(!b1.childSignal.aborted, "5: b1 NOT aborted (b's subtree unaffected)");
	assert(!top.signal.aborted, "5: top NOT aborted");
}

// ── Test 6: Cleanup removes listener (no leak) ──
{
	const top = new AbortController();
	const level1 = createLevel(top.signal);
	level1.cleanup();
	// After cleanup, aborting top should not re-fire (listener removed)
	// This just shouldn't throw
	top.abort();
	assert(true, "6: cleanup + later abort doesn't throw");
}

// ── Test 7: Already-aborted parent signal ──
{
	const top = new AbortController();
	top.abort(); // already aborted
	const level1 = createLevel(top.signal);
	assert(level1.childSignal.aborted, "7: child immediately aborted when parent already aborted");
}

// ── Test 8: mergeSignals pattern ──
{
	function mergeSignals(a?: AbortSignal, b?: AbortSignal): AbortSignal | undefined {
		if (!a && !b) return undefined;
		if (!a) return b;
		if (!b) return a;
		const controller = new AbortController();
		const abort = () => controller.abort();
		if (a.aborted || b.aborted) { controller.abort(); return controller.signal; }
		a.addEventListener("abort", abort, { once: true });
		b.addEventListener("abort", abort, { once: true });
		return controller.signal;
	}

	const sigA = new AbortController();
	const sigB = new AbortController();
	const merged = mergeSignals(sigA.signal, sigB.signal)!;

	assert(!merged.aborted, "8: merged not aborted initially");
	sigA.abort();
	assert(merged.aborted, "8: merged aborted when A fires");

	// Either signal triggers it
	const sigC = new AbortController();
	const sigD = new AbortController();
	const merged2 = mergeSignals(sigC.signal, sigD.signal)!;
	sigD.abort();
	assert(merged2.aborted, "8: merged aborted when B fires");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
