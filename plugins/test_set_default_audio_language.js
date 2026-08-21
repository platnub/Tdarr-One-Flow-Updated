// Regression test for js_set_default_audio_language.js, which is kept in sync with
// (and covers the same matching logic as) the inline MkvDf01 customFunction body in
// "3 - Audio.yml" ("Audio - Default Lang - JS Determine mkvpropedit Args"). No test
// framework/package.json exists in this repo, so this is a plain Node script:
// `node plugins/test_set_default_audio_language.js` (exit code 0 = pass).

const assert = require("assert");
const setDefaultAudioLanguage = require("./js_set_default_audio_language.js");

function makeArgs({ defaultAudioLanguage = "", streams = [] } = {}) {
  return {
    userVariables: { library: { default_audio_language: defaultAudioLanguage } },
    variables: {},
    inputFileObj: { ffProbeData: { streams: streams.map((s) => ({ ...s })) } },
  };
}

async function run(opts) {
  const args = makeArgs(opts);
  await setDefaultAudioLanguage(args);
  return args.variables.mkvpropedit_default_audio_args;
}

(async () => {
  // Blank/unset library variable: no-op, no mkvpropedit args emitted.
  {
    const out = await run({ streams: [{ codec_type: "audio", tags: { language: "eng" } }] });
    assert.strictEqual(out, "");
  }

  // Single-code match: matched track gets flag-default=1, others get 0, and track
  // selectors are mkvpropedit's 1-indexed "track:aN".
  {
    const out = await run({
      defaultAudioLanguage: "jpn",
      streams: [
        { codec_type: "audio", tags: { language: "eng" } },
        { codec_type: "audio", tags: { language: "jpn" } },
      ],
    });
    assert.strictEqual(out, "--edit track:a1 --set flag-default=0 --edit track:a2 --set flag-default=1");
  }

  // Ordered priority list: first language in the list with a match wins, even if a
  // later-priority language also matches a track.
  {
    const out = await run({
      defaultAudioLanguage: "jpn,eng",
      streams: [
        { codec_type: "audio", tags: { language: "eng" } },
        { codec_type: "audio", tags: { language: "jpn" } },
      ],
    });
    assert.strictEqual(out, "--edit track:a1 --set flag-default=0 --edit track:a2 --set flag-default=1");
  }

  // No track matches any language in the list: no-op, existing default flags untouched.
  {
    const out = await run({
      defaultAudioLanguage: "fra",
      streams: [{ codec_type: "audio", tags: { language: "eng" } }],
    });
    assert.strictEqual(out, "");
  }

  // Non-audio streams are excluded from both matching and the emitted track indices.
  {
    const out = await run({
      defaultAudioLanguage: "eng",
      streams: [
        { codec_type: "video", tags: { language: "eng" } },
        { codec_type: "audio", tags: { language: "eng" } },
      ],
    });
    assert.strictEqual(out, "--edit track:a1 --set flag-default=1");
  }

  // A single code (no comma) behaves as a list of one.
  {
    const out = await run({
      defaultAudioLanguage: "eng",
      streams: [{ codec_type: "audio", tags: { language: "eng" } }],
    });
    assert.strictEqual(out, "--edit track:a1 --set flag-default=1");
  }

  console.log("test_set_default_audio_language.js: all cases passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
