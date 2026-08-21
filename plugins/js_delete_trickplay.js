module.exports = async (args) => {

  // Read the opt-in flag from the library variable. Blank/unset/anything other than "true" = no-op.
  const deleteEnabled = String(args.userVariables.library.delete_trickplay || "").trim().toLowerCase() === "true";

  // This node only sits on the replace-success path, so reaching it already means
  // the compressed file replaced the original in place. When the flag is off we
  // still must pass through so DONE is reached.
  if (!deleteEnabled) {
    return {
      outputFileObj: args.inputFileObj,
      outputNumber: 1, // Continue the workflow
      variables: args.variables, // Pass the updated variables
    };
  }

  const fs = require("fs");
  const path = require("path");

  // Derive the ORIGINAL media path from originalLibraryFile._id, NOT inputFileObj:
  // the earlier rename_group_compressed node may have renamed inputFileObj to
  // "<name>-compressed", but the Jellyfin trickplay folder is named after the
  // original media file that just got replaced in place.
  const origId = String(args.originalLibraryFile._id || "");
  const dir = path.dirname(origId);
  const ext = path.extname(origId);
  const base = path.basename(origId, ext);
  const fullName = path.basename(origId);

  // Jellyfin's trickplay folder is named after the media with a ".trickplay"
  // extension appended. Naming varies between versions (stripped extension vs.
  // full file name), so check BOTH conventions and delete whichever exists. Both
  // names are specific to this exact media file, so there is no risk of touching
  // an unrelated folder.
  const candidates = [
    path.join(dir, base + ".trickplay"),
    path.join(dir, fullName + ".trickplay"),
  ];

  // Wrapped in try/catch so a deletion failure only warns and never fails the
  // flow (mirrors the non-fatal tolerance of neighboring Save nodes). The
  // function always returns the pass-through object so DONE is reached.
  try {
    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        fs.rmSync(candidate, { recursive: true, force: true });
        console.log(`delete_trickplay: deleted trickplay folder "${candidate}"`);
      }
    }
  } catch (err) {
    console.log(`delete_trickplay: WARNING failed to delete trickplay folder: ${err.message}`);
  }

  return {
    outputFileObj: args.inputFileObj,
    outputNumber: 1, // Continue the workflow
    variables: args.variables, // Pass the updated variables
  };
};
