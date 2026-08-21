// Regression test for js_rename_group_compressed.js.
// No test framework/package.json exists in this repo, so this is a plain Node
// script: `node plugins/test_rename_group_compressed.js` (exit code 0 = pass).

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const rename = require("./js_rename_group_compressed.js");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rename-group-compressed-"));

let caseCounter = 0;

function makeArgs(fileName, { renameEnabled = true, videoWasCompressed = true } = {}) {
  // Isolate each scenario in its own subdirectory so target filenames from one
  // case can't collide with (or clobber) another's.
  const caseDir = path.join(tmpDir, `case-${caseCounter++}`);
  fs.mkdirSync(caseDir, { recursive: true });
  const filePath = path.join(caseDir, fileName);
  fs.writeFileSync(filePath, "x");
  return {
    userVariables: { library: { rename_group_compressed: renameEnabled ? "true" : "false" } },
    variables: { user: { video_was_compressed: videoWasCompressed ? "true" : "false" } },
    inputFileObj: { _id: filePath, file: filePath },
  };
}

async function run(fileName, opts) {
  const args = makeArgs(fileName, opts);
  const result = await rename(args);
  return { result, args };
}

(async () => {
  // Title-internal hyphen must not be mistaken for a release-group separator:
  // the title and year must survive the rename.
  {
    const { result } = await run("Spider-Man (2019).mkv");
    const newId = result.outputFileObj._id;
    assert.strictEqual(path.basename(newId), "Spider-Man (2019)-compressed.mkv");
    assert.ok(fs.existsSync(newId), "renamed file should exist on disk");
  }

  // Real release-group token gets replaced.
  {
    const { result } = await run("Movie (2019)-RARBG.mkv");
    assert.strictEqual(path.basename(result.outputFileObj._id), "Movie (2019)-compressed.mkv");
  }

  // No group token present: marker is appended.
  {
    const { result } = await run("Movie (2019).mkv");
    assert.strictEqual(path.basename(result.outputFileObj._id), "Movie (2019)-compressed.mkv");
  }

  // Idempotent: already-renamed files are left alone.
  {
    const { result, args } = await run("Movie (2019)-compressed.mkv");
    assert.strictEqual(result.outputFileObj._id, args.inputFileObj._id);
    assert.ok(fs.existsSync(args.inputFileObj._id));
  }

  // Mutation propagates on both _id and file so downstream save plugins see it.
  {
    const { result } = await run("Movie (2019)-RARBG.mkv");
    assert.strictEqual(result.outputFileObj._id, result.outputFileObj.file);
  }

  // No-op when the library variable is unset.
  {
    const { result, args } = await run("Movie (2019)-RARBG.mkv", { renameEnabled: false });
    assert.strictEqual(result.outputFileObj._id, args.inputFileObj._id);
    assert.ok(fs.existsSync(args.inputFileObj._id), "original file should be untouched");
  }

  // No-op when the file wasn't actually re-encoded this run.
  {
    const { result, args } = await run("Movie (2019)-RARBG.mkv", { videoWasCompressed: false });
    assert.strictEqual(result.outputFileObj._id, args.inputFileObj._id);
    assert.ok(fs.existsSync(args.inputFileObj._id));
  }

  // No-op when only audio was re-encoded (was_compressed=true) but video was
  // skipped/remuxed (video_was_compressed unset/false) — the exact scenario
  // this gating change targets.
  {
    const caseDir = path.join(tmpDir, "case-audio-only");
    fs.mkdirSync(caseDir, { recursive: true });
    const filePath = path.join(caseDir, "Movie (2019)-RARBG.mkv");
    fs.writeFileSync(filePath, "x");
    const args = {
      userVariables: { library: { rename_group_compressed: "true" } },
      variables: { user: { was_compressed: "true", video_was_compressed: "false" } },
      inputFileObj: { _id: filePath, file: filePath },
    };
    const result = await rename(args);
    assert.strictEqual(result.outputFileObj._id, filePath, "audio-only recompression must not trigger rename");
    assert.ok(fs.existsSync(filePath), "original file should be untouched");
  }

  // Overwrite guard: if the target "<name>-compressed.ext" already exists, the
  // rename is skipped so the pre-existing file is not clobbered.
  {
    const guardDir = path.join(tmpDir, "overwrite-guard");
    fs.mkdirSync(guardDir, { recursive: true });
    const sourcePath = path.join(guardDir, "Guarded (2019)-RARBG.mkv");
    const preExisting = path.join(guardDir, "Guarded (2019)-compressed.mkv");
    fs.writeFileSync(sourcePath, "source");
    fs.writeFileSync(preExisting, "keep-me");
    const args = {
      userVariables: { library: { rename_group_compressed: "true" } },
      variables: { user: { video_was_compressed: "true" } },
      inputFileObj: { _id: sourcePath, file: sourcePath },
    };
    const result = await rename(args);
    // Rename skipped: output still points at the original source file...
    assert.strictEqual(result.outputFileObj._id, sourcePath, "should skip rename when target exists");
    assert.ok(fs.existsSync(sourcePath), "original source file should be untouched");
    // ...and the pre-existing target was not overwritten.
    assert.strictEqual(fs.readFileSync(preExisting, "utf8"), "keep-me", "existing target must not be clobbered");
  }

  // A failed rename (e.g. source file missing) is caught, logged, and doesn't throw.
  {
    const missingPath = path.join(tmpDir, "does-not-exist-RARBG.mkv");
    const args = {
      userVariables: { library: { rename_group_compressed: "true" } },
      variables: { user: { video_was_compressed: "true" } },
      inputFileObj: { _id: missingPath, file: missingPath },
    };
    const result = await rename(args);
    assert.strictEqual(result.outputFileObj._id, missingPath, "should fall back to original path on rename failure");
  }

  // --- Sidecar subtitle rename coverage ---------------------------------------
  //
  // The plugin re-derives the sidecar folder the same way stage 2 placed the subs:
  //   regular mode -> originalLibraryFile.meta.Directory
  //   test mode    -> output_dir_done + path.relative(librarySettings.folder, meta.Directory)
  // These helpers build args with those fields and pre-create sidecar files on disk.

  let sidecarCounter = 0;
  function sidecarCaseDir() {
    const d = path.join(tmpDir, `sidecar-${sidecarCounter++}`);
    fs.mkdirSync(d, { recursive: true });
    return d;
  }

  // Regular mode: video and sidecars share the original file folder.
  function makeRegularArgs(videoName, sidecarNames, { renameEnabled = true, videoWasCompressed = true } = {}) {
    const root = sidecarCaseDir();
    const libFolder = path.join(root, "library");
    const movieDir = path.join(libFolder, "Movies", "Movie (2019)");
    fs.mkdirSync(movieDir, { recursive: true });
    const videoPath = path.join(movieDir, videoName);
    fs.writeFileSync(videoPath, "video");
    for (const s of sidecarNames) fs.writeFileSync(path.join(movieDir, s), "sub");
    return {
      args: {
        userVariables: { library: { rename_group_compressed: renameEnabled ? "true" : "false" } },
        variables: { user: { video_was_compressed: videoWasCompressed ? "true" : "false" } },
        inputFileObj: { _id: videoPath, file: videoPath },
        librarySettings: { folder: libFolder },
        originalLibraryFile: { _id: videoPath, meta: { Directory: movieDir } },
      },
      movieDir,
    };
  }

  // Test mode: video is logically under library/Movies/Movie (2019), sidecars were
  // placed by stage 2 at output_dir_done/Movies/Movie (2019) (the relative subpath).
  function makeTestModeArgs(videoName, sidecarNames, { renameEnabled = true, videoWasCompressed = true } = {}) {
    const root = sidecarCaseDir();
    const libFolder = path.join(root, "library");
    const relSub = path.join("Movies", "Movie (2019)");
    const movieDir = path.join(libFolder, relSub);
    fs.mkdirSync(movieDir, { recursive: true });
    // The video the plugin renames lives in the cache/working dir at this stage.
    const cacheDir = path.join(root, "cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    const videoPath = path.join(cacheDir, videoName);
    fs.writeFileSync(videoPath, "video");
    // Sidecars sit at output_dir_done/<relSub>/ per Bug 1's fix.
    const outputDirDone = path.join(root, "done");
    const sidecarDir = path.join(outputDirDone, relSub);
    fs.mkdirSync(sidecarDir, { recursive: true });
    for (const s of sidecarNames) fs.writeFileSync(path.join(sidecarDir, s), "sub");
    return {
      args: {
        userVariables: {
          library: {
            rename_group_compressed: renameEnabled ? "true" : "false",
            test_mode: "true",
            output_dir_done: outputDirDone,
          },
        },
        variables: { user: { video_was_compressed: videoWasCompressed ? "true" : "false" } },
        inputFileObj: { _id: videoPath, file: videoPath },
        librarySettings: { folder: libFolder },
        // meta.Directory is the ORIGINAL library location, not the cache.
        originalLibraryFile: { _id: path.join(movieDir, videoName), meta: { Directory: movieDir } },
      },
      sidecarDir,
    };
  }

  // Regular mode: a language-suffixed sidecar is renamed alongside the video.
  {
    const { args, movieDir } = makeRegularArgs("Movie (2019)-RARBG.mkv", ["Movie (2019)-RARBG.en.srt"]);
    await rename(args);
    assert.ok(fs.existsSync(path.join(movieDir, "Movie (2019)-compressed.en.srt")), "sidecar should be renamed to match video");
    assert.ok(!fs.existsSync(path.join(movieDir, "Movie (2019)-RARBG.en.srt")), "old sidecar name should be gone");
  }

  // Regular mode: bare + all four extensions + language suffixes are all renamed.
  {
    const sidecars = [
      "Movie (2019)-RARBG.srt",
      "Movie (2019)-RARBG.en.srt",
      "Movie (2019)-RARBG.en.ass",
      "Movie (2019)-RARBG.fr.sub",
      "Movie (2019)-RARBG.fr.idx",
    ];
    const { args, movieDir } = makeRegularArgs("Movie (2019)-RARBG.mkv", sidecars);
    await rename(args);
    for (const expected of [
      "Movie (2019)-compressed.srt",
      "Movie (2019)-compressed.en.srt",
      "Movie (2019)-compressed.en.ass",
      "Movie (2019)-compressed.fr.sub",
      "Movie (2019)-compressed.fr.idx",
    ]) {
      assert.ok(fs.existsSync(path.join(movieDir, expected)), `expected renamed sidecar ${expected}`);
    }
  }

  // Regular mode: a look-alike file (shared prefix, no literal dot boundary) is left alone.
  {
    const { args, movieDir } = makeRegularArgs("Movie (2019)-RARBG.mkv", [
      "Movie (2019)-RARBG.en.srt",
      "Movie (2019)-RARBG2.en.srt", // baseName is "Movie (2019)-RARBG", this should NOT match
    ]);
    await rename(args);
    assert.ok(fs.existsSync(path.join(movieDir, "Movie (2019)-compressed.en.srt")), "matching sidecar renamed");
    assert.ok(fs.existsSync(path.join(movieDir, "Movie (2019)-RARBG2.en.srt")), "look-alike sidecar must be untouched");
  }

  // Test mode: sidecar under output_dir_done/<relative subpath> is renamed.
  {
    const { args, sidecarDir } = makeTestModeArgs("Movie (2019)-RARBG.mkv", ["Movie (2019)-RARBG.en.srt"]);
    await rename(args);
    assert.ok(fs.existsSync(path.join(sidecarDir, "Movie (2019)-compressed.en.srt")), "test-mode sidecar renamed in output_dir_done subpath");
    assert.ok(!fs.existsSync(path.join(sidecarDir, "Movie (2019)-RARBG.en.srt")), "old test-mode sidecar name gone");
  }

  // No-op when rename_group_compressed is off: sidecar untouched.
  {
    const { args, movieDir } = makeRegularArgs("Movie (2019)-RARBG.mkv", ["Movie (2019)-RARBG.en.srt"], { renameEnabled: false });
    await rename(args);
    assert.ok(fs.existsSync(path.join(movieDir, "Movie (2019)-RARBG.en.srt")), "sidecar untouched when rename disabled");
  }

  // No-op when video_was_compressed is false: sidecar untouched.
  {
    const { args, movieDir } = makeRegularArgs("Movie (2019)-RARBG.mkv", ["Movie (2019)-RARBG.en.srt"], { videoWasCompressed: false });
    await rename(args);
    assert.ok(fs.existsSync(path.join(movieDir, "Movie (2019)-RARBG.en.srt")), "sidecar untouched when not re-encoded");
  }

  // Idempotent: an already-compressed video returns early, sidecar left alone.
  {
    const { args, movieDir } = makeRegularArgs("Movie (2019)-compressed.mkv", ["Movie (2019)-compressed.en.srt"]);
    await rename(args);
    assert.ok(fs.existsSync(path.join(movieDir, "Movie (2019)-compressed.en.srt")), "already-compressed sidecar unchanged");
  }

  // No-clobber on sidecar target collision: video still renamed, both sidecars preserved.
  {
    const { args, movieDir } = makeRegularArgs("Movie (2019)-RARBG.mkv", ["Movie (2019)-RARBG.en.srt"]);
    const collidingTarget = path.join(movieDir, "Movie (2019)-compressed.en.srt");
    fs.writeFileSync(collidingTarget, "keep-me");
    const result = await rename(args);
    // Video rename is independent of the sidecar outcome.
    assert.strictEqual(path.basename(result.outputFileObj._id), "Movie (2019)-compressed.mkv", "video still renamed");
    // Pre-existing target content untouched; source sidecar not clobbered/deleted.
    assert.strictEqual(fs.readFileSync(collidingTarget, "utf8"), "keep-me", "colliding sidecar target must not be overwritten");
    assert.ok(fs.existsSync(path.join(movieDir, "Movie (2019)-RARBG.en.srt")), "source sidecar preserved on collision");
  }

  // No sidecars present at all: sidecar step is a harmless no-op, video renamed.
  {
    const { args, movieDir } = makeRegularArgs("Movie (2019)-RARBG.mkv", []);
    const result = await rename(args);
    assert.strictEqual(path.basename(result.outputFileObj._id), "Movie (2019)-compressed.mkv", "video renamed with no sidecars present");
    assert.ok(fs.existsSync(path.join(movieDir, "Movie (2019)-compressed.mkv")), "renamed video exists");
  }

  // --- Hard-fail: test_mode on but output_dir_done blank/unset ------------------
  //
  // Defense-in-depth backstop. The flow's early gate (2 - Prep.yml) should fail
  // fast before transcoding, but if the plugin is ever reached in that state it
  // must THROW (not silently log-and-skip), because there is no provable folder in
  // which to find the sidecars. Helper builds a test_mode video whose rename
  // succeeds first, then the plugin throws.
  function makeBlankOutputArgs(outputDirDoneValue) {
    const root = sidecarCaseDir();
    const libFolder = path.join(root, "library");
    const movieDir = path.join(libFolder, "Movies", "Movie (2019)");
    fs.mkdirSync(movieDir, { recursive: true });
    const cacheDir = path.join(root, "cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    const videoPath = path.join(cacheDir, "Movie (2019)-RARBG.mkv");
    fs.writeFileSync(videoPath, "video");
    const library = { rename_group_compressed: "true", test_mode: "true" };
    // Distinguish "explicitly blank" from "unset" — both must hard-fail.
    if (outputDirDoneValue !== undefined) library.output_dir_done = outputDirDoneValue;
    return {
      args: {
        userVariables: { library },
        variables: { user: { video_was_compressed: "true" } },
        inputFileObj: { _id: videoPath, file: videoPath },
        librarySettings: { folder: libFolder },
        originalLibraryFile: { _id: path.join(movieDir, "Movie (2019)-RARBG.mkv"), meta: { Directory: movieDir } },
      },
      cacheDir,
    };
  }

  // Explicitly blank output_dir_done.
  {
    const { args, cacheDir } = makeBlankOutputArgs("");
    await assert.rejects(rename(args), /output_dir_done/, "blank output_dir_done in test_mode must hard-fail");
    // The video rename still took effect before the throw (rename is not undone).
    assert.ok(fs.existsSync(path.join(cacheDir, "Movie (2019)-compressed.mkv")), "video still renamed before hard-fail");
  }

  // output_dir_done entirely unset (key absent).
  {
    const { args } = makeBlankOutputArgs(undefined);
    await assert.rejects(rename(args), /output_dir_done/, "unset output_dir_done in test_mode must hard-fail");
  }

  // Whitespace-only output_dir_done is treated as blank (trimmed) and hard-fails.
  {
    const { args } = makeBlankOutputArgs("   ");
    await assert.rejects(rename(args), /output_dir_done/, "whitespace-only output_dir_done must hard-fail");
  }

  // --- Byte-identity: inline copy in "5 - Save.yml" == plugin file --------------
  //
  // Node RnCmpJs01 in 5 - Save.yml embeds a copy of this plugin's source. They must
  // stay byte-for-byte identical so the flow and the standalone plugin never drift.
  {
    const pluginSrc = fs.readFileSync(path.join(__dirname, "js_rename_group_compressed.js"), "utf8");
    const flow = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "5 - Save.yml"), "utf8"));
    const node = flow.flowPlugins.find((p) => p.id === "RnCmpJs01");
    assert.ok(node, "RnCmpJs01 node must exist in 5 - Save.yml");
    assert.ok(node.inputsDB && typeof node.inputsDB.code === "string", "RnCmpJs01 must have an inputsDB.code string");
    assert.strictEqual(node.inputsDB.code, pluginSrc, "inline RnCmpJs01 copy must be byte-identical to plugins/js_rename_group_compressed.js");
  }

  // --- Root-level video (no library subpath) -----------------------------------
  //
  // Test mode: a video sitting directly in the library root has an empty relative
  // subpath, so its sidecars live directly under output_dir_done (not a subfolder).
  {
    const root = sidecarCaseDir();
    const libFolder = path.join(root, "library");
    fs.mkdirSync(libFolder, { recursive: true });
    const cacheDir = path.join(root, "cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    const videoPath = path.join(cacheDir, "Movie (2019)-RARBG.mkv");
    fs.writeFileSync(videoPath, "video");
    const outputDirDone = path.join(root, "done");
    fs.mkdirSync(outputDirDone, { recursive: true });
    fs.writeFileSync(path.join(outputDirDone, "Movie (2019)-RARBG.en.srt"), "sub");
    const args = {
      userVariables: { library: { rename_group_compressed: "true", test_mode: "true", output_dir_done: outputDirDone } },
      variables: { user: { video_was_compressed: "true" } },
      inputFileObj: { _id: videoPath, file: videoPath },
      librarySettings: { folder: libFolder },
      originalLibraryFile: { _id: path.join(libFolder, "Movie (2019)-RARBG.mkv"), meta: { Directory: libFolder } },
    };
    await rename(args);
    assert.ok(fs.existsSync(path.join(outputDirDone, "Movie (2019)-compressed.en.srt")), "root-level test-mode sidecar renamed at output_dir_done root");
    assert.ok(!fs.existsSync(path.join(outputDirDone, "Movie (2019)-RARBG.en.srt")), "old root-level sidecar gone");
  }

  // Regular mode: a root-level video's sidecar sits next to it and is renamed.
  {
    const root = sidecarCaseDir();
    const libFolder = path.join(root, "library");
    fs.mkdirSync(libFolder, { recursive: true });
    const videoPath = path.join(libFolder, "Movie (2019)-RARBG.mkv");
    fs.writeFileSync(videoPath, "video");
    fs.writeFileSync(path.join(libFolder, "Movie (2019)-RARBG.srt"), "sub");
    const args = {
      userVariables: { library: { rename_group_compressed: "true" } },
      variables: { user: { video_was_compressed: "true" } },
      inputFileObj: { _id: videoPath, file: videoPath },
      librarySettings: { folder: libFolder },
      originalLibraryFile: { _id: videoPath, meta: { Directory: libFolder } },
    };
    await rename(args);
    assert.ok(fs.existsSync(path.join(libFolder, "Movie (2019)-compressed.srt")), "root-level in-place sidecar renamed");
    assert.ok(!fs.existsSync(path.join(libFolder, "Movie (2019)-RARBG.srt")), "old root-level in-place sidecar gone");
  }

  // --- Case-insensitive sidecar extension matching -----------------------------
  //
  // Extensions are matched case-insensitively; the original suffix casing is kept.
  {
    const { args, movieDir } = makeRegularArgs("Movie (2019)-RARBG.mkv", [
      "Movie (2019)-RARBG.EN.SRT",
      "Movie (2019)-RARBG.FR.Sub",
      "Movie (2019)-RARBG.ASS",
      "Movie (2019)-RARBG.DE.IDX",
    ]);
    await rename(args);
    for (const expected of [
      "Movie (2019)-compressed.EN.SRT",
      "Movie (2019)-compressed.FR.Sub",
      "Movie (2019)-compressed.ASS",
      "Movie (2019)-compressed.DE.IDX",
    ]) {
      assert.ok(fs.existsSync(path.join(movieDir, expected)), `uppercase/mixed-case sidecar ${expected} renamed (case-insensitive ext match)`);
    }
  }

  // --- Multi-sidecar partial collision: one target exists, the rest continue ----
  //
  // If one sidecar's target already exists, that single rename is skipped (no
  // clobber) but the loop keeps going and renames every other sidecar.
  {
    const { args, movieDir } = makeRegularArgs("Movie (2019)-RARBG.mkv", [
      "Movie (2019)-RARBG.en.srt",
      "Movie (2019)-RARBG.fr.srt",
      "Movie (2019)-RARBG.de.srt",
    ]);
    const collide = path.join(movieDir, "Movie (2019)-compressed.fr.srt");
    fs.writeFileSync(collide, "keep-me");
    await rename(args);
    // The collision is left fully intact...
    assert.strictEqual(fs.readFileSync(collide, "utf8"), "keep-me", "colliding sidecar target must not be overwritten");
    assert.ok(fs.existsSync(path.join(movieDir, "Movie (2019)-RARBG.fr.srt")), "source of the colliding sidecar preserved");
    // ...while the other sidecars are still renamed (loop continued past collision).
    assert.ok(fs.existsSync(path.join(movieDir, "Movie (2019)-compressed.en.srt")), "en sidecar renamed despite fr collision");
    assert.ok(!fs.existsSync(path.join(movieDir, "Movie (2019)-RARBG.en.srt")), "old en sidecar gone");
    assert.ok(fs.existsSync(path.join(movieDir, "Movie (2019)-compressed.de.srt")), "de sidecar renamed despite fr collision");
    assert.ok(!fs.existsSync(path.join(movieDir, "Movie (2019)-RARBG.de.srt")), "old de sidecar gone");
  }

  console.log("All rename_group_compressed regression tests passed.");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
