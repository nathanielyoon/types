function assert($: unknown): asserts $ {
  if (!$) throw $;
}
/** Field types. */
export const enum Width {
  // Variable-length fields - trailing zero bits hold element length.
  TEXT = 0b10000000,
  BITS = 0b01100000,
  ENUM = 0b01000000,
  KEYS = 0b00110000,
  NUMS = 0b00100000,
  // Fixed-length fields.
  REAL = 0b00001000,
  TIME = 0b00000111,
  UINT = 0b00000100,
  BOOL = 0b00000001,
  PKEY = 0b00000000,
}
/** Range of numbers from 0-31. */
export type Word<A extends unknown[] = []> = A["length"] extends 32 ? A[number]
  : Word<[...A, A["length"]]>;
/** Byte length brand for number types. */
export declare const BYTES: unique symbol;
/** Map of field widths to data types. */
export type Decoded = (
  & { [_ in Width.PKEY]: Uint8Array }
  & { [_ in Width.BOOL]: boolean }
  & { [_ in Width.UINT]: number & { [BYTES]: 4 } }
  & { [_ in Width.TIME]: number & { [BYTES]: 7 } }
  & { [_ in Width.REAL]: number & { [BYTES]: 8 } }
  & { [_ in Width.NUMS]: Float64Array }
  & { [_ in Width.KEYS]: Uint8Array[] }
  & { [_ in Width.ENUM]: Word }
  & { [_ in Width.BITS]: Set<Word> }
  & { [_ in Width.TEXT]: string }
) extends infer A ? { [B in keyof A]: A[B] } : never; // make type look nicer
/** Decoded data matching a schema. */
export type Bytes<A> = A extends Byter<infer B>
  ? { [C in keyof B]: Decoded[B[C]] }
  : never;
