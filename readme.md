## Tdarr - One Flow - To Rule Them All

Goal to have One Flow (set of flows) to Rule all your Media!

I accomplish this by using Library Variables.  This allows us to change our quality and encoding settings in the library.  This is much easier than trying to edit the flow every time we want to encode differently.
I have a library for low quality, high quality, Animation, Movies.  Each has their own quality settings.  Then I just move the files I'm processing into the corresponding library folder and tdarr will process as needed.

# About This Fork

This is a fork of [samssausages' Tdarr - One Flow](https://github.com/samssausages/tdarr).  It keeps everything the original does and layers on new codec support, subtitle handling, file-management options, and a leaner processing pipeline.  If you're coming from the original flow, the biggest change is that **the flow now replaces your media in-place by default** (a normal Tdarr library, no separate output folder needed) — see the BREAKING CHANGES in the Release Notes before you upgrade.

**What you get (carried over from the original):**
- One set of flows (Input → Prep → Audio → Video → Save) to process your whole library
- Per-library quality via Library Variables — separate libraries for low/high quality, animation, movies, etc.
- Target-bitrate encoding with automatic `-maxrate` calculation, and a `cq` fallback method
- Works with Nvidia (NVENC), Intel QuickSync, and CPU
- Audio cleaning (strip unwanted/commentary tracks) and optional Opus encoding
- Deinterlacing for `.ts` DVR recordings
- Extensive logging and inline documentation to make troubleshooting easy

**🆕 NEW in this fork:**
- **🆕 AV1 output** — set library variable `codec = av1` to encode a library to AV1 instead of HEVC (NVENC / QuickSync / CPU implemented). HEVC stays the default, so existing libraries are unchanged. Companion `do_av1` re-encodes already-AV1 sources, mirroring `do_hevc`.
- **🆕 Always-on subtitle extraction** — embedded subtitles are extracted to external Jellyfin-named `.srt` files (e.g. `MovieName.en.srt`) on every normal pass (not just failure retries), placed right next to the video in its final folder, and removed from the output container.
- **🆕 `clear_default_subtitle`** — clears subtitle dispositions on any subtitle stream that stays embedded (e.g. image-based PGS/VOBSUB), so players don't auto-pick one over your external `.srt`. (Applies `-disposition:s 0`, which clears the whole disposition bitmask — `forced`/`hearing_impaired`/etc., not only `default`.)
- **🆕 `default_audio_language`** — give an ordered priority list of language codes (e.g. `eng,jpn`); the first one with a matching track becomes the default/auto-selected audio track.
- **🆕 `rename_group_compressed`** — when a video is actually re-encoded, rename its release-group token to `compressed` (and rename matching subtitle sidecars alongside it so they stay associated).
- **🆕 `delete_trickplay`** — after a compressed file replaces the original in-place, delete Jellyfin's leftover `.trickplay` folder for that media.
- **🆕 Simplified `test_mode`** — one switch to keep the source and save the transcoded output (plus extracted subs) to `output_dir_done` for safe testing. The old separate debug variable is gone.
- **🆕 Leaner pipeline (performance)** — several redundant full-container remux passes were folded into the existing FFmpeg command chains, cutting the number of full-size cache copies written while processing large files.
- **🆕 Fixed stream reordering** — a long-standing bug where stream reordering silently did nothing is fixed, so output streams are now actually grouped/ordered as intended.

See the [Release Notes](#release-notes) at the bottom for the full changelog, caveats, and BREAKING CHANGES.

## Setup (Step by Step)

Do a **test run first** so you can check the output and tune your settings before letting the flow touch your real library.

1. **Import the 5 flows.** In Tdarr go to **Flows → add flow → Import JSON Template**, then copy/paste each file in order:
   - [`1 - Input.yml`](./1%20-%20Input.yml) — flow variables & configurables
   - [`2 - Prep.yml`](./2%20-%20Prep.yml) — standardizes the file
   - [`3 - Audio.yml`](./3%20-%20Audio.yml) — audio clean / Opus encode
   - [`4 - Video.yml`](./4%20-%20Video.yml) — video encode (HEVC or AV1)
   - [`5 - Save.yml`](./5%20-%20Save.yml) — final checks & move
2. **Create a library** pointing at a folder with a few test files (copies — not your only copy). Assign the `1 - Input` flow to it.
3. **Add the Library Variables.** Set the [Required Fields](#required-fields) (quality, per-resolution bitrates, audio settings) and any [Optional Fields](#optional-library-variable-fields) you want (e.g. `codec = av1`, `default_audio_language`, `rename_group_compressed`). See the [Quality Examples](#quality-examples) for sane starting values.
4. **Turn on test mode.** Set `test_mode = true` and set `output_dir_done` to a path Tdarr can write to. In test mode your **source files are kept untouched** and the transcoded output (plus any extracted subtitles) is written to `output_dir_done` instead — so nothing in your library is modified. (`output_dir_done` is **required** when `test_mode = true`; the flow fails fast at the start if it's missing.)
5. **Run it and check the results.** Process your test files, then inspect the output in `output_dir_done`: file size / bitrate, that the right audio track is default, subtitles extracted correctly, playback looks good, etc.
6. **Tweak and re-test.** Adjust the Library Variables (bitrates, `v_cq`, codec, audio options…) and run again until you're happy with the output. Repeat this loop as many times as you need — your originals are safe the whole time.
7. **Go live.** Once the settings are dialed in, set `test_mode = false` (or remove it). The flow now processes the library normally and **replaces the original media file in place**. Files that fail the size-ratio sanity check are moved to `output_dir_review` for you to accept or reject.

<br>

---

<!-- ▲▲▲ END OF NEW FORK SECTION  ·  ORIGINAL README BEGINS BELOW ▼▼▼ -->

---

<br>

- While I have ran thousands of files through this flow, please consider this beta! Do not trust it with your media library until you have ran a bunch of various files through it and understand how it operates!  Let me know if you run into unexpected behavior!
- Do not use with DV or HDR+.  Could cause playback error.  Works fine with basic HDR (Fix for DV is on the roadmap, need help implementing it)
- CPU & QSV work but need more testing, as I don't use them often.  NVENC is well tested.
- By default this Flow works with a library and replaces the original media file in place.  Set the library variable test_mode = true to keep the source file and save the transcoded output (and any extracted subtitles) to output_dir_done instead — useful for testing without touching your library.  When test_mode = true you MUST set output_dir_done; if it is empty/unset the flow fails fast at the start (before transcoding) rather than misplacing your output.
- Uses the -vbr method to obtain a predictable bitrate.  With cq as a fallback method, or when we decide the bitrate is too low for -vbr to work well.
- AV1 output is optional (library variable codec = av1) and defaults off.  Caveats: av1_nvenc needs an Nvidia RTX 40 series (Ada) or newer + FFmpeg ≥ 6.0; av1_qsv needs Intel Arc or Meteor Lake+ + FFmpeg ≥ 6.0; CPU AV1 (libsvtav1) needs an FFmpeg build with --enable-libsvtav1.  On unsupported hardware the flow autodetects and falls back to CPU (libsvtav1).  The v_cq value is on HEVC's 0-51 scale but AV1 encoders use 0-63, so a value tuned for HEVC maps to a different quality on AV1 (it is not silently rescaled).  As with HEVC, AV1 4k_hdr is disabled and basic-HDR only (no DV/HDR10+).
- SVT-AV1 (CPU / libsvtav1) uses capped CRF, not VBR.  SVT-AV1 rejects a target bitrate combined with a max bitrate (-b:v + -maxrate aborts with `Svt[error]: Max Bitrate only supported with CRF mode`, ffmpeg exit 234).  So the per-resolution CPU AV1 encode uses `-crf <v_cq> -maxrate <maxrate_res> -bufsize <bufsize_res>` (no -b:v): CRF drives quality while -maxrate/-bufsize cap the bitrate.  Hardware AV1 encoders (nvenc/qsv/amf/vaapi) keep the normal VBR -b:v/-maxrate/-bufsize form, like their HEVC counterparts.  Advanced SVT-AV1 tuning goes through fl_av1_cpu_main as `-svtav1-params key=value` (SVT-AV1's replacement for x265's -x265-params); fl_av1_cpu_quality stays `-preset 6`.

# Features
- Uses Library Variables for Quality Settings. This way you can have different libraries for different quality settings
- Uses Centralized Flow Variables for configurables in one location (1 - Input) No need to hunt the entire flow for configurables
- We calculate things like -maxrate based on your target bitrate. Simplifying user imput
- Lots of notes & documentation in the flow
- Extensive logging and use of icons to make tracking down failures a breeze
- Works with Nvidia, Intel QuickSync and CPU (Help me add others by sharing your ffmpeg command)
- Optional AV1 output: set library variable codec = av1 to encode a library to AV1 instead of HEVC (nvenc/qsv/cpu implemented; vaapi/amf pending community commands). Default is HEVC, so existing libraries are unchanged.
- Strip audio to where only the tracks you want remain
- If a lossless audio track exists, encode in opus (can disable, still needs refinement, as sometimes encodes high bitrate non-lossless tracks)
- Deinterlace .ts files. (tv DVR broadcasts)
- Export Embedded Subtitles — always extracted to Jellyfin-named external .srt files (MovieName.en.srt) into the video's exact final folder (including its test_mode subpath under output_dir_done), on every normal pass (not just failure-rescue retries). Embedded subtitle streams are removed from the output container after extraction. When rename_group_compressed renames a re-encoded video, the matching sidecars are renamed alongside it so they stay associated.
- Skip already-compressed inputs — at the very start of the flow, any file whose name ends in the release-group token "-compressed" (the marker rename_group_compressed writes) is skipped: the flow ends immediately, gracefully, without transcoding and without failing. A title-internal hyphen (e.g. Spider-Man (2019)) is not mistaken for the marker.

  

I broke it down into 5 steps/flows:

1 - Input (Define Flow Variables & Configurables.  Tags files that may need special processing down the stack)

2 - Prep (Standardizes the File so it is less likely to fail encoding later)

3 - Audio (Clean audio and encode to Opus, if enabled)

4 - Video (Define desired bitrate by resolution, fall back on cq)

5 - Save (final checks and move operations)

# Installation
1. Create a new flow for each of the above steps (1-5) by:
   
    a. Go to Tdarr Flows

    b. Click "add flow"

    c. Scoll to bottom and copy/paste json into "Import JSON Template" 

3. Create a new Library with the Variables listed below (Make Sure your library has an input folder defined & output folders exist)
4. Profit

# Known Limitations
  - Doesn't work for DV HDR content.
  - .ts files in 720p often end up with an unexpected bitrate.  Have not been able to figure out why yet.

# Tweaks
- All the configurable Flow Settings can be edited in flow 1 - Input
- If you have an Nvidia 2000 series or up, enable flow plugin fl_nvenc_b-frames in the 1-Input flow. (1660 Super as well)
- You can disable audio processing with library variable do_audio = false

Library variables you need to add, with example setting:

# Variable Notes:
Audio bitrates and cutoff are set PER CHANNEL.  We use that to calculate based on number of channels in the audio stream.

# Required Fields
```
test_mode true # true = KEEP the source file AND save the transcoded output (and extracted subtitles) to output_dir_done.  Subtitles follow the same relative-subpath rule as the video, so they land in output_dir_done/<library-relative subpath>/ next to it (not the flat root).  false/unset = replace the original media file in place (subtitles saved to the original file folder).  Also applies to review-accepted files: when you accept a file from output_dir_review, the original is deleted unless test_mode = true.

output_dir_review /media/4_done_review # if something didn't go right, we move to review folder.

output_dir_done /media/4_done # path from within tdarr.  REQUIRED when test_mode = true — the transcoded file (and extracted subtitles) are saved here, each under the video's library-relative subpath so subtitles stay in the same folder as the video.  If test_mode = true and this is empty/unset the flow now FAILS FAST at the start of 2 - Prep (before any transcoding) instead of silently misplacing files.  Unused when test_mode is false/unset.

v_cq 24 # quality setting for cq fallback method. Scale of 0-51.  Where 0 is lossless and 51 is the lowest quality.  16-18 is often considered indistinguishable.  18-24 is usually a sane range.

bitrate_480p 1000k # bitrate you want for given resolution

bitrate_576p 1200k

bitrate_720p 1600k

bitrate_1080p 2000k

bitrate_1440p 3000k

bitrate_4k 8000k

bitrate_4k_hdr 10000k

do_audio_clean - true - Remove Commentary Audio, Remove Languages not listed in "audio_language", Keep only the Audio Track with Highest Channel Count

do_audio_encode - true - Encode 1st Audio track to Opus

bitrate_audio 160k # Output audio bitrate we will encode to.  This is PER CHANNEL.

bitrate_audio_cutoff 192k # will not encode if source audio bitrate is under this value.  This is PER CHANNEL

audio_language und,un,eng,en,ger,deu,de,zho,zh,chi,jpn,ja,kor,ko,spa,es,cpe,  # languages that you want to keep, if unset it's skipped

default_audio_language eng,jpn  # ordered priority list of language codes; the first one with a matching audio track becomes the default/auto-selected track, if unset it's skipped

```

# Optional Library Variable Fields

```
If not defined, the default is "false" (disabled)

disable_vbr = true # Disable Primary VBR encoding Method

disable_cq = true # Disable Fallback encoding method

disable_video = true # Optional - Only needed if you want to disable video processing - Set to True

do_hevc = true # process hevc?

codec = av1 # Select the output codec.  Unset (or anything other than "av1") = HEVC, identical to previous behavior.  Set to "av1" to encode that library to AV1 instead.

do_av1 = true # process av1?  Mirrors do_hevc: when codec = av1, re-encode files that are already AV1 (otherwise already-AV1 sources are skipped).

encoder = nvenc/qsv/amf/vaapi/cpu - Override Encoder Autodetect and manually set what encoder to use (currently only nvenc/qsv/cpu work; applies to both HEVC and AV1)

clear_default_subtitle = true # Clear subtitle stream dispositions on any subtitle stream still muxed after extraction (e.g. image-based PGS/VOBSUB tracks that can't be converted to .srt), so players don't auto-select one over the external .srt. NOTE: this applies ffmpeg's `-disposition:s 0`, which resets the ENTIRE disposition bitmask to zero on every remaining subtitle stream — it clears not just 'default' but also 'forced', 'hearing_impaired', etc. Default is false/unset (dispositions left unchanged).

remove_subs = true # Optional (pre-existing). When true, remove ALL subtitle streams in 2 - Prep (applied before/independently of the always-on .srt extraction). Default is false/unset (subtitles kept and, where possible, extracted).

rename_group_compressed = true # When the VIDEO is actually re-encoded this run, rename the release-group token at the end of the output filename to "compressed" (e.g. Movie (2019)-group.mkv -> Movie (2019)-compressed.mkv; if no group token is present, "-compressed" is appended). Matching extracted subtitle sidecars (.srt/.ass/.sub/.idx, bare and language-suffixed e.g. .en.srt) in the video's final folder are renamed to match (Movie (2019)-group.en.srt -> Movie (2019)-compressed.en.srt), so external subs stay associated; an existing sidecar target is never overwritten and a sidecar failure never blocks the video rename. No-op if unset, or if the video wasn't re-encoded this run (remux/video-skip/copy-only paths are unaffected, even if the audio was re-encoded to Opus). Default is false/unset (filenames unchanged).

delete_trickplay = true # After the compressed file has actually replaced the original in place, delete the media's Jellyfin trickplay folder (the folder next to the media named after it with a .trickplay extension, e.g. Movie (2019).trickplay or Movie (2019).mkv.trickplay). Does NOT run when the output failed the size-ratio check — a too-SMALL output is routed to output_dir_review, and a too-LARGE output hard-fails the flow (failFlow) — nor in test_mode, nor when unset. A deletion failure only logs a warning and never fails the flow. Default is false/unset (trickplay folder left in place).

```

# Quality Examples

Peoples opinions vary greatly on this.  Also content will have a big impact on what is optimal.  If you think you have good settings, share them!

## "Live action" Quality:

```
v_cq 24 # quality setting for cq fallback method. Scale of 0-51.  Where 0 is lossless and 51 is the lowest quality.  16-18 is often considered indistinguishable.  18-24 is usually a sane range.

bitrate_480p 1000k # bitrate you want for given resolution

bitrate_576p 1200k

bitrate_720p 1600k

bitrate_1080p 2000k

bitrate_1440p 3000k

bitrate_4k 8000k

bitrate_4k_hdr 10000k

bitrate_audio 160k # Audio bitrate we will encode to.  This is PER CHANNEL.

bitrate_audio_cutoff 192k # will not encode source audio under this bitrate.  This is PER CHANNEL

```

## Animation Quality:

```
v_cq 19 # quality setting for cq fallback method. Scale of 0-51.  Where 0 is lossless and 51 is the lowest quality.  16-18 is often considered indistinguishable.  18-24 is usually a sane range.

bitrate_480p 800k # bitrate you want for given resolution

bitrate_576p 1600k

bitrate_720p 2400k

bitrate_1080p 3200k

bitrate_1440p 4800k

bitrate_4k 14000k

bitrate_4k_hdr 16000k

bitrate_audio 160k # Audio bitrate we will encode to.  This is PER CHANNEL

bitrate_audio_cutoff 192k # will not encode source audio under this bitrate.  This is PER CHANNEL

```

## FAQ

Q: It was working but now it isn't.  The Variables aren't working anymore, but I do have them configured.  Log has message:  "Variable of value does not match condition == "

A: Sometimes a Tdarr update can break the existing Variables that you configured in the Library.  When this happens you need to re-save them to update the database.  You could delete them and re-add them, but the easiest way I have found is to simply add a space, " ", after the variable, then click another variable and it will save it.  After adding spaces to everything, go back and click on the variables and delete the spaces.  This will re-save the variables to the database and should correct the issue. 

Q:  Why is my video not encoding?  Why is it just copying the video?

A:  The most common reason for this is that your desired Output Bitrate is higher (or close to) your Input bitrate.  It wouldn't make sense to encode a 4000k video to 6000k.  When we encounter this we do go to the fallback cq encoding method, but this also checks to make sure a reasonable size savings can be obtained.  You can lower the quality by raising the cq value.
But keep in mind, it may not be worth it to encode such videos.  One-Flow probably won't encode if you only save 5% of space, the loss in quality wouldn't be worth a 5% space savings.  Keep it original, or lower the output bitrate.

Q:  Why are my hevc vides not encoding?

A:  By default we skip hevc, to force hevc encoding add the custom library variable: do_hevc = true

Q:  How do I encode to AV1 instead of HEVC?

A:  Add the custom library variable codec = av1 to that library.  Leave it unset (or set to anything else) and the library keeps encoding to HEVC exactly as before.  AV1 uses the same encoder autodetect and the same bitrate_<res> / v_cq / encoder settings as HEVC.

Q:  I set codec = av1 but my AV1 files aren't encoding, they're just being skipped.

A:  Just like HEVC, we skip files that are already in the target codec.  If a source is already AV1 and you want to re-encode it anyway, add the custom library variable do_av1 = true (mirrors do_hevc).

## Flow Screenshot
The flow is huge, but here is an example.

![Video Example](https://github.com/samssausages/tdarr/blob/80ee7f3c63ab8f017eefac86c9a25f7f101f129a/video_example.png)
![Input Example](https://github.com/samssausages/tdarr/blob/80ee7f3c63ab8f017eefac86c9a25f7f101f129a/input_example.png)


## Release Notes

Changelog:

V1.00

NEW FEATURES:

- Subtitle extraction to external .srt (Jellyfin naming, e.g. MovieName.en.srt) now always runs on the normal processing path, not only on the retry2 failure-rescue path. Extracted subtitle streams are removed from the output container and the .srt files follow the video to its final destination (output_dir_done when test_mode = true, otherwise the original file folder) — identical destination logic to the previous retry2-only behavior.
- Added optional library variable clear_default_subtitle (default false). When true, clears subtitle stream dispositions on any subtitle stream that remains muxed after extraction (via ffmpeg -disposition:s 0), so no leftover subtitle track is auto-selected by players. Note: -disposition:s 0 resets the entire disposition bitmask to zero on every remaining subtitle stream, so it clears not only 'default' but also 'forced', 'hearing_impaired', etc. — not just the default flag.
- Added optional AV1 output.  Set the library variable codec = av1 to encode a library to AV1 instead of HEVC (nvenc/qsv/cpu implemented; vaapi/amf are not yet implemented and cleanly fall back to the CPU libsvtav1 encoder, pending community-tested commands).  Default is HEVC, so existing libraries are byte-for-byte unchanged.
- Added companion library variable do_av1 (mirrors do_hevc) to force re-encoding of already-AV1 sources.
- Added optional library variable default_audio_language.  Set an ordered priority list of language codes (e.g. eng,jpn); the first language in the list with a matching audio track is marked as the container's default/auto-selected track, and other audio tracks have their default flag cleared.  A single code (e.g. eng) works as a list of one.  Blank/unset = skipped, identical to previous behavior.  If the list is set but NO audio track matches any language in it, the step is also a no-op: existing default flags are left untouched (nothing is cleared or set).
- Added optional library variable rename_group_compressed (default false). When true AND the video was actually re-encoded this run, renames the release-group token at the end of the output filename to "compressed" (appends it if no group token is present). Audio-only Opus recompression (video skipped/remuxed) does not trigger the rename. A title-internal hyphen (e.g. Spider-Man (2019)) is not mistaken for a release-group separator, and an existing "-compressed" target is never overwritten. Idempotent — already-renamed files are left alone. No effect on remux/video-skip-only files or when unset.
- Added optional library variable delete_trickplay (default false). When true, deletes the media's Jellyfin trickplay folder (named after the media with a .trickplay extension; both the base and full-filename naming conventions are checked) only after the compressed file has actually replaced the original in place. It does not run when the file was routed to review by the size-ratio check, nor in test_mode, nor when unset. A deletion failure only logs a warning and never fails the flow.
- Added a start-of-flow skip for already-compressed inputs (1 - Input). Immediately after the input file is found, any file whose name ends in the trailing "-compressed" release-group token is skipped: the flow ends gracefully without transcoding, without going to Flow 2 Prep, and without failing (no failFlow). This pairs with rename_group_compressed — files it renamed on a prior run are not needlessly re-encoded. IMPORTANT: this skip is UNCONDITIONAL — it reads no library variable and is NOT gated on rename_group_compressed (or any opt-in). Any input whose base name ends in a trailing "-compressed" token is skipped even if you never enabled rename_group_compressed, so a file you legitimately named "Something-compressed.mkv" will also be skipped. The trailing-token match is case-insensitive and mirrors rename_group_compressed's tokenization exactly (final hyphen-delimited segment, whitespace-free), so a title-internal hyphen (e.g. Spider-Man (2019)) and untagged files (e.g. Movie-RARBG.mkv) continue down the normal path unchanged.
- Added centralized AV1 flow variables in 1 - Input (fl_av1_nvenc_quality, fl_av1_nvenc_main, fl_av1_nvenc_b-frames, fl_av1_qsv_quality, fl_av1_qsv_main, fl_av1_cpu_quality, fl_av1_cpu_main). The clear_default_subtitle feature also adds a companion flow variable fl_clear_default_subtitle_args in 1 - Input (default `-disposition:s 0`), applied by 2 - Prep when clear_default_subtitle is true.
- Added AV1 encoder flag references under ffmpeg_docs/ (flags_av1_nvenc.md, flags_av1_qsv.md, flags_libsvtav1.md, plus vaapi/amf stubs).
- Note: v_cq is reused for AV1 but AV1 uses a 0-63 scale (vs HEVC 0-51); it is not silently rescaled.  See caveats above.

PERFORMANCE:

- Reduced peak worker-cache usage when processing large files by collapsing five redundant full-container remux passes into the FFmpeg command builder chains that already run in the same flows. In 2 - Prep, the classic Reorder Streams, Remove Images, and Clean Titles passes are now folded into the single Begin/Execute ffmpeg command (image-format streams removed via Remove Stream By Property; title cleaning via a custom-function + custom-arguments pair that computes the same metadata clears as before, using output-relative stream indices). In 3 - Audio, the "Remove all Audio but opus" pass is folded into the Opus encode execute — non-opus audio tracks are marked removed in the same pass, using the exact same codec-name list as before, and the track being encoded to Opus is never removed. For MKV sources the output content, dispositions, titles, and container are unchanged; only the number of full-size cache copies written during processing goes down. (Stream order is a separate story — see the reorder bug fix under FIXES and the corresponding BREAKING CHANGES note below; the builder-chain reorder is now live for the first time.)
- default_audio_language is now applied as an in-place mkvpropedit edit (no full-size remux) immediately after the existing MKVPropEdit step in 3 - Audio, instead of a dedicated ffmpeg remux pass — eliminating another full-size cache copy on the common (MKV) path. The matching logic (ordered priority list, first language with a matching audio track wins) is unchanged. It reads ffProbeData after the audio clean/encode/strip steps have run, on the assumption that the engine re-probes the stream list at that point so the 1-indexed mkvpropedit track selector (track:aN) lines up with the surviving tracks. NOTE: this re-probe assumption has not yet been confirmed against a live fixture — if ffProbeData is stale after AudRm01 strips tracks, a wrong/nonexistent track could be flagged default. Verify against your library if you rely on this.

FIXES:

- Extracted subtitles now land in their destination folder as part of extraction rather than via a separate later move step. The subtitle extractor already writes each .srt next to the original library file (its own final in-place folder), so in the default (in-place) mode nothing is moved at all. The previous two-branch copyMoveFolderContent move is replaced by a single js_move_extracted_subs step that only relocates the sidecars when they must diverge from the video (test_mode = true, where they follow the transcoded video to output_dir_done/<library-relative subpath>). test_mode destination rules are preserved exactly, including the hard-fail defense-in-depth backstop when test_mode = true but output_dir_done is empty/unset. Cross-filesystem relocations (source library and output_dir_done on different mounts) fall back to copy-then-delete, and an existing sidecar at the destination is never overwritten.
- Fixed the test_mode subtitle move (js_move_extracted_subs) sweeping up sidecars belonging to OTHER videos that share the source folder. The move now only relocates sidecars whose filename starts with this video's own base name (stem) — derived from the original library file — followed by a "." separator, so e.g. for `Movie (2019)-RARBG.mkv` only `Movie (2019)-RARBG.srt` / `Movie (2019)-RARBG.en.srt` follow the video, while `Other Movie.en.srt` and near-misses like `Movie (2019)-RARBG-extra.en.srt` are left untouched. Stem matching is case-sensitive (sidecars are generated from the exact original name); subtitle-extension matching stays case-insensitive.
- Fixed CPU AV1 (libsvtav1) encodes aborting with `Max Bitrate only supported with CRF mode` (ffmpeg exit 234); the per-resolution CPU AV1 command now uses capped CRF (`-crf` + `-maxrate`/`-bufsize`) instead of `-b:v`.  See the SVT-AV1 capped-CRF caveat above.
- Fixed the AV1 vaapi/amf autodetect fallback re-introducing that same exit-234 conflict. On the default (VBR) autodetect path, when av1_amf or av1_vaapi hardware was detected, the per-resolution amf/vaapi argument node injected `-b:v -maxrate -bufsize` and then fell through ("This Encoder is not available yet") into the CPU libsvtav1 node, which appends `-crf` — so the executed command carried BOTH `-b:v` and `-crf` and aborted on AMD (amf) / VAAPI systems whenever codec = av1. The twelve per-resolution amf/vaapi argument nodes (all resolutions, both encoders) now emit no arguments; the downstream libsvtav1 CPU node already supplies the complete capped-CRF command (`-crf` + `-maxrate`/`-bufsize` + CPU presets), so the fallback is now a clean CPU encode. NVENC, QSV, and the explicit encoder= override paths were unaffected and are unchanged.
- Fixed extracted subtitles being separated from their video when test_mode = true: the subtitle move now uses keepRelativePath, so subs land in output_dir_done/<library-relative subpath>/ next to the video instead of the flat output_dir_done root.
- Fixed rename_group_compressed leaving subtitle sidecars behind under the old name: when a re-encoded video is renamed to -compressed, matching sidecars (.srt/.ass/.sub/.idx, bare and language-suffixed like .en.srt) in the video's final folder are now renamed to match, in both test_mode and in-place modes. Same guarantees as the video rename — no-clobber (an existing sidecar target is never overwritten), and the sidecar step is fully isolated so a sidecar failure only logs a warning and never blocks or undoes the video rename. Sidecar-extension matching is case-insensitive (e.g. .EN.SRT), and the test-mode sidecar FOLDER is derived the same provable way as the video's moveToDirectory keepRelativePath move (from the original library file path), not from a best-effort field. (The sidecar FILENAME match, however, is anchored to the output video's basename — inputFileObj — not the original library stem; this works because the output normally keeps the original base name, but if that basename ever diverged from the original stem the matching sidecars would not be found/renamed.)
- Hardened the test_mode + output_dir_done requirement into a fail-fast guard: if test_mode = true and output_dir_done is empty/unset, the flow now fails at the very start of 2 - Prep (before any transcoding) via a checkFlowVariable/failFlow gate, instead of transcoding and then silently misplacing the output and subtitle sidecars. The rename_group_compressed plugin additionally throws as a defense-in-depth backstop if it is ever reached in that state.
- Fixed a pre-existing bug where 2 - Prep's builder-chain stream reorder (Reorder Streams / ffmpegCommandRorderStreams) read flow variables that were never set (config_reorder_streams_* instead of the fl_reorder_streams_* names 1 - Input actually defines), so stream reordering was silently a no-op on every run. It now reads the fl_reorder_streams_* values and reorders streams as intended.

BREAKING CHANGES:

- The flow now replaces the original media file in your library by default (works with a normal Tdarr library, no separate output directory needed).
- test_mode is now the single testing switch: test_mode = true keeps the source file AND saves the transcoded output (and extracted subtitles) to output_dir_done, so you can test without touching your library.  The old separate debug variable has been removed and folded into test_mode — if you previously set that debug flag to true, use test_mode = true instead (and delete the now-unused debug variable from your library settings).
- output_dir_done is required when test_mode = true.
- Files flagged for review are still moved to output_dir_review, so output_dir_review is still required.  Accepting a reviewed file deletes the original unless test_mode = true.  Note that the two size-ratio outcomes are asymmetric: a too-SMALL output (suspiciously large reduction) is soft-routed to output_dir_review for inspection, whereas a too-LARGE output hard-fails the flow (failFlow) and discards the transcode rather than routing it to review.
- Extracted subtitles (now extracted on every normal pass) follow the video file into its exact final folder: original file folder by default, or output_dir_done/<library-relative subpath> when test_mode = true.
- Stream reordering is now active for the first time (see the reorder bug fix above), so output stream order can differ from previous runs. Streams are still grouped video → audio → subtitle, but the builder-chain reorder sorts by type → language → channels → codec using the fl_reorder_streams_* values in 1 - Input (channels default 7.1,5.1,2,1), rather than the old classic plugin's type-then-channel-count-only order. Adjust the fl_reorder_streams_* values in 1 - Input if you want a different ordering.
- default_audio_language is now applied only to MKV outputs (via the in-place mkvpropedit edit described under PERFORMANCE). Non-MKV outputs — e.g. the mp4 retry/error-recovery fallback path — no longer have the default-audio-track flag set. On the normal path the flow force-conforms output to MKV, so this only affects the rare fallback case.
- .avi sources no longer receive image-format-stream removal or title cleaning, since those steps are now part of the 2 - Prep ffmpeg builder chain. (Mechanically, avi still traverses the builder-chain nodes — the JS title-clean node even runs and logs — but avi branches off before the chain's Execute node, so the mutated ffmpeg command is never written; avi is intentionally given minimal remux treatment.) This is consistent with the flow's existing "avi gets minimal treatment" behavior.
- The folded-in 2 - Prep operations (stream reorder, image-stream removal, title cleaning) no longer have their own per-step error rescue. Previously each ran as an isolated classic-plugin pass that silently moved on if it failed; now a failure in any of them is caught only by the shared ffmpeg builder chain's retry1–retry5 cascade, which can end in failFlow for what is otherwise a cosmetic/best-effort step. Title cleaning (the one step made of custom JS) degrades gracefully — its logic is wrapped in try/catch and falls back to leaving titles unchanged on error — but image-stream removal and stream reordering are built-in plugin steps and share the wider blast radius of the merged chain. Accepted tradeoff of the cache-usage reduction above; see PERFORMANCE.

V0.94

Not too many front end changes this relase, much is to prepare for future features.  Also squashed a few bugs.

 - Fixed bug that resulted in wrong bitrate during certain cirumstances
 - Backend changes to prepare for future features
 - Added better notifications for when encoding is skipped due to incompatible HDR

V0.93

BREAKING CHANGES:

Split "do_audio" into:

do_audio_clean - true/false - Remove Commentary Audio, Remove Languages not listed in "audio_language", Keep only the Audio Track with Highest Channel Count

do_audio_encode - true/false - Encode 1st Audio track to Opus


ACTION TO TAKE IF UPGRADING FROM OLD VERSION:

Remove "do_audio" Library Variable and create "do_audio_clean" and "do_audio_encode" Library Variables


OTHER CHANGES:

- is_audio_lossless custom JS - Expanding to capture more lossless audio codecs through the custom JS, for more durable lossless codec identification. - Still refining this
- Added optional library variable: "disable_vbr" - true/false - to disable vbr encoding method and force cq encoding. (if you have disable_cq enabled as well, then video encoding is skipped)
- Added optional library variable: "encoder" - nvenc/qsv/amf/vaapi/cpu - Override Autodetect and manually set what encoder to use (currently only nvenc/qsv/cpu work)
- Moved "lookahead=32" from 4 - Video to 1 - Input - Flow Variable "fl_cpu_main"

BUG FIX:

- Added missing error handling to audio cleaning process
- Improved Audio encode error reporting
