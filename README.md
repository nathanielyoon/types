# types

Define schemas that decode data from variable-length CSV rows.

```ts
import { bin, Infer, num, obj, opt, str, vec } from "@nyoon/types";
import { assertEquals } from "jsr:@std/assert@^1.0.13";

const type = obj({
  opt: opt(["a", "b", "c"]),
  num: obj({
    uint: num("uint", { min: 1 }),
    time: num("time", { step: 86400 }),
    real: num("real", { max: 1e5 }),
  }),
  str: obj({
    char: str("char", { pattern: /^[\da-f]+$/ }),
    text: str("text", { min: 1, max: 33 }),
  }),
  bin: obj({
    pkey: bin("pkey"),
    blob: bin("blob", { max: 0x1000 }),
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
    char: "dada",
    text: "hello!",
  },
  bin: {
    pkey: crypto.getRandomValues(new Uint8Array(32)),
    blob: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]),
  },
  vec: ["f", "e", "d"],
} satisfies Infer<typeof type>;
assertEquals(type.decode(type.encode(data)), data);
```
