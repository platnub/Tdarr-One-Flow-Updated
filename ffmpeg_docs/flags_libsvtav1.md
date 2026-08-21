list your encoders run: 
```
ffmpeg -encoders
```

search the list run: 
```
ffmpeg -encoders | grep av1
```

To query an encoder's options run: 
```
ffmpeg -h encoder=libsvtav1
```

## Build requirements

- `libsvtav1` is the **CPU (software) SVT-AV1** encoder. It requires an **FFmpeg build with `--enable-libsvtav1`**. Verify with `ffmpeg -encoders | grep libsvtav1`.
- No special hardware needed — this is the guaranteed fallback when no AV1-capable GPU is detected.
- 10-bit HDR uses pixel format `yuv420p10le`.

## Important: preset scale is INVERTED vs x265

- SVT-AV1 `-preset` ranges **0–13**, where **higher = faster / lower quality** (0 is slowest/best). This is the **opposite** of x265, where higher preset numbers are slower.
- This flow sets `fl_av1_cpu_quality = -preset 6` as a sane default (roughly the balanced middle of the range).
- CRF-based quality uses `-crf`, range **0–63** for SVT-AV1 (0 = lossless-ish, higher = smaller/lower quality). Note this differs from x265's 0–51 CRF scale.
- SVT-AV1 uses **`-svtav1-params`** for advanced tuning, **NOT** `-x265-params`. This flow strips `-x265-params` from the AV1 CPU command; add tuning via `fl_av1_cpu_main` (e.g. `-svtav1-params tune=0`) if desired.

Example:

```
Encoder libsvtav1 [SVT-AV1(Scalable Video Technology for AV1) encoder]:
    General capabilities: dr1 delay other 
    Threading capabilities: other
    Supported pixel formats: yuv420p yuv420p10le
libsvtav1 AVOptions:
  -preset            <int>        E..V....... Encoding preset (from -1 to 13) (default -1)
  -crf               <int>        E..V....... Constant Rate Factor value (from 0 to 63) (default 0)
  -qp                <int>        E..V....... Initial Quantizer level value (from 0 to 63) (default 0)
  -svtav1-params     <dictionary> E..V....... Set the SVT-AV1 configuration using a :-separated list of key=value parameters
  -tile_columns      <int>        E..V....... Log2 of number of tile columns to use (from 0 to 4) (default 0)
  -tile_rows         <int>        E..V....... Log2 of number of tile rows to use (from 0 to 6) (default 0)
```

## Reference

- FFmpeg SVT-AV1 wiki: https://trac.ffmpeg.org/wiki/Encode/AV1#SVT-AV1
- SVT-AV1 parameter documentation: https://gitlab.com/AOMediaCodec/SVT-AV1/-/blob/master/Docs/Parameters.md
