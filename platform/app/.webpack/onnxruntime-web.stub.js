// Inert stub for `onnxruntime-web/webgpu`.
//
// The real onnxruntime-web bundle ships emscripten runtime code whose Node.js
// branch (`if (ENVIRONMENT_IS_NODE) { ... location: { href: __filename } ... }`)
// gets reached in the browser when the WASM backend spins up on a page RELOAD
// where WebGPU is degraded (a known Chrome behavior). It then throws
// "__filename is not defined", which aborts the cornerstone extension boot and
// leaves the viewer on a gray screen. A fresh tab works; reloading the same
// context does not.
//
// onnxruntime-web is only pulled in by `@cornerstonejs/ai` for SAM-based AI
// auto-segmentation, which is not enabled in this deployment. Nothing else in
// the viewer needs it (DICOM decoding uses the cornerstone WASM codecs). We
// alias the import to this inert stub via `resolve.alias` in webpack.pwa.js so
// the emscripten code never runs and the viewer always boots.
//
// All `ort.*` access in @cornerstonejs/ai happens inside methods, never at
// module-evaluation time, so these no-op shapes are enough for the modules to
// load. If AI segmentation is ever invoked, InferenceSession.create rejects
// with a clear message instead of crashing the app.

const env = {
  wasm: {
    wasmPaths: '',
    numThreads: 1,
    proxy: false,
    simd: true,
  },
  webgpu: {},
  logLevel: 'warning',
};

class Tensor {
  constructor(type, data, dims) {
    this.type = type;
    this.data = data;
    this.dims = dims;
  }
}

const InferenceSession = {
  create() {
    return Promise.reject(
      new Error('onnxruntime-web is disabled in this build (AI auto-segmentation unavailable).')
    );
  },
};

const ort = { env, Tensor, InferenceSession };

export default ort;
export { env, Tensor, InferenceSession };
