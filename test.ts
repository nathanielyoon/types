import { assertEquals } from "jsr:@std/assert@^1.0.13";
import fc from "npm:fast-check@^4.1.1";
import * as mod from "./mod.ts";

const b = {
  opt: [
    fc.tuple(fc.constant("")),
    fc.constant(undefined),
  ],
} satisfies {
  [B in keyof Omit<typeof mod, "flag" | "open">]?: {
    [C in Exclude<keyof Parameters<typeof mod[B]>, keyof []>]: fc.Arbitrary<
      Parameters<typeof mod[B]>[C]
    >;
  };
};
