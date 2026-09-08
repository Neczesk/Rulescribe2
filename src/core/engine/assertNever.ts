/**
 * Exhaustiveness guard for discriminated-union `switch`es: put `assertNever` in
 * the `default` branch so a newly-added union member is a compile-time error
 * until every switch handles it.
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled union member: ${JSON.stringify(value)}`);
}
