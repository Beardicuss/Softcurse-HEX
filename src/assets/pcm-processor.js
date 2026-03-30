// pcm-processor.js — AudioWorklet processor
// Captures raw Float32 PCM at 16kHz and sends to main thread in chunks.
// Runs in the audio worklet thread — completely separate from the renderer.
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf   = [];
    this._count = 0;
    // Send a chunk every ~0.5 seconds — VAD in voice.js accumulates speech frames
    // and only sends to Whisper once a complete speech segment is detected.
    this._chunkSize = 16000 * 0.5; // 0.5 seconds
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const samples = input[0]; // Float32Array, one channel

    for (let i = 0; i < samples.length; i++) {
      this._buf.push(samples[i]);
      this._count++;
    }

    if (this._count >= this._chunkSize) {
      // Transfer chunk to main thread
      const chunk = new Float32Array(this._buf);
      this.port.postMessage({ chunk: chunk.buffer }, [chunk.buffer]);
      this._buf   = [];
      this._count = 0;
    }

    return true; // keep processor alive
  }
}

registerProcessor('pcm-processor', PCMProcessor);
