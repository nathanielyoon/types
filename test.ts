import { Row } from "jsr:@nyoon/csv@^1.0.9";
import { Word } from "jsr:@nyoon/schema@1.0.0";
import { assertEquals, assertNotEquals } from "jsr:@std/assert@^1.0.13";
import fc from "npm:fast-check@^4.1.1";
import {
  fix,
  iso,
  Json,
  key,
  make,
  map,
  num,
  obj,
  open,
  opt,
  str,
  Type,
  vec,
  wrap,
} from "./mod.ts";
import { b_s64 } from "@nyoon/base";

Deno.test("symbol", () => {
  assertEquals(open(Symbol("")), null);
  fc.assert(fc.property(
    fc.jsonValue().filter(($): $ is Json => typeof $ !== "boolean"),
    ($) => assertEquals(open(wrap($)), $),
  ));
});
Deno.test("fix", () => {
  assertNotEquals(fix("ñ"), "ñ".normalize("NFD"));
  assertNotEquals(fix("ñ"), "ñ".normalize("NFKD"));
  Array.from({ length: 0x10000 }, (_, $) => String.fromCharCode($))
    .filter(($) => !$.isWellFormed())
    .forEach(($) => assertEquals(fix($), "\ufffd"));
  ["\r\n", "\u2028", "\u2029"].forEach(($) => assertEquals(fix($), "\n"));
  [
    0x0020,
    0x00a0,
    0x1680,
    ...Array.from({ length: 11 }, (_, $) => $ + 0x2000),
    0x202f,
    0x205f,
    0x3000,
  ].forEach(($) => assertEquals(fix(String.fromCharCode($)), " "));
});
type Rowish = Row | string | null;
const assert_ok = <A>(type: Type<{}, A>, row: Row) => {
  const a = type.decode([...row]);
  if (typeof a === "symbol") throw open(a);
  assertEquals(type.encode(a), row);
  return a;
};
const assert_no = (type: Type, [row, json]: [Row, Json]) => {
  const a = type.decode(row);
  if (typeof a !== "symbol") throw a;
  assertEquals(open(a), json);
};
Deno.test("nil", () =>
  ([opt(["ok"]), vec(iso("date")), map(num("uint"))] as Type[]).forEach(($) => {
    assert_no($, [[null], "valueMissing"]);
    assert_ok($.maybe(), [null]);
    assert_no($.really(), [[null], "valueMissing"]);
  }));
Deno.test("hook", async () => {
  const a = fc.tuple(fc.boolean(), fc.boolean(), fc.nat());
  fc.assert(fc.property(a, ([condition_0, condition_1, $]) => {
    const b = num("uint")
      .on("decode_0", ($) => condition_0 ? $[0] = `${+$[0]! + 1}` : wrap($[0]))
      .on("decode_1", ($) => condition_1 ? $ - 1 : wrap(`${$}`));
    if (!condition_0) assert_no(b, [[`${$}`], `${$}`]);
    else if (!condition_1) assert_no(b, [[`${$}`], `${$ + 1}`]);
    else assert_ok(b, [`${$}`]);
  }));
  fc.assert(fc.property(a, ([condition_0, condition_1, $]) => {
    const b = num("uint")
      .on("encode_0", ($) => condition_0 ? $ + 1 : $)
      .on("encode_1", ($) => condition_1 && ($[0] = `${+$[0]! - 1}`))
      .encode($)[0];
    if (condition_0 === condition_1) assertEquals(b, `${$}`);
    else if (condition_0) assertEquals(b, `${$ + 1}`);
    else if (condition_1) assertEquals(b, `${$ - 1}`);
  }));
  fc.assert(fc.property(a, ([condition_0, condition_1, $]) => {
    const b = num("uint")
      .on("decode_0", () => condition_0 || wrap(0))
      .on("decode_0", () => condition_1 || wrap(1))
      .on("decode_1", ($) => condition_0 ? $ : wrap(0))
      .on("decode_1", ($) => condition_1 ? $ : wrap(1));
    if (condition_0 && condition_1) assertEquals(b.decode([`${$}`]), $);
    else assert_no(b, [[`${$}`], condition_0 ? 1 : 0]);
  }));
});
const assert = <A extends [unknown, ...unknown[]]>(
  ...args: [
    ...arbitraries: { [B in keyof A]: fc.Arbitrary<A[B]> },
    transform: (...$$: A) => [Type, Rowish[], [Rowish, Json][]],
  ]
) =>
  fc.assert(fc.property(
    ...args.slice(0, -1) as { [B in keyof A]: fc.Arbitrary<A[B]> },
    (...$$) => {
      const a = (args[args.length - 1] as (...$: A) => any)(...$$);
      for (const $ of a[1]) assert_ok(a[0], Array.isArray($) ? $ : [$]);
      for (const [row, json] of a[2]) {
        assert_no(a[0], [Array.isArray(row) ? row : [row], json]);
      }
    },
  ));
Deno.test("opt", () => {
  const a = <A>($: fc.Arbitrary<A>) =>
    fc.uniqueArray($, { minLength: 1 }) as fc.Arbitrary<[A, ...A[]]>;
  assert(a(fc.string()), (kind) => [
    opt(kind),
    kind,
    kind.reduce<[Row, Json][]>(
      (no, $) => kind.includes($ += "!") ? no : [...no, [[$], "badInput"]],
      [],
    ),
  ]);
  const b = Array.from({ length: 32 }, (_, z) => z) as [Word, ...Word[]];
  assert(a(fc.nat({ max: 31 }) as fc.Arbitrary<Word>), (kind) => [
    opt(kind),
    kind.map((_, z) =>
      kind.slice(z).reduce<number>(($$, $) => ($$ | 1 << $) >>> 0, 0)
        .toString(16)
    ),
    [
      ...["", "00", "!"].map<[Row, Json]>(($) => [[$], "badInput"]),
      ...b.filter(($) => !kind.includes($)).map<[Row, Json]>(
        ($) => [[(1 << $).toString(16)], "typeMismatch"],
      ),
    ],
  ]);
  const c = assert_ok(opt(b), ["f".repeat(8)]);
  for (const $ of b) assertEquals(c.has($), 1);
});
Deno.test("key", () =>
  assert(
    fc.constantFrom("pkey", "skey"),
    fc.uint8Array({ minLength: 32, maxLength: 32 }).map(b_s64),
    fc.oneof(
      fc.uint8Array({ maxLength: 31 }),
      fc.uint8Array({ minLength: 33 }),
    ).map(b_s64),
    (kind, ok, no) => [key(kind), [ok], [[no, "badInput"]]],
  ));
