import path from "node:path";

const safeTargetPattern = /^\/[A-Za-z0-9._/-]+$/;
const broadDirectories = new Set([
  "/", "/bin", "/boot", "/dev", "/etc", "/home", "/lib", "/lib64",
  "/opt", "/root", "/run", "/sbin", "/srv", "/tmp", "/usr", "/var",
  "/var/www", "/Users",
]);

export function validateDeployTarget(rawTarget, { sshUser = "", remoteHome = "" } = {}) {
  if (typeof rawTarget !== "string" || !rawTarget.trim()) {
    throw new Error("Deployment target is missing or empty");
  }
  if (rawTarget !== rawTarget.trim() || !safeTargetPattern.test(rawTarget)) {
    throw new Error("Deployment target must be an absolute path containing only letters, numbers, '.', '_', '-' and '/'");
  }
  if (rawTarget.includes("//")) {
    throw new Error("Deployment target must not contain repeated slashes");
  }
  const segments = rawTarget.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Deployment target must not contain '.' or '..' segments");
  }

  const target = path.posix.normalize(rawTarget).replace(/\/$/, "") || "/";
  if (broadDirectories.has(target)) {
    throw new Error(`Deployment target is too broad: ${target}`);
  }
  if (sshUser && ["/home/", "/Users/"].some((prefix) => target === `${prefix}${sshUser}`)) {
    throw new Error(`Deployment target must not be the SSH user's home directory: ${target}`);
  }
  if (remoteHome) {
    const normalizedHome = path.posix.normalize(remoteHome).replace(/\/$/, "") || "/";
    if (target === normalizedHome) {
      throw new Error(`Deployment target resolves to the remote home directory: ${target}`);
    }
  }
  if (segments.length < 2) {
    throw new Error(`Deployment target must identify a dedicated site directory: ${target}`);
  }
  return target;
}
