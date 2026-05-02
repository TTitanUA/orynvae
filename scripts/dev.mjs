import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const isWindows = process.platform === "win32";

const commandName = (name) => (isWindows ? `${name}.cmd` : name);
const uvCommand = process.env.ORYNVAE_UV || commandName("uv");
const pnpmCommand = process.env.ORYNVAE_PNPM || commandName("pnpm");

function shouldUseShell(command) {
  return isWindows && command.toLowerCase().endsWith(".cmd");
}

function commandSpec(command, args) {
  if (!shouldUseShell(command)) {
    return { command, args };
  }

  return {
    command: process.env.ComSpec || "cmd.exe",
    args: ["/d", "/c", command, ...args],
  };
}

function runOnce(label, command, args, cwd) {
  return new Promise((resolve, reject) => {
    const spec = commandSpec(command, args);
    const child = spawn(spec.command, spec.args, {
      cwd,
      stdio: "inherit",
      shell: false,
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} exited with code ${code}`));
      }
    });
  });
}

function spawnService(label, command, args, cwd) {
  const spec = commandSpec(command, args);
  const child = spawn(spec.command, spec.args, {
    cwd,
    stdio: "inherit",
    shell: false,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`[${label}] stopped by ${signal}`);
    } else if (code !== 0) {
      console.log(`[${label}] exited with code ${code}`);
    }
  });

  return child;
}

function stopProcessTree(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  if (isWindows) {
    spawnSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
    });
    return;
  }

  child.kill();
}

const backendDir = join(repoRoot, "backend");
const frontendDir = join(repoRoot, "frontend");
const backendPython = join(
  backendDir,
  ".venv",
  isWindows ? "Scripts/python.exe" : "bin/python",
);

if (!existsSync(backendDir) || !existsSync(frontendDir)) {
  throw new Error("Run this script from the Orynvae repository.");
}

if (!existsSync(backendPython)) {
  await runOnce("backend-sync", uvCommand, ["sync"], backendDir);
}
await runOnce("db-init", uvCommand, ["run", "--no-sync", "python", "-m", "app.cli.db_init"], backendDir);

const services = [
  spawnService("backend", uvCommand, ["run", "--no-sync", "python", "-m", "app.cli.dev"], backendDir),
  spawnService("frontend", pnpmCommand, ["dev"], frontendDir),
];

function shutdown() {
  for (const service of services) {
    stopProcessTree(service);
  }
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});

process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});
