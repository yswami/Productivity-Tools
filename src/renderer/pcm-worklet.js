class PcmWorklet extends AudioWorkletProcessor {
  process(inputs) {
    const channels = inputs[0];
    if (!channels || !channels[0]) return true;
    const source = channels[0];
    const output = new Int16Array(source.length);
    for (let index = 0; index < source.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, source[index]));
      output[index] = sample < 0 ? sample * 32768 : sample * 32767;
    }
    this.port.postMessage(output.buffer, [output.buffer]);
    return true;
  }
}

registerProcessor("pcm-worklet", PcmWorklet);
