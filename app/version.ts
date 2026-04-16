import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** 运行时读取仓库根目录 package.json（编译后为 dist/version.js → 上一级为根） */
export function getAppVersion(): string {
  try {
    const pkgPath = join(here, "../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}
