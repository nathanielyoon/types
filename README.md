# types

Define schemas that decode data from variable-length CSV rows.

```ts
import { iso, key, make, map, num, obj, opt, str, vec } from "@nyoon/types";
import { generate } from "jsr:@nyoon/x25519@^1.0.7";
import { assertEquals } from "jsr:@std/assert@^1.0.13";

const type = obj({
  opt: opt(["a", "b", "c"]),
  key: obj({
    pkey: key("pkey"),
    skey: key("skey"),
  }),
  iso: obj({
    time: iso("time", { min: 28800000 }),
    date: iso("date", { min: Date.now() }),
  }),
  num: obj({
    uint: num("uint").maybe(),
    real: num("real", { step: 10 }),
  }),
  str: obj({
    char: str("char", { pattern: /^(?:[\da-f]{2})+$/ }),
    text: str("text", { min: 5 }),
  }),
  vec: vec(opt(["d", "e", "f"]), { unique: true }),
  map: map(num("uint"), { min: 1 }),
  obj: obj({ str: str("char") }),
});
const data = {
  opt: "b",
  key: {
    pkey: make("pkey", generate(crypto.getRandomValues(new Uint8Array(32)))),
    skey: make("skey", crypto.getRandomValues(new Uint8Array(32))),
  },
  iso: { time: new Date("1970T09:00:00"), date: new Date(Date.now() + 1000) },
  num: { uint: null, real: 1234567890 },
  str: { char: "dada", text: "Hello!" },
  vec: ["d", "e"],
  map: { one: 1, two: 2 },
  obj: { str: "" },
} satisfies As<typeof type>;
assertEquals(type.decode(type.encode(data)), data);
```
