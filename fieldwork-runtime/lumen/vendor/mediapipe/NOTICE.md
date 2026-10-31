# Local hand tracking assets

The MediaPipe Tasks Vision runtime is @mediapipe/tasks-vision 0.10.21, downloaded from the official npm registry. Runtime source and WebAssembly assets are kept unchanged. Its Apache 2.0 license is included as LICENSE.

- Runtime: https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-0.10.21.tgz
- Upstream: https://github.com/google-ai-edge/mediapipe
- Hand Landmarker model bundle, float16, version 1: https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
- Model documentation: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker

These assets are served from the artwork's own directory. No CDN, hosted inference, telemetry, or image upload is used by the hand-lens integration. Camera frames and landmark results remain in memory on the viewing device.
