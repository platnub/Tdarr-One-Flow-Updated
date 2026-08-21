// Regression test for the CTitle01 customFunction body inline in "2 - Prep.yml"
// ("Prep & Clean - JS Determine Clean Title Args"). No test framework/package.json
// exists in this repo, so this is a plain Node script:
// `node plugins/test_ctitle01.js` (exit code 0 = pass).

const assert = require("assert");
const { loadFlowFunction } = require("./flow_customfunction_test_helper.js");

const cTitle01 = loadFlowFunction("2 - Prep.yml", "CTitle01");

function makeArgs({ streams = [], meta = {}, formatTags } = {}) {
  return {
    variables: { ffmpegCommand: { streams: streams.map((s) => ({ ...s })) } },
    inputFileObj: {
      meta,
      ffProbeData: formatTags ? { format: { tags: formatTags } } : {},
    },
  };
}

async function run(opts) {
  const args = makeArgs(opts);
  await cTitle01(args);
  return args.variables.clean_title_args;
}

(async () => {
  // No title anywhere: fully empty result, genuine no-op.
  {
    const out = await run({ streams: [{ codec_type: "video" }] });
    assert.strictEqual(out, "");
  }

  // Overall container title via meta.Title clears the container title.
  {
    const out = await run({ meta: { Title: "Some Movie" }, streams: [] });
    assert.strictEqual(out, "-metadata title=");
  }

  // Overall container title via the ffProbeData.format.tags.title fallback, when
  // meta.Title is absent (CTitle01's self-documented fallback path).
  {
    const out = await run({ meta: {}, formatTags: { title: "Some Movie" }, streams: [] });
    assert.strictEqual(out, "-metadata title=");
  }

  // Video stream titles are cleared unconditionally when present.
  {
    const out = await run({
      streams: [{ codec_type: "video", tags: { title: "x" } }],
    });
    assert.strictEqual(out, "-metadata:s:v:0 title=");
  }

  // Audio/subtitle titles are only cleared when "junk" (more than 3 "." characters).
  {
    const out = await run({
      streams: [
        { codec_type: "audio", tags: { title: "English" } },
        { codec_type: "audio", tags: { title: "a.b.c.d.e" } },
      ],
    });
    assert.strictEqual(out, "-metadata:s:a:1 title=");
  }

  {
    const out = await run({
      streams: [{ codec_type: "subtitle", tags: { title: "a.b.c.d.e" } }],
    });
    assert.strictEqual(out, "-metadata:s:s:0 title=");
  }

  // Per-stream indices are computed over the CURRENT non-removed stream list, not raw
  // ffprobe indices -- a removed (e.g. image) stream ahead of an audio stream must not
  // shift the audio stream's emitted index.
  {
    const out = await run({
      streams: [
        { codec_type: "video", removed: true, tags: { title: "junk" } },
        { codec_type: "audio", tags: { title: "a.b.c.d.e" } },
      ],
    });
    assert.strictEqual(out, "-metadata:s:a:0 title=", "removed stream must not be counted in indexing");
  }

  // Multiple clears combine into one space-joined, no-empty-token argument string.
  {
    const out = await run({
      meta: { Title: "Movie" },
      streams: [
        { codec_type: "video", tags: { title: "junk" } },
        { codec_type: "audio", tags: { title: "a.b.c.d.e" } },
      ],
    });
    assert.strictEqual(out, "-metadata title= -metadata:s:v:0 title= -metadata:s:a:0 title=");
    assert.ok(!out.includes("  "), "no double spaces");
  }

  // Exception safety (HIGH #1 fix): an unexpected shape must not throw out of the
  // node -- it must degrade to "leave titles unchanged" (empty clean_title_args).
  {
    const args = {
      // variables.ffmpegCommand is intentionally missing -> reading .streams throws.
      variables: {},
      inputFileObj: { meta: {}, ffProbeData: {} },
    };
    const result = await cTitle01(args);
    assert.strictEqual(args.variables.clean_title_args, "", "must fall back to empty string on exception");
    assert.strictEqual(result.outputFileObj, args.inputFileObj);
    assert.strictEqual(result.outputNumber, 1);
  }

  console.log("test_ctitle01.js: all cases passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
