import { s64_b } from "@nyoon/base";
import { Row } from "jsr:@nyoon/csv@^1.0.9";

/** Valid [JSON](https://www.json.org/) values, excluding `boolean`s. */
export type Json = null | number | string | Json[] | { [key: string]: Json };
/** Wraps an error or errors in a `symbol`. */
export const wrap = ($: Json): symbol => Symbol.for(JSON.stringify($));
/** Unwraps the error or error held in a `symbol`. */
export const open = <A extends Json>($: symbol): A =>
  JSON.parse(Symbol.keyFor($) ?? "null");
type Meta<A> = A extends { new (_: any, meta: infer B): any } ? B : never;
/** Type for parsing and stringifying variable-length data. */
export abstract class Type<A, B> {
  private nil: B | symbol = wrap("valueMissing");
  /** Makes a `Type` optional. */
  maybe(): Type<A, B | null> {
    return this.nil = null as B, this as Type<A, B | null>;
  }
  /** Makes a `Type` required. */
  really(): Type<A, NonNullable<B>> {
    return this.nil = wrap("valueMissing"), this as Type<A, NonNullable<B>>;
  }
  protected abstract decode($: string, row: Row): B | symbol;
  protected abstract encode($: NonNullable<B>, row: Row): string;
  /** Creates a type for parsing and stringifying CSV data. */
  constructor(public kind: A) {}
  private hooks = {
    pre_parse: (() => {}) as ($: Row) => any,
    post_parse: (($) => $) as ($: B) => B | symbol,
    pre_stringify: (($) => $) as ($: B) => B,
    post_stringify: (() => {}) as ($: Row) => void,
  };
  /** Hooks into one of the steps. */
  on<A extends keyof typeof this.hooks>(on: A, to: typeof this.hooks[A]): this {
    const a = this.hooks[on];
    this.hooks[on] = ($: any) => {
      const b = a($);
      return (typeof b === "symbol" ? b : to(b ?? $));
    };
    return this;
  }
  /** Converts a CSV row to the specified type or a `symbol` (error). */
  parse($: Row): B | symbol {
    const a = this.hooks.pre_parse($);
    if (typeof a === "symbol") return a;
    const b = $.shift();
    if (b == null) return this.nil;
    const c = this.decode(b, $);
    if (typeof c === "symbol") return c;
    return this.hooks.post_parse(c);
  }
  /** Converts the specified type to a CSV row (or portion thereof). */
  stringify($: B): Row {
    const a: Row = [];
    $ = this.hooks.pre_stringify($);
    if ($ == null) a.push(null);
    else a.unshift(this.encode($, a));
    return this.hooks.post_stringify(a), a;
  }
  /** Creates an option type. */
  static opt<const A extends [string, ...string[]]>(kind: A): Opt<A> {
    return new Opt(kind);
  }
  /** Creates a public or secret key type. */
  static key<const A extends "pkey" | "skey">(kind: A): Key<A> {
    return new Key(kind);
  }
  /** Creates a datetime type. */
  static iso<const A extends "time" | "date">(
    kind: A,
    meta?: Meta<typeof Iso>,
  ): Iso<A> {
    return new Iso(kind, meta ?? {});
  }
  /** Creates a number type. */
  static num<const A extends "uint" | "real">(
    kind: A,
    meta?: Meta<typeof Num>,
  ): Num<A> {
    return new Num(kind, meta ?? {});
  }
  /** Creates a string type. */
  static str<const A extends "char" | "text">(
    kind: A,
    meta?: Meta<typeof Str>,
  ): Str<A> {
    return new Str(kind, meta ?? {});
  }
  /** Creates a vector type. */
  static vec<const A extends Type<{}, any>>(
    kind: A,
    meta?: Meta<typeof Vec>,
  ): Vec<A> {
    return new Vec(kind, meta ?? {});
  }
  /** Creates a map type. */
  static map<const A extends Type<{}, any>>(
    kind: A,
    meta?: Meta<typeof Map>,
  ): Map<A> {
    return new Map(kind, meta ?? {});
  }
  /** Creates an object type. */
  static obj<const A extends { [key: string]: Type<{}, any> }>(
    kind: A,
  ): Obj<A> {
    return new Obj(kind);
  }
}
/** Parsed data. */
export type As<A> = A extends Type<any, infer B> ? B : never;
/** Canonicalizes, replaces lone surrogates, and standardizes whitespace. */
export const fix = ($: string): string =>
  $.normalize("NFC").replace(/\p{Cs}/gu, "\ufffd")
    .replace(/\r\n|\p{Zl}|\p{Zp}/gu, "\n").replace(/\p{Zs}/gu, " ");
