import { b_s64, s64_b } from "@nyoon/base";
import { Row } from "jsr:@nyoon/csv@^1.0.9";

/** Valid [JSON](https://www.json.org/) values, excluding `boolean`s. */
export type Json = null | number | string | Json[] | { [key: string]: Json };
const FLAGS = [ // <https://dev.mozilla.org/Web/API/ValidityState>
  "badInput",
  "patternMismatch",
  "rangeOverflow",
  "rangeUnderflow",
  "stepMismatch",
  "tooLong",
  "tooShort",
  "typeMismatch",
  "valid",
  "valueMissing",
] as const;
/** Wraps an error or errors in a `symbol`, has some defined directly. */
export const flag = Object.assign(
  ($: Json) => Symbol.for(JSON.stringify($)),
  FLAGS.reduce((to, $) => ({ ...to, [$]: Symbol.for(JSON.stringify($)) }), {}),
) as (($: Json) => symbol) & { [_ in typeof FLAGS[number]]: symbol };
/** Unwraps the error or error held in a `symbol`. */
export const open = <A extends Json>($: symbol): A =>
  JSON.parse(Symbol.keyFor($) ?? "null");
/** Type definition. */
export type Type<A = any, B = any, C = any> = {
  kind: B;
  meta: C;
  encode: ($: A) => Row;
  decode: ($: Row) => A | symbol;
};
type Numeric = "uint" | "time" | "real";
type Stringy = "char" | "text";
type Byteish = "pkey" | "blob";
type Data<A> = A extends readonly [string, ...string[]] ? A[number]
  : A extends Numeric ? number
  : A extends Stringy ? string
  : A extends Byteish ? Uint8Array
  : A extends Type<infer B> ? B[]
  : { [B in keyof A]: A[B] extends Type<infer C> ? C : never };
export type Infer<A> = A extends Type<infer B> ? B : never;
const type = <A, B>(
  typer: (kind: A, meta: B) => [
    ($: NonNullable<Data<A>>, row: Row) => string,
    ($: string, row: Row) => Data<A> | symbol,
  ],
) =>
<const C extends A, const D extends boolean = never>(
  kind: C,
  meta?: B & { optional?: D },
) => {
  const a = meta?.optional ? null : flag.valueMissing;
  const [b, c] = typer(kind, meta! ?? {});
  return {
    kind,
    meta,
    decode: ($: Row) => {
      const d = $.shift();
      return (d == null ? a : c(d, $)) as
        | Data<C>
        | (D extends true ? null : never)
        | symbol;
    },
    encode: ($: Data<C> | (D extends true ? null : never)) => {
      if ($ == null) return [$];
      const d: Row = [];
      return d.unshift(b($, d)), d;
    },
  } satisfies Type;
};
const normalize = ($: string) =>
  $.normalize("NFC").replace(/\p{Cs}/gu, "\ufffd")
    .replace(/\r\n|\p{Zl}|\p{Zp}/gu, "\n").replace(/\p{Zs}/gu, " ");
export const opt: ReturnType<typeof type<readonly [string, ...string[]], {}>> =
  type<readonly [string, ...string[]], {}>((kind) => {
    const a = Set.prototype.has.bind(new Set(kind));
    return [normalize, ($) => a($) ? $ : flag.badInput];
  });
type Meta<A> = {
  [B in keyof A | "min" | "max"]?: B extends keyof A ? A[B] : number;
};
/** Numeric or length ranges. */
export const MIN_MAX = {
  uint: [0, -1 >>> 0],
  time: [0, 281474976710655],
  real: [-Number.MAX_VALUE, Number.MAX_VALUE],
  char: [0, 0xff],
  text: [0, 0xffff],
  pkey: [32, 32],
  blob: [0, 0xffff],
} satisfies { [kind: string]: [min: number, max: number, radix?: number] };
const clamp = (range: typeof MIN_MAX[keyof typeof MIN_MAX], $: Meta<any>) => {
  const a = $.min ?? range[0], b = $.max ?? range[1];
  return [Math.min(a, b), Math.max(a, b)];
};
export const num: ReturnType<typeof type<Numeric, Meta<{ step: number }>>> =
  type<Numeric, Meta<{ step: number }>>((kind, meta) => {
    const [a, b, c, d] = kind === "real"
      ? [10, 0, "", Number.isFinite]
      : [16, kind === "time" ? 12 : 0, "0x", Number.isInteger];
    const [e, f] = clamp(MIN_MAX[kind], meta), g = meta?.step ?? 0;
    return [($) => $.toString(a).padStart(b, "0"), ($) => {
      if (!$.trim()) return flag.badInput;
      const h = +(c + $);
      if (Number.isNaN(h)) return flag.badInput;
      if (!d(h)) return flag.typeMismatch;
      if (h < e) return flag.rangeUnderflow;
      if (h > f) return flag.rangeOverflow;
      if (h % g) return flag.stepMismatch;
      return h;
    }];
  });
