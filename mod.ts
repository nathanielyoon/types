import { Row } from "jsr:@nyoon/csv@^1.0.9";

/** Valid [JSON](https://www.json.org/) values, excluding `boolean`s. */
export type Json = null | number | string | Json[] | { [key: string]: Json };
/** Wraps an error or errors in a `symbol`. */
export const flag = ($: Json): symbol => Symbol.for(JSON.stringify($));
/** Unwraps the error or error held in a `symbol`. */
export const open = <A extends Json>($: symbol): A =>
  JSON.parse(Symbol.keyFor($) ?? "null");
class Type<A = any, B = {}> {
  private nil: A | symbol = flag("valueMissing");
  maybe(): Type<A | null, B> {
    this.nil = null as A;
    return this as Type<A | null, B>;
  }
  constructor(
    public meta: B,
    private decode: ($: string, row: Row) => A | symbol,
    private encode: ($: NonNullable<A>, row: Row) => string,
  ) {}
  parse($: Row): A | symbol {
    const a = $.shift();
    return a == null ? this.nil : this.decode(a, $);
  }
  stringify($: A): Row {
    const a: Row = [];
    return $ == null ? a.push(null) : a.unshift(this.encode($, a)), a;
  }
}
/** Parsed data. */
export type As<A> = A extends Type<infer B> ? B : never;
/** Canonicalizes, replaces lone surrogates, and standardizes whitespace. */
export const normalize = ($: string): string =>
  $.normalize("NFC").replace(/\p{Cs}/gu, "\ufffd")
    .replace(/\r\n|\p{Zl}|\p{Zp}/gu, "\n").replace(/\p{Zs}/gu, " ");
/** Creates an option type. */
export const opt = <const A extends [string, ...string[]]>(
  options: A,
): Type<A[number], A> => {
  const a = Set.prototype.has.bind(new Set(options));
  return new Type(
    options,
    ($) => a($ = normalize($)) ? $ : flag("badInput"),
    normalize,
  );
};
/** Numeric or length ranges. */
export const RANGE = {
  uint: [0, 0xffffffff],
  time: [0, 281474976710655],
  real: [-1.7976931348623157e+308, 1.7976931348623157e+308],
  char: [0, 0xff],
  text: [0, 0xffff],
} as const;
/** Normalizes a range. */
export const clamp = (
  [min, max]: readonly [number, number],
  $?: { min?: number; max?: number },
): [number, number] => {
  const a = Math.max($?.min ?? min, min), b = Math.min($?.max ?? max, max);
  return [Math.max(Math.min(a, b), min), Math.min(Math.max(a, b), max)];
};
/** Creates a number type. */
export const num = <A extends "uint" | "time" | "real">(
  kind: A,
  meta?: { min?: number; max?: number; step?: number },
): Type<number, A> => {
  const [a, b] = kind === "real" ? [10, ""] : [16, "0x"];
  const c = kind === "time" ? 12 : 0, [d, e] = clamp(RANGE[kind], meta);
  const f = meta?.step || 0;
  return new Type(kind, ($) => {
    if (!$.trim()) return flag("badInput");
    const h = +(b + $);
    if (Number.isNaN(h)) return flag("badInput");
    if (h < d) return flag("rangeUnderflow");
    if (h > e) return flag("rangeOverflow");
    if (h % f) return flag("stepMismatch");
    return h;
  }, ($) => $.toString(a).padStart(c, "0"));
};
const PKEY = /^[-\w]{43}$/;
/** Creates a string type. */
export const str = ((
  kind: "pkey" | "char" | "text",
  meta?: { min?: number; max?: number; pattern?: RegExp },
) => {
  if (kind === "pkey") {
    return new Type(
      kind,
      ($) => PKEY.test($) ? $ : flag("badInput"),
      ($) => PKEY.exec($)?.[0] ?? "A".repeat(43),
    );
  }
  const [a, b] = clamp(RANGE[kind], meta), c = meta?.pattern;
  return new Type(kind, ($) => {
    $ = normalize($);
    if ($.length < a) return flag("tooShort");
    if ($.length > b) return flag("tooLong");
    if (c?.test($) === false) return flag("patternMismatch");
    return $;
  }, normalize);
}) as {
  (kind: "pkey"): Type<string, "pkey">;
  <A extends "char" | "text">(
    kind: A,
    meta?: { min?: number; max?: number; pattern?: RegExp },
  ): Type<string, A>;
};
/** Creates a vector type. */
export const vec = <const A extends Type>(
  kind: A,
  meta?: { min?: number; max?: number; unique?: boolean },
): Type<As<A>[], A> => {
  const [a, b] = clamp([0, 0xfff], meta), c = meta?.unique;
  return new Type(kind, ($, row) => {
    const d = parseInt($, 36);
    if (!$.trim() || $ !== d.toString(36) || d < 0) return flag("badInput");
    if (d < a) return flag("tooShort");
    if (d > b) return flag("tooLong");
    const e = Array(d), f: Json[] = [];
    for (let z = 0; z < d; ++z) {
      const g = e[z] = kind.parse(row);
      if (typeof g === "symbol") f[z] = open(g);
    }
    if (f.length) {
      for (let z = 0; z < d; ++z) f[z] ??= null;
      return flag(f);
    }
    if (c) {
      for (let z = 0, g = new Set<string>(); z < d; ++z) {
        if (g.size === g.add(JSON.stringify(e[z])).size) {
          return flag("typeMismatch");
        }
      }
    }
    return e;
  }, ($, row) => {
    for (let z = 0; z < $.length; ++z) {
      row.push.apply(row, kind.stringify($[z]));
    }
    return $.length.toString(36);
  });
};
/** Creates an object type. */
export const obj = <const A extends { [key: string]: Type }>(
  kind: A,
  meta?: { min?: number; max?: number },
): Type<{ [B in keyof A]: As<A[B]> }, A> => {
  const [a, b] = clamp([0, 0xfff], meta), c = Object.keys(kind);
  return new Type(kind, ($, row) => {
    const d = parseInt($, 36);
    if (!$.trim() || $ !== d.toString(36) || d < 0) return flag("badInput");
    const e = {} as { [B in keyof A]: any }, f: { [key: string]: Json } = {};
    let g = 0;
    for (let z = 0; z < c.length; ++z) {
      const h = e[c[z] as keyof A] = kind[c[z]].parse(row);
      if (typeof h === "symbol") f[c[z]] = open(h);
      else if (h !== null && ++g > b) return flag("tooLong");
    }
    if (g < a) return flag("tooShort");
    if (Object.keys(f).length) return flag(f);
    return e;
  }, ($, row) => {
    for (let z = 0; z < c.length; ++z) {
      row.push.apply(row, kind[c[z]].stringify($[c[z]]));
    }
    return c.length.toString(36);
  });
};
