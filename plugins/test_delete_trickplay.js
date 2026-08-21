// Regression test for js_delete_trickplay.js.
// No test framework/package.json exists in this repo, so this is a plain Node
// script: `node plugins/test_delete_trickplay.js` (exit code 0 = pass).

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const deleteTrickplay = require("./js_delete_trickplay.js");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "delete-trickplay-"));

let caseCounter = 0;

// Build args around an ORIGINAL library file. The plugin derives the trickplay
// folder from originalLibraryFile._id (NOT inputFileObj, which may have been
// renamed to -compressed by an earlier node), so inputFileObj points at a
// deliberately different name to prove that.
function makeCase(origName, { deleteEnabled = true } = {}) {
  const caseDir = path.join(tmpDir, `case-${caseCounter++}`);
  fs.mkdirSync(caseDir, { recursive: true });
  const origPath = path.join(caseDir, origName);
  fs.writeFileSync(origPath, "video");
  // inputFileObj deliberately carries a -compressed name to prove the trickplay
  // folder is derived from the original, not the (renamed) input.
  const ext = path.extname(origName);
  const compressedPath = path.join(caseDir, path.basename(origName, ext) + "-compressed" + ext);
  return {
    args: {
      userVariables: { library: { delete_trickplay: deleteEnabled ? "true" : "false" } },
      variables: { user: {} },
      inputFileObj: { _id: compressedPath, file: compressedPath },
      originalLibraryFile: { _id: origPath },
    },
    caseDir,
    origPath,
  };
}

function mkTrickplayDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  // Populate with a nested file so recursive removal is exercised.
  fs.writeFileSync(path.join(dirPath, "1000.jpg"), "thumb");
}

(async () => {
  // (a) Disabled/unset -> no deletion, folder untouched, pass-through returned.
  {
    const { args, caseDir } = makeCase("Movie (2019).mkv", { deleteEnabled: false });
    const trickplay = path.join(caseDir, "Movie (2019).trickplay");
    mkTrickplayDir(trickplay);
    const result = await deleteTrickplay(args);
    assert.ok(fs.existsSync(trickplay), "trickplay folder must be untouched when disabled");
    assert.strictEqual(result.outputFileObj, args.inputFileObj, "pass-through outputFileObj");
    assert.strictEqual(result.outputNumber, 1);
  }

  // (a2) Entirely unset library variable -> treated as disabled.
  {
    const caseDir = path.join(tmpDir, `case-unset-${caseCounter++}`);
    fs.mkdirSync(caseDir, { recursive: true });
    const origPath = path.join(caseDir, "Movie (2019).mkv");
    fs.writeFileSync(origPath, "video");
    const trickplay = path.join(caseDir, "Movie (2019).trickplay");
    mkTrickplayDir(trickplay);
    const args = {
      userVariables: { library: {} },
      variables: { user: {} },
      inputFileObj: { _id: origPath, file: origPath },
      originalLibraryFile: { _id: origPath },
    };
    await deleteTrickplay(args);
    assert.ok(fs.existsSync(trickplay), "unset flag must not delete the trickplay folder");
  }

  // (b1) Enabled + folder present under the base.trickplay naming variant -> removed.
  {
    const { args, caseDir } = makeCase("Movie (2019).mkv");
    const trickplay = path.join(caseDir, "Movie (2019).trickplay"); // base (no video ext)
    mkTrickplayDir(trickplay);
    await deleteTrickplay(args);
    assert.ok(!fs.existsSync(trickplay), "base.trickplay folder should be removed");
  }

  // (b2) Enabled + folder present under the fullName.trickplay naming variant -> removed.
  {
    const { args, caseDir } = makeCase("Movie (2019).mkv");
    const trickplay = path.join(caseDir, "Movie (2019).mkv.trickplay"); // full name incl. ext
    mkTrickplayDir(trickplay);
    await deleteTrickplay(args);
    assert.ok(!fs.existsSync(trickplay), "fullName.trickplay folder should be removed");
  }

  // (b3) Both naming variants present -> both removed.
  {
    const { args, caseDir } = makeCase("Movie (2019).mkv");
    const baseTrick = path.join(caseDir, "Movie (2019).trickplay");
    const fullTrick = path.join(caseDir, "Movie (2019).mkv.trickplay");
    mkTrickplayDir(baseTrick);
    mkTrickplayDir(fullTrick);
    await deleteTrickplay(args);
    assert.ok(!fs.existsSync(baseTrick), "base.trickplay removed");
    assert.ok(!fs.existsSync(fullTrick), "fullName.trickplay removed");
  }

  // (c) Enabled but no trickplay folder -> clean no-op, still returns pass-through.
  {
    const { args, caseDir } = makeCase("Movie (2019).mkv");
    const result = await deleteTrickplay(args);
    assert.strictEqual(result.outputFileObj, args.inputFileObj, "pass-through when nothing to delete");
    // Sanity: the case dir still only holds the original media file.
    assert.ok(fs.existsSync(path.join(caseDir, "Movie (2019).mkv")));
  }

  // (c2) A same-named FILE (not a directory) ending in .trickplay is left alone.
  {
    const { args, caseDir } = makeCase("Movie (2019).mkv");
    const trickFile = path.join(caseDir, "Movie (2019).trickplay");
    fs.writeFileSync(trickFile, "not a dir");
    await deleteTrickplay(args);
    assert.ok(fs.existsSync(trickFile), "a non-directory .trickplay must not be deleted");
  }

  // (d) Deletion error -> warns and still returns the pass-through object.
  //     fs.rmSync is stubbed to throw; the plugin must swallow it.
  {
    const { args, caseDir } = makeCase("Movie (2019).mkv");
    const trickplay = path.join(caseDir, "Movie (2019).trickplay");
    mkTrickplayDir(trickplay);
    const realRm = fs.rmSync;
    fs.rmSync = () => { throw new Error("simulated rm failure"); };
    try {
      const result = await deleteTrickplay(args);
      assert.strictEqual(result.outputFileObj, args.inputFileObj, "pass-through even on deletion failure");
      assert.strictEqual(result.outputNumber, 1);
    } finally {
      fs.rmSync = realRm;
    }
    // Folder still there (deletion failed) but the flow was not broken.
    assert.ok(fs.existsSync(trickplay), "folder remains when rm throws");
  }

  // --- Byte-identity: inline copy in "5 - Save.yml" == plugin file --------------
  //
  // Node DelTrkPly1 in 5 - Save.yml embeds a copy of this plugin's source. They
  // must stay byte-for-byte identical so the flow and the standalone plugin never
  // drift.
  {
    const pluginSrc = fs.readFileSync(path.join(__dirname, "js_delete_trickplay.js"), "utf8");
    const flow = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "5 - Save.yml"), "utf8"));
    const node = flow.flowPlugins.find((p) => p.id === "DelTrkPly1");
    assert.ok(node, "DelTrkPly1 node must exist in 5 - Save.yml");
    assert.ok(node.inputsDB && typeof node.inputsDB.code === "string", "DelTrkPly1 must have an inputsDB.code string");
    assert.strictEqual(node.inputsDB.code, pluginSrc, "inline DelTrkPly1 copy must be byte-identical to plugins/js_delete_trickplay.js");
  }

  console.log("All delete_trickplay regression tests passed.");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
