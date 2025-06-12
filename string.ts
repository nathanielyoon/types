/** Define schemas that decode data from variable-length CSV rows.
 * @module */

import { b_s64, s64_b } from "@nyoon/base";
import { Row } from "jsr:@nyoon/csv@^1.0.9";
import { flag } from "./flag.ts";

type Data<A> = A extends readonly [string, ...string[]] ? A[number]
  : A extends "uint" | "time" | "real" ? number
  : A extends "char" | "text" ? string
  : A extends "pkey" | "blob" ? Uint8Array
  : A extends Type<infer B> ? Data<B>[]
  : { [B in keyof A]: A[B] extends Type<infer C> ? Data<C> : never };
type Type<A> = { parse: ($: Row) => A | symbol; stringify: ($: A) => Row };
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
    parse: ($) => {
      const d = $.shift();
      return d == null ? a : b(d, $) as any;
    },
    stringify: ($) => {
      if ($ == null) return [$];
      const a: Row = [];
      return a.unshift(c($, a)), a;
    },
  };
};
const normalize = ($: string) =>
  $.normalize("NFC").replace(/\p{Cs}/gu, "\ufffd")
    .replace(/\r\n|\p{Zl}|\p{Zp}/gu, "\n").replace(/\p{Zs}/gu, " ");
export const opt = type<readonly [string, ...string[]], {}>((kind) => {
  const a = Set.prototype.has.bind(new Set(kind));
  return [($) => a($) ? $ : flag.badInput, normalize];
});
type MinMax = { min?: number; max?: number };
const clamp = ($: MinMax, range: readonly [min: number, max: number]) => {
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
export const num = type<"uint" | "time" | "real", MinMax & { step?: number }>(
  (kind, meta) => {
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
  },
);
export const str = type<"char" | "text", MinMax & { pattern?: RegExp }>(
  (kind, meta) => {
    const [a, b] = clamp(meta, MIN_MAX[kind]), c = meta?.pattern;
    return [($) => {
      $ = normalize($);
      if ($.length < a) return flag.tooShort;
      if ($.length > b) return flag.tooLong;
      if (c?.test($) === false) return flag.patternMismatch;
      return $;
    }, normalize];
  },
);
export const bin = type<"pkey" | "blob", MinMax & { step?: number }>(
  (kind, meta) => {
    const [a, b] = clamp(meta, MIN_MAX[kind]), c = meta?.step ?? 0;
    return [($) => {
      if (/[^-\w]/.test($)) return flag.badInput;
      const d = s64_b($);
      if (d.length < a) return flag.tooShort;
      if (d.length > b) return flag.tooLong;
      if (d.length % c) return flag.stepMismatch;
      return d;
    }, b_s64];
  },
);
export const vec = type<Type<any>, MinMax & { unique?: boolean }>(
  ({ parse, stringify }, meta) => {
    const [a, b] = clamp(meta, [0, 0xfff]), c = !meta.unique;
    return [($, row) => {
      const e = parseInt($, 36);
      if (!$.trim() || !Number.isInteger(e)) return flag.badInput;
      if (e < a) return flag.tooShort;
      if (e > b) return flag.tooLong;
      const f = Array(e), g: (symbol | null)[] = [];
      for (let z = 0; z < e; ++z) {
        const h = f[z] = parse(row);
        if (typeof h === "symbol") g[z] = h;
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
export const obj = type<{ [key: string]: Type<any> }, MinMax>((kind, meta) => {
  const [a, b] = clamp(meta, [0, 0x3ff]), c = Object.keys(kind);
  return [($, row) => {
    const e = parseInt($, 36);
    if (!$.trim() || !Number.isInteger(e)) return flag.badInput;
    if (e !== c.length) return flag.typeMismatch;
    const f: { [key: string]: any } = {}, g: { [key: string]: symbol } = {};
    let h = 0;
    for (let z = 0; z < e; ++z) {
      const i = f[c[z]] = kind[c[z]].parse(row);
      if (typeof i === "symbol") g[c[z]] = i;
      else if (i !== null && ++h > b) return flag.tooLong;
    }
    if (h < a) return flag.tooShort;
    if (Object.keys(g).length) return flag(g);
    return f;
  }, ($, row) => {
    for (let z = 0; z < c.length; ++z) {
      row.push.apply(kind[c[z]].stringify($[c[z]]));
    }
    return c.length.toString(36);
  }];
});
