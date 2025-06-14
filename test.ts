import { Row } from "jsr:@nyoon/csv@^1.0.9";
import { assert, assertEquals } from "jsr:@std/assert@^1.0.13";
import fc from "npm:fast-check@^4.1.1";
import {
  bin,
  flag,
  Infer,
  Json,
  num,
  obj,
  open,
  opt,
  RANGE,
  str,
  Type,
  vec,
} from "./mod.ts";
import * as mod from "./mod.ts";

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
const all: [Type, Row[], readonly [Row, Json][]][] = [];
const test = <
  A extends keyof Omit<typeof mod, "flag" | "open" | "MIN_MAX">,
  B extends [Parameters<typeof mod[A]>, Infer<ReturnType<typeof mod[A]>>],
>(
  name: A,
  params: fc.Arbitrary<B>,
  ok: (...$: B) => Generator<Row>,
  no: (...$: B) => Generator<readonly [Row, Json]>,
) =>
  Deno.test(name, () =>
    fc.assert(
      fc.property(params, ($) => {
        const a = mod[name] as (...$: any) => Type, b = a(...$[0]);
        all.push([
          b,
          Array.from(ok(...$), assert_ok(b)),
          Array.from(no(...$), ([row, json]) => {
            const c = b.decode([...row]);
            assert(typeof c === "symbol"), assertEquals(open(c), json);
            return [row, json];
          }),
        ]);
        all.push([b, [], [[[null], "valueMissing"]]]);
        const c = a($[0][0], { ...$[0][1], optional: true });
        all.push([c, [assert_ok(c)([null])], []]);
      }),
      { numRuns: 16 },
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
  function* ([kind, meta]) {
    yield* kind.map(($) => [$]);
  },
  function* ([kind, meta]) {
    yield* kind.map<[string[], Json]>(($) => [[$ + "!"], "badInput"])
      .filter(($) => !kind.includes($[0][0]));
  },
);
const is = <A>($?: A): $ is A => !!$ && Object.values($).some(($) => $ != null);
const fc_num = ([
  ["uint", ($: number) => $ >>> 0],
  ["time", ($: number) => Math.floor(Math.abs($)) % 2 ** 48],
  ["real", ($: number) => $],
] as const).reduce(($, [kind, map]) => ({
  ...$,
  [kind]: fc.double({ noDefaultInfinity: true, noNaN: true }).map(map),
}), {} as { [_ in Parameters<typeof num>[0]]: fc.Arbitrary<number> });
const n_s = (kind: keyof typeof fc_num, $: number) =>
  $.toString(kind === "real" ? 10 : 16).padStart(kind === "time" ? 12 : 0, "0");
test(
  "num",
  fc.oneof(
    ...(Object.entries(fc_num) as [keyof typeof fc_num, fc.Arbitrary<number>][])
      .map(([kind, $]) =>
        fc.tuple(fc_type(kind, { min: $, max: $, step: $ }), $)
      ),
  ),
  function* ([kind, meta], $) {
    if (is(meta)) {
      if (meta.min! > meta.max! || meta.step === 0) return; // nothing matches
      const a = (["min", "max", "step"] as const).map(($) => meta[$] != null);
      const [b, c] = RANGE[kind];
      const d = Math.max(meta.min ?? b, b), e = Math.min(meta.max ?? c, c);
      const f = Math.min(d, e), g = Math.max(d, e);
      const h = Math.abs(meta.step ?? Math.floor((g - f) / 10));
      const i = Math.min(g, f + h * 10);
      for (let z = f; z < i; z += h) if (z % h === 0) yield [n_s(kind, z)];
    } else yield [n_s(kind, $)];
  },
  function* ([kind, meta]) {
    yield* ["", " ", "z"].map<[Row, Json]>(($) => [[$], "badInput"]);
    // const [a, b] = MIN_MAX[kind];
    // if (is(meta)) {
    //   if (meta?.min != null && meta.min > a) {
    //     yield* [a, meta.min - 1].map<[Row, Json]>(
    //       ($) => [[n_s(kind, $)], "rangeUnderflow"],
    //     );
    //   }
    // }
  },
);
Deno.test("all", () => {
  const a: { [key: string]: Type } = {}, b = Array<Row>(all.length);
  for (let z = 0; z < all.length; ++z) {
    a[z] = vec(all[z][0]);
    b[z] = [all[z][1].length.toString(36), ...all[z][1].flat()];
  }
  const c = obj(a), d = b.length.toString(36), e = c.decode([d, ...b.flat()]);
  assert(typeof e !== "symbol"), assertEquals(c.encode(e), [d, ...b.flat()]);
  for (let z = 0; z < all.length; ++z) {
    for (let y = 0, f = all[z][2]; y < f.length; ++y) {
      const g = c.decode([d, ...b.with(z, ["1", ...f[y][0]]).flat()]);
      assert(typeof g === "symbol"), assertEquals(open(g), { [z]: [f[y][1]] });
    }
  }
});
