import { Row } from "jsr:@nyoon/csv@^1.0.9";
import { assert, assertEquals } from "jsr:@std/assert@^1.0.13";
import fc from "npm:fast-check@^4.1.1";
import {
  clamp,
  flag,
  Infer,
  Json,
  normalize,
  num,
  obj,
  open,
  opt,
  RANGE,
  Type,
  vec,
} from "./mod.ts";
import * as mod from "./mod.ts";
import { b_s64 } from "@nyoon/base";

Deno.test("flag", () => {
  assertEquals(open(Symbol("")), null);
  fc.assert(fc.property(
    fc.jsonValue().filter(($): $ is Json => typeof $ !== "boolean"),
    ($) => assertEquals(open(flag($)), $),
  ));
});
const assert_ok = (type: Type) => ($: Row) => {
  const a = type.decode([...$]);
  try {
    assert(typeof a !== "symbol");
  } catch (thrown) {
    console.log([$, open(a)]);
    throw thrown;
  }
  assertEquals(type.encode(a), $);
  return $;
};
const assert_no = (type: Type) => ($: [Row, Json]) => {
  const a = type.decode([...$[0]]);
  try {
    assert(typeof a === "symbol");
  } catch (thrown) {
    console.log([$, a]);
    throw thrown;
  }
  assertEquals(open(a), $[1]);
  return $;
};
const all: [Type, Row[], readonly [Row, Json][]][] = [];
const test = <
  A extends keyof Omit<
    typeof mod,
    "flag" | "open" | "RANGE" | "normalize" | "clamp"
  >,
  B extends [Parameters<typeof mod[A]>, Infer<ReturnType<typeof mod[A]>>],
>(
  name: A,
  params: fc.Arbitrary<B>,
  ok: (...$: B) => Generator<Row>,
  no: (...$: B) => Generator<[Row, Json]>,
  runs: number,
) =>
  Deno.test(name, () =>
    fc.assert(
      fc.property(params, ($) => {
        const a = mod[name] as (...$: any) => Type, b = a(...$[0]);
        all.push([
          b,
          Array.from(ok(...$), assert_ok(b)),
          Array.from(no(...$), assert_no(b)),
        ]);
        all.push([b, [], [[[null], "valueMissing"]]]);
        const c = a($[0][0], { ...$[0][1], optional: true });
        all.push([c, [assert_ok(c)([null])], []]);
      }),
      { numRuns: runs, seed: 2057048634 },
    ));
const fc_type = <A, B>(kind: A, meta: { [C in keyof B]: fc.Arbitrary<B[C]> }) =>
  fc.tuple(
    fc.constant(kind),
    fc.option(fc.record(meta, { requiredKeys: [] }), { nil: undefined }),
  );
test(
  "opt",
  fc.uniqueArray(fc.string(), { minLength: 1 }).chain(([$, ...$$]) =>
    fc.tuple(
      fc_type([$, ...$$] as const, {}),
      fc.constantFrom($, ...$$),
    )
  ),
  function* ([kind]) {
    yield* kind.map(($) => [$]);
  },
  function* ([kind]) {
    yield* kind.map<[string[], Json]>(($) => [[$ + "!"], "badInput"])
      .filter(($) => !kind.includes($[0][0]));
  },
  8,
);
const fc_step = fc.nat({ max: 8 });
const is = <A>($?: A): $ is A => !!$ && Object.values($).some(($) => $ != null);
const fc_num = ([
  ["uint", ($: number) => $ >>> 0],
  ["time", ($: number) => Math.floor(Math.abs($)) % 2 ** 48],
  ["real", ($: number) => $],
] as const).reduce(($, [kind, map]) => ({
  ...$,
  [kind]: fc.double({ noDefaultInfinity: true, noNaN: true }).map(map),
}), {} as { [_ in Parameters<typeof num>[0]]: fc.Arbitrary<number> });
const n_s = (kind: Parameters<typeof num>[0], $: number) =>
  $.toString(kind === "real" ? 10 : 16).padStart(kind === "time" ? 12 : 0, "0");
