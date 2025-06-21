import { b_s64, s64_b } from "@nyoon/base";
import { Row } from "jsr:@nyoon/csv@^1.0.9";
import { Word } from "jsr:@nyoon/schema@^1.0.0";

/** Valid [JSON](https://www.json.org/) values, excluding `boolean`s. */
export type Json = null | number | string | Json[] | { [_: string]: Json };
/** Wraps an error or errors in a `symbol`. */
export const wrap = ($: Json): symbol => Symbol.for(JSON.stringify($));
/** Unwraps the error or error held in a `symbol`. */
export const open = <A extends Json>($: symbol): A =>
  JSON.parse(Symbol.keyFor($) ?? "null");
/** Type for parsing and stringifying variable-length data. */
export class Type<A = {}, B = any> {
  private nil: B | symbol = wrap("valueMissing");
  /** Makes a `Type` optional. */
  maybe(): Type<A, B | null> {
    return this.nil = null as B, this as Type<A, B | null>;
  }
  /** Makes a `Type` required. */
  really(): Type<A, NonNullable<B>> {
    return this.nil = wrap("valueMissing"), this as Type<A, NonNullable<B>>;
  }
  /** Creates a type for parsing and stringifying CSV data. */
  constructor(
    public kind: A,
    private parse: ($: string, row: Row) => NonNullable<B> | symbol,
    private stringify: ($: NonNullable<B>, row: Row) => string,
  ) {}
  private hooks: {
    decode_0?: ($: Row) => any;
    decode_1?: ($: B) => B | symbol;
    encode_0?: ($: B) => B;
    encode_1?: ($: Row) => void;
  } = {};
  /** Hooks into one of the steps. */
  on<A extends keyof typeof this.hooks>(
    onto: A,
    hook: NonNullable<typeof this.hooks[A]>,
  ): this {
    const a = this.hooks[onto];
    this.hooks[onto] = ($: any) => {
      const b = a?.($);
      return (typeof b === "symbol" ? b : hook(b ?? $));
    };
    return this;
  }
  /** Converts a CSV row to the specified type or a `symbol` (error). */
  decode($: Row): B | symbol {
    const a = this.hooks.decode_0?.($);
    if (typeof a === "symbol") return a;
    const b = $.shift();
    if (b == null) return this.nil;
    const c = this.parse(b, $);
    if (typeof c === "symbol") return c;
    return this.hooks.decode_1?.(c) ?? c;
  }
  /** Converts the specified type to a CSV row (or portion thereof). */
  encode($: B): Row {
    const a: Row = [];
    $ = this.hooks.encode_0?.($) ?? $;
    if ($ == null) a.push(null);
    else a.unshift(this.stringify($, a));
    return this.hooks.encode_1?.(a), a;
  }
}
type All<A> = A extends number | string | Date ? A : { [B in keyof A]: A[B] };
/** Parsed data. */
export type As<A> = A extends Type<any, infer B> ? All<B> : never;
/** Canonicalizes, replaces lone surrogates, and standardizes whitespace. */
export const fix = ($: string): string =>
  $.normalize("NFC").replace(/\p{Cs}/gu, "\ufffd")
    .replace(/\r\n|\p{Zl}|\p{Zp}/gu, "\n").replace(/\p{Zs}/gu, " ");
