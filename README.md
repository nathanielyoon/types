# types

Define schemas that decode data from variable-length CSV rows.

```ts
import { As, num, obj, opt, str, vec } from "@nyoon/types";
import { assertEquals } from "jsr:@std/assert@^1.0.13";

const type = obj({
  opt: opt(["a", "b", "c"]),
  num: obj({
    uint: num("uint", { min: 1 }),
    time: num("time", { step: 86400 }),
    real: num("real", { max: 1e5 }),
  }),
  str: obj({
    pkey: str("pkey"),
    char: str("char", { pattern: /^[\da-f]+$/ }),
    text: str("text", { min: 1, max: 33 }),
  }),
  vec: vec(opt(["d", "e", "f"])),
});
const data = {
  opt: "a",
  num: {
    uint: 1,
    time: (Date.now() / 86400 | 0) * 86400,
    real: -0.1,
  },
  str: {
    pkey: "A".repeat(43),
    char: "dada",
    text: "hello!",
  },
  vec: ["f", "e", "d"],
} satisfies As<typeof type>;
assertEquals(type.parse(type.stringify(data)), data);
```
