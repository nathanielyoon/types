import { b_s64, normalize, s64_b } from "./encoding.ts";
import { wrap } from "./wrap.ts";

type MinMax = { min?: number; max?: number };
type Types = { [key: string]: Type };
export type Type =
  | { kind: "choice"; optional?: boolean; meta: readonly [string, ...string[]] }
  | { kind: "number"; optional?: boolean; meta?: MinMax & { step?: number } }
  | { kind: "string"; optional?: boolean; meta?: MinMax & { pattern?: string } }
  | { kind: "binary"; optional?: boolean; meta?: MinMax & { step?: number } }
  | { kind: [Type]; optional?: boolean; meta?: MinMax & { unique?: boolean } }
  | { kind: Types; optional?: boolean; meta?: never };
export type Data<A extends Type> =
  | (A extends { optional: true } ? null : never)
  | (A extends { kind: [infer B extends Type] } ? Data<B>[]
    : A extends { kind: infer B extends { [key: string]: Type } }
      ? { [C in keyof B]: Data<B[C]> }
    : A extends { meta: infer B extends readonly string[] } ? B[number]
    : A extends { kind: "number" } ? number
    : A extends { kind: "string" } ? string
    : A extends { kind: "binary" } ? Uint8Array
    : never);
type Flag = Exclude<keyof ValidityStateFlags, "customError">;
abstract class Typer<A extends Type> {
  protected null;
  constructor(public type: A) {
    this.null = type.optional ? null as Data<A> : wrap<Flag>("valueMissing");
  }
  abstract row_data(row: (string | null)[]): Data<A> | symbol;
  abstract data_row(row: (string | null)[], $: Data<A>): void;
}
class Choice<A extends Extract<Type, { kind: "choice" }>> extends Typer<A> {
  private has;
  constructor(type: A) {
    super(type);
    this.has = Set.prototype.has.bind(new Set(type.meta));
  }
  row_data(row: (string | null)[]) {
    const a = row.shift();
    if (a == null) return this.null;
    if (!this.has(a)) return wrap<Flag>("badInput");
    return a as Data<A>;
  }
  data_row(row: (string | null)[], $: Data<A>) {
    row.push($);
  }
}
const clamp = ($: MinMax | undefined, min = 0, max = 65535) => {
  const a = $?.min ?? min, b = $?.max ?? max;
  return [Math.min(a, b), Math.max(a, b)];
};
class Number<A extends Extract<Type, { kind: "number" }>> extends Typer<A> {
  private min;
  private max;
  private step;
  constructor(type: A) {
    super(type);
    [this.min, this.max] = clamp(
      type.meta,
      -1.7976931348623157e+308,
      1.7976931348623157e+308,
    );
    this.step = type.meta?.step ?? 0;
  }
  row_data(row: (string | null)[]) {
    const a = row.shift();
    if (a == null) return this.null;
    if (!a.trim()) return wrap<Flag>("badInput");
    const b = +a;
    if (isNaN(b)) return wrap<Flag>("badInput");
    if (b < this.min) return wrap<Flag>("rangeUnderflow");
    if (b > this.max) return wrap<Flag>("rangeOverflow");
    if (b % this.step) return wrap<Flag>("stepMismatch");
    return b as Data<A>;
  }
  data_row(row: (string | null)[], $: Data<A>) {
    row.push($ == null ? $ : `${$}`);
  }
}
class String<A extends Extract<Type, { kind: "string" }>> extends Typer<A> {
  private min;
  private max;
  private test;
  constructor(type: A) {
    super(type);
    [this.min, this.max] = clamp(type.meta);
    try {
      if (type.meta?.pattern) {
        this.test = RegExp.prototype.test.bind(RegExp(type.meta.pattern));
      }
    } catch {
      this.test = null;
    }
  }
  row_data(row: (string | null)[]) {
    const a = row.shift();
    if (a == null) return this.null;
    if (a !== normalize(a)) return wrap<Flag>("badInput");
    if (a.length < this.min) return wrap<Flag>("tooShort");
    if (a.length > this.max) return wrap<Flag>("tooLong");
    if (this.test?.(a) === false) return wrap<Flag>("patternMismatch");
    return a as Data<A>;
  }
  data_row(row: (string | null)[], $: Data<A>) {
    row.push($);
  }
}
class Binary<A extends Extract<Type, { kind: "binary" }>> extends Typer<A> {
  private min;
  private max;
  private step;
  constructor(type: A) {
    super(type);
    [this.min, this.max] = clamp(type.meta), this.step = type.meta?.step ?? 0;
  }
  row_data(row: (string | null)[]) {
    const a = row.shift();
    if (a == null) return this.null;
    if (/[^-\w]/.test(a)) return wrap<Flag>("badInput");
    const b = s64_b(a);
    if (b.length < this.min) return wrap<Flag>("tooShort");
    if (b.length > this.max) return wrap<Flag>("tooLong");
    if (b.length % this.step) return wrap<Flag>("stepMismatch");
    return b as Data<A>;
  }
  data_row(row: (string | null)[], $: NonNullable<Data<A>>) {
    row.push(b_s64($));
  }
}
class Vector<A extends Extract<Type, { kind: [Type] }>> extends Typer<A> {
  private min;
  private max;
  private unique;
  private typer;
  constructor(type: A) {
    super(type);
    [this.min, this.max] = clamp(type.meta), this.unique = type.meta?.unique;
    this.typer = typer<Type>(type.kind[0]);
  }
  row_data(row: (string | null)[]) {
    const a = row.shift();
    if (a == null) return this.null;
    if (!a.trim()) return wrap<Flag>("badInput");
    const b = parseInt(a, 36);
    if (isNaN(b)) return wrap<Flag>("badInput");
    if (b < this.min) return wrap<Flag>("tooShort");
    if (b > this.max) return wrap<Flag>("tooLong");
    const c = Array(b), d: (symbol | null)[] = [];
    for (let z = 0; z < b; ++z) {
      const e = c[z] = this.typer.row_data(row);
      if (typeof e === "symbol") d[z] = e;
    }
    if (d.length) {
      for (let z = 0; z < b; ++z) d[z] ??= null;
      return wrap(d);
    }
    if (this.unique) {
      for (let z = 0, d = new Set<string>(); z < b; ++z) {
        if (d.size === d.add(JSON.stringify(c[z])).size) {
          return wrap<Flag>("typeMismatch");
        }
      }
    }
    return c as Data<A>;
  }
  data_row(row: (string | null)[], $: Data<A>) {
    if ($ == null) return row.push(null);
    row.push($.length.toString(36));
    for (let z = 0; z < $.length; ++z) this.typer.data_row(row, $[z]);
  }
}
class Record<A extends Extract<Type, { kind: Types }>> extends Typer<A> {
  private keys;
  private typers;
  length;
  constructor(type: A) {
    super(type);
    this.keys = Object.keys(type.kind), this.length = this.keys.length;
    this.typers = Array<Typer<Type>>(this.length);
    for (let z = 0; z < this.length; ++z) {
      this.typers[z] = typer(type.kind[this.keys[z]]);
    }
  }
  row_data(row: (string | null)[]) {
    const a = row.shift();
    if (a == null) return this.null;
    if (!a.trim()) return wrap<Flag>("badInput");
    const b = parseInt(a, 36);
    if (isNaN(b)) return wrap<Flag>("badInput");
    if (b !== this.length) return wrap<Flag>("typeMismatch");
    const c: { [key: string]: unknown } = {}, d: (symbol | null)[] = [];
    for (let z = 0; z < this.length; ++z) {
      const e = c[this.keys[z]] = this.typers[z].row_data(row);
      if (typeof e === "symbol") d[z] = e;
    }
    if (d.length) {
      for (let z = 0; z < b; ++z) d[z] ??= null;
      return wrap(d);
    }
    return c as Data<A>;
  }
  data_row(row: (string | null)[], $: Data<A>) {
    if ($ == null) return row.push(null);
    row.push(this.length.toString(36));
    for (let z = 0; z < this.length; ++z) {
      this.typers[z].data_row(row, $[this.keys[z]]);
    }
  }
}
const vec = ($: Type): $ is Extract<Type, { kind: [Type] }> =>
  Array.isArray($.kind);
const rec = ($: Type): $ is Extract<Type, { kind: Types }> =>
  typeof $.kind === "object";
export const typer = <A extends Type>(type: A): Typer<A> => {
  if (vec(type)) return new Vector(type);
  if (rec(type)) return new Record(type);
  switch (type.kind) { // TODO figure out this type
    case "choice":
      return new Choice(type) as unknown as Typer<A>;
    case "number":
      return new Number(type) as unknown as Typer<A>;
    case "string":
      return new String(type) as unknown as Typer<A>;
    case "binary":
      return new Binary(type) as unknown as Typer<A>;
  }
};
