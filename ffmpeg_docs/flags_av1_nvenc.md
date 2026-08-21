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
ffmpeg -h encoder=av1_nvenc
```

## Hardware / build requirements

- `av1_nvenc` requires an **NVIDIA Ada Lovelace GPU (RTX 40 series or newer)**. Turing/Ampere (RTX 20/30) do **not** have an AV1 NVENC engine and will fail the hardware check → the flow falls back to CPU (`libsvtav1`).
- Requires **FFmpeg ≥ 6.0** built with `--enable-nvenc` and a recent NVIDIA driver.
- 10-bit HDR uses pixel format `p010le` (same family as `hevc_nvenc`).

Example:
AD102 [RTX 4090]

```
Encoder av1_nvenc [NVIDIA NVENC av1 encoder]:
    General capabilities: dr1 delay hardware 
    Threading capabilities: none
    Supported hardware devices: cuda cuda 
    Supported pixel formats: yuv420p nv12 p010le yuv444p p016le gbrp gbrp16le cuda
av1_nvenc AVOptions:
  -preset            <int>        E..V....... Set the encoding preset (from 0 to 18) (default p4)
     default         0            E..V....... 
     slow            1            E..V....... hq 2 passes
     medium          2            E..V....... hq 1 pass
     fast            3            E..V....... hp 1 pass
     p1              12           E..V....... fastest (lowest quality)
     p2              13           E..V....... faster (lower quality)
     p3              14           E..V....... fast (low quality)
     p4              15           E..V....... medium (default)
     p5              16           E..V....... slow (good quality)
     p6              17           E..V....... slower (better quality)
     p7              18           E..V....... slowest (best quality)
  -tune              <int>        E..V....... Set the encoding tuning info (from 1 to 4) (default hq)
     hq              1            E..V....... High quality
     ll              2            E..V....... Low latency
     ull             3            E..V....... Ultra low latency
     lossless        4            E..V....... Lossless
  -rc                <int>        E..V....... Override the preset rate-control (from -1 to INT_MAX) (default -1)
     constqp         0            E..V....... Constant QP mode
     vbr             1            E..V....... Variable bitrate mode
     cbr             2            E..V....... Constant bitrate mode
  -rc-lookahead      <int>        E..V....... Number of frames to look ahead for rate-control (from 0 to INT_MAX) (default 0)
  -spatial-aq        <boolean>    E..V....... set to 1 to enable Spatial AQ (default false)
  -temporal-aq       <boolean>    E..V....... set to 1 to enable Temporal AQ (default false)
  -aq-strength       <int>        E..V....... When Spatial AQ is enabled, this field is used to specify AQ strength. AQ strength scale is from 1 (low) - 15 (aggressive) (from 1 to 15) (default 8)
  -cq                <float>      E..V....... Set target quality level (0 to 63, 0 means automatic) for constant quality mode in VBR rate control (from 0 to 63) (default 0)
  -bf                <int>        E..V....... Number of B-frames between reference frames (from -1 to INT_MAX) (default -1)
  -b_ref_mode        <int>        E..V....... Use B frames as references (from 0 to 1) (default 0)
  -multipass         <int>        E..V....... Set the multipass encoding (from 0 to 2) (default disabled)
  -tile-rows         <int>        E..V....... Number of tile rows to encode with (from -1 to 64) (default -1)
  -tile-columns      <int>        E..V....... Number of tile columns to encode with (from -1 to 64) (default -1)
  -highbitdepth      <boolean>    E..V....... Enable 10 bit encode for 8 bit input (default false)
```

> **Note on the `-cq` scale:** for AV1 the constant-quality range is **0–63** (vs 0–51 for HEVC). The flow reuses the `v_cq` library variable, so a value tuned for HEVC will map to a different perceptual quality on AV1 — see `readme.md` caveats.

## Reference

- FFmpeg AV1 encoding wiki: https://trac.ffmpeg.org/wiki/Encode/AV1
- NVIDIA Video Codec SDK (AV1 support matrix): https://docs.nvidia.com/video-technologies/video-codec-sdk/
