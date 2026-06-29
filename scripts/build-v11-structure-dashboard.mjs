import { rebuildStandaloneHtml } from "./v11-standalone-core.mjs";

try {
  rebuildStandaloneHtml();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
