import { Row } from "jsr:@nyoon/csv@^1.0.9";
import { assert, assertEquals } from "jsr:@std/assert@^1.0.13";
import fc from "npm:fast-check@^4.1.1";
import { bin, flag, Json, num, obj, open, opt, str, Type, vec } from "./mod.ts";
import * as mod from "./mod.ts";

type Falsy = undefined | null | false | 0 | "";
type Ok = (Falsy | Row)[];
type No = (Falsy | [Row, Json])[];
const all: [type: Type][] = [];
const test = <A extends keyof Omit<typeof mod, "flag" | "open">>(
  name: A,
  arbitraries: fc.Arbitrary<Parameters<typeof mod[A]>>,
  to: (...$: Parameters<typeof mod[A]>) => [Ok, No],
) =>
  Deno.test(name, () =>
    fc.assert(
      fc.property(arbitraries, ($) => {
        const a = (mod[name] as (...$: any) => Type)(...$), b = to(...$);
        b[0].forEach(($) => {
          if ($) {
            const e = a.decode([...$]);
            assert(typeof e !== "symbol"), assertEquals(a.encode(e), $);
            all.push([a]);
          }
        });
        b[1].forEach(($) => {
          if ($) {
            const e = a.decode([...$[0]]);
            assert(typeof e === "symbol"), assertEquals(mod.open(e), $[1]);
            d.push($);
          }
        });
      }),
      { numRuns: 1 },
    ));
test(
  "opt",
  fc.uniqueArray(fc.string(), { minLength: 1 })
    .map(([$, ...$$]) => [[$, ...$], { optional: !($$.length & 1) }]),
  (kind, meta) => {
    const a: Ok = [], b: No = [];
    meta?.optional ? a.push([null]) : b.push([[null], open(flag.valueMissing)]);
    return [a, b];
  },
);
// Deno.test("all", () => {
//   console.log(all);
//   const a: { [key: string]: Type } = {}, b = Array<Row>(all.length);
//   for (let z = 0; z < all.length; ++z) {
//     a[z] = vec(obj({ [z]: all[z][0] }));
//     b[z] = all[z][1].flatMap(($) => [$.length.toString(36), ...$]);
//   }
//   b.unshift([b.length.toString(36)]);
//   const c = obj(a), d = c.decode(b.flat());
//   assert(typeof d !== "symbol");
//   assertEquals(c.encode(d), b.flat());
//   all.forEach(($) =>
//     $[2].forEach(([row, json], z) => {
//       const e = c.decode(b.with(z, row).flat());
//       assert(typeof e === "symbol"), assertEquals(open(e), { [z]: json });
//     })
//   );
// });