export const str: ReturnType<typeof type<Stringy, Meta<{ pattern: RegExp }>>> =
  type<Stringy, Meta<{ pattern: RegExp }>>((kind, meta) => {
    const [a, b] = clamp(MIN_MAX[kind], meta), c = meta?.pattern;
    return [normalize, ($) => {
      $ = normalize($);
      if ($.length < a) return flag.tooShort;
      if ($.length > b) return flag.tooLong;
      if (c?.test($) === false) return flag.patternMismatch;
      return $;
    }];
  });
export const bin: ReturnType<typeof type<Byteish, Meta<{ step: number }>>> =
  type<Byteish, Meta<{ step: number }>>((kind, meta) => {
    const [a, b] = clamp(MIN_MAX[kind], meta), c = meta?.step ?? 0;
    return [b_s64, ($) => {
      if (/[^-\w]/.test($)) return flag.badInput;
      const d = s64_b($);
      if (d.length < a) return flag.tooShort;
      if (d.length > b) return flag.tooLong;
      if (d.length % c) return flag.stepMismatch;
      return d;
    }];
  });
export const vec: ReturnType<typeof type<Type, Meta<{ unique: boolean }>>> =
  type<Type, Meta<{ unique: boolean }>>(
    ({ decode: parse, encode: stringify }, meta) => {
      const [a, b] = clamp([0, 0xfff], meta), c = !meta.unique;
      return [($, row) => {
        for (let z = 0; z < $.length; ++z) row.push.apply(row, stringify($[z]));
        return $.length.toString(36);
      }, ($, row) => {
        const e = parseInt($, 36);
        if (!$.trim() || !Number.isInteger(e)) return flag.badInput;
        if (e < a) return flag.tooShort;
        if (e > b) return flag.tooLong;
        const f = Array(e), g: Json[] = [];
        for (let z = 0; z < e; ++z) {
          const h = f[z] = parse(row);
          if (typeof h === "symbol") g[z] = open(h);
        }
        if (g.length) {
          for (let z = 0; z < e; ++z) g[z] ??= null;
          return flag(g);
        }
        if (c) return f;
        for (let z = 0, h = new Set<string>(); z < e; ++z) {
          if (h.size === h.add(JSON.stringify(f[z])).size) {
            return flag.typeMismatch;
          }
        }
        return f;
      }];
    },
  );
export const obj: ReturnType<typeof type<{ [key: string]: Type }, Meta<{}>>> =
  type<{ [key: string]: Type }, Meta<{}>>((kind, meta) => {
    const [a, b] = clamp([0, 0xfff], meta), c = Object.keys(kind);
    return [($, row) => {
      for (let z = 0; z < c.length; ++z) {
        row.push.apply(row, kind[c[z]].encode($[c[z]]));
      }
      return c.length.toString(36);
    }, ($, row) => {
      const e = parseInt($, 36);
      if (!$.trim() || !Number.isInteger(e)) return flag.badInput;
      if (e !== c.length) return flag.typeMismatch;
      const f: { [key: string]: unknown } = {}, g: { [key: string]: Json } = {};
      let h = 0;
      for (let z = 0; z < e; ++z) {
        const i = f[c[z]] = kind[c[z]].decode(row);
        if (typeof i === "symbol") g[c[z]] = open(i);
        else if (i !== null && ++h > b) return flag.tooLong;
      }
      if (h < a) return flag.tooShort;
      if (Object.keys(g).length) return flag(g);
      return f;
    }];
  });
