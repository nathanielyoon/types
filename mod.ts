import { b_s64, s64_b } from "@nyoon/base";
import { Row } from "jsr:@nyoon/csv@^1.0.9";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
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
type Numeric = "uint" | "time" | "real";
type Stringy = "char" | "text";
type Byteish = "pkey" | "blob";
type Data<A> = A extends readonly [string, ...string[]] ? A[number]
  : A extends Numeric ? number
  : A extends Stringy ? string
  : A extends Byteish ? Uint8Array
  : A extends Type<infer B> ? B[]
  : { [B in keyof A]: A[B] extends Type<infer C> ? C : never };
type Type<A = any> = { encode: ($: Row) => A | symbol; decode: ($: A) => Row };
export type Infer<A> = A extends Type<infer B> ? B : never;
const type = <A, B>(
  typer: (kind: A, meta: B) => [
    ($: string, row: Row) => Data<A> | symbol,
    ($: NonNullable<Data<A>>, row: Row) => string,
  ],
) =>
<const C extends A, const D extends boolean = never>(
  kind: C,
  meta?: B & { optional?: D },
): Type<Data<C> | (D extends true ? null : never)> => {
  const a = meta?.optional ? null : flag.valueMissing;
  const [b, c] = typer(kind, meta! ?? {});
  return {
    encode: ($) => {
      const d = $.shift();
      return d == null ? a : b(d, $) as any;
    },
    decode: ($) => {
      if ($ == null) return [$];
      const d: Row = [];
      return d.unshift(c($, d)), d;
    },
  };
};
const normalize = ($: string) =>
  $.normalize("NFC").replace(/\p{Cs}/gu, "\ufffd")
    .replace(/\r\n|\p{Zl}|\p{Zp}/gu, "\n").replace(/\p{Zs}/gu, " ");
export const opt: ReturnType<typeof type<readonly [string, ...string[]], {}>> =
  type<readonly [string, ...string[]], {}>((kind) => {
    const a = Set.prototype.has.bind(new Set(kind));
    return [($) => a($) ? $ : flag.badInput, normalize];
  });
type Meta<A> = {
  [B in keyof A | "min" | "max"]?: B extends keyof A ? A[B] : number;
};
const clamp = ($: Meta<any>, range: readonly [min: number, max: number]) => {
  const a = $.min ?? range[0], b = $.max ?? range[1];
  return [Math.min(a, b), Math.max(a, b)];
};
const MIN_MAX = {
  uint: [0, -1 >>> 0],
  time: [-864e13, 864e13],
  real: [-Number.MAX_VALUE, Number.MAX_VALUE],
  char: [0, 0xff],
  text: [0, 0xffff],
  pkey: [32, 32],
  blob: [0, 0xffff],
} as const;
export const num: ReturnType<typeof type<Numeric, Meta<{ step: number }>>> =
  type<Numeric, Meta<{ step: number }>>((kind, meta) => {
    const [a, b] = clamp(meta, MIN_MAX[kind]), c = meta?.step ?? 0;
    const d = kind.includes("i") ? Number.isInteger : Number.isFinite;
    return [($) => {
      if (!$.trim()) return flag.badInput;
      const e = +$;
      if (Number.isNaN(e)) return flag.badInput;
      if (!d(e)) return flag.typeMismatch;
      if (e < a) return flag.rangeUnderflow;
      if (e > b) return flag.rangeOverflow;
      if (e % c) return flag.stepMismatch;
      return e;
    }, String];
  });
export const str: ReturnType<typeof type<Stringy, Meta<{ pattern: RegExp }>>> =
  type<Stringy, Meta<{ pattern: RegExp }>>((kind, meta) => {
    const [a, b] = clamp(meta, MIN_MAX[kind]), c = meta?.pattern;
    return [($) => {
      $ = normalize($);
      if ($.length < a) return flag.tooShort;
      if ($.length > b) return flag.tooLong;
      if (c?.test($) === false) return flag.patternMismatch;
      return $;
    }, normalize];
  });
export const bin: ReturnType<typeof type<Byteish, Meta<{ step: number }>>> =
  type<Byteish, Meta<{ step: number }>>((kind, meta) => {
    const [a, b] = clamp(meta, MIN_MAX[kind]), c = meta?.step ?? 0;
    return [($) => {
      if (/[^-\w]/.test($)) return flag.badInput;
      const d = s64_b($);
      if (d.length < a) return flag.tooShort;
      if (d.length > b) return flag.tooLong;
      if (d.length % c) return flag.stepMismatch;
      return d;
    }, b_s64];
  });
export const vec: ReturnType<typeof type<Type, Meta<{ unique: boolean }>>> =
  type<Type, Meta<{ unique: boolean }>>(
    ({ encode: parse, decode: stringify }, meta) => {
      const [a, b] = clamp(meta, [0, 0xfff]), c = !meta.unique;
      return [($, row) => {
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
      }, ($, row) => {
        for (let z = 0; z < $.length; ++z) row.push.apply(row, stringify($[z]));
        return $.length.toString(36);
      }];
    },
  );
export const obj: ReturnType<typeof type<{ [key: string]: Type }, Meta<{}>>> =
  type<{ [key: string]: Type }, Meta<{}>>((kind, meta) => {
    const [a, b] = clamp(meta, [0, 0xfff]), c = Object.keys(kind);
    return [($, row) => {
      const e = parseInt($, 36);
      if (!$.trim() || !Number.isInteger(e)) return flag.badInput;
      if (e !== c.length) return flag.typeMismatch;
      const f: { [key: string]: unknown } = {}, g: { [key: string]: Json } = {};
      let h = 0;
      for (let z = 0; z < e; ++z) {
        const i = f[c[z]] = kind[c[z]].encode(row);
        if (typeof i === "symbol") g[c[z]] = open(i);
        else if (i !== null && ++h > b) return flag.tooLong;
      }
      if (h < a) return flag.tooShort;
      if (Object.keys(g).length) return flag(g);
      return f;
    }, ($, row) => {
      for (let z = 0; z < c.length; ++z) {
        row.push.apply(row, kind[c[z]].decode($[c[z]]));
      }
      return c.length.toString(36);
    }];
  });
