// Starts the FastAPI backend and the Next.js frontend together.
// Usage (from the repo root): npm run dev
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";

const BACKEND_PORT = process.env.BACKEND_PORT ?? "8000";

// Prefer the project's virtualenv; fall back to whatever python is on PATH.
const venvPython = join(root, "backend", ".venv", isWin ? "Scripts/python.exe" : "bin/python");
const python = existsSync(venvPython) ? venvPython : isWin ? "python" : "python3";

if (!existsSync(join(root, "frontend", "node_modules"))) {
  console.error('frontend/node_modules is missing. Run "npm run install:all" first.');
  process.exit(1);
}

const COLORS = { backend: "\x1b[35m", frontend: "\x1b[36m", reset: "\x1b[0m" };
const children = [];
let shuttingDown = false;

function run(name, command, args, cwd) {
  // npm is a .cmd shim on Windows and needs a shell; pass it as one string
  // (no separate args) so Node doesn't warn about unescaped shell args.
  const child =
    command === "npm"
      ? spawn(`npm ${args.join(" ")}`, { cwd, shell: true, env: process.env })
      : spawn(command, args, { cwd, env: process.env });
  children.push(child);

  const prefix = `${COLORS[name]}[${name}]${COLORS.reset} `;
  const pipe = (stream, out) => {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) out.write(prefix + line + "\n");
    });
    stream.on("end", () => buffer && out.write(prefix + buffer + "\n"));
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);

  child.on("error", (err) => {
    console.error(`${prefix}failed to start: ${err.message}`);
    shutdown(1);
  });
  child.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`${prefix}exited with code ${code}, stopping everything.`);
      shutdown(code ?? 1);
    }
  });
}

function kill(child) {
  if (child.exitCode !== null || !child.pid) return;
  if (isWin) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  children.forEach(kill);
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run("backend", python, ["-m", "uvicorn", "app.main:app", "--reload", "--port", BACKEND_PORT], join(root, "backend"));
run("frontend", "npm", ["run", "dev"], join(root, "frontend"));

console.log(`Backend  -> http://localhost:${BACKEND_PORT}  (docs at /docs)`);
console.log("Frontend -> http://localhost:3000");
