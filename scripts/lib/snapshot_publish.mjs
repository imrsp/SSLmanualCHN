import fs from "node:fs";
import path from "node:path";

export function finalizeSnapshot({ failures, stagingRoot, snapshotRoot, latestPath, latestRecord }) {
  if (failures.length > 0) {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    return false;
  }

  fs.rmSync(snapshotRoot, { recursive: true, force: true });
  fs.renameSync(stagingRoot, snapshotRoot);

  const temporaryLatestPath = path.join(
    path.dirname(latestPath),
    `.${path.basename(latestPath)}-${process.pid}-${Date.now()}.tmp`,
  );
  try {
    fs.writeFileSync(temporaryLatestPath, JSON.stringify(latestRecord, null, 2));
    fs.renameSync(temporaryLatestPath, latestPath);
  } finally {
    fs.rmSync(temporaryLatestPath, { force: true });
  }
  return true;
}
