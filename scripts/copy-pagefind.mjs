import { cpSync, existsSync, rmSync } from "node:fs";

const source = "dist/pagefind";
const destination = "public/pagefind";

if (!existsSync(source)) {
  process.stderr.write(`Pagefind output not found at ${source}\n`);
  process.exit(1);
}

rmSync(destination, { force: true, recursive: true });
cpSync(source, destination, { recursive: true });

process.stdout.write(`Copied Pagefind assets to ${destination}\n`);
