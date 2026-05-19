const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const YAML = require("yaml");

const projectRoot = path.join(__dirname, "..");
const releaseDir = path.join(projectRoot, "release");
const version = require(path.join(projectRoot, "package.json")).version;
const tag = `v${version}`;

function sha512Base64(filePath) {
  return crypto.createHash("sha512").update(fs.readFileSync(filePath)).digest("base64");
}

function run(command, args) {
  console.log(`[release:mac] ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command} ${args.join(" ")}`);
  }
}

function artifactInfo(fileName) {
  const filePath = path.join(releaseDir, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing release artifact: ${filePath}`);
  }
  return {
    filePath,
    url: fileName,
    sha512: sha512Base64(filePath),
    size: fs.statSync(filePath).size,
  };
}

const artifacts = [
  artifactInfo(`CodePal-${version}-arm64.zip`),
  artifactInfo(`CodePal-${version}-arm64.dmg`),
];
const latestMacPath = path.join(releaseDir, "latest-mac.yml");
const latestMac = {
  version,
  files: artifacts.map(({ url, sha512, size }) => ({ url, sha512, size })),
  path: artifacts[0].url,
  sha512: artifacts[0].sha512,
  releaseDate: new Date().toISOString(),
};

fs.writeFileSync(latestMacPath, YAML.stringify(latestMac));

const reread = YAML.parse(fs.readFileSync(latestMacPath, "utf8"));
for (const artifact of artifacts) {
  const fileInfo = reread.files.find((candidate) => candidate.url === artifact.url);
  if (!fileInfo || fileInfo.size !== artifact.size || fileInfo.sha512 !== artifact.sha512) {
    throw new Error(`Final latest-mac.yml metadata does not match ${artifact.url}.`);
  }
}

console.log(`[release:mac] refreshed final ${latestMacPath}`);

if (process.env.CODEPAL_PUBLISH_RELEASE === "1") {
  run("gh", ["release", "upload", tag, latestMacPath, "--clobber"]);
}