class Flag<A extends Word> {
  /** Creates a getter for the set bits. */
  constructor(public bits: number) {}
  /** Checks if a bit is set. */
  has($: A): 0 | 1 {
    return (this.bits >>> $ & 1) as 0 | 1;
  }
}
/** Creates an option type. */
export const opt = ((kind: [string, ...string[]] | [Word, ...Word[]]) => {
  if (typeof kind[0] === "string") {
    const a = Set.prototype.has.bind(new Set(kind));
    return new Type(kind, ($) => a($ = fix($)) ? $ : wrap("badInput"), fix);
  }
  let a = 0;
  for (let z = 0; z < kind.length; ++z) a |= 1 << kind[z];
  return new Type(kind, ($) => {
    const b = parseInt($, 16);
    if (Number.isNaN(b) || $ !== b.toString(16)) return wrap("badInput");
    if (b !== (b & a)) return wrap("typeMismatch");
    return new Flag(b);
  }, ($) => $.bits.toString(16));
}) as {
  <A extends [string, ...string[]]>(kind: A): Type<A, A[number]>;
  <A extends [Word, ...Word[]]>(kind: A): Type<A, Flag<A[number]>>;
};
/** Symbol for a key's type (public/secret). */
export const KEY_HALF = Symbol("KEY_HALF");
/** Symbol for a key's underlying bytes. */
export const KEY_DATA = Symbol("KEY_DATA");
/** Key as a base64url string with some extra properties. */
export type Key<A extends "pkey" | "skey"> = string & {
  [KEY_HALF]: A;
  [KEY_DATA]: Uint8Array;
};
/** Creates a new `Key` from binary data. */
export const make = <A extends "pkey" | "skey">(as: A, $: Uint8Array): Key<A> =>
  Object.assign(b_s64($), { [KEY_HALF]: as, [KEY_DATA]: $ });
/** Creates a key type. */
export const key = <A extends "pkey" | "skey">(kind: A): Type<A, Key<A>> =>
  new Type(
    kind,
    ($) => /^[-\w]{43}$/.test($) ? make(kind, s64_b($)) : wrap("badInput"),
    ($) => /^[-\w]{43}$/.exec($)?.[0] ?? "A".repeat(43),
  );
/** Numeric or length ranges. */
export const RANGE = {
  uint: [0, 0xffffffff],
  real: [-1.7976931348623157e+308, 1.7976931348623157e+308],
  time: [0, 86399999],
  date: [0, 281474976710655],
  char: [0, 0xff],
  text: [0, 0xffff],
  vec: [0, 0xfff],
  map: [0, 0xfff],
} as const;
type Meta<A = {}> = All<Partial<{ min: number; max: number } & A>>;
const range = (kind: keyof typeof RANGE, meta?: Meta) => {
  const [a, b] = RANGE[kind];
  const c = Math.max(meta?.min ?? a, a), d = Math.min(meta?.max ?? b, b);
  return [Math.max(a, Math.min(c, d)), Math.min(b, Math.max(c, d))] as const;
};
/** Creates an ISO datetime type. */
export const iso = <const A extends "time" | "date">(
  kind: A,
  meta?: Meta,
): Type<A, Date> => {
  const [a, b] = range(kind, meta), c = kind === "time" ? "1970-01-01T" : "";
  return new Type(kind, ($) => {
    const d = new Date(`${c}${$}Z`), e = +d;
    if (Number.isNaN(e)) return wrap("badInput");
    if (e < a) return wrap("rangeUnderflow");
    if (e > b) return wrap("rangeOverflow");
    return d;
  }, ($) => $.toISOString().slice(0, -1).replace(c, ""));
};
/** Creates a number type. */
export const num = <const A extends "uint" | "real">(
  kind: A,
  meta?: Meta<{ step: number }>,
): Type<A, number> => {
  const [a, b] = range(kind, meta), c = meta?.step ?? 0;
  return new Type(kind, ($) => {
    const d = +$;
    if (Number.isNaN($) || !$.trim()) return wrap("badInput");
    if (d < a) return wrap("rangeUnderflow");
    if (d > b) return wrap("rangeOverflow");
    if (d % c) return wrap("stepMismatch");
    return d;
  }, String);
};
/** Creates a string type. */
export const str = <const A extends "char" | "text">(
  kind: A,
  meta?: Meta<{ pattern: RegExp }>,
): Type<A, string> => {
  const [a, b] = range(kind, meta), c = meta?.pattern?.test.bind(meta.pattern);
  return new Type(kind, ($) => {
    $ = fix($);
    if ($.length < a) return wrap("tooShort");
    if ($.length > b) return wrap("tooLong");
    if (c?.($) === false) return wrap("patternMismatch");
    return $;
  }, fix);
};
const length = ([min, max]: readonly [number, number]) => ($: string) => {
  if (!$.trim()) return wrap("badInput");
  const a = parseInt($, 36);
  if ($ !== a.toString(36) || a < 0) return wrap("badInput");
  if (a < min) return wrap("tooShort");
  if (a > max) return wrap("tooLong");
  return a;
};
const result =
  (meta?: { unique?: boolean }) =>
  <A extends {}>(size: number, ok: A, no: Json[]) => {
    if (no.length) {
      for (let z = 0; z < size; ++z) no[z] ??= null;
      return wrap(no);
    }
    if (meta?.unique) {
      const a = Object.values(ok), b = new Set<string>();
      for (let z = 0; z < size; ++z) {
        if (b.size === b.add(JSON.stringify(a[z])).size) {
          return wrap("typeMismatch");
        }
      }
    }
    return ok;
  };