/** Fixed-length binary schema. */
export class Byter<A extends readonly [Width, ...Width[]]> {
  private types;
  private sizes;
  /** Byte length of encoded data. */
  total = 0;
  /** Creates a schema from a list of fields. */
  constructor(public fields: A | Uint8Array) {
    this.types = Array<Width>(fields.length);
    this.sizes = new Uint8Array(fields.length);
    for (let z = 0; z < fields.length; this.total += this.sizes[z++]) {
      const a = fields[z];
      /* @__PURE__ */ assert(a === a >>> 0 && a < 256); // unsigned char
      // No empty text fields, so all variable lengths are implicitly 1 larger.
      // Then allocate an additional byte for string length.
      if (a & 128) this.types[z] = Width.TEXT, this.sizes[z] = (a & 127) + 2;
      else if ((a & 96) === 96) this.types[z] = Width.BITS, this.sizes[z] = 4;
      else if (a & 64) this.types[z] = Width.ENUM, this.sizes[z] = 1;
      // Just like strings get an extra character of possible length, the array
      // types get an extra element. But while a character (in this encoding) is
      // 1 byte, keys/numbers are 32/8 bytes respectively, hence the shifts.
      // They also need an additional byte for the array's length.
      else if ((a & 48) === 48) {
        this.types[z] = Width.KEYS, this.sizes[z] = ((a & 31) + 1 << 5) + 1;
      } else if (a & 32) {
        this.types[z] = Width.NUMS, this.sizes[z] = ((a & 31) + 1 << 3) + 1;
      } else this.types[z] = this.sizes[z] = a;
    }
  }
  /** Converts typed fields to binary. */
  encode($: Bytes<typeof this>): Uint8Array {
    const a = new Uint8Array(this.total), b = new DataView(a.buffer);
    for (let z = 0, y = 0, x, c; z < $.length; y += this.sizes[z++]) {
      switch (c = $[z], this.types[z]) {
        case Width.TEXT: {
          /* @__PURE__ */ assert(typeof c === "string");
          const d = new TextEncoder().encode(c);
          // The value in `this.sizes` includes a byte for the string's length,
          // which must thus be lower to leave room.
          /* @__PURE__ */ assert(d.length < this.sizes[z]);
          a[y] = d.length, a.set(d, y + 1);
          break;
        }
        case Width.BITS: {
          /* @__PURE__ */ assert(c instanceof Set);
          let d = 0;
          for (x of c) d |= 1 << x;
          b.setUint32(y, d);
          break;
        }
        case Width.ENUM:
          /* @__PURE__ */ assert(
            typeof c === "number" && c === c >>> 0 && c < 32,
          );
          a[y] = c;
          break;
        case Width.KEYS:
          /* @__PURE__ */ assert(
            Array.isArray(c) &&
              c.every(($) => $ instanceof Uint8Array && $.length === 32),
          );
          a[y] = c.length;
          for (x = 0; x < c.length; ++x) a.set(c[x], y + 1 + (x << 5));
          break;
        case Width.NUMS:
          /* @__PURE__ */ assert(c instanceof Float64Array);
          a[y] = c.length;
          for (x = 0; x < c.length; ++x) b.setFloat64(y + 1 + (x << 3), c[x]);
          break;
        case Width.REAL:
          /* @__PURE__ */ assert(typeof c === "number" && Number.isFinite(c));
          b.setFloat64(y, c);
          break;
        case Width.TIME:
          /* @__PURE__ */ assert(
            typeof c === "number" && Math.abs(c) <= 864e13,
          );
          b.setUint32(y, c);
          b.setUint16(y + 4, c / 0x100000000);
          a[y + 6] = c / 0x1000000000000;
          break;
        case Width.UINT:
          /* @__PURE__ */ assert(typeof c === "number" && c === c >>> 0);
          b.setUint32(y, c);
          break;
        case Width.BOOL:
          /* @__PURE__ */ assert(typeof c === "boolean");
          a[y] = c ? 1 : 0;
          break;
        case Width.PKEY:
          /* @__PURE__ */ assert(c instanceof Uint8Array && c.length === 32);
          a.set(c, y);
          break;
      }
    }
    return a;
  }
  /** Converts binary to typed fields. */
  decode($: Uint8Array): Bytes<typeof this> {
    /* @__PURE__ */ assert($.length === this.total);
    const a = new DataView($.buffer), b = Array(this.fields.length);
    for (let z = 0, y = 0, x; z < b.length; y += this.sizes[z++]) {
      switch (this.types[z]) {
        case Width.TEXT:
          b[z] = new TextDecoder().decode($.subarray(y + 1, y + 1 + $[y]));
          break;
        case Width.BITS: {
          const d = b[z] = new Set<Word>();
          let e = a.getUint32(y), f;
          while (e) d.add(f = 31 - Math.clz32(e) as Word), e &= ~(1 << f);
          break;
        }
        case Width.ENUM: {
          /* @__PURE__ */ assert($[y] === $[y] >>> 0 && $[y] < 32);
          b[z] = $[y] as Word;
          break;
        }
        case Width.KEYS: {
          const c = $[y], d = b[z] = Array<Uint8Array>(c);
          for (x = 0; x < c; ++x) {
            d[x] = new Uint8Array(
              $.subarray(y + 1 + (x << 5), y + 33 + (x << 5)),
            );
          }
          break;
        }
        case Width.NUMS: {
          const c = $[y], d = b[z] = new Float64Array(c);
          for (x = 0; x < c; ++x) d[x] = a.getFloat64(y + 1 + (x << 3));
          break;
        }
        case Width.REAL:
          b[z] = a.getFloat64(y) as number & { [BYTES]: 8 };
          break;
        case Width.TIME:
          b[z] = a.getUint32(y) + a.getUint16(y + 4) * 0x100000000 +
            $[y + 6] * 0x1000000000000 as number & { [BYTES]: 7 };
          /* @__PURE__ */ assert(Math.abs(b[z] as number) <= 864e13);
          break;
        case Width.UINT:
          b[z] = a.getUint32(y) as number & { [BYTES]: 4 };
          break;
        case Width.BOOL:
          /* @__PURE__ */ assert($[y] === 0 || $[y] === 1);
          b[z] = $[y] ? true : false;
          break;
        case Width.PKEY:
          b[z] = new Uint8Array($.subarray(y, y + 32));
          break;
      }
    }
    return b as any;
  }
}
