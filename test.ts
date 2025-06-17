import {
  assertEquals,
  assertGreaterOrEqual,
  assertLessOrEqual,
  assertNotEquals,
} from "jsr:@std/assert@^1.0.13";
import fc from "npm:fast-check@^4.1.1";
import { clamp, flag, Json, normalize, open } from "./mod.ts";

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
Deno.test("clamp", () => {
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
  ));
});
