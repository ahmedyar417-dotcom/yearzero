import readline from 'node:readline';

/** Minimal prompt helper that works both interactively and with piped input. */
export function createPrompt() {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  return {
    async question(q) {
      process.stdout.write(q);
      const { value, done } = await lines.next();
      if (!process.stdin.isTTY) process.stdout.write('\n');
      if (done) {
        console.error('\nInput ended — stopping.');
        process.exit(1);
      }
      return value;
    },
    close: () => rl.close(),
  };
}
