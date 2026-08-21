module.exports = async (args) => {

  const fs = require("fs");
  const path = require("path");

  // The classic subtitle extractor (Tdarr_Plugin_rr01_drpeppershaker_extract_subs_to_SRT,
  // run via runClassicTranscodePlugin) derives each .srt output path from
  // otherArguments.originalLibraryFile.file — the ORIGINAL library file, NOT the
  // flow's working/cache copy. So the extracted sidecars land next to the original
  // video, sharing its base name. originalLibraryFile._id is that same path and is
  // the exact field js_rename_group_compressed reads, so the two plugins agree on
  // the folder.
  const originalId = String(args.originalLibraryFile._id || "");
  const sourceDir = path.dirname(originalId);

  // The extractor names each sidecar after the ORIGINAL file's base name (stem):
  // e.g. "Movie (2019)-RARBG.mkv" -> "Movie (2019)-RARBG.en.srt". Other videos'
  // sidecars can share this folder, so we only move files whose name starts with
  // this video's stem + "." — matched case-sensitively, since the extractor
  // generates them from the exact original name.
  const originalBase = path.basename(originalId);
  const originalStem = originalBase.slice(0, originalBase.length - path.extname(originalBase).length);

  const testMode = String(args.userVariables.library.test_mode || "").trim().toLowerCase() === "true";
  const outputDirDone = testMode
    ? String(args.userVariables.library.output_dir_done || "").trim()
    : "";

  const result = {
    outputFileObj: args.inputFileObj,
    outputNumber: 1, // Continue the workflow
    variables: args.variables, // Pass the updated variables
  };

  // Defense-in-depth backstop: the flow's early gate (2 - Prep.yml) should already
  // have failed the flow fast, before transcoding, when test_mode is on but
  // output_dir_done is empty. If that gate was somehow bypassed we refuse to
  // silently continue — there is no provable destination for the sidecars, so we
  // surface the misconfiguration loudly (thrown, so it propagates as a real flow
  // failure) instead of misplacing the extracted subtitles.
  if (testMode && !outputDirDone) {
    throw new Error(
      "move_extracted_subs: test_mode is enabled but output_dir_done is empty/unset; "
      + "cannot determine where to place the extracted subtitle sidecars. "
      + "Set the output_dir_done library variable (the flow's early gate in 2 - Prep should "
      + "catch this before transcoding)."
    );
  }

  // Destination = the video's FINAL folder, derived the SAME provable way Tdarr's
  // moveToDirectory (keepRelativePath, node nSj2dyRzi) places the video and
  // js_rename_group_compressed re-derives the sidecar folder:
  //   test_mode -> output_dir_done + the ORIGINAL file's library-relative subpath.
  //   default   -> the original file's own folder (the in-place final location) —
  //                which is ALSO where the extractor already wrote the sidecars, so
  //                this branch is a no-op: the subs already landed at their
  //                destination and there is nothing to move.
  let destDir;
  if (testMode) {
    const libFolder = String(args.librarySettings.folder || "");
    const relStem = originalId.startsWith(libFolder) ? originalId.slice(libFolder.length) : originalId;
    // Drop the file name; an empty subStem (video directly in the library root)
    // yields path.join(outputDirDone, "") === outputDirDone, so no special-casing.
    const subStem = relStem.split("/").slice(0, -1).join("/");
    destDir = path.join(outputDirDone, subStem);
  } else {
    destDir = sourceDir;
  }

  // Nothing to do when the extractor already wrote the sidecars to the destination
  // (the default in-place case). This is the whole point: extraction lands the subs
  // in their final folder, so no separate move step is needed.
  if (path.resolve(sourceDir) === path.resolve(destDir)) {
    console.log(`move_extracted_subs: sidecars already at destination "${destDir}", nothing to move`);
    return result;
  }

  const SUBTITLE_EXTS = ["srt", "ass", "sub", "idx"];

  let entries;
  try {
    // readdirSync throws ENOENT if the source folder doesn't exist (e.g. no
    // subtitles were extracted for this file). Treat that as "nothing to move".
    entries = fs.readdirSync(sourceDir);
  } catch (err) {
    if (err && err.code === "ENOENT") {
      console.log(`move_extracted_subs: no source directory "${sourceDir}", nothing to move (${err.message})`);
    } else {
      console.log(`move_extracted_subs: WARNING could not read source directory "${sourceDir}": ${err.message}`);
    }
    return result;
  }

  let destEnsured = false;
  for (const entry of entries) {
    // Extension matching is case-insensitive; the original suffix casing is kept.
    const entryExt = path.extname(entry).slice(1).toLowerCase();
    if (!SUBTITLE_EXTS.includes(entryExt)) continue;

    // Only move sidecars belonging to THIS video (stem match, case-sensitive), so
    // subtitles for other videos sharing the folder are left untouched. The "."
    // separator prevents near-misses like "<stem>-extra.en.srt" from matching.
    if (originalStem && !entry.startsWith(originalStem + ".")) continue;

    const oldPath = path.join(sourceDir, entry);
    const newPath = path.join(destDir, entry);
    if (path.resolve(oldPath) === path.resolve(newPath)) continue;

    try {
      if (fs.existsSync(newPath)) {
        // Guard against clobbering a sidecar already present at the destination.
        console.log(`move_extracted_subs: target "${newPath}" already exists, skipping to avoid overwrite`);
        continue;
      }
      if (!destEnsured) {
        fs.mkdirSync(destDir, { recursive: true });
        destEnsured = true;
      }
      try {
        fs.renameSync(oldPath, newPath);
      } catch (err) {
        // output_dir_done is frequently a different filesystem/mount than the
        // source library, so a plain rename fails with EXDEV. Fall back to a
        // copy-then-delete, mirroring what copyMoveFolderContent does.
        if (err && err.code === "EXDEV") {
          fs.copyFileSync(oldPath, newPath);
          fs.unlinkSync(oldPath);
        } else {
          throw err;
        }
      }
      console.log(`move_extracted_subs: moved "${oldPath}" -> "${newPath}"`);
    } catch (err) {
      // One bad sidecar shouldn't block the rest or fail the flow.
      console.log(`move_extracted_subs: WARNING failed to move "${oldPath}" -> "${newPath}": ${err.message}`);
    }
  }

  return result;
};
