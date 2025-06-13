import { Row } from "jsr:@nyoon/csv@^1.0.9";
import { assert, assertEquals } from "jsr:@std/assert@^1.0.13";
import fc from "npm:fast-check@^4.1.1";
import { Json, Type } from "./mod.ts";
import * as mod from "./mod.ts";

const all = {} as {
  [A in keyof Omit<typeof mod, "flag" | "open">]: [
    type: Type,
    ok: Row,
    no: [Json, Row],
  ];
};
const test = <A extends keyof Omit<typeof mod, "flag" | "open">>(
  name: A,
  arbitraries: fc.Arbitrary<Parameters<typeof mod[A]>>,
  to: (...$: Parameters<typeof mod[A]>) => [Row[], [Json, Row[]][]],
) =>
  Deno.test(name, () =>
    fc.assert(
      fc.property(arbitraries, ($) => {
        const a = (mod[name] as (...$: any) => Type)(...$), b = to(...$);
        b[0].forEach(($) => {
          const c = a.decode($);
          assert(typeof c !== "symbol"), assertEquals(a.encode(c), $);
        });
        b[1].forEach(([json, rows]) =>
          rows.forEach(($) => {
            const c = a.decode($);
            assert(typeof c === "symbol"), assertEquals(mod.open(c), json);
          })
        );
        all[name] = [a, b[0][0], b[1][0]];
      }),
      { numRuns: 16 },
    ));
test(
  "opt",
  fc.uniqueArray(fc.string(), { minLength: 1 })
    .map(([$, ...$$]) => [[$, ...$], { optional: !($$.length & 1) }]),
  (kind, meta) => {
    const a = [], b = [];
    if (meta?.optional) {
      a.push([null]);
    }
    throw 0;
  },
);
