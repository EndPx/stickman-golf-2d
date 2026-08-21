// The slice of the Node runtime the verification tools use, declared by hand.
//
// `@types/node` sits outside the dependency set R17.6 gates, and these four members are the whole of
// what the tools touch. Declaring them here keeps the tools inside the single type-check command
// without adding a dependency to get there.

declare const console: {
  log(...values: readonly unknown[]): void;
  error(...values: readonly unknown[]): void;
};

declare const process: {
  exitCode: number | undefined;
  argv: readonly string[];
};
