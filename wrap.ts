type Err = string | (Err | null)[] | { [key: string]: Err };
export const FLAGS = [
  "badInput",
  "patternMismatch",
  "rangeOverflow",
  "rangeUnderflow",
  "stepMismatch",
  "tooLong",
  "tooShort",
  "typeMismatch",
  "valid",
  "valueMissing",
] as const;
const symbol = ($: Err) => Symbol.for(JSON.stringify($));
/** Wraps an error or errors in a `symbol`. (Has some defined directly.) */
export const wrap = Object.assign(
  ($: string | (symbol | null)[] | { [key: string]: symbol }) =>
    Symbol.for(JSON.stringify(
      typeof $ === "string"
        ? $
        : Array.isArray($)
        ? $.map(($) => JSON.stringify($ ? open($) : null))
        : Object.keys($).reduce(
          (err, key) => ($[key] ? { ...err, [key]: open($[key]) } : err),
          {},
        ),
    )),
  FLAGS.reduce(
    ($, flag) => ({ ...$, [flag]: Symbol.for(flag) }),
    {} as { [_ in typeof FLAGS[number]]: symbol },
  ),
);
/** Unwraps the error or error held in a `symbol`. */
export const open = <A extends Err>($: symbol): A =>
  JSON.parse(Symbol.keyFor($) ?? '""');
