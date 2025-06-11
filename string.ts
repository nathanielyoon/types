import { b_s64, s64_b } from "@nyoon/base";
import { Row } from "jsr:@nyoon/csv@^1.0.9";
import { wrap } from "./wrap.ts";

type MinMax = { min?: number; max?: number };
type Enum = readonly [string, ...string[]];
type Map = { [key: string]: Type };
export type Type =
  | { kind: Enum; meta: { optional?: boolean } }
  | { kind: "num"; meta?: MinMax & { step?: number; optional?: boolean } }
  | { kind: "str"; meta?: MinMax & { pattern?: string; optional?: boolean } }
  | { kind: "bin"; meta?: MinMax & { step?: number; optional?: boolean } }
  | { kind: [Type]; meta?: MinMax & { unique?: boolean; optional?: boolean } }
  | { kind: Map; meta?: MinMax & { optional?: boolean } };
export type Data<A extends Type> =
  | (A extends { meta: { optional: true } } ? null : never)
  | (
    A extends { kind: readonly [string, ...string[]] } ? A["kind"][number]
      : A extends { kind: "num" } ? number
      : A extends { kind: "str" } ? string
      : A extends { kind: "bin" } ? Uint8Array
      : A extends { kind: [infer B extends Type] } ? Data<B>[]
      : A extends { kind: infer B extends Map } ? { [C in keyof B]: Data<B[C]> }
      : never
  );
const clamp = ($: MinMax | undefined, max?: number) => {
  const a = max == null ? 0 : -max, b = $?.min ?? a, c = $?.max ?? max ?? 65535;
  return [Math.min(b, c), Math.max(b, c)];
};
export const normalize = ($: string) =>
  $.normalize("NFC") // canonically decompose and compose
    .replace(/\p{Cs}/gu, "\ufffd") // replace lone surrogates
    .replace(/\p{Zl}|\p{Zp}/gu, "\n") // only use 0x0a
    .replace(/\p{Zs}/gu, " "); // only use 0x20
const type = <A extends Type>(
  $: (flag: typeof wrap, kind: A["kind"], meta: A["meta"]) => [
    row_data: ($: string, row: Row) => Data<A> | symbol,
    data_row: ($: NonNullable<Data<A>>, row: Row) => string | null,
  ],
) =>
<const B extends A>(kind: B["kind"], meta?: B["meta"]) => {
  const a = meta?.optional ? null : wrap.valueMissing;
  const [b, c] = $(wrap, kind, meta);
  return {
    parse: ($: Row) => {
      const d = $.shift();
      return (d == null ? a : b(d, $)) as Data<B> | symbol;
    },
    stringify: ($: Data<B>, row: Row) => {
      if ($ == null) row.push($);
      else row.splice(row.length, 0, c($, row));
    },
  };
};
export const opt = type<Extract<Type, { kind: Enum }>>((flag, kind) => {
  const a = Set.prototype.has.bind(new Set(kind.map(normalize)));
  return [($) => a($ = normalize($)) ? $ : flag("badInput"), normalize];
});
export const num = type<Extract<Type, { kind: "num" }>>((flag, _, meta) => {
  const [a, b] = clamp(meta, Number.MAX_VALUE), c = meta?.step ?? 0;
  return [
    ($) => {
      const d = +$;
      if (!$.trim() || Number.isNaN(d)) return flag.badInput;
      if (d < a) return flag.rangeUnderflow;
      if (d > b) return flag.rangeOverflow;
      if (d % c) return flag.stepMismatch;
      return d;
    },
    String,
  ];
}).bind(null, "num");
export const str = type<Extract<Type, { kind: "str" }>>((flag, _, meta) => {
  const [a, b] = clamp(meta);
  let c: RegExp["test"] | null;
  try {
    if (meta?.pattern) c = RegExp.prototype.test.bind(RegExp(meta.pattern));
  } catch {
    c = null;
  }
  return [
    ($) => {
      $ = normalize($);
      if ($.length < a) return flag.tooShort;
      if ($.length > b) return flag.tooLong;
      if (c?.($) === false) return flag.patternMismatch;
      return $;
    },
    normalize,
  ];
}).bind(null, "str");
export const bin = type<Extract<Type, { kind: "bin" }>>((flag, _, meta) => {
  const [a, b] = clamp(meta), c = meta?.step ?? 0;
  return [
    ($) => {
      if (/[^-\w]/.test($)) return flag.badInput;
      const d = s64_b($);
      if (d.length < a) return flag.tooShort;
      if (d.length > b) return flag.tooLong;
      if (d.length % c) return flag.stepMismatch;
      return d;
    },
    b_s64,
  ];
}).bind(null, "bin");
export const vec = type<Extract<Type, { kind: [Type] }>>((flag, kind, meta) => {
  const [a, b] = clamp(meta), c = !meta?.unique, d = typer(kind, meta);
  return [
    ($, row) => {
      const e = parseInt($, 36);
      if (!$.trim() || Number.isNaN(e)) return flag.badInput;
      if (e < a) return flag.tooShort;
      if (e > b) return flag.tooLong;
      const f = Array(e), g: (symbol | null)[] = [];
      for (let z = 0; z < e; ++z) {
        const h = f[z] = d.parse(row);
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
    },
    ($, row) => {
      for (let z = 0; z < $.length; ++z) d.stringify($[z], row);
      return $.length.toString(36);
    },
  ];
});
export const obj = type<Extract<Type, { kind: Map }>>((flag, kind, meta) => {
  const [a, b] = clamp(meta), c = Object.keys(kind);
  const d = Array.from(c, ($) => typer(kind[$].kind, kind[$].meta));
  return [
    ($, row) => {
      const e = parseInt($, 36);
      if (!$.trim() || Number.isNaN(e)) return flag.badInput;
      if (e !== c.length) return flag.typeMismatch;
      const f: { [key: string]: any } = {}, g: { [key: string]: symbol } = {};
      let h = 0;
      for (let z = 0; z < e; ++z) {
        const i = f[c[z]] = d[z].parse(row);
        if (typeof i === "symbol") g[c[z]] = i;
        else if (i !== null && ++h > b) return flag.tooLong;
      }
      if (h < a) return flag.tooShort;
      if (Object.keys(g).length) return wrap(g);
      return f;
    },
    ($, row) => {
      for (let z = 0; z < c.length; ++z) d[z].stringify($[c[z]], row);
      return c.length.toString(36);
    },
  ];
});
const typer = <A extends Type>(kind: A["kind"], meta: A["meta"]) => {
  if ((Array.isArray as ($: any) => $ is readonly any[])(kind)) {
    return typeof kind[0] === "string"
      ? opt(kind as Enum, meta)
      : vec(kind as [Type], meta);
  }
  if (typeof kind === "object") return obj(kind, meta);
  switch (kind) {
    case "num":
      return num(meta);
    case "str":
      return str(meta);
    case "bin":
      return bin(meta);
  }
  throw "UNREACHABLE";
};
