# Local portrait detection assets

MediaPipe Tasks Vision 1.2.0 is bundled from the official npm package under Apache 2.0. See LICENSE. The runtime and all model files are served locally. Camera pixels are never uploaded.

Sources:

- Package: https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-1.2.0.tgz
- Face model, float16 version 1: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- Person model, landscape float16 version 1: https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/1/selfie_segmenter_landscape.tflite
- Face guide: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js
- Person guide and model information: https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter

The unchanged runtime, model binaries, and compressed equivalents are recorded in manifest.json. The .gz files are deterministic gzip copies for the local launcher; static hosts can also compress the original files themselves. Preserve this versioned directory when publishing.
