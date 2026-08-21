module.exports = async (args) => {

  // Read the opt-in flag from the library variable. Blank/unset/anything other than "true" = no-op.
  const renameEnabled = String(args.userVariables.library.rename_group_compressed || "").trim().toLowerCase() === "true";

  // Only rename when the VIDEO was actually re-encoded this run
  // (video_was_compressed is set by 4 - Video.yml at its real-encode choke points;
  // audio-only Opus recompression in 3 - Audio.yml does not set it).
  const videoWasCompressed = String(args.variables.user.video_was_compressed || "").trim().toLowerCase() === "true";

  if (!renameEnabled || !videoWasCompressed) {
    return {
      outputFileObj: args.inputFileObj,
      outputNumber: 1, // Continue the workflow
      variables: args.variables, // Pass the updated variables
    };
  }

  const fs = require("fs");
  const path = require("path");

  // Tdarr's save plugins (Replace Original File / Move To Directory) derive the
  // destination filename from inputFileObj._id, not inputFileObj.file, so that's
  // what we must read from and write back to for the rename to actually take effect.
  const currentPath = args.inputFileObj._id;
  const dir = path.dirname(currentPath);
  const ext = path.extname(currentPath);
  const baseName = path.basename(currentPath, ext);

  const lastHyphenIndex = baseName.lastIndexOf("-");
  const trailingToken = lastHyphenIndex === -1 ? "" : baseName.slice(lastHyphenIndex + 1);
  // Only treat the trailing token as a release-group tag if it looks like one (no
  // whitespace). Otherwise a title-internal hyphen (e.g. "Spider-Man (2019)") gets
  // mistaken for a group separator and the title/year gets truncated.
  const hasGroupToken = lastHyphenIndex !== -1 && trailingToken.length > 0 && !/\s/.test(trailingToken);

  let newBaseName;
  if (hasGroupToken && trailingToken.toLowerCase() === "compressed") {
    // Idempotent: already renamed, nothing to do
    console.log(`rename_group_compressed: "${baseName}" already ends in -compressed, skipping`);
    return {
      outputFileObj: args.inputFileObj,
      outputNumber: 1,
      variables: args.variables,
    };
  } else if (hasGroupToken) {
    // Replace the release-group token after the last hyphen with "compressed"
    newBaseName = `${baseName.slice(0, lastHyphenIndex)}-compressed`;
  } else {
    // No release-group token present (or trailing token isn't a group tag): append the marker
    newBaseName = `${baseName}-compressed`;
  }

  const newPath = path.join(dir, `${newBaseName}${ext}`);

  // Guard against clobbering an existing file at the target path (e.g. a prior
  // run already produced "<name>-compressed.ext"). fs.renameSync would silently
  // overwrite it, so fall through to a normal save with the original file instead.
  if (fs.existsSync(newPath)) {
    console.log(`rename_group_compressed: target "${newPath}" already exists, skipping rename to avoid overwrite`);
    return {
      outputFileObj: args.inputFileObj,
      outputNumber: 1,
      variables: args.variables,
    };
  }

  try {
    fs.renameSync(currentPath, newPath);
    console.log(`rename_group_compressed: renamed "${currentPath}" -> "${newPath}"`);
  } catch (err) {
    console.log(`rename_group_compressed: WARNING failed to rename "${currentPath}" -> "${newPath}": ${err.message}`);
    return {
      outputFileObj: args.inputFileObj,
      outputNumber: 1,
      variables: args.variables,
    };
  }

  args.inputFileObj._id = newPath;
  args.inputFileObj.file = newPath;

  // Rename the extracted subtitle sidecars to match the renamed video so
  // Jellyfin/Plex keep associating them as external subs. Stage 2 already moved
  // them to the video's FINAL folder (not the cache), so we re-derive that folder
  // the SAME provable way Tdarr's moveToDirectory (keepRelativePath, node
  // nSj2dyRzi) placed the video: test_mode -> output_dir_done + the library-
  // relative subpath of the ORIGINAL library file; otherwise the original file's
  // own folder.
  const testMode = String(args.userVariables.library.test_mode || "").trim().toLowerCase() === "true";
  const outputDirDone = testMode
    ? String(args.userVariables.library.output_dir_done || "").trim()
    : "";

  // Defense-in-depth backstop: the flow's early gate (2 - Prep.yml) should already
  // have failed the flow fast, before transcoding, when test_mode is on but
  // output_dir_done is empty. If that gate was somehow bypassed we refuse to
  // silently continue — there is no provable destination for the sidecars, so we
  // surface the misconfiguration loudly instead of skipping. Thrown OUTSIDE the
  // sidecar try/catch below so it propagates as a real flow failure.
  if (testMode && !outputDirDone) {
    throw new Error(
      "rename_group_compressed: test_mode is enabled but output_dir_done is empty/unset; "
      + "cannot locate the transcoded video's folder to rename its subtitle sidecars. "
      + "Set the output_dir_done library variable (the flow's early gate in 2 - Prep should "
      + "catch this before transcoding)."
    );
  }

  // Wrapped in its own try/catch so a sidecar failure only warns and never undoes
  // the (already successful) video rename.
  try {
    let sidecarDir;
    if (testMode) {
      // Mirror moveToDirectory's keepRelativePath (node nSj2dyRzi) exactly: strip the
      // library-folder prefix from the ORIGINAL library file's full path, then drop
      // the file name. That library-relative subpath is where the video (and the
      // stage-2 subtitle moves, which use the same keepRelativePath) were placed
      // under output_dir_done. path.relative on meta.Directory is avoided; we derive
      // from originalLibraryFile._id, the exact field Tdarr's own move node reads.
      const libFolder = String(args.librarySettings.folder || "");
      const originalId = String(args.originalLibraryFile._id || "");
      const relStem = originalId.startsWith(libFolder) ? originalId.slice(libFolder.length) : originalId;
      // Drop the file name; an empty subStem (video directly in the library root)
      // yields path.join(outputDirDone, "") === outputDirDone, so no special-casing.
      const subStem = relStem.split("/").slice(0, -1).join("/");
      sidecarDir = path.join(outputDirDone, subStem);
    } else {
      // In-place mode: sidecars sit in the original video file's own folder.
      sidecarDir = path.dirname(String(args.originalLibraryFile._id || ""));
    }

    const SUBTITLE_EXTS = ["srt", "ass", "sub", "idx"];
    // readdirSync throws ENOENT if the folder doesn't exist; the outer catch treats
    // that as "no sidecar directory, nothing to rename" without affecting the video
    // rename. Extension matching is case-insensitive (entry ext lower-cased below).
    for (const entry of fs.readdirSync(sidecarDir)) {
      const entryExt = path.extname(entry).slice(1).toLowerCase();
      if (!SUBTITLE_EXTS.includes(entryExt)) continue;
      // Match the video's sidecars: "<baseName>.srt" (bare) or "<baseName>.en.srt"
      // (language-suffixed). The literal "." after baseName means "MovieName2.srt"
      // does NOT match "MovieName.".
      if (!entry.startsWith(`${baseName}.`)) continue;

      // Preserve whatever follows the old base name (e.g. ".en.srt" or ".srt").
      const suffix = entry.slice(baseName.length);
      const oldSidecarPath = path.join(sidecarDir, entry);
      const newSidecarPath = path.join(sidecarDir, `${newBaseName}${suffix}`);

      if (oldSidecarPath === newSidecarPath) continue;

      try {
        if (fs.existsSync(newSidecarPath)) {
          console.log(`rename_group_compressed: sidecar target "${newSidecarPath}" already exists, skipping to avoid overwrite`);
          continue;
        }
        fs.renameSync(oldSidecarPath, newSidecarPath);
        console.log(`rename_group_compressed: renamed sidecar "${oldSidecarPath}" -> "${newSidecarPath}"`);
      } catch (err) {
        // One bad sidecar shouldn't skip the rest.
        console.log(`rename_group_compressed: WARNING failed to rename sidecar "${oldSidecarPath}" -> "${newSidecarPath}": ${err.message}`);
      }
    }
  } catch (err) {
    if (err && err.code === "ENOENT") {
      // Benign: the sidecar directory doesn't exist (e.g. no subtitles were
      // extracted for this file). Nothing to rename.
      console.log(`rename_group_compressed: no sidecar directory to scan, nothing to rename (${err.message})`);
    } else {
      // Unexpected (permissions, malformed args, etc.) — surface distinctly, but
      // still never undo the already-successful video rename.
      console.log(`rename_group_compressed: WARNING sidecar rename step failed unexpectedly: ${err.message}`);
    }
  }

  return {
    outputFileObj: args.inputFileObj,
    outputNumber: 1, // Continue the workflow
    variables: args.variables, // Pass the updated variables
  };
};
