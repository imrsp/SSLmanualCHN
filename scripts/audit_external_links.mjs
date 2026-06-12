import fs from "node:fs";
import path from "node:path";
import { readJson, root } from "./lib/manual.mjs";

const catalog = readJson(path.join(root, "dist", "data", "catalog.json"));
const urls = new Set();

for (const page of catalog.pages) {
  const data = readJson(path.join(root, "dist", "data", "pages", `${page.id}.json`));
  for (const html of [data.contentHtml, data.englishHtml]) {
    for (const match of html.matchAll(/<a\b[^>]*\bhref=["'](https?:\/\/[^"']+)["']/gi)) {
      urls.add(match[1]);
    }
  }
}

const queue = [...urls].sort();
const results = [];
let cursor = 0;

async function check(url) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "user-agent": "SSL-Live-Manual-ZH-Link-Auditor/1.0",
          range: "bytes=0-0",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
      });
      return {
        url,
        finalUrl: response.url,
        status: response.status,
        ok: response.ok,
      };
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
  }
  return { url, finalUrl: null, status: null, ok: false, error: lastError.message };
}

const workers = Array.from({ length: 6 }, async () => {
  while (cursor < queue.length) {
    const url = queue[cursor];
    cursor += 1;
    results.push(await check(url));
  }
});
await Promise.all(workers);
results.sort((a, b) => a.url.localeCompare(b.url));

const report = {
  generatedAt: new Date().toISOString(),
  total: results.length,
  reachable: results.filter((result) => result.ok).length,
  blocked: results.filter((result) => [401, 403, 429].includes(result.status)).length,
  unavailable: results.filter((result) =>
    !result.ok && result.status && ![401, 403, 429].includes(result.status)).length,
  networkErrors: results.filter((result) => result.error).length,
  results,
};
fs.writeFileSync(
  path.join(root, "reports", "external-link-audit.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify({
  total: report.total,
  reachable: report.reachable,
  blocked: report.blocked,
  unavailable: report.unavailable,
  networkErrors: report.networkErrors,
}, null, 2));
