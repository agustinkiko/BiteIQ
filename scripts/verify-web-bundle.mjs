import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const outputDirectory = mkdtempSync(join(tmpdir(), "biteiq-web-build-"));
const expoExecutable = resolve(
  "node_modules",
  ".bin",
  process.platform === "win32" ? "expo.cmd" : "expo"
);

function filesBelow(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesBelow(path) : [path];
  });
}

try {
  execFileSync(
    expoExecutable,
    ["export", "--platform", "web", "--output-dir", outputDirectory],
    {
      cwd: process.cwd(),
      env: { ...process.env, CI: "1" },
      stdio: "inherit"
    }
  );

  const scripts = filesBelow(outputDirectory).filter((path) => path.endsWith(".js"));
  if (scripts.length === 0) {
    throw new Error("Expo web export did not produce a JavaScript bundle.");
  }

  const incompatibleScripts = scripts.filter((path) =>
    readFileSync(path, "utf8").includes("import.meta")
  );

  if (incompatibleScripts.length > 0) {
    throw new Error(
      `Expo emitted import.meta into classic web scripts:\n${incompatibleScripts.join("\n")}`
    );
  }

  console.log(`Verified ${scripts.length} web bundle without raw import.meta syntax.`);
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
