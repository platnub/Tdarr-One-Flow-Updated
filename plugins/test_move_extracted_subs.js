// Regression test for js_move_extracted_subs.js.
// No test framework/package.json exists in this repo, so this is a plain Node
// script: `node plugins/test_move_extracted_subs.js` (exit code 0 = pass).

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const move = require("./js_move_extracted_subs.js");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "move-extracted-subs-"));

let caseCounter = 0;
function caseDir() {
  const d = path.join(tmpDir, `case-${caseCounter++}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// Regular (in-place) mode: the extractor already wrote the sidecars next to the
// original file, which IS the final in-place folder. The plugin must be a no-op:
// subtitles were "extracted directly to the destination" and nothing is moved.
function makeRegularArgs(videoName, sidecarNames) {
  const root = caseDir();
  const libFolder = path.join(root, "library");
  const movieDir = path.join(libFolder, "Movies", "Movie (2019)");
  fs.mkdirSync(movieDir, { recursive: true });
  const videoPath = path.join(movieDir, videoName);
  fs.writeFileSync(videoPath, "video");
  for (const s of sidecarNames) fs.writeFileSync(path.join(movieDir, s), "sub");
  return {
    args: {
      userVariables: { library: {} },
      variables: { user: {} },
      inputFileObj: { _id: videoPath, file: videoPath },
      librarySettings: { folder: libFolder },
      originalLibraryFile: { _id: videoPath, meta: { Directory: movieDir } },
    },
    movieDir,
  };
}

// Test mode: the extractor wrote the sidecars next to the ORIGINAL file (kept in
// place in test_mode), but the transcoded video goes to
// output_dir_done/<library-relative subpath>. The plugin must relocate the
// sidecars to that same subpath so they follow the video.
function makeTestModeArgs(videoName, sidecarNames, { outputDirDone } = {}) {
  const root = caseDir();
  const libFolder = path.join(root, "library");
  const relSub = path.join("Movies", "Movie (2019)");
  const movieDir = path.join(libFolder, relSub);
  fs.mkdirSync(movieDir, { recursive: true });
  const videoPath = path.join(movieDir, videoName);
  fs.writeFileSync(videoPath, "video");
  for (const s of sidecarNames) fs.writeFileSync(path.join(movieDir, s), "sub");
  const done = outputDirDone === undefined ? path.join(root, "done") : outputDirDone;
  return {
    args: {
      userVariables: { library: { test_mode: "true", output_dir_done: done } },
      variables: { user: {} },
      inputFileObj: { _id: videoPath, file: videoPath },
      librarySettings: { folder: libFolder },
      originalLibraryFile: { _id: videoPath, meta: { Directory: movieDir } },
    },
    movieDir,
    sidecarDir: path.join(done, relSub),
    done,
  };
}

(async () => {
  // (c) Regular mode: sidecars already at destination -> untouched (no-op move).
  {
    const { args, movieDir } = makeRegularArgs("Movie (2019)-RARBG.mkv", [
      "Movie (2019)-RARBG.en.srt",
      "Movie (2019)-RARBG.fr.ass",
    ]);
    await move(args);
    assert.ok(fs.existsSync(path.join(movieDir, "Movie (2019)-RARBG.en.srt")), "en sidecar stays put in-place");
    assert.ok(fs.existsSync(path.join(movieDir, "Movie (2019)-RARBG.fr.ass")), "fr sidecar stays put in-place");
    assert.ok(fs.existsSync(path.join(movieDir, "Movie (2019)-RARBG.mkv")), "video untouched");
  }

  // (a) Test mode: sidecars relocated to output_dir_done/<relative subpath>.
  {
    const sidecars = [
      "Movie (2019)-RARBG.srt",
      "Movie (2019)-RARBG.en.srt",
      "Movie (2019)-RARBG.en.ass",
      "Movie (2019)-RARBG.fr.sub",
      "Movie (2019)-RARBG.fr.idx",
    ];
    const { args, movieDir, sidecarDir } = makeTestModeArgs("Movie (2019)-RARBG.mkv", sidecars);
    await move(args);
    for (const s of sidecars) {
      assert.ok(fs.existsSync(path.join(sidecarDir, s)), `sidecar ${s} moved into output_dir_done subpath`);
      assert.ok(!fs.existsSync(path.join(movieDir, s)), `sidecar ${s} removed from source folder`);
    }
    // The kept original video is NOT moved (only subtitle byproducts follow it).
    assert.ok(fs.existsSync(path.join(movieDir, "Movie (2019)-RARBG.mkv")), "original video kept in place in test_mode");
  }

  // Test mode, root-level video: empty subpath -> sidecars land directly under output_dir_done.
  {
    const root = caseDir();
    const libFolder = path.join(root, "library");
    fs.mkdirSync(libFolder, { recursive: true });
    const videoPath = path.join(libFolder, "Movie (2019)-RARBG.mkv");
    fs.writeFileSync(videoPath, "video");
    fs.writeFileSync(path.join(libFolder, "Movie (2019)-RARBG.en.srt"), "sub");
    const done = path.join(root, "done");
    const args = {
      userVariables: { library: { test_mode: "true", output_dir_done: done } },
      variables: { user: {} },
      inputFileObj: { _id: videoPath, file: videoPath },
      librarySettings: { folder: libFolder },
      originalLibraryFile: { _id: videoPath, meta: { Directory: libFolder } },
    };
    await move(args);
    assert.ok(fs.existsSync(path.join(done, "Movie (2019)-RARBG.en.srt")), "root-level sidecar lands at output_dir_done root");
    assert.ok(!fs.existsSync(path.join(libFolder, "Movie (2019)-RARBG.en.srt")), "root-level sidecar removed from source");
  }

  // Non-subtitle files are left behind; only srt/ass/sub/idx are moved.
  {
    const { args, movieDir, sidecarDir } = makeTestModeArgs("Movie (2019)-RARBG.mkv", [
      "Movie (2019)-RARBG.en.srt",
      "Movie (2019)-RARBG.nfo",
      "poster.jpg",
    ]);
    await move(args);
    assert.ok(fs.existsSync(path.join(sidecarDir, "Movie (2019)-RARBG.en.srt")), "srt moved");
    assert.ok(fs.existsSync(path.join(movieDir, "Movie (2019)-RARBG.nfo")), ".nfo left behind");
    assert.ok(fs.existsSync(path.join(movieDir, "poster.jpg")), "poster left behind");
  }

  // Only THIS video's sidecars move; subtitles for other videos sharing the
  // source folder (and near-miss names) are left behind untouched.
  {
    const { args, movieDir, sidecarDir } = makeTestModeArgs("Movie (2019)-RARBG.mkv", [
      "Movie (2019)-RARBG.srt",          // belongs to current video -> move
      "Movie (2019)-RARBG.en.srt",       // belongs to current video -> move
      "Other Movie.en.srt",              // different video -> stay
      "Movie (2019)-RARBG-extra.en.srt", // near-miss (no "." after stem) -> stay
    ]);
    await move(args);
    for (const s of ["Movie (2019)-RARBG.srt", "Movie (2019)-RARBG.en.srt"]) {
      assert.ok(fs.existsSync(path.join(sidecarDir, s)), `own sidecar ${s} moved`);
      assert.ok(!fs.existsSync(path.join(movieDir, s)), `own sidecar ${s} removed from source`);
    }
    for (const s of ["Other Movie.en.srt", "Movie (2019)-RARBG-extra.en.srt"]) {
      assert.ok(fs.existsSync(path.join(movieDir, s)), `unrelated subtitle ${s} left in source`);
      assert.ok(!fs.existsSync(path.join(sidecarDir, s)), `unrelated subtitle ${s} not moved`);
    }
  }

  // Case-insensitive extension matching; original casing preserved.
  {
    const sidecars = ["Movie (2019)-RARBG.EN.SRT", "Movie (2019)-RARBG.FR.Sub", "Movie (2019)-RARBG.ASS"];
    const { args, sidecarDir } = makeTestModeArgs("Movie (2019)-RARBG.mkv", sidecars);
    await move(args);
    for (const s of sidecars) {
      assert.ok(fs.existsSync(path.join(sidecarDir, s)), `mixed-case sidecar ${s} moved`);
    }
  }

  // No-clobber: a sidecar already at the destination is not overwritten; the
  // source copy is left in place rather than destroyed.
  {
    const { args, movieDir, sidecarDir } = makeTestModeArgs("Movie (2019)-RARBG.mkv", ["Movie (2019)-RARBG.en.srt"]);
    fs.mkdirSync(sidecarDir, { recursive: true });
    const target = path.join(sidecarDir, "Movie (2019)-RARBG.en.srt");
    fs.writeFileSync(target, "keep-me");
    await move(args);
    assert.strictEqual(fs.readFileSync(target, "utf8"), "keep-me", "existing destination sidecar not overwritten");
    assert.ok(fs.existsSync(path.join(movieDir, "Movie (2019)-RARBG.en.srt")), "source sidecar preserved on collision");
  }

  // Partial collision: one target exists, the rest still move.
  {
    const { args, movieDir, sidecarDir } = makeTestModeArgs("Movie (2019)-RARBG.mkv", [
      "Movie (2019)-RARBG.en.srt",
      "Movie (2019)-RARBG.fr.srt",
    ]);
    fs.mkdirSync(sidecarDir, { recursive: true });
    fs.writeFileSync(path.join(sidecarDir, "Movie (2019)-RARBG.fr.srt"), "keep-me");
    await move(args);
    assert.ok(fs.existsSync(path.join(sidecarDir, "Movie (2019)-RARBG.en.srt")), "en sidecar moved despite fr collision");
    assert.ok(!fs.existsSync(path.join(movieDir, "Movie (2019)-RARBG.en.srt")), "en source removed");
    assert.strictEqual(fs.readFileSync(path.join(sidecarDir, "Movie (2019)-RARBG.fr.srt"), "utf8"), "keep-me", "fr collision untouched");
    assert.ok(fs.existsSync(path.join(movieDir, "Movie (2019)-RARBG.fr.srt")), "fr source preserved on collision");
  }

  // No sidecars present: harmless no-op.
  {
    const { args } = makeTestModeArgs("Movie (2019)-RARBG.mkv", []);
    const result = await move(args);
    assert.strictEqual(result.outputNumber, 1, "continues the flow with nothing to move");
  }

  // Missing source directory (e.g. nothing was extracted): benign no-op, no throw.
  {
    const root = caseDir();
    const libFolder = path.join(root, "library");
    const missingDir = path.join(libFolder, "Gone");
    const videoPath = path.join(missingDir, "Movie (2019)-RARBG.mkv");
    // NB: missingDir is never created.
    const args = {
      userVariables: { library: {} },
      variables: { user: {} },
      inputFileObj: { _id: videoPath, file: videoPath },
      librarySettings: { folder: libFolder },
      originalLibraryFile: { _id: videoPath, meta: { Directory: missingDir } },
    };
    // Regular mode: source===dest===missingDir, so it early-returns before readdir.
    const result = await move(args);
    assert.strictEqual(result.outputNumber, 1, "missing dir in regular mode is a no-op");
  }

  // Cross-device fallback: renameSync throwing EXDEV falls back to copy + unlink.
  {
    const { args, movieDir, sidecarDir } = makeTestModeArgs("Movie (2019)-RARBG.mkv", ["Movie (2019)-RARBG.en.srt"]);
    fs.writeFileSync(path.join(movieDir, "Movie (2019)-RARBG.en.srt"), "sub-content");
    const realRename = fs.renameSync;
    let threw = false;
    fs.renameSync = (a, b) => {
      if (!threw) { threw = true; const e = new Error("cross-device"); e.code = "EXDEV"; throw e; }
      return realRename(a, b);
    };
    try {
      await move(args);
    } finally {
      fs.renameSync = realRename;
    }
    assert.ok(threw, "EXDEV path was exercised");
    assert.ok(fs.existsSync(path.join(sidecarDir, "Movie (2019)-RARBG.en.srt")), "sidecar copied to destination across devices");
    assert.strictEqual(fs.readFileSync(path.join(sidecarDir, "Movie (2019)-RARBG.en.srt"), "utf8"), "sub-content", "content preserved across EXDEV move");
    assert.ok(!fs.existsSync(path.join(movieDir, "Movie (2019)-RARBG.en.srt")), "source removed after EXDEV copy");
  }

  // --- Hard-fail: test_mode on but output_dir_done blank/unset -----------------
  //
  // Defense-in-depth backstop mirroring js_rename_group_compressed: without a
  // provable destination the plugin must THROW, not silently misplace subs.
  function makeBlankOutputArgs(outputDirDoneValue) {
    const root = caseDir();
    const libFolder = path.join(root, "library");
    const movieDir = path.join(libFolder, "Movies", "Movie (2019)");
    fs.mkdirSync(movieDir, { recursive: true });
    const videoPath = path.join(movieDir, "Movie (2019)-RARBG.mkv");
    fs.writeFileSync(videoPath, "video");
    fs.writeFileSync(path.join(movieDir, "Movie (2019)-RARBG.en.srt"), "sub");
    const library = { test_mode: "true" };
    if (outputDirDoneValue !== undefined) library.output_dir_done = outputDirDoneValue;
    return {
      userVariables: { library },
      variables: { user: {} },
      inputFileObj: { _id: videoPath, file: videoPath },
      librarySettings: { folder: libFolder },
      originalLibraryFile: { _id: videoPath, meta: { Directory: movieDir } },
    };
  }

  await assert.rejects(move(makeBlankOutputArgs("")), /output_dir_done/, "blank output_dir_done in test_mode must hard-fail");
  await assert.rejects(move(makeBlankOutputArgs(undefined)), /output_dir_done/, "unset output_dir_done in test_mode must hard-fail");
  await assert.rejects(move(makeBlankOutputArgs("   ")), /output_dir_done/, "whitespace-only output_dir_done must hard-fail");

  // --- Byte-identity: inline copies in "2 - Prep.yml" == plugin file ------------
  //
  // Both customFunction nodes (normal path AlwSubMvJs, retry2 path DbgSubMvJs)
  // embed a copy of this plugin's source. They must stay byte-for-byte identical so
  // the flow and the standalone plugin never drift.
  {
    const pluginSrc = fs.readFileSync(path.join(__dirname, "js_move_extracted_subs.js"), "utf8");
    const flow = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "2 - Prep.yml"), "utf8"));
    for (const id of ["AlwSubMvJs", "DbgSubMvJs"]) {
      const node = flow.flowPlugins.find((p) => p.id === id);
      assert.ok(node, `${id} node must exist in 2 - Prep.yml`);
      assert.strictEqual(node.pluginName, "customFunction", `${id} must be a customFunction node`);
      assert.ok(node.inputsDB && typeof node.inputsDB.code === "string", `${id} must have an inputsDB.code string`);
      assert.strictEqual(node.inputsDB.code, pluginSrc, `inline ${id} copy must be byte-identical to plugins/js_move_extracted_subs.js`);
    }
  }

  console.log("All move_extracted_subs regression tests passed.");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
