import {
  assert,
  assertEquals,
  assertGreaterOrEqual,
  assertLessOrEqual,
  assertNotEquals,
} from "jsr:@std/assert@^1.0.13";
import fc from "npm:fast-check@^4.1.1";
import { b_s64 } from "@nyoon/base";
import { fix, Json, Key, open, Type, wrap } from "./mod.ts";

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
  ].forEach(($) => assertEquals(fix(String.fromCharCode($)), " ")); // as(
});
