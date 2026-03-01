// Lightweight Result type — tagged union, no exceptions, composable, dependency-free.

export interface Ok<T> {
	readonly _tag: "Ok";
	readonly value: T;
}

export interface Err<E> {
	readonly _tag: "Err";
	readonly error: E;
}

export type Result<T, E = string> = Ok<T> | Err<E>;

// ── Constructors ──

export const Ok = <T>(value: T): Ok<T> => ({ _tag: "Ok", value });
export const Err = <E>(error: E): Err<E> => ({ _tag: "Err", error });

// ── Guards ──

export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> => result._tag === "Ok";
export const isErr = <T, E>(result: Result<T, E>): result is Err<E> => result._tag === "Err";

// ── Combinators ──

export const match = <T, E, A, B>(
	result: Result<T, E>,
	cases: { Ok: (value: T) => A; Err: (error: E) => B }
): A | B => (result._tag === "Ok" ? cases.Ok(result.value) : cases.Err(result.error));

export const map = <T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> =>
	match(result, { Ok: (v) => Ok(fn(v)), Err: (e) => Err(e) });

export const flatMap = <T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> =>
	match(result, { Ok: fn, Err: (e) => Err(e) });

export const mapErr = <T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> =>
	match(result, { Ok: (v) => Ok(v), Err: (e) => Err(fn(e)) });

export const unwrapOr = <T, E>(result: Result<T, E>, fallback: T): T =>
	match(result, { Ok: (v) => v, Err: () => fallback });

// ── Lifting ──

export const fromTry = <T>(fn: () => T, label?: string): Result<T, string> => {
	try {
		return Ok(fn());
	} catch (e: any) {
		return Err(label ? `${label}: ${e.message}` : e.message);
	}
};

export const fromPromise = async <T>(p: Promise<T>, label?: string): Promise<Result<T, string>> => {
	try {
		return Ok(await p);
	} catch (e: any) {
		return Err(label ? `${label}: ${e.message}` : e.message);
	}
};
