# types

Create schemas for parsing and stringifying data.

```ts
import { assertEquals } from "jsr:@std/assert@^1.0.13";
import { Schema, Struct, Width } from "@nyoon/types/number";
import * as S from "@nyoon/types/string";

const PROFILE_1 = new Schema([
  Width.PKEY, // key
  Width.TEXT | 33, // name
  Width.KEYS | 8, // friends
  Width.TIME, // birthday
  Width.BOOL, // verified
]);
const profile_1 = [
  crypto.getRandomValues(new Uint8Array(32)),
  "Example Name 1",
  [crypto.getRandomValues(new Uint8Array(32))],
  new Date("1970-01-01").getTime(),
  true,
] satisfies Struct<typeof PROFILE_1>;
assertEquals(PROFILE_1.decode(PROFILE_1.encode(profile_1)), profile_1);

const PROFILE_2 = S.obj({
  key: S.bin("pkey"),
  name: S.str("char", { max: 33 }),
  friends: S.vec(S.bin("pkey", { max: 8 })),
  birthday: S.num("time"),
  verified: S.opt(["yes", "no"]),
});
const profile_2 = {
  key: crypto.getRandomValues(new Uint8Array(32)),
  name: "Example Name 2",
  friends: [crypto.getRandomValues(new Uint8Array(32))],
  birthday: new Date("1970-01-02").getTime(),
  verified: "yes",
} satisfies S.Infer<typeof PROFILE_2>;
assertEquals(PROFILE_2.parse(PROFILE_2.stringify(profile_2)), profile_2);
```
