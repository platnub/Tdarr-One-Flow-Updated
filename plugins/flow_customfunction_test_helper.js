// Shared helper for regression-testing inline customFunction bodies that live only
// inside the flow-export JSON (2 - Prep.yml / 3 - Audio.yml), not as standalone
// plugins/*.js mirrors. Loads a named node's `inputsDB.code` string and executes it
// the same way Tdarr's flow engine does: as CommonJS source assigning module.exports.

const fs = require("fs");
const path = require("path");

function loadFlowFunction(flowFileName, nodeId) {
  const flowPath = path.join(__dirname, "..", flowFileName);
  const flow = JSON.parse(fs.readFileSync(flowPath, "utf8"));
  const node = flow.flowPlugins.find((p) => p.id === nodeId);
  if (!node) {
    throw new Error(`Node ${nodeId} not found in ${flowFileName}`);
  }
  const code = node.inputsDB && node.inputsDB.code;
  if (!code) {
    throw new Error(`Node ${nodeId} in ${flowFileName} has no inputsDB.code`);
  }
  const moduleObj = { exports: {} };
  // eslint-disable-next-line no-new-func
  const fn = new Function("module", "exports", code);
  fn(moduleObj, moduleObj.exports);
  if (typeof moduleObj.exports !== "function") {
    throw new Error(`Node ${nodeId} code did not assign a function to module.exports`);
  }
  return moduleObj.exports;
}

module.exports = { loadFlowFunction };
