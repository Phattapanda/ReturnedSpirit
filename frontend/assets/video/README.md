# Intro video

The cinematic intro asset is stored at:

`frontend/assets/intro.mp4`

`frontend/app/intro.tsx` bundles it locally with:

```ts
const INTRO_VIDEO = require("../assets/intro.mp4");
```

The video replaces the old illustrated/text intro sequence. After playback or a successful hold-to-skip action, the game fades into the morning room, plays the knock, shows Rupert's "Are you awake?" line, and continues the existing dialogue flow.
