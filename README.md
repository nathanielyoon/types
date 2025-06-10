# types

Parse and stringify based on schemas.

```ts
import { Byter, Bytes, Width } from "@nyoon/types/number";
import { assertEquals } from "@std/assert";

const PROFILE = new Byter([
  Width.PKEY, // key
  Width.TEXT | 33, // name
  Width.KEYS | 8, // friends
  Width.TIME, // birthday
  Width.BOOL, // verified
]);
const profile = [
  crypto.getRandomValues(new Uint8Array(32)),
  "Example Name",
  [crypto.getRandomValues(new Uint8Array(32))],
  new Date("1970-01-01").getTime(),
  true,
] satisfies Bytes<typeof PROFILE>;

assertEquals(PROFILE.decode(PROFILE.encode(profile)), profile);
```