test(
  "num",
  fc.oneof(
    ...(Object.entries(fc_num) as [keyof typeof fc_num, fc.Arbitrary<number>][])
      .map(([kind, $]) =>
        fc.tuple(fc_type(kind, { min: $, max: $, step: fc_step }), $)
      ),
  ),
  function* ([kind, meta], $) {
    if (!is(meta)) return yield [n_s(kind, $)];
    const [a, b] = clamp(RANGE[kind], meta);
    switch (meta.step) {
      case undefined:
      case 0:
        return yield* [[n_s(kind, a)], [n_s(kind, b)]];
      default:
        yield* [a + meta.step, b]
          .reduce<Row[]>((all, $) => {
            const c = $ - $ % meta.step!;
            c >= a && c <= b && !(c % meta.step!) && all.push([n_s(kind, c)]);
            return all;
          }, []);
    }
  },
  function* ([kind, meta]) {
    yield* ["", " ", "z"].map<[Row, Json]>(($) => [[$], "badInput"]);
    if (!is(meta)) {
      if (kind === "real") {
        return yield* ["-", ""].map<[Row, Json]>(
          ($, z) => [[`${$}Infinity`], `range${z ? "Ov" : "Und"}erflow`],
        );
      } else return yield [["1000000000000"], "rangeOverflow"];
    }
    const [a, b] = clamp(RANGE[kind], meta), c = a - 1, d = b + 1;
    if (c < a && c >= RANGE[kind][0]) yield [[n_s(kind, c)], "rangeUnderflow"];
    if (d > b && d <= RANGE[kind][1]) yield [[n_s(kind, d)], "rangeOverflow"];
    if (meta.step) {
      yield* [a + meta.step, b - meta.step].filter(($) =>
        $ % meta.step! && $ >= a && $ <= b
      ).map<[Row, Json]>(($) => [[n_s(kind, $)], "stepMismatch"]);
    }
  },
  256,
);
test(
  "str",
  fc.constantFrom("char", "text").chain(($) =>
    fc.tuple(fc.nat({ max: RANGE[$][1] }), fc.nat({ max: RANGE[$][1] }))
      .chain(([min, max]) =>
        fc_type($, {
          min: fc.constant(min),
          max: fc.constant(max),
          pattern: fc.uint8Array({ min: 33, max: 126, minLength: 1 }).map(($) =>
            RegExp(`^[${
              $.reduce((string, code) => string + String.fromCharCode(code), "")
                .replace(/[$(-+-./?[-^{|}]/g, "\\&$")
            }]{1,255}$`)
          ),
        })
      ).chain((type) =>
        fc.tuple(
          fc.constant(type),
          type[1]?.pattern
            ? fc.stringMatching(type[1].pattern)
            : fc.string({ unit: "grapheme", maxLength: RANGE[type[0]][0] })
              .map(normalize),
        )
      )
  ),
  function* ([kind, meta], $) {
    if (!is(meta)) return yield [$];
    const [a, b] = clamp(RANGE[kind], meta), c = (b - a) >> 1 || 1;
    for (let d = "\0".repeat(a); d.length < b; d += "\0".repeat(c)) {
      if (meta.pattern?.test(d) !== false) yield [d];
    }
  },
  function* ([kind, meta], $) {
    const [a, b] = clamp(RANGE[kind], meta ?? {});
    if (a) yield [["\0".repeat(a - 1)], "tooShort"];
    if (b) yield [["\0".repeat(b + 1)], "tooLong"];
    if (meta?.pattern && !a) yield [[""], "patternMismatch"];
  },
  64,
);
const s64 = (length: number) => b_s64(new Uint8Array(length));
test(
  "bin",
  fc.oneof(
    fc.tuple(
      fc_type("pkey" as const, {}),
      fc.uint8Array({ minLength: 32, maxLength: 32 }),
    ),
    fc_type("blob" as const, {
      min: fc.nat({ max: RANGE.blob[1] }),
      max: fc.nat({ max: RANGE.blob[1] }),
      step: fc_step,
    }).chain((type) => {
      const [a, b] = clamp(RANGE.blob, type[1] ?? {});
      return fc.tuple(
        fc.constant(type),
        fc.uint8Array({ minLength: b, maxLength: b }),
      );
    }),
  ),
  function* ([kind, meta], $) {
    if (kind === "pkey" || !is(meta)) return yield [b_s64($)];
    const [a, b] = clamp(RANGE[kind], meta);
    switch (meta.step) {
      case undefined:
      case 0:
        return yield* [a, b].map((length) => [b_s64($.subarray(0, length))]);
      default:
        yield* [a + meta.step, b]
          .reduce<Row[]>((all, length) => {
            const c = length - length % meta.step!;
            c >= a && c <= b && !(c % meta.step!) &&
              all.push([b_s64($.subarray(0, c))]);
            return all;
          }, []);
    }
  },
  function* ([kind, meta], $) {
    yield [["\0"], "badInput"];
    if (!is(meta)) {
      return yield* kind === "pkey"
        ? [[[s64(32 + 1)], "tooLong"], [[s64(32 - 1)], "tooShort"]]
        : [[[s64(0xffff + 1)], "tooLong"]];
    }
    const [a, b] = clamp(RANGE[kind], meta), c = a - 1, d = b + 1;
    if (c < a && c >= RANGE[kind][0]) yield [[s64(c)], "tooShort"];
    if (d > b && d <= RANGE[kind][1]) yield [[s64(d)], "tooLong"];
    const e = (meta as { step?: number }).step;
    if (e) {
      yield* [e - 1, e + 1].filter(($) => $ % e && $ >= a && $ <= b)
        .map<[Row, Json]>(($) => [[s64($)], "stepMismatch"]);
    }
  },
  64,
);
Deno.test("vec", () => {
  const a = vec(opt(["0", "1"]), { min: 1, max: 2, unique: true });
  [
    ["1", "0"],
    ["1", "1"],
    ["2", "0", "1"],
    ["2", "1", "0"],
  ].forEach(assert_ok(a));
  ([
    [[""], "badInput"],
    [[" "], "badInput"],
    [["0.1"], "badInput"],
    [["-1"], "badInput"],
    [["0"], "tooShort"],
    [["3"], "tooLong"],
    [["1", "2"], ["badInput"]],
    [["2", "0", "2"], [null, "badInput"]],
    [["2", "2", "0"], ["badInput", null]],
    [["2", "0", "0"], "typeMismatch"],
  ] satisfies [Row, Json][]).forEach(assert_no(a));
  assert_no(a)([[null], "valueMissing"]);
  const b = vec(opt([""], { optional: true }), { optional: true });
  assert_ok(b)([null]);
  assert_ok(b)(["1", null]);
});
Deno.test("obj", () => {
  const a = obj({
    0: opt(["0"], { optional: true }),
    1: opt(["1"], { optional: true }),
    2: opt(["2"], { optional: true }),
  }, { min: 1, max: 2 });
  [
    ["3", "0", null, null],
    ["3", null, "1", null],
    ["3", null, null, "2"],
    ["3", "0", "1", null],
    ["3", "0", null, "2"],
    ["3", null, "1", "2"],
  ].forEach(assert_ok(a));
  ([
    [[""], "badInput"],
    [[" "], "badInput"],
    [["0.1"], "badInput"],
    [["-1"], "badInput"],
    [["0"], "typeMismatch"],
    [["3", null, null, null], "tooShort"],
    [["3", "0", "1", "2"], "tooLong"],
    [["3", "0", "4", null], { 1: "badInput" }],
  ] satisfies [Row, Json][]).forEach(assert_no(a));
});
Deno.test("all", () => {
  const a: { [key: string]: Type } = {}, b = Array<Row>(all.length);
  for (let z = 0; z < all.length; ++z) {
    a[z] = vec(all[z][0]);
    b[z] = [all[z][1].length.toString(36), ...all[z][1].flat()];
  }
  const c = obj(a), d = b.length.toString(36);
  assert_ok(c)([d, ...b.flat()]);
  for (let z = 0; z < all.length; ++z) {
    const e = all[z][2][0];
    e && assert_no(c)(
      [[d, ...b.with(z, ["1", ...e[0]]).flat()], { [z]: [e[1]] }],
    );
  }
});
