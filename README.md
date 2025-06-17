# types

Define schemas that decode data from variable-length CSV rows.

```ts
import { As, num, obj, opt, str, vec } from "@nyoon/types";
import { assertEquals } from "jsr:@std/assert@^1.0.13";

const type = obj({
  opt: opt(["a", "b", "c"]),
  num: obj({
    uint: "uint?",
    time: num("time", { step: 86400 }),
    real: num("real", { max: 1e5 }),
  }),
  str: obj({
    pkey: "pkey",
    char: str("char", { pattern: /^[\da-f]+$/ }),
    text: "text",
  }),
  vec: vec("time"),
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
  vec: [0],
} satisfies As<typeof type>;
assertEquals(type.parse(type.stringify(data)), data);
```
