const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function run(command, args, extraEnv = {}) {
  const rendered = [command, ...args].join(" ");
  console.log(`[dist:mac:unsigned:test] ${rendered}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${rendered}`);
  }
}

function utcTimestampParts() {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mi = String(now.getUTCMinutes()).padStart(2, "0");
  return {
    stamp: `${yyyy}${mm}${dd}-${hh}${mi}Z`,
    build: `${yyyy}${mm}${dd}${hh}${mi}`,
  };
}

function main() {
  const packageJsonPath = path.join(process.cwd(), "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const baseVersion = packageJson.version;
  const { stamp, build } = utcTimestampParts();
  const testVersion = `${baseVersion}-test.${stamp}`;
  const productName = "CodePal Test";
  const artifactName = `CodePal-Test-${testVersion}-\${arch}.\${ext}`;

  run("npm", ["run", "build"]);
  run(
    "node_modules/.bin/electron-builder",
    [
      "--mac",
      "zip",
      "dmg",
      "--publish",
      "never",
      "-c.mac.identity=null",
      "-c.mac.notarize=false",
      `-c.productName=${productName}`,
      `-c.buildVersion=${build}`,
      `-c.mac.artifactName=${artifactName}`,
      `-c.extraMetadata.version=${testVersion}`,
    ],
    {
      CODEPAL_SKIP_RELEASE_FINISH: "1",
    },
  );

  console.log(`[dist:mac:unsigned:test] version=${testVersion}`);
  console.log(`[dist:mac:unsigned:test] app=release/mac-arm64/${productName}.app`);
  console.log(`[dist:mac:unsigned:test] dmg=release/CodePal-Test-${testVersion}-arm64.dmg`);
  console.log(`[dist:mac:unsigned:test] zip=release/CodePal-Test-${testVersion}-arm64.zip`);
}

main();
