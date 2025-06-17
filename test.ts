import {
  assert,
  assertEquals,
  assertGreaterOrEqual,
  assertLessOrEqual,
  assertNotEquals,
} from "jsr:@std/assert@^1.0.13";
import fc from "npm:fast-check@^4.1.1";
import {
  clamp,
  flag,
  Json,
  normalize,
  num,
  obj,
  open,
  opt,
  RANGE,
  str,
  Type,
  vec,
} from "./mod.ts";
import { Row } from "jsr:@nyoon/csv@^1.0.9";

Deno.test("symbol", () => {
  assertEquals(open(Symbol("")), null);
  fc.assert(fc.property(
    fc.jsonValue().filter(($): $ is Json => typeof $ !== "boolean"),
    ($) => assertEquals(open(flag($)), $),
  ));
});
Deno.test("normalize", () => {
  assertNotEquals(normalize("ñ"), "ñ".normalize("NFD"));
  assertNotEquals(normalize("ñ"), "ñ".normalize("NFKD"));
  Array.from({ length: 0x10000 }, (_, $) => String.fromCharCode($))
    .filter(($) => !$.isWellFormed())
    .forEach(($) => assertEquals(normalize($), "\ufffd"));
  ["\r\n", "\u2028", "\u2029"].forEach(($) => assertEquals(normalize($), "\n"));
  [
    0x0020,
    0x00a0,
    0x1680,
    ...Array.from({ length: 11 }, (_, $) => $ + 0x2000),
    0x202f,
    0x205f,
    0x3000,
  ].forEach(($) => assertEquals(normalize(String.fromCharCode($)), " ")); // as(
});
const fc_number = (constraints: fc.DoubleConstraints = {}) =>
  fc.double({ noDefaultInfinity: true, noNaN: true, ...constraints });
Deno.test("clamp", () =>
  fc.assert(fc.property(
    fc.tuple(fc_number(), fc_number()).map(($) =>
      $[0] > $[1] ? [$[1], $[0]] as const : $
    ),
    fc.record({ min: fc_number(), max: fc_number() }),
    (range, meta) => {
      const [a, b] = clamp(range, meta);
      assertGreaterOrEqual(a, range[0]), assertLessOrEqual(b, range[1]);
      assertLessOrEqual(a, b);
    },
  )));
const all: [Type, ok: Row[], no: [Row, Json][]][] = [];
type Falsy = undefined | null | false | 0 | 0n | "";
const assert_type =
  (type: Type) => (ok: (Row | Falsy)[], no: ([Row, Json] | Falsy)[]) => {
    const a = ok.filter(($) => Array.isArray($));
    for (const row of a) {
      const b = type.parse([...row]);
      try {
        assert(typeof b !== "symbol");
      } catch ($) {
        console.log({ type, row, data: b });
        throw $;
      }
      assertEquals(type.stringify(b), row);
    }
    const b = no.filter(($) => Array.isArray($));
    for (const [row, json] of b) {
      const c = type.parse([...row]);
      try {
        assert(typeof c === "symbol");
      } catch ($) {
        console.log({ type, row, data: c });
        throw $;
      }
      assertEquals(open(c), json);
    }
    all.push([type, a, b]);
  };
Deno.test("nil", () =>
  [
    opt([""]).really(),
    num("uint").maybe(),
    str("pkey").really(),
    vec("time").maybe(),
    obj({ char: "char" }),
  ].forEach(($, z) =>
    assert_type($)([z & 1 && [null]], [z & 1 ^ 1 && [[null], "valueMissing"]])
  ));
Deno.test("hook", async ($) => {
  const step = <A extends keyof Type["hooks"]>(
    on: A,
    hook: ($: boolean) => Type["hooks"][A],
  ) =>
    $.step(on, () =>
      fc.assert(fc.property(fc.boolean(), (ok) => {
        const a = hook(ok), b = num("real").on(on, a);
        if (on.endsWith("parse")) {
          const c = b.parse(["0"]);
          if (ok) assertEquals(c, 1);
          else assert(typeof c === "symbol"), assertEquals(open(c), ["0"]);
        } else assertEquals(b.stringify(0), [ok ? "1" : "0"]);
      })));
  await step("pre_parse", (ok) => ($) => ok ? $.unshift("1") : flag($));
  await step("post_parse", (ok) => ($) => ok ? $ + 1 : flag([`${$}`]));
  await step("pre_stringify", (ok) => ($) => ok ? $ + 1 : $);
  await step("post_stringify", (ok) => ($) => ok && ($[0] = `${+$[0]! + 1}`));
  fc.assert(fc.property(
    fc.boolean(),
    fc.boolean(),
    fc_number(),
    (one, two, $) =>
      assert_type(
        num("real")
          .on("post_parse", ($) => one ? $ : flag(1))
          .on("post_parse", ($) => two ? $ : flag(2)),
      )(
        [one && two && [`${$}`]],
        [!one && [[`${$}`], 1] || !two && [[`${$}`], 2]],
      ),
  ));
});
Deno.test("opt", () =>
  fc.assert(
    fc.property(fc.uniqueArray(fc.string(), { minLength: 1 }), (kind) =>
      assert_type(opt(kind as [string, ...string[]]))(
        kind.map(($) => [$]),
        kind.reduce(
          (no, $) =>
            kind.includes($ += "!") ? no : [...no, [[$], "badInput"]],
          [] as [Row, Json][],
        ),
      )),
  ));
Deno.test("num", () =>
  ([["uint", Math.floor], ["time", Math.floor], ["real", Number]] as const)
    .forEach(([kind, map]) => {
      const to = (numbers: number[]) =>
        numbers.map(($) => {
          if (kind === "uint") return $.toString(16);
          if (kind === "time") return $.toString(16).padStart(12, "0");
          return `${$}`;
        });
      assert_type(num(kind))(
        [to([0])],
        ["", " ", "!"].map((raw) => [[raw], "badInput"] as const),
      );
      fc.assert(fc.property(
        fc.record({
          min: fc_number({ min: 0, max: 0xffffffff }).map(map),
          max: fc_number({ min: 0, max: 0xffffffff }).map(map),
          step: fc_number({ min: 0, max: 0xff }).map(map),
        }),
        (meta) => {
          assert_type(vec(kind))([["3"].concat(to(Object.values(meta)))], []);
          const [a, b] = clamp(RANGE.uint, meta);
          assert_type(num(kind, { min: a }))(
            [to([a]), a < b && to([a + 1])],
            [a && [to([a - 1]), "rangeUnderflow"]],
          );
          assert_type(num(kind, { max: b }))(
            [to([b]), b && to([b - 1])],
            [[to([b + 1]), "rangeOverflow"]],
          );
          meta.step > 1 && assert_type(num(kind, { step: meta.step }))(
            [to([meta.step])],
            [[to([meta.step + 1]), "stepMismatch"]],
          );
        },
      ));
    }));
Deno.test("all", () => {
  const a: { [key: string]: Type } = {}, b = Array<Row>(all.length);
  for (let z = 0; z < all.length; ++z) {
    a[z] = vec(all[z][0]);
    b[z] = [all[z][1].length.toString(36), ...all[z][1].flat()];
  }
  const c = b.length.toString(36);
  assert_type(obj(a))(
    [[c, ...b.flat()]],
    [],
    // all.flatMap(($, z) =>
    //   $[2].map(([row, json]) =>
    //     [[c, ...b.with(z, row).flat()], { [z]: json }] as const
    //   )
    // ),
  );
});
