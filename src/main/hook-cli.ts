import { HOOK_CLI_NOT_HOOK_MODE, runHookCli } from "./hook/runHookCli";

void runHookCli(process.argv, process.stdin, process.stdout, process.stderr, process.env)
  .then((hookExitCode) => {
    if (hookExitCode === HOOK_CLI_NOT_HOOK_MODE) {
      process.stderr.write("codepal-hook: missing --codepal-hook\n");
      process.exit(1);
      return;
    }
    process.exit(hookExitCode);
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`codepal-hook: ${message}\n`);
    process.exit(1);
  });
