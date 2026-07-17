const safeSegmentPattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const manifestOutputPattern = /^pages\/[0-9]+-[A-Za-z0-9][A-Za-z0-9_-]*\.html$/;

export function assertSafePathSegment(value, label) {
  if (typeof value !== "string" || !safeSegmentPattern.test(value)) {
    throw new Error(`${label} must be a safe path segment: ${JSON.stringify(value)}`);
  }
  return value;
}

export function assertSafeManifestOutputFile(value, label) {
  if (typeof value !== "string" || !manifestOutputPattern.test(value)) {
    throw new Error(`${label} must match pages/<order>-<id>.html: ${JSON.stringify(value)}`);
  }
  return value;
}
