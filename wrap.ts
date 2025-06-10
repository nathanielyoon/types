type Key<A extends string> = A | (Key<A> | null)[] | { [key: string]: Key<A> };
const symbol = ($: Key<string>) => Symbol.for(JSON.stringify($));
/** Wraps an error message or error messages in a `symbol`. */
export const wrap = <A extends string>(
  $: A | (symbol | null)[] | { [key: string]: symbol },
): symbol => {
  if (typeof $ === "string") return symbol($);
  if (Array.isArray($)) {
    const a = Array<Key<string> | null>($.length);
    for (let z = 0; z < $.length; ++z) {
      a[z] = JSON.stringify($[z] && open($[z]!) || null);
    }
    return symbol(a);
  }
  const a = Object.keys($), b: { [key: string]: Key<string> } = {};
  for (let z = 0; z < a.length; ++z) if ($[a[z]]) b[a[z]] = open($[a[z]]);
  return symbol(a);
};
/** Unwraps the error message or error messages held in a `symbol`. */
export const open = <A extends string>($: symbol): Key<A> =>
  JSON.parse(Symbol.keyFor($) ?? '""');
