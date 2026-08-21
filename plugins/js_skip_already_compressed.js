module.exports = async (args) => {
  const path = require("path");

  // Guard: skip files already produced by rename_group_compressed. Those files
  // carry a trailing "-compressed" release-group token (see plugins/
  // js_rename_group_compressed.js). Re-running the whole flow on them would just
  // re-encode an already-compressed file, so end the flow right here — gracefully:
  // no transcode, no goToFlow to Flow 2, and NO failFlow (this is an intentional
  // skip, not an error). This branch simply terminates with no further edge.
  const currentPath = String(args.inputFileObj._id || args.inputFileObj.file || "");
  const ext = path.extname(currentPath);
  const baseName = path.basename(currentPath, ext);

  // Mirror js_rename_group_compressed's tokenization exactly: the release-group
  // tag is the final hyphen-delimited segment of the base name, and only counts
  // as a group token when it is non-empty and whitespace-free — so a title-
  // internal hyphen like "Spider-Man (2019)" is NOT mistaken for a group
  // separator (its trailing token "Man (2019)" contains whitespace).
  const lastHyphenIndex = baseName.lastIndexOf("-");
  const trailingToken = lastHyphenIndex === -1 ? "" : baseName.slice(lastHyphenIndex + 1);
  const hasGroupToken = lastHyphenIndex !== -1 && trailingToken.length > 0 && !/\s/.test(trailingToken);
  const alreadyCompressed = hasGroupToken && trailingToken.toLowerCase() === "compressed";

  if (alreadyCompressed) {
    console.log(`skip_already_compressed: "${baseName}" ends in -compressed; ending flow without transcoding`);
  } else {
    console.log(`skip_already_compressed: "${baseName}" not flagged compressed, continuing normally`);
  }

  return {
    outputFileObj: args.inputFileObj,
    // Output 2 = already compressed -> route to the graceful stop node (dead-ends,
    // so the flow completes without transcoding). Output 1 = normal file ->
    // continue down the existing Sort & Tag chain unchanged.
    outputNumber: alreadyCompressed ? 2 : 1,
    variables: args.variables,
  };
};
