// Regression test for the AudRm01 customFunction body inline in "3 - Audio.yml"
// ("Audio - Encode - Mark Non-Opus Audio Removed"). No test framework/package.json
// exists in this repo, so this is a plain Node script:
// `node plugins/test_audrm01.js` (exit code 0 = pass).

const assert = require("assert");
const { loadFlowFunction } = require("./flow_customfunction_test_helper.js");

const audRm01 = loadFlowFunction("3 - Audio.yml", "AudRm01");

function makeArgs(streams) {
  return { variables: { ffmpegCommand: { streams: streams.map((s) => ({ ...s })) } } };
}

async function run(streams) {
  const args = makeArgs(streams);
  await audRm01(args);
  return args.variables.ffmpegCommand.streams.map((s) => s.removed === true);
}

(async () => {
  // Track 0 is the encode target and is always skipped, even though its pre-encode
  // codec_name (aac) is in the removal list -- it must never be marked removed.
  {
    const removed = await run([
      { codec_type: "audio", codec_name: "aac" },
      { codec_type: "audio", codec_name: "aac" },
    ]);
    assert.deepStrictEqual(removed, [false, true], "track 0 must survive, track 1 (aac) removed");
  }

  // Opus-first, non-opus-second: the common real-world shape.
  {
    const removed = await run([
      { codec_type: "audio", codec_name: "opus" },
      { codec_type: "audio", codec_name: "aac" },
    ]);
    assert.deepStrictEqual(removed, [false, true]);
  }

  // Adversarial case (test-coverage-findings.md Finding 1): a non-first audio track
  // whose codec is NOT in the removal list (e.g. already-opus commentary) must survive.
  {
    const removed = await run([
      { codec_type: "audio", codec_name: "aac" },
      { codec_type: "audio", codec_name: "opus" },
    ]);
    assert.deepStrictEqual(removed, [false, false], "second track (opus) is not in the removal list");
  }

  // Codec-name matching is case-insensitive.
  {
    const removed = await run([
      { codec_type: "audio", codec_name: "AAC" },
      { codec_type: "audio", codec_name: "AC3" },
    ]);
    assert.deepStrictEqual(removed, [false, true]);
  }

  // Non-audio streams (video/subtitle) are never touched and don't advance audioIdx.
  {
    const removed0 = await run([
      { codec_type: "video", codec_name: "hevc" },
      { codec_type: "audio", codec_name: "aac" },
      { codec_type: "audio", codec_name: "ac3" },
    ]);
    assert.deepStrictEqual(removed0, [false, false, true], "video stream ignored, audioIdx starts at first audio stream");
  }

  // No audio streams at all: must not throw, nothing marked removed.
  {
    const removed = await run([{ codec_type: "video", codec_name: "hevc" }]);
    assert.deepStrictEqual(removed, [false]);
  }

  // Empty stream list: must not throw.
  {
    const args = { variables: { ffmpegCommand: { streams: [] } } };
    await audRm01(args);
    assert.deepStrictEqual(args.variables.ffmpegCommand.streams, []);
  }

  // Return contract: outputFileObj/outputNumber/variables are passed through.
  {
    const args = makeArgs([{ codec_type: "audio", codec_name: "aac" }]);
    args.inputFileObj = { _id: "x" };
    const result = await audRm01(args);
    assert.strictEqual(result.outputFileObj, args.inputFileObj);
    assert.strictEqual(result.outputNumber, 1);
    assert.strictEqual(result.variables, args.variables);
  }

  console.log("test_audrm01.js: all cases passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
