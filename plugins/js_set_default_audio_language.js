module.exports = async (args) => {

  // Read the preferred default audio language(s) from the library variable.
  // Accepts a comma-separated, ordered priority list (e.g. "eng,jpn"): the first
  // language in the list that has a matching audio track wins. A single code
  // (e.g. "eng") is simply a list of one, preserving the previous behavior.
  const targetLanguages = String(args.userVariables.library.default_audio_language || "")
    .split(",")
    .map((lang) => lang.trim().toLowerCase())
    .filter((lang) => lang !== "");

  args.variables.mkvpropedit_default_audio_args = "";

  // Blank/unset = skip: no-op, leave existing default flags untouched
  if (targetLanguages.length === 0) {
    console.log("default_audio_language is blank, skipping default audio track flag");
    return {
      outputFileObj: args.inputFileObj,
      outputNumber: 1, // Continue the workflow
      variables: args.variables, // Pass the updated variables
    };
  }

  // Filter to audio streams only, preserving order (this order is what mkvpropedit's
  // 1-indexed `track:aN` selector addresses)
  const streams = (args.inputFileObj.ffProbeData && args.inputFileObj.ffProbeData.streams) || [];
  const audioStreams = streams.filter((stream) => stream.codec_type === "audio");

  const streamLanguage = (stream) =>
    stream.tags ? String(stream.tags.language || "").trim().toLowerCase() : "";

  // Walk the priority list in order; the first language with a matching audio
  // track wins, and its first matching track becomes the default.
  let matchIndex = -1;
  for (const targetLanguage of targetLanguages) {
    matchIndex = audioStreams.findIndex((stream) => streamLanguage(stream) === targetLanguage);
    if (matchIndex !== -1) {
      console.log(`Matched default_audio_language "${targetLanguage}" at audio track ${matchIndex}`);
      break;
    }
  }

  // No match for any language = no-op: do not clear existing default flags when
  // there's nothing to set as default
  if (matchIndex === -1) {
    console.log(`No audio track matched default_audio_language "${targetLanguages.join(",")}", skipping`);
    return {
      outputFileObj: args.inputFileObj,
      outputNumber: 1, // Continue the workflow
      variables: args.variables, // Pass the updated variables
    };
  }

  // Set the matched track default and clear the default flag on every other audio track.
  // This is applied IN PLACE via mkvpropedit (a runCli node) rather than a full ffmpeg
  // remux, and only on the MKV branch, after any audio clean/encode/strip steps have
  // already run — so audioStreams reflects the final surviving track list, not the
  // original pre-encode one. mkvpropedit track selectors are 1-INDEXED (track:a1 = first
  // audio track), unlike ffmpeg's 0-indexed `-disposition:a:N`.
  args.variables.mkvpropedit_default_audio_args = audioStreams
    .map((s, i) => `--edit track:a${i + 1} --set flag-default=${i === matchIndex ? 1 : 0}`)
    .join(" ");
  console.log(`mkvpropedit_default_audio_args: ${args.variables.mkvpropedit_default_audio_args}`);

  return {
    outputFileObj: args.inputFileObj,
    outputNumber: 1, // Continue the workflow
    variables: args.variables, // Pass the updated variables
  };
};