class Opt<A extends [string, ...string[]]> extends Type<A, A[number]> {
  private has;
  constructor(kind: A) {
    super(kind);
    this.has = Set.prototype.has.bind(new Set(kind));
  }
  protected decode($: string): A[number] | symbol {
    if (!this.has($ = fix($))) return wrap("badInput");
    return $ as A[number];
  }
  protected encode($: A[number]): string {
    return fix($);
  }
}
/** Type of key (public/secret). */
export const KEY_HALF = Symbol("KEY_HALF");
/** Key bytes. */
export const KEY_DATA = Symbol("KEY_DATA");
export type KeyString<A extends "pkey" | "skey"> = string & {
  [KEY_HALF]: A;
  [KEY_DATA]: Uint8Array;
};
class Key<A extends "pkey" | "skey"> extends Type<A, KeyString<A>> {
  protected decode($: string): KeyString<A> | symbol {
    if (!/^[-\w]{43}$/.test($)) return wrap("badInput");
    return Object.assign($, { [KEY_HALF]: this.kind, [KEY_DATA]: s64_b($) });
  }
  protected encode($: KeyString<A>): string {
    return /^[-\w]{43}$/.exec($)?.[0] ?? "A".repeat(43);
  }
}
/** Numeric or length ranges. */
export const RANGE = {
  uint: [0, 0xffffffff],
  real: [-1.7976931348623157e+308, 1.7976931348623157e+308],
  time: [0, 86399999],
  date: [0, 281474976710655],
  char: [0, 0xff],
  text: [0, 0xffff],
} as const;
type MinMax<A> = {
  [B in keyof A | "min" | "max"]?: B extends keyof A ? A[B] : number;
};
const min = (min_min: number, $?: number) => Math.max(min_min, $ ?? min_min);
const max = (max_max: number, $?: number) => Math.min(max_max, $ ?? max_max);
abstract class Primitive<A extends keyof typeof RANGE, B> extends Type<A, B> {
  protected min: number;
  protected max: number;
  constructor(kind: A, meta: MinMax<{}>) {
    super(kind);
    const [a, b] = RANGE[kind], c = min(a, meta?.min), d = max(b, meta?.max);
    this.min = min(a, Math.min(c, d)), this.max = max(b, Math.max(c, d));
  }
}
class Iso<A extends "time" | "date"> extends Primitive<A, Date> {
  private prefix;
  constructor(kind: A, meta: MinMax<{}>) {
    super(kind, meta);
    this.prefix = kind === "time" ? "1970-01-01T" : "";
  }
  protected decode($: string): Date | symbol {
    const a = new Date(this.prefix + $), b = +a;
    if (Number.isNaN(b) || !$.trim()) return wrap("badInput");
    if (b < this.min) return wrap("rangeUnderflow");
    if (b > this.max) return wrap("rangeOverflow");
    return a;
  }
  protected encode($: Date): string {
    return $.toISOString().slice(0, -1).replace(this.prefix, "");
  }
}
class Num<A extends "uint" | "real"> extends Primitive<A, number> {
  private step;
  constructor(kind: A, meta: MinMax<{ step: number }>) {
    super(kind, meta);
    this.step = meta.step ?? 0;
  }
  protected decode($: string): number | symbol {
    const a = +$;
    if (Number.isNaN(a) || !$.trim()) return wrap("badInput");
    if (a < this.min) return wrap("rangeUnderflow");
    if (a > this.max) return wrap("rangeOverflow");
    if (a % this.step) return wrap("stepMismatch");
    return a;
  }
  protected encode($: number): string {
    return `${$}`;
  }
}
class Str<A extends "char" | "text"> extends Primitive<A, string> {
  private test;
  constructor(kind: A, meta: MinMax<{ pattern: RegExp }>) {
    super(kind, meta);
    if (meta.pattern) this.test = RegExp.prototype.test.bind(meta?.pattern);
  }
  protected decode($: string): string | symbol {
    $ = fix($);
    if ($.length < this.min) return wrap("tooShort");
    if ($.length > this.max) return wrap("tooLong");
    if (this.test?.($) === false) return wrap("patternMismatch");
    return $;
  }
  protected encode($: string): string {
    return fix($);
  }
}
const length = ($: string, min: number, max: number) => {
  if (!$.trim()) return wrap("badInput");
  const a = parseInt($, 36);
  if ($ !== a.toString(36) || a < 0) return wrap("badInput");
  if (a < min) return wrap("tooShort");
  if (a > max) return wrap("tooLong");
  return a;
};
abstract class List<A, B> extends Type<A, B> {
  protected min: number;
  protected max: number;
  protected unique: boolean;
  constructor(kind: A, meta: MinMax<{ unique: boolean }>) {
    super(kind);
    const a = min(0, meta.min), b = max(0xfff, meta.max);
    this.min = min(0, Math.min(a, b)), this.max = max(0xfff, Math.max(a, b));
    this.unique = meta.unique || false;
  }
  protected result<C extends {}>(size: number, ok: C, no: Json[]): C | symbol {
    if (no.length) {
      for (let z = 0; z < size; ++z) no[z] ??= null;
      return wrap(no);
    }
    if (this.unique) {
      for (let z = 0, a = Object.values(ok), b = new Set(); z < a.length; ++z) {
        if (b.size === b.add(JSON.stringify(a[z])).size) {
          return wrap("typeMismatch");
        }
      }
    }
    return ok;
  }
}
class Vec<A extends Type<{}, any>> extends List<A, As<A>[]> {
  constructor($: A, meta: MinMax<{ unique: boolean }>) {
    super($, meta);
  }
  protected decode($: string, row: Row): As<A>[] | symbol {
    const a = length($, this.min, this.max);
    if (typeof a === "symbol") return a;
    const b = Array(a), c: Json[] = [];
    for (let z = 0; z < a; ++z) {
      if (typeof (b[z] = this.kind.parse(row)) === "symbol") c[z] = open(b[z]);
    }
    return this.result(a, b as As<A>[], c);
  }
  protected encode($: As<A>[], row: Row): string {
    for (let z = 0; z < $.length; ++z) {
      row.push.apply(row, this.kind.stringify($[z]));
    }
    return $.length.toString(36);
  }
}
class Map<A extends Type<{}, any>> extends List<A, { [key: string]: As<A> }> {
  /** Type of each field's key. */
  readonly keys: Type<"char", string>;
  constructor(kind: A, meta: MinMax<{ unique: boolean; keys: Str<"char"> }>) {
    super(kind, meta);
    this.keys = (meta.keys ?? new Str("char", {})).really();
  }
  protected decode($: string, row: Row): { [key: string]: As<A> } | symbol {
    const a = length($, this.min, this.max);
    if (typeof a === "symbol") return a;
    const b: { [key: string]: As<A> } = {}, c: Json[] = [];
    for (let z = 0; z < a; ++z) {
      const d = this.keys.parse(row);
      if (typeof d === "symbol") c[z] = open(d);
      else if (d in b) c[z] = "typeMismatch";
      else if (typeof (b[d] = this.kind.parse(row)) === "symbol") {
        c[z] = [d, open(b[d])];
      }
    }
    return this.result(a, b, c);
  }
  protected encode($: { [key: string]: As<A> }, row: Row): string {
    const a = Object.keys($);
    for (let z = 0; z < a.length; ++z) {
      row.push(a[z]), row.push.apply(row, this.kind.stringify($[a[z]]));
    }
    return a.length.toString(36);
  }
}
class Obj<A extends { [key: string]: Type<{}, any> }>
  extends Type<A, { [B in keyof A]: As<A[B]> }> {
  /** List of field keys. */
  readonly keys: (keyof A & string)[];
  constructor(kind: A) {
    super(kind);
    this.keys = Object.keys(kind) as (keyof A & string)[];
  }
  protected decode($: string, row: Row): { [B in keyof A]: As<A[B]> } | symbol {
    const a = length($, this.keys.length, this.keys.length);
    if (typeof a === "symbol") return a;
    const b = {} as { [B in keyof A]: As<A[B]> };
    const c: { [key: string]: Json } = {};
    for (let z = 0, d: keyof A & string; z < a; ++z) {
      if (typeof (b[d = this.keys[z]] = this.kind[d].parse(row)) === "symbol") {
        c[d] = open(b[d]);
      }
    }
    if (Object.keys(c).length) return wrap(c);
    return b;
  }
  protected encode($: { [B in keyof A]: As<A[B]> }, row: Row): string {
    for (let z = 0; z < this.keys.length; ++z) {
      row.push.apply(row, this.kind[this.keys[z]].stringify($[this.keys[z]]));
    }
    return this.keys.length.toString(36);
  }
}

const a = Type.obj({
  a: Type.opt([""]),
  b: Type.key("pkey"),
  c: Type.key("skey"),
  d: Type.iso("time"),
  e: Type.iso("date"),
  f: Type.num("uint"),
  g: Type.num("real"),
});
const b = Type.obj({
  h: Type.str("char").maybe(),
  i: Type.str("text"),
  j: Type.vec(Type.num("uint")),
  k: Type.map(Type.iso("time")),
  l: Type.obj({ char: Type.str("char") }),
});
const c = Type.obj({
  ...b.kind,
  ...a.kind,
});
type C = As<typeof c>;
