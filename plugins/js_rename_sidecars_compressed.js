module.exports = async (args) => {

  // NOTE: this code is duplicated verbatim in RnScJs01 (in-place path) and
  // RnScJs02 (test_mode path) — Tdarr flow JSON has no shared-code mechanism,
  // so keep BOTH nodes in sync when editing.

  // Read the opt-in flag from the library variable. Blank/unset/anything other than "true" = no-op.
  const renameEnabled = String(args.userVariables.library.rename_sidecars_compressed || "").trim().toLowerCase() === "true";

  if (!renameEnabled) {
    return {
      outputFileObj: args.inputFileObj,
      outputNumber: 1, // Continue the workflow
      variables: args.variables, // Pass the updated variables
    };
  }

  const fs = require("fs");
  const path = require("path");

  // Derive the ORIGINAL media base name from originalLibraryFile._id (the exact
  // field js_rename_group_compressed and delete_trickplay both read), and the
  // CURRENT base name from inputFileObj._id: js_rename_group_compressed runs
  // earlier in this flow and mutates inputFileObj._id to the "-compressed" name
  // when it actually renames the video, so by the time this node runs the two
  // will differ ONLY if a rename actually happened this run.
  const originalId = String(args.originalLibraryFile._id || "");
  const originalExt = path.extname(originalId);
  const originalBase = path.basename(originalId, originalExt);
  const originalFullName = path.basename(originalId);

  const currentId = String(args.inputFileObj._id || "");
  const currentExt = path.extname(currentId);
  const currentBase = path.basename(currentId, currentExt);
  const currentFullName = path.basename(currentId);

  // Only proceed when the video was ACTUALLY renamed to "-compressed" this run.
  // js_rename_group_compressed leaves inputFileObj._id unchanged (equal to the
  // original base name) when it's disabled, when the video wasn't re-encoded,
  // when it's already renamed (idempotent skip), or when the rename target
  // already existed (clobber guard) — all of those cases are no-ops here too.
  // The !originalBase guard also prevents an empty original base name from
  // prefix-matching (and renaming) every entry in the folder further below.
  if (!originalBase || !currentBase || currentBase === originalBase) {
    console.log(`rename_sidecars_compressed: base name unchanged or unavailable ("${originalBase}"), nothing to rename`);
    return {
      outputFileObj: args.inputFileObj,
      outputNumber: 1,
      variables: args.variables,
    };
  }

  // Mirror js_rename_group_compressed's sidecarDir derivation exactly: test_mode
  // -> output_dir_done + the ORIGINAL library file's library-relative subpath
  // (the video's FINAL folder); otherwise -> the original file's own folder
  // (in-place).
  const testMode = String(args.userVariables.library.test_mode || "").trim().toLowerCase() === "true";
  let mediaDir;
  if (testMode) {
    const outputDirDone = String(args.userVariables.library.output_dir_done || "").trim();
    if (!outputDirDone) {
      // Same misconfiguration rename_group_compressed throws loudly for; stay
      // non-fatal here (nothing is ever copied into output_dir_done in
      // test_mode today, so there is nothing to rename anyway) but don't let
      // it pass as a silent ENOENT no-op either.
      console.log("rename_sidecars_compressed: WARNING test_mode is enabled but output_dir_done is empty/unset; cannot locate the video's folder, so sidecars (if any) will not be renamed. Set the output_dir_done library variable.");
    }
    const libFolder = String(args.librarySettings.folder || "");
    const relStem = originalId.startsWith(libFolder) ? originalId.slice(libFolder.length) : originalId;
    const subStem = relStem.split("/").slice(0, -1).join("/");
    mediaDir = path.join(outputDirDone, subStem);
  } else {
    mediaDir = path.dirname(originalId);
  }

  const SUBTITLE_EXTS = ["srt", "ass", "sub", "idx"];

  // Wrapped in try/catch so a failure only warns and never fails the flow
  // (mirrors the non-fatal tolerance of neighboring Save nodes).
  try {
    // readdirSync throws ENOENT if the folder doesn't exist (e.g. in test_mode,
    // where NFO/thumbnail/trickplay files are never copied into output_dir_done
    // today); caught below as "nothing to rename".
    for (const entry of fs.readdirSync(mediaDir)) {
      // Skip the video itself and the subtitle sidecars: those are already
      // renamed (or intentionally left alone) by js_rename_group_compressed,
      // and must not be touched again here.
      if (entry === originalFullName || entry === currentFullName) continue;
      const entryExt = path.extname(entry).slice(1).toLowerCase();
      if (SUBTITLE_EXTS.includes(entryExt)) continue;

      // General full-match: anything whose name starts with the original base
      // name is renamed, preserving whatever follows it (.nfo, -thumb.jpg,
      // .trickplay, .mkv.trickplay, etc.) — this naturally covers Jellyfin's
      // NFO, thumbnail, and trickplay sidecars without special-casing each one.
      // This is a loose prefix match (no separator required after the base
      // name), so an unrelated file/folder that happens to start with the same
      // text would also be swept up and renamed.
      if (!entry.startsWith(originalBase)) continue;

      const suffix = entry.slice(originalBase.length);
      const oldPath = path.join(mediaDir, entry);
      const newPath = path.join(mediaDir, `${currentBase}${suffix}`);

      if (oldPath === newPath) continue;

      try {
        if (fs.existsSync(newPath)) {
          console.log(`rename_sidecars_compressed: target "${newPath}" already exists, skipping to avoid overwrite`);
          continue;
        }
        fs.renameSync(oldPath, newPath);
        console.log(`rename_sidecars_compressed: renamed "${oldPath}" -> "${newPath}"`);
      } catch (err) {
        // One bad entry shouldn't skip the rest.
        console.log(`rename_sidecars_compressed: WARNING failed to rename "${oldPath}" -> "${newPath}": ${err.message}`);
      }
    }
  } catch (err) {
    if (err && err.code === "ENOENT") {
      console.log(`rename_sidecars_compressed: no media directory "${mediaDir}", nothing to rename (${err.message})`);
    } else {
      console.log(`rename_sidecars_compressed: WARNING failed to scan media directory: ${err.message}`);
    }
  }

  return {
    outputFileObj: args.inputFileObj,
    outputNumber: 1, // Continue the workflow
    variables: args.variables, // Pass the updated variables
  };
};
