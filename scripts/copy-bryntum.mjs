// Copy Bryntum Calendar's ready-built browser files into public/bryntum, so the
// Occasions page loads them as a plain script and stylesheets. Bundling its 5 MB
// file made the build run out of memory on Vercel. Runs before every build and dev.

import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const from = "node_modules/@bryntum/calendar";
const to = "public/bryntum";

// The trial package fills in its licence text on install. Some installs skip
// install scripts, so make sure it's done (it does nothing once it has run).
if (readFileSync(join(from, "calendar.umd.js"), "utf8").includes("%LICENSE%")) {
  const r = spawnSync(process.execPath, [join(process.cwd(), "node_modules/@bryntum/calendar-trial-lib/build.js")], { cwd: from, stdio: "inherit" });
  if (r.status !== 0) throw new Error("Bryntum's licence step failed.");
}

mkdirSync(to, { recursive: true });
for (const f of ["calendar.umd.js", "calendar.css", "svalbard-light.css"]) cpSync(join(from, f), join(to, f));
for (const d of ["fonts", "fontawesome/css", "fontawesome/webfonts"]) if (existsSync(join(from, d))) cpSync(join(from, d), join(to, d), { recursive: true });
console.log("Bryntum files copied to public/bryntum");
