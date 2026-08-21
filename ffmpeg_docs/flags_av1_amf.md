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
ffmpeg -h encoder=av1_amf
```

## Status in this flow: STUBBED → CPU fallback

`av1_amf` is **not wired to a real command** in this flow. Exactly like `hevc_amf`, selecting the `amf` encoder with `codec=av1` routes to the CPU fallback (`libsvtav1`) with a *"This Encoder is not available yet…"* notice.

Real `av1_amf` support (AMD RDNA3+ AV1 encode via AMF) requires hardware to validate the exact flags and pixel formats (`p010le`/`nv12`). Community PRs adding a tested `av1_amf` command are welcome — mirror the structure of the `av1_qsv` / `av1_nvenc` encode-arg nodes in `4 - Video.yml`.

## Reference

- AMD AMF: https://github.com/GPUOpen-LibrariesAndSDKs/AMF
- FFmpeg AV1 encoding wiki: https://trac.ffmpeg.org/wiki/Encode/AV1
