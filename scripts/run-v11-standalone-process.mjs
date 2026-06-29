import { runStandaloneV11 } from "./v11-standalone-core.mjs";

runStandaloneV11({ writeHtml: true }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
