# Local hand tracking assets

MediaPipe Tasks Vision 0.10.32, Apache 2.0, from Google's npm package.
`vision_bundle.cjs` is preserved byte-for-byte as `vision_bundle.js` so a classic
worker can load it with the correct JavaScript MIME type. The worker supplies
an `exports` object for the package's CommonJS exports. Both SIMD and non-SIMD
WASM runtimes are included.

The Hand Landmarker float16 bundle, version 1, is downloaded from the model
link in Google's Hand Landmarker documentation. Source URLs and SHA-256 hashes
are recorded in `manifest.json`. `LICENSE` contains the Apache 2.0 license.

Runtime scripts, WASM, and the model are served from this edition's own origin.
The page's Content Security Policy restricts network connections to that origin.
No CDN, model download from a third-party origin, telemetry endpoint, camera
recording, or camera upload is used by this edition.

- https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js
- https://github.com/google-ai-edge/mediapipe
