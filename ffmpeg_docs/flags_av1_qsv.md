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
ffmpeg -h encoder=av1_qsv
```

## Hardware / build requirements

- `av1_qsv` requires an Intel GPU with an AV1 encode engine: **Arc discrete GPUs (Alchemist)** or **Meteor Lake / Lunar Lake and newer iGPUs**. Older iGPUs (Xe / UHD) have no AV1 encoder and fall back to CPU (`libsvtav1`).
- Requires **FFmpeg ≥ 6.0** built with `--enable-libvpl` (or legacy `--enable-libmfx`) and a recent Intel media driver.
- 10-bit HDR uses pixel format `p010le`.
- **`-look_ahead` is intentionally NOT used** for `av1_qsv` in this flow — it is not reliably supported on the AV1 QSV encoder and can cause the command to fail. (It is used by `hevc_qsv`.)

Example:
Intel Arc A770

```
Encoder av1_qsv [AV1 (Intel Quick Sync Video acceleration)]:
    General capabilities: delay hybrid 
    Threading capabilities: none
    Supported hardware devices: qsv vaapi d3d11va qsv qsv 
    Supported pixel formats: nv12 p010le qsv vaapi d3d11 x2rgb10le
av1_qsv encoder AVOptions:
  -async_depth       <int>        E..V....... Maximum processing parallelism (from 1 to INT_MAX) (default 4)
  -preset            <int>        E..V....... (from 1 to 7) (default medium)
     veryfast        7            E..V.......
     faster          6            E..V.......
     fast            5            E..V.......
     medium          4            E..V.......
     slow            3            E..V.......
     slower          2            E..V.......
     veryslow        1            E..V.......
  -profile           <int>        E..V....... (from 0 to INT_MAX) (default unknown)
     unknown         0            E..V.......
     main            1            E..V.......
  -tile_cols         <int>        E..V....... Number of columns for tiled encoding (from 0 to 65535) (default 0)
  -tile_rows         <int>        E..V....... Number of rows for tiled encoding (from 0 to 65535) (default 0)
  -adaptive_i        <int>        E..V....... Adaptive I-frame placement (from -1 to 1) (default -1)
  -adaptive_b        <int>        E..V....... Adaptive B-frame placement (from -1 to 1) (default -1)
  -b_strategy        <int>        E..V....... Strategy to choose between I/P/B-frames (from -1 to 1) (default -1)
  -extbrc            <int>        E..V....... Extended bitrate control (from -1 to 1) (default -1)
  -low_delay_brc     <boolean>    E..V....... Allow to strictly obey avg frame size (default auto)
  -max_frame_size    <int>        E..V....... Maximum encoded frame size in bytes (from -1 to INT_MAX) (default -1)
```

## Rate control

Quality-based encoding uses `-global_quality` (ICQ), range **1–63** for AV1. Bitrate-based encoding uses `-b:v` / `-maxrate` (VBR). This flow uses VBR by default and falls back to `-global_quality {{v_cq}}` when VBR is disabled.

## Reference

- FFmpeg AV1 encoding wiki: https://trac.ffmpeg.org/wiki/Encode/AV1
- Intel QSV FFmpeg guide: https://trac.ffmpeg.org/wiki/Hardware/QuickSync
