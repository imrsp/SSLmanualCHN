import { validateDeployTarget } from "./lib/deploy_target.mjs";

try {
  const target = validateDeployTarget(process.argv[2] ?? "", {
    sshUser: process.argv[3] ?? "",
    remoteHome: process.argv[4] ?? "",
  });
  console.log(`[deploy] Validated target: ${target}`);
} catch (error) {
  console.error(`[deploy] Refusing unsafe target: ${error.message}`);
  process.exit(1);
}