/** Creates a vector type. */
export const vec = <const A extends Type>(
  kind: A,
  meta?: Meta<{ unique: boolean }>,
): Type<A, As<A>[]> => {
  const a = length(range("vec", meta)), b = result(meta);
  return new Type(kind, ($, row) => {
    const c = a($);
    if (typeof c === "symbol") return c;
    const d = Array<As<A>>(c), e: Json[] = [];
    for (let z = 0; z < c; ++z) {
      if (typeof (d[z] = kind.decode(row)) === "symbol") e[z] = open(d[z]);
    }
    return b(c, d, e);
  }, ($, row) => {
    for (let z = 0; z < $.length; ++z) row.push.apply(row, kind.encode($[z]));
    return $.length.toString(36);
  });
};
/** Creates a map type. */
export const map = <
  const A extends Type,
  const B extends string | Key<"pkey" | "skey"> = string,
>(
  kind: A,
  meta?: Meta<{ unique: boolean; keys: Type<any, B> }>,
): Type<A, { [key: string]: As<A> }> => {
  const a = length(range("vec", meta)), b = meta?.keys ?? str("char");
  const c = result(meta);
  return new Type(kind, ($, row) => {
    const d = a($);
    if (typeof d === "symbol") return d;
    const e: { [_: string]: As<A> } = {}, f: Json[] = [];
    for (let z = 0; z < d; ++z) {
      const g = b.decode(row);
      if (typeof g === "symbol") f[z] = open(g);
      else if (g in e) f[z] = "typeMismatch";
      else if (typeof (e[g] = kind.decode(row)) === "symbol") {
        f[z] = [g, open(e[g])];
      }
    }
    return c(d, e, f);
  }, ($, row) => {
    const c = Object.keys($);
    for (let z = 0; z < c.length; ++z) {
      row.push.apply(row, b.encode(c[z] as B));
      row.push.apply(row, kind.encode($[c[z]]));
    }
    return c.length.toString(36);
  });
};
/** Creates an object type. */
export const obj = <const A extends { [_: string]: Type }>(
  kind: A,
): Type<A, { [B in keyof A]: As<A[B]> }> => {
  const a = Object.keys(kind), b = length([a.length, a.length]);
  return new Type(kind, ($, row) => {
    const c = b($);
    if (typeof c === "symbol") return c;
    const d = {} as { [B in keyof A]: As<A[B]> }, e: { [_: string]: Json } = {};
    for (let z = 0; z < a.length; ++z) {
      if (typeof (d[a[z] as keyof A] = kind[a[z]].decode(row)) === "symbol") {
        e[a[z]] = open(d[a[z]]);
      }
    }
    if (Object.keys(e).length) return wrap(e);
    return d;
  }, ($, row) => {
    for (let z = 0; z < a.length; ++z) {
      row.push.apply(row, kind[a[z]].encode($[a[z]]));
    }
    return a.length.toString(36);
  });
};
