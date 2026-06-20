import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { root } from "./lib/manual.mjs";

const port = Number(process.env.PORT || process.argv[2] || 4173);
const directory = path.join(root, "dist");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

if (!fs.existsSync(path.join(directory, "index.html"))) {
  console.error("dist/ 不存在，请先运行 npm run build。");
  process.exit(1);
}

http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const requestedPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(directory, requestedPath);
  if (!filePath.startsWith(`${directory}${path.sep}`) && filePath !== path.join(directory, "index.html")) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.setHeader("Content-Type", mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream");
    const extension = path.extname(filePath).toLowerCase();
    response.setHeader(
      "Cache-Control",
      [".html", ".json", ".js", ".css"].includes(extension)
        ? "no-store"
        : "public, max-age=3600",
    );
    fs.createReadStream(filePath).pipe(response);
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`SSL Live 手册：http://127.0.0.1:${port}/`);
});
