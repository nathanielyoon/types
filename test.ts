import {
  assert,
  assertEquals,
  assertGreaterOrEqual,
  assertLessOrEqual,
  assertNotEquals,
} from "jsr:@std/assert@^1.0.13";
import fc from "npm:fast-check@^4.1.1";
import { b_s64 } from "@nyoon/base";
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
type Falsy = undefined | null | false | 0 | 0n | "";
const type = (type: Type, ok: (Row | Falsy)[], no: ([Row, Json] | Falsy)[]) => {
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
};
Deno.test("nil", () =>
  [
    opt([""]).really(),
    num("uint").maybe(),
    str("pkey").really(),
    vec("time").maybe(),
    obj({ char: "char" }),
  ].forEach(($, z) =>
    type($, [z & 1 && [null]], [z & 1 ^ 1 && [[null], "valueMissing"]])
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
    (one, two, $) => {
      const a = num("real")
        .on("post_parse", ($) => one ? $ : flag(1))
        .on("post_parse", ($) => two ? $ : flag(2))
        .parse([`${$}`]);
      if (one && two) assertEquals(a, $);
      else assert(typeof a === "symbol"), assertEquals(open(a), one ? 2 : 1);
    },
  ));
});
Deno.test("opt", () =>
  fc.assert(
    fc.property(fc.uniqueArray(fc.string(), { minLength: 1 }), (kind) =>
      type(
        opt(kind as [string, ...string[]]),
        kind.map(($) => [$]),
        kind.reduce(
          (no, $) => kind.includes($ += "!") ? no : [...no, [[$], "badInput"]],
          [] as [Row, Json][],
        ),
      )),
  ));
Deno.test("num", async ($) => {
  const step = (kind: Parameters<typeof num>[0], arb: fc.Arbitrary<number>) =>
    $.step(kind, () => {
      const a = ($: number) =>
        $.toString(kind === "real" ? 10 : 16)
          .padStart(kind === "time" ? 12 : 0, "0");
      type(num(kind), [[a(0)]], [
        ...["", " ", "!"].map<[Row, Json]>(($) => [[$], "badInput"]),
        [["00"], "typeMismatch"],
      ]);
      fc.assert(fc.property(arb, arb, (min, max) => {
        type(vec(num(kind)), [["2", a(min), a(max)]], []);
        const [c, d] = clamp(RANGE[kind], { min, max });
        type(num(kind, { min: c, max: d }), [
          [a(c)],
          [a(d)],
          c + 1 <= d && [a(c + 1)],
          d - 1 >= c && [a(d - 1)],
        ], [
          c && c - 1 < c && [[a(c - 1)], "rangeUnderflow"],
          d + 1 > d && [[a(d + 1)], "rangeOverflow"],
        ]);
      }));
      fc.assert(fc.property(arb.map(($) => $ & 0xff || 1), ($) => {
        type(num(kind), [[a($)]], []);
        type(num(kind, { step: $ }), [[a($)]], [
          $ > 1 && [[a($ + 1)], "stepMismatch"],
        ]);
        type(num(kind, { step: 0 }), [[a($)]], []);
      }));
    });
  await step("uint", fc_number({ min: 0, max: -1 >>> 0 }).map(Math.floor));
  await step("time", fc_number({ min: 0, max: 2 ** 48 - 1 }).map(Math.floor));
  await step("real", fc_number());
});
Deno.test("str", async ($) => {
  await $.step("pkey", () => {
    fc.assert(fc.property(
      fc.uint8Array({ minLength: 32, maxLength: 32 }).map(b_s64),
      fc.oneof(
        fc.uint8Array({ maxLength: 31 }),
        fc.uint8Array({ minLength: 33 }),
      ).map(b_s64),
      (key, not) => type(str("pkey"), [[key]], [[[not], "badInput"]]),
    ));
    fc.assert(fc.property(
      fc.stringMatching(/[^-\w]|^(?:[-\w]{0,42}|[-\w]{44,})$/),
      ($) => assertEquals(str("pkey").stringify($), ["A".repeat(43)]),
    ));
  });
  for (const kind of ["char", "text"] as const) {
    await $.step(kind, () => {
    });
  }
});
