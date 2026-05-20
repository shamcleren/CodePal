import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { startActionResponseCollector } from "./helpers/actionResponseServer";
import { launchCodePal } from "./helpers/launchCodePal";
import { canListen } from "./helpers/probeNetwork";

test.beforeEach(async () => {
  if (!(await canListen())) test.skip();
});

test.describe.configure({ timeout: 60_000 });

const CURSOR_HOOK_EVENT_NAMES = [
  "sessionStart",
  "stop",
  "beforeSubmitPrompt",
  "afterAgentResponse",
  "afterAgentThought",
  "beforeReadFile",
  "afterFileEdit",
  "beforeMCPExecution",
  "afterMCPExecution",
  "beforeShellExecution",
  "afterShellExecution",
] as const;

test("startup migrates old direct Cursor hook commands to the wrapper", async () => {
  const collector = await startActionResponseCollector();
  const homeDir = await fs.mkdtemp(path.join("/tmp", "codepal-home-"));
  const cursorConfigPath = path.join(homeDir, ".cursor", "hooks.json");
  await fs.mkdir(path.dirname(cursorConfigPath), { recursive: true });
  await fs.writeFile(
    cursorConfigPath,
    JSON.stringify({
      version: 1,
      hooks: Object.fromEntries(
        CURSOR_HOOK_EVENT_NAMES.map((eventName) => [
          eventName,
          [
            {
              command:
                '"/Applications/CodePal.app/Contents/MacOS/CodePal" "/Applications/CodePal.app/Contents/Resources/app.asar" --codepal-hook cursor',
            },
          ],
        ]),
      ),
    }),
    "utf8",
  );

  const codepal = await launchCodePal({
    actionResponseTarget: collector.responseTarget,
    homeDir,
  });

  try {
    const migrated = JSON.parse(await fs.readFile(cursorConfigPath, "utf8")) as {
      hooks: Record<string, Array<{ command: string }>>;
    };
    const wrapperCommand = `"${path.join(homeDir, ".codepal", "bin", "cursor-hook")}"`;

    for (const eventName of CURSOR_HOOK_EVENT_NAMES) {
      expect(migrated.hooks[eventName]?.[0]?.command).toBe(wrapperCommand);
    }
    expect(await fs.readFile(cursorConfigPath, "utf8")).not.toContain("--codepal-hook cursor");
  } finally {
    await codepal.close();
    await collector.close();
    await fs.rm(homeDir, { recursive: true, force: true });
  }
});
