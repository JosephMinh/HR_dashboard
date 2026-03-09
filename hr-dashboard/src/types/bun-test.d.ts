declare module "bun:test" {
  interface Matcher {
    toBe(expected: unknown): void;
    toThrow(expected?: unknown): void;
  }

  interface NegatedMatcher {
    toThrow(expected?: unknown): void;
  }

  interface Expectation extends Matcher {
    not: NegatedMatcher;
  }

  export function describe(name: string, fn: () => void): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function expect(actual: unknown): Expectation;
}
