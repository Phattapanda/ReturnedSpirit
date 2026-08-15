# Intro video asset

Place the cinematic intro file at:

`frontend/assets/video/intro.mp4`

Expected format for the current intro implementation:
- MP4 container
- H.264 video
- AAC audio
- portrait aspect ratio (9:16 recommended)

The feature branch currently loads this exact path through the branch's raw GitHub URL while testing. Once the binary asset is committed, the intro can be switched to a local bundled `require("../assets/video/intro.mp4")` source before merge.
