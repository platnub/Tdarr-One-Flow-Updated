# Resources on how to configure various encoders

## General Info
ffmpeg codecs documentation:

https://ffmpeg.org/ffmpeg-codecs.html

## Video

### nvenc

Nvidia Encoder/Decoder Capability Matrix

https://developer.nvidia.com/video-encode-and-decode-gpu-support-matrix-new

#### hvec_nvenc

https://docs.nvidia.com/video-technologies/video-codec-sdk/11.1/ffmpeg-with-nvidia-gpu/index.html

https://goughlui.com/2023/12/29/video-codec-round-up-2023-part-9-hevc_nvenc-h-265-nvidia-nvenc/

#### av1_nvenc

Requires an Nvidia Ada Lovelace GPU (RTX 40 series or newer) and FFmpeg ≥ 6.0. See [flags_av1_nvenc.md](flags_av1_nvenc.md).

https://docs.nvidia.com/video-technologies/video-codec-sdk/

https://trac.ffmpeg.org/wiki/Encode/AV1

### qsv

Intel Quick Sync Encoder/Decoder Compatibility Matrix

https://en.wikipedia.org/wiki/Intel_Quick_Sync_Video#Hardware_decoding_and_encoding

#### hvec_qsv

https://trac.ffmpeg.org/wiki/Hardware/QuickSync

https://goughlui.com/2023/12/28/video-codec-round-up-2023-part-7-hevc_qsv-h-265-intel-quick-sync-video/

https://nelsonslog.wordpress.com/2022/08/22/ffmpeg-and-hevc_qsv-intel-quick-sync-settings/

#### av1_qsv

Requires an Intel Arc GPU or Meteor Lake / Lunar Lake (and newer) iGPU, plus FFmpeg ≥ 6.0. See [flags_av1_qsv.md](flags_av1_qsv.md).

https://trac.ffmpeg.org/wiki/Hardware/QuickSync

https://trac.ffmpeg.org/wiki/Encode/AV1

### amf

AMD Encoder/Decoder Compatibility Matrix

https://en.wikipedia.org/wiki/Video_Core_Next

https://en.wikipedia.org/wiki/Video_Coding_Engine

https://github.com/GPUOpen-LibrariesAndSDKs/AMF

#### hevc_amf

https://goughlui.com/2023/12/31/video-codec-round-up-2023-part-11-hevc_amf-h-265-amd-advanced-media-framework/

#### av1_amf

Stubbed to CPU fallback in this flow (no tested command yet). See [flags_av1_amf.md](flags_av1_amf.md).

### libx265

https://goughlui.com/2023/12/26/video-codec-round-up-2023-part-3-libx265-mpeg-h-part-2-h-265-hevc/

### libsvtav1

CPU (software) SVT-AV1 encoder. Preset scale is 0–13 (higher = faster, inverted vs x265); CRF 0–63. See [flags_libsvtav1.md](flags_libsvtav1.md).

https://trac.ffmpeg.org/wiki/Encode/AV1#SVT-AV1

### vaapi
#### hvec_vaapi

https://trac.ffmpeg.org/wiki/Hardware/VAAPI

#### av1_vaapi

Stubbed to CPU fallback in this flow (no tested command yet). See [flags_av1_vaapi.md](flags_av1_vaapi.md).

## Audio

### opus
