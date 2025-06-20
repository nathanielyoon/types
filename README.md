# types

Define schemas that decode data from variable-length CSV rows.

```ts
import { As, Key, Type } from "@nyoon/types";
import { generate } from "jsr:@nyoon/x25519@^1.0.7";
import { assertEquals } from "jsr:@std/assert@^1.0.13";

const type = Type.obj({
  opt: Type.opt(["a", "b", "c"]),
  key: Type.obj({
    pkey: Type.key("pkey"),
    skey: Type.key("skey"),
  }),
  iso: Type.obj({
    time: Type.iso("time", { min: 28800000 }),
    date: Type.iso("date", { min: Date.now() }),
  }),
  num: Type.obj({
    uint: Type.num("uint").maybe(),
    real: Type.num("real", { step: 10 }),
  }),
  str: Type.obj({
    char: Type.str("char", { pattern: /^(?:[\da-f]{2})+$/ }),
    text: Type.str("text", { min: 5 }),
  }),
  vec: Type.vec(Type.opt(["d", "e", "f"]), { unique: true }),
  map: Type.map(Type.num("uint"), { min: 1 }),
  obj: Type.obj({ str: Type.str("char") }),
});
const key = crypto.getRandomValues(new Uint8Array(32));
const data = {
  opt: "b",
  key: { pkey: Key.make("pkey", generate(key)), skey: Key.make("skey", key) },
  iso: { time: new Date("1970T09:00:00"), date: new Date(Date.now() + 1000) },
  num: { uint: null, real: 1234567890 },
  str: { char: "dada", text: "Hello!" },
  vec: ["d", "e"],
  map: { one: 1, two: 2 },
  obj: { str: "" },
} satisfies As<typeof type>;
assertEquals(type.parse(type.stringify(data)), data);
```
