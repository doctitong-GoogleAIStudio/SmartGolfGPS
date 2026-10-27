const { spawnSync } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
for (const args of [[require.resolve("typescript/bin/tsc"), "-p", "tsconfig.navigation.json"], ["--test", "tests/navigation.test.cjs", "tests/serviceSession.test.cjs"]]) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
