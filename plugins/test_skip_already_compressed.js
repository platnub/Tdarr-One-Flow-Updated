// Regression test for js_skip_already_compressed.js (mirrors the inline SkpCmpChk1
// node in "1 - Input.yml"). No test framework/package.json exists in this repo, so
// this is a plain Node script: `node plugins/test_skip_already_compressed.js`
// (exit code 0 = pass).

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const skipCheck = require("./js_skip_already_compressed.js");

function makeArgs(fileName) {
  return { inputFileObj: { _id: fileName, file: fileName }, variables: {} };
}

(async () => {
  // Already-compressed: skip (output 2).
  {
    const r = await skipCheck(makeArgs("Movie (2019)-compressed.mkv"));
    assert.strictEqual(r.outputNumber, 2);
  }

  // Case-insensitive match.
  for (const variant of ["Compressed", "COMPRESSED", "CoMpReSsEd"]) {
    const r = await skipCheck(makeArgs(`Movie (2019)-${variant}.mkv`));
    assert.strictEqual(r.outputNumber, 2, `${variant} should skip`);
  }

  // Title-internal hyphen is NOT mistaken for a group token: continues normally.
  {
    const r = await skipCheck(makeArgs("Spider-Man (2019).mkv"));
    assert.strictEqual(r.outputNumber, 1);
  }

  // Has a group token, but it isn't "compressed": continues normally.
  {
    const r = await skipCheck(makeArgs("Movie-RARBG.mkv"));
    assert.strictEqual(r.outputNumber, 1);
  }

  // No group token at all: continues normally.
  {
    const r = await skipCheck(makeArgs("Movie (2019).mkv"));
    assert.strictEqual(r.outputNumber, 1);
  }

  // variables object is passed through unchanged.
  {
    const args = makeArgs("Movie (2019)-compressed.mkv");
    args.variables.someKey = "someValue";
    const r = await skipCheck(args);
    assert.strictEqual(r.variables, args.variables);
  }

  // --- Byte-identity: inline copy in "1 - Input.yml" == plugin file -------------
  //
  // Node SkpCmpChk1 in 1 - Input.yml embeds a copy of this plugin's source. They
  // must stay byte-for-byte identical so the flow and the standalone plugin never
  // drift.
  {
    const pluginSrc = fs.readFileSync(path.join(__dirname, "js_skip_already_compressed.js"), "utf8");
    const flow = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "1 - Input.yml"), "utf8"));
    const node = flow.flowPlugins.find((p) => p.id === "SkpCmpChk1");
    assert.ok(node, "SkpCmpChk1 node must exist in 1 - Input.yml");
    assert.ok(node.inputsDB && typeof node.inputsDB.code === "string", "SkpCmpChk1 must have an inputsDB.code string");
    assert.strictEqual(node.inputsDB.code, pluginSrc, "inline SkpCmpChk1 copy must be byte-identical to plugins/js_skip_already_compressed.js");
  }

  console.log("All skip_already_compressed regression tests passed.");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
