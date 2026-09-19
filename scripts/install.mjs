// One-time setup: frontend deps + backend virtualenv and requirements.
// Usage (from the repo root): npm run install:all
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";

function run(command, args, cwd) {
  const res =
    command === "npm"
      ? spawnSync(`npm ${args.join(" ")}`, { cwd, stdio: "inherit", shell: true })
      : spawnSync(command, args, { cwd, stdio: "inherit" });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

run("npm", ["install"], join(root, "frontend"));

const venv = join(root, "backend", ".venv");
if (!existsSync(venv)) run(isWin ? "python" : "python3", ["-m", "venv", ".venv"], join(root, "backend"));

const python = join(venv, isWin ? "Scripts/python.exe" : "bin/python");
run(python, ["-m", "pip", "install", "-r", "requirements.txt"], join(root, "backend"));

console.log('\nDone. Start everything with "npm run dev".');
