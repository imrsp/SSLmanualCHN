import { execFileSync } from "node:child_process";
import path from "node:path";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function dateFromEpoch(value) {
  if (!/^\d+$/.test(value ?? "")) return "";
  const date = new Date(Number(value) * 1000);
  return Number.isNaN(date.valueOf()) ? "" : date.toISOString().slice(0, 10);
}

export function getSourceDate(filePath, { rootDirectory, fallbackDate, sourceDateEpoch = process.env.SOURCE_DATE_EPOCH } = {}) {
  const reproducibleDate = dateFromEpoch(sourceDateEpoch);
  if (reproducibleDate) return reproducibleDate;

  try {
    const relativePath = path.relative(rootDirectory, filePath);
    const date = execFileSync(
      "git",
      ["log", "-1", "--format=%cs", "--", relativePath],
      { cwd: rootDirectory, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    if (datePattern.test(date)) return date;
  } catch {}

  if (!datePattern.test(fallbackDate ?? "")) {
    throw new Error(`No deterministic sitemap date available for ${filePath}`);
  }
  return fallbackDate;
}
