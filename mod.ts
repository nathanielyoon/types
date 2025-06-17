import { Row } from "jsr:@nyoon/csv@^1.0.9";

/** Valid [JSON](https://www.json.org/) values, excluding `boolean`s. */
export type Json = null | number | string | Json[] | { [key: string]: Json };
/** Wraps an error or errors in a `symbol`. */
export const flag = ($: Json): symbol => Symbol.for(JSON.stringify($));
/** Unwraps the error or error held in a `symbol`. */
export const open = <A extends Json>($: symbol): A =>
  JSON.parse(Symbol.keyFor($) ?? "null");
/** Type for parsing and stringifying variable-length data. */
export class Type<A = any, B = {}> {
  private nil: A | symbol = flag("valueMissing");
  /** Makes a `Type` optional. */
  maybe(): Type<A | null, B> {
    this.nil = null as A;
    return this as Type<A | null, B>;
  }
  /** Makes a `Type` required. */
  really(): Type<Exclude<A, null>, B> {
    this.nil = flag("valueMissing");
    return this as Type<Exclude<A, null>, B>;
  }
  private hooks = {
    pre_parse: (() => {}) as ($: Row) => void | symbol,
    post_parse: (($) => $) as ($: A) => A | symbol,
    pre_stringify: (($) => $) as ($: A) => A,
    post_stringify: (() => {}) as ($: Row) => void,
  };
  /** Adds a hook to one of the processes. */
  on<A extends keyof typeof this.hooks>(on: A, $: typeof this.hooks[A]): this {
    const a = this.hooks[on];
    this.hooks[on] = ($: any) => {
      const b = a($);
      return (typeof b === "symbol" ? b : $(b ?? $)) as any;
    };
    return this;
  }
  /** Creates a type for parsing and stringifying CSV data. */
  constructor(
    public meta: B,
    private decode: ($: string, row: Row) => A | symbol,
    private encode: ($: NonNullable<A>, row: Row) => string,
  ) {}
  /** Converts a CSV row to the specified type or a `symbol` (error). */
  parse($: Row): A | symbol {
    const a = this.hooks.pre_parse($);
    if (a) return a;
    const b = $.shift();
    if (b == null) return this.nil;
    const c = this.decode(b, $);
    if (typeof c === "symbol") return c;
    return this.hooks.post_parse(c);
  }
  /** Converts the specified type to a CSV row (or portion thereof). */
  stringify($: A): Row {
    const a: Row = [];
    $ = this.hooks.pre_stringify($);
    if ($ == null) a.push(null);
    else a.unshift(this.encode($, a));
    this.hooks.post_stringify(a);
    return a;
  }
}
type Numbery = "uint" | "time" | "real";
type Stringy = "pkey" | "char" | "text";
type Primitive = Numbery | Stringy | `${Numbery | Stringy}?`;
/** Parsed data. */
export type As<A extends Type | Primitive> = A extends Type<infer B> ? B
  : A extends Numbery ? number
  : A extends Stringy ? string
  : A extends `${Numbery}?` ? number | null
  : A extends `${Stringy}?` ? string | null
  : never;
/** Canonicalizes, replaces lone surrogates, and standardizes whitespace. */
export const normalize = ($: string): string =>
  $.normalize("NFC").replace(/\p{Cs}/gu, "\ufffd")
    .replace(/\r\n|\p{Zl}|\p{Zp}/gu, "\n").replace(/\p{Zs}/gu, " ");
/** Creates an option type. */
export const opt = <const A extends readonly [string, ...string[]]>(
  kind: A,
): Type<A[number], A> => {
  const a = Set.prototype.has.bind(new Set(kind));
  return new Type(
    kind,
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
export const num = <A extends Numbery>(
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
/** Creates a string type. */
export const str =
  ((kind: Stringy, meta?: { min?: number; max?: number; pattern?: RegExp }) => {
    if (kind === "pkey") {
      return new Type(
        kind,
        ($) => /^[-\w]{43}$/.test($) ? $ : flag("badInput"),
        ($) => /^[-\w]{43}$/.exec($)?.[0] ?? "A".repeat(43),
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
const primitive = (kind: Primitive) => {
  switch (kind) {
    case "uint":
    case "time":
    case "real":
      return num(kind);
    case "pkey":
      return str(kind);
    case "char":
    case "text":
      return str(kind);
    case "uint?":
    case "time?":
    case "real?":
      return num(kind.slice(0, -1) as Parameters<typeof num>[0]).maybe();
    case "pkey?":
      return str(kind.slice(0, -1) as Parameters<typeof str>[0]).maybe();
    case "char?":
    case "text?":
      return str(kind.slice(0, -1) as Parameters<typeof str>[0]).maybe();
  }
};
/** Creates a vector type. */
export const vec = <const A extends Type | Primitive>(
  kind: A,
  meta?: { min?: number; max?: number; unique?: boolean },
): Type<As<A>[], A> => {
  const [a, b] = clamp([0, 0xfff], meta), c = meta?.unique;
  const d: Type = typeof kind === "string" ? primitive(kind) : kind;
  return new Type(kind, ($, row) => {
    const e = parseInt($, 36);
    if (!$.trim() || $ !== e.toString(36) || e < 0) return flag("badInput");
    if (e < a) return flag("tooShort");
    if (e > b) return flag("tooLong");
    const f = Array(e), g: Json[] = [];
    for (let z = 0; z < e; ++z) {
      const h = f[z] = d.parse(row);
      if (typeof h === "symbol") g[z] = open(h);
    }
    if (g.length) {
      for (let z = 0; z < e; ++z) g[z] ??= null;
      return flag(g);
    }
    if (c) {
      for (let z = 0, h = new Set<string>(); z < e; ++z) {
        if (h.size === h.add(JSON.stringify(f[z])).size) {
          return flag("typeMismatch");
        }
      }
    }
    return f;
  }, ($, row) => {
    for (let z = 0; z < $.length; ++z) row.push.apply(row, d.stringify($[z]));
    return $.length.toString(36);
  });
};
/** Creates an object type. */
export const obj = <const A extends { [key: string]: Type | Primitive }>(
  kind: A,
  meta?: { min?: number; max?: number },
): Type<{ [B in keyof A]: As<A[B]> }, A> => {
  const [a, b] = clamp([0, 0xfff], meta), c = Object.keys(kind);
  const d: { [key: string]: Type } = {};
  for (let z = 0; z < c.length; ++z) {
    const e = kind[c[z]];
    d[c[z]] = typeof e === "string" ? primitive(e) : e;
  }
  return new Type(kind, ($, row) => {
    const e = parseInt($, 36);
    if (!$.trim() || $ !== e.toString(36) || e < 0) return flag("badInput");
    if (e !== c.length) return flag("typeMismatch");
    const f = {} as { [B in keyof A]: any }, g: { [key: string]: Json } = {};
    let h = 0;
    for (let z = 0; z < e; ++z) {
      const i = f[c[z] as keyof A] = d[c[z]].parse(row);
      if (typeof i === "symbol") g[c[z]] = open(i);
      else if (i !== null && ++h > b) return flag("tooLong");
    }
    if (h < a) return flag("tooShort");
    if (Object.keys(g).length) return flag(g);
    return f;
  }, ($, row) => {
    for (let z = 0; z < c.length; ++z) {
      row.push.apply(row, d[c[z]].stringify($[c[z]]));
    }
    return c.length.toString(36);
  });
};
