#!/usr/bin/env node
if (process.argv[2] === "reset") {
  await import(new URL("../scripts/reset.mjs", import.meta.url));
} else {
  await import(new URL("../dist/index.js", import.meta.url));
}
