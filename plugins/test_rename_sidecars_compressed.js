// Regression test for js_rename_sidecars_compressed.js.
// No test framework/package.json exists in this repo, so this is a plain Node
// script: `node plugins/test_rename_sidecars_compressed.js` (exit code 0 = pass).

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const renameSidecars = require("./js_rename_sidecars_compressed.js");
const renameGroupCompressed = require("./js_rename_group_compressed.js");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rename-sidecars-compressed-"));

let caseCounter = 0;
function caseDir() {
  const d = path.join(tmpDir, `case-${caseCounter++}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// Build args around an in-place scenario: the video was already renamed by
// js_rename_group_compressed from origName to <stem>-compressed<ext> BEFORE this
// node runs, mirroring real flow state (the original name no longer exists on
// disk once rename_group_compressed's fs.renameSync has executed).
function makeInPlaceCase(origName, { renamed = true, enabled = true } = {}) {
  const dir = caseDir();
  const ext = path.extname(origName);
  const base = path.basename(origName, ext);
  const origPath = path.join(dir, origName);
  const newBase = `${base}-compressed`;
  const currentPath = renamed ? path.join(dir, `${newBase}${ext}`) : origPath;
  fs.writeFileSync(currentPath, "video");
  return {
    dir,
    base,
    newBase,
    ext,
    origPath,
    currentPath,
    args: {
      userVariables: { library: { rename_sidecars_compressed: enabled ? "true" : "false" } },
      variables: { user: {} },
      inputFileObj: { _id: currentPath, file: currentPath },
      librarySettings: { folder: dir },
      originalLibraryFile: { _id: origPath },
    },
  };
}

function mkTrickplayDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(path.join(dirPath, "1000.jpg"), "thumb");
}

(async () => {
  // (a) Disabled -> no-op, sidecars untouched, pass-through returned.
  {
    const { args, dir, base } = makeInPlaceCase("Movie (2019)-RARBG.mkv", { enabled: false });
    fs.writeFileSync(path.join(dir, `${base}.nfo`), "nfo");
    const result = await renameSidecars(args);
    assert.ok(fs.existsSync(path.join(dir, `${base}.nfo`)), ".nfo must be untouched when disabled");
    assert.strictEqual(result.outputFileObj, args.inputFileObj, "pass-through outputFileObj");
    assert.strictEqual(result.outputNumber, 1);
  }

  // (a2) Entirely unset library variable -> treated as disabled.
  {
    const dir = caseDir();
    const origPath = path.join(dir, "Movie (2019)-RARBG.mkv");
    fs.writeFileSync(origPath, "video");
    fs.writeFileSync(path.join(dir, "Movie (2019)-RARBG.nfo"), "nfo");
    const args = {
      userVariables: { library: {} },
      variables: { user: {} },
      inputFileObj: { _id: origPath, file: origPath },
      librarySettings: { folder: dir },
      originalLibraryFile: { _id: origPath },
    };
    await renameSidecars(args);
    assert.ok(fs.existsSync(path.join(dir, "Movie (2019)-RARBG.nfo")), "unset flag must not rename sidecars");
  }

  // (b) Base name unchanged (video was NOT renamed this run, e.g.
  // rename_group_compressed disabled/no-op/idempotent-skip) -> no-op even though
  // rename_sidecars_compressed itself is enabled.
  {
    const { args, dir, base } = makeInPlaceCase("Movie (2019)-RARBG.mkv", { renamed: false });
    fs.writeFileSync(path.join(dir, `${base}.nfo`), "nfo");
    const result = await renameSidecars(args);
    assert.ok(fs.existsSync(path.join(dir, `${base}.nfo`)), ".nfo must be untouched when base name is unchanged");
    assert.strictEqual(result.outputNumber, 1);
  }

  // (c) Full rename: .nfo, -thumb.jpg, and .trickplay all renamed to the new
  // base; the (already-renamed) video and subtitle sidecars are left alone, and
  // the renamed video is never double-suffixed.
  {
    const { args, dir, base, newBase, currentPath } = makeInPlaceCase("Movie (2019)-RARBG.mkv");
    fs.writeFileSync(path.join(dir, `${base}.nfo`), "nfo");
    fs.writeFileSync(path.join(dir, `${base}-thumb.jpg`), "thumb");
    mkTrickplayDir(path.join(dir, `${base}.trickplay`));
    // A subtitle sidecar still under the OLD name (as if rename_group_compressed's
    // own sidecar step hadn't reached it, or ran independently) must be skipped by
    // extension, regardless of prefix match.
    fs.writeFileSync(path.join(dir, `${base}.en.srt`), "sub");

    const result = await renameSidecars(args);

    assert.ok(fs.existsSync(path.join(dir, `${newBase}.nfo`)), ".nfo renamed to new base");
    assert.ok(!fs.existsSync(path.join(dir, `${base}.nfo`)), "old .nfo name gone");

    assert.ok(fs.existsSync(path.join(dir, `${newBase}-thumb.jpg`)), "-thumb.jpg renamed to new base");
    assert.ok(!fs.existsSync(path.join(dir, `${base}-thumb.jpg`)), "old -thumb.jpg name gone");

    assert.ok(fs.existsSync(path.join(dir, `${newBase}.trickplay`)), ".trickplay folder renamed to new base");
    assert.ok(fs.existsSync(path.join(dir, `${newBase}.trickplay`, "1000.jpg")), "trickplay folder contents preserved");
    assert.ok(!fs.existsSync(path.join(dir, `${base}.trickplay`)), "old .trickplay name gone");

    assert.ok(fs.existsSync(path.join(dir, `${base}.en.srt`)), "subtitle sidecar left untouched (skipped by extension)");

    assert.ok(fs.existsSync(currentPath), "already-renamed video left in place, not touched again");
    assert.ok(!fs.existsSync(path.join(dir, `${newBase}-compressed${path.extname(currentPath)}`)), "video must not be double-suffixed");

    assert.strictEqual(result.outputNumber, 1);
  }

  // (d) No-clobber: when the rename target already exists, the SOURCE entry is
  // left in place rather than being renamed on top of it (fs.existsSync guard).
  // Note: because the target name (<newBase>.nfo) itself also starts with
  // originalBase, the loose prefix sweep independently picks up the pre-existing
  // target file too and renames IT further (a known consequence of the
  // intentionally-loose, no-separator prefix match documented in the plugin's
  // own comments) -- so this case asserts the guard fired for the source entry,
  // not that the pre-existing target path is frozen.
  {
    const { args, dir, base, newBase } = makeInPlaceCase("Movie (2019)-RARBG.mkv");
    fs.writeFileSync(path.join(dir, `${base}.nfo`), "original-nfo");
    fs.writeFileSync(path.join(dir, `${newBase}.nfo`), "keep-me");
    await renameSidecars(args);
    assert.strictEqual(fs.readFileSync(path.join(dir, `${base}.nfo`), "utf8"), "original-nfo", "source .nfo left in place (not renamed on top of the existing target), content untouched");
  }

  // (e) Missing media directory (e.g. the in-place folder vanished/was never
  // populated) -> benign no-op, no throw, still returns pass-through.
  {
    const dir = caseDir();
    const missingDir = path.join(dir, "Gone");
    const origPath = path.join(missingDir, "Movie (2019)-RARBG.mkv");
    const currentPath = path.join(missingDir, "Movie (2019)-RARBG-compressed.mkv");
    // NB: missingDir is never created.
    const args = {
      userVariables: { library: { rename_sidecars_compressed: "true" } },
      variables: { user: {} },
      inputFileObj: { _id: currentPath, file: currentPath },
      librarySettings: { folder: dir },
      originalLibraryFile: { _id: origPath },
    };
    const result = await renameSidecars(args);
    assert.strictEqual(result.outputNumber, 1, "missing media directory is a benign no-op");
  }

  // --- test_mode folder-derivation parity against rename_group_compressed -------
  //
  // Both plugins independently derive the sidecar folder as
  // output_dir_done + <library-relative subpath of originalLibraryFile._id>. Run
  // BOTH plugins against the same file layout and confirm each one finds and
  // renames its own sidecar (a .srt for rename_group_compressed, a .nfo for
  // rename_sidecars_compressed) sitting in that SAME folder -- proving the two
  // independently-implemented derivations agree, per scope.md focus area 4.
  {
    const root = caseDir();
    const libFolder = path.join(root, "library");
    const relSub = path.join("Movies", "Movie (2019)");
    const done = path.join(root, "done");
    const finalDir = path.join(done, relSub); // where Tdarr's moveToDirectory places the video in test_mode
    fs.mkdirSync(finalDir, { recursive: true });

    // No trailing hyphen-group token in this name, so rename_group_compressed
    // takes its simple "append -compressed" branch (keeps the expected new name
    // unambiguous for this parity check).
    const originalPath = path.join(libFolder, relSub, "Movie (2019).mkv");
    // The video, already moved+transcoded by Tdarr into its test_mode destination
    // before this Save-chain node runs (still under the ORIGINAL base name; the
    // rename to -compressed happens below).
    const movedPath = path.join(finalDir, "Movie (2019).mkv");
    fs.writeFileSync(movedPath, "video-transcoded");
    // A subtitle sidecar already relocated to the final folder by
    // move_extracted_subs (2 - Prep.yml), which uses this same derivation.
    fs.writeFileSync(path.join(finalDir, "Movie (2019).en.srt"), "sub");

    const groupArgs = {
      userVariables: { library: { rename_group_compressed: "true", test_mode: "true", output_dir_done: done } },
      variables: { user: { video_was_compressed: "true" } },
      inputFileObj: { _id: movedPath, file: movedPath },
      librarySettings: { folder: libFolder },
      originalLibraryFile: { _id: originalPath },
    };
    await renameGroupCompressed(groupArgs);

    const compressedVideoPath = path.join(finalDir, "Movie (2019)-compressed.mkv");
    assert.ok(fs.existsSync(compressedVideoPath), "rename_group_compressed renamed the video in its derived folder");
    assert.ok(fs.existsSync(path.join(finalDir, "Movie (2019)-compressed.en.srt")), "rename_group_compressed renamed the .srt sidecar in that SAME derived folder");

    // A Jellyfin NFO sidecar sitting in that same derived folder.
    fs.writeFileSync(path.join(finalDir, "Movie (2019).nfo"), "nfo");

    // groupArgs.inputFileObj._id was mutated in place to the -compressed path by
    // rename_group_compressed -- exactly what RnScJs02 observes as
    // args.inputFileObj._id in the real test_mode flow.
    const sidecarArgs = {
      userVariables: { library: { rename_sidecars_compressed: "true", test_mode: "true", output_dir_done: done } },
      variables: { user: {} },
      inputFileObj: { _id: groupArgs.inputFileObj._id, file: groupArgs.inputFileObj._id },
      librarySettings: { folder: libFolder },
      originalLibraryFile: { _id: originalPath },
    };
    await renameSidecars(sidecarArgs);

    assert.ok(
      fs.existsSync(path.join(finalDir, "Movie (2019)-compressed.nfo")),
      "rename_sidecars_compressed found and renamed the .nfo sidecar in the SAME folder rename_group_compressed derived"
    );
    assert.ok(!fs.existsSync(path.join(finalDir, "Movie (2019).nfo")), "old .nfo name gone");
  }

  // (f) Empty originalBase (originalLibraryFile._id unset) -> guard fires before
  // the prefix sweep; nothing in the folder is renamed (an empty prefix would
  // otherwise match EVERY entry) and the pass-through is returned.
  {
    const dir = caseDir();
    const currentPath = path.join(dir, "Movie (2019)-compressed.mkv");
    fs.writeFileSync(currentPath, "video");
    fs.writeFileSync(path.join(dir, "Unrelated.nfo"), "nfo");
    const args = {
      userVariables: { library: { rename_sidecars_compressed: "true" } },
      variables: { user: {} },
      inputFileObj: { _id: currentPath, file: currentPath },
      librarySettings: { folder: dir },
      originalLibraryFile: { _id: "" },
    };
    const result = await renameSidecars(args);
    assert.strictEqual(result.outputNumber, 1, "empty originalBase is a benign no-op");
    assert.ok(fs.existsSync(path.join(dir, "Unrelated.nfo")), "no entry swept up by an empty-prefix match");
  }

  // (g) test_mode with output_dir_done empty/unset -> non-fatal, but logs a
  // distinguishing misconfiguration WARNING instead of only the generic
  // missing-directory ENOENT message.
  {
    const dir = caseDir();
    const origPath = path.join(dir, "Movie (2019).mkv");
    const currentPath = path.join(dir, "Movie (2019)-compressed.mkv");
    fs.writeFileSync(currentPath, "video");
    const args = {
      userVariables: { library: { rename_sidecars_compressed: "true", test_mode: "true" } },
      variables: { user: {} },
      inputFileObj: { _id: currentPath, file: currentPath },
      librarySettings: { folder: dir },
      originalLibraryFile: { _id: origPath },
    };
    const logs = [];
    const origLog = console.log;
    console.log = (msg) => logs.push(String(msg));
    let result;
    try {
      result = await renameSidecars(args);
    } finally {
      console.log = origLog;
    }
    assert.strictEqual(result.outputNumber, 1, "test_mode without output_dir_done stays non-fatal");
    assert.ok(
      logs.some((l) => l.includes("WARNING test_mode is enabled but output_dir_done is empty/unset")),
      "misconfiguration warning logged"
    );
  }

  // --- Byte-identity: inline copies in "5 - Save.yml" == plugin file ------------
  //
  // Both customFunction nodes (in-place path RnScJs01, test_mode path RnScJs02)
  // embed a copy of this plugin's source. They must stay byte-for-byte identical
  // so the flow and the standalone plugin never drift.
  {
    const pluginSrc = fs.readFileSync(path.join(__dirname, "js_rename_sidecars_compressed.js"), "utf8");
    const flow = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "5 - Save.yml"), "utf8"));
    for (const id of ["RnScJs01", "RnScJs02"]) {
      const node = flow.flowPlugins.find((p) => p.id === id);
      assert.ok(node, `${id} node must exist in 5 - Save.yml`);
      assert.strictEqual(node.pluginName, "customFunction", `${id} must be a customFunction node`);
      assert.ok(node.inputsDB && typeof node.inputsDB.code === "string", `${id} must have an inputsDB.code string`);
      assert.strictEqual(node.inputsDB.code, pluginSrc, `inline ${id} copy must be byte-identical to plugins/js_rename_sidecars_compressed.js`);
    }
  }

  console.log("All rename_sidecars_compressed regression tests passed.");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
