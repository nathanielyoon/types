/** Asserts that a condition is true. Mark as pure to remove from bundle. */
export function assert($: unknown, message?: string): asserts $ {
  if (!$) throw Error(message, { cause: $ });
}
