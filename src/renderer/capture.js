let active;

window.captureBridge.onStart(async (options) => {
  try {
    const streams = [];
    const microphone = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false
    });
    streams.push(microphone);

    if (options.includeSystemAudio) {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      display.getVideoTracks().forEach((track) => track.stop());
      if (display.getAudioTracks().length === 0) throw new Error("Windows system audio was not available.");
      streams.push(display);
    }

    const context = new AudioContext({ sampleRate: 16000, latencyHint: "playback" });
    await context.audioWorklet.addModule("pcm-worklet.js");
    const mix = context.createGain();
    mix.gain.value = streams.length > 1 ? 0.75 : 1;
    streams.forEach((stream) => context.createMediaStreamSource(stream).connect(mix));
    const processor = new AudioWorkletNode(context, "pcm-worklet");
    const silent = context.createGain();
    silent.gain.value = 0;
    mix.connect(processor).connect(silent).connect(context.destination);
    processor.port.onmessage = (event) => window.captureBridge.chunk(options.sessionId, event.data);
    await context.resume();
    active = { options, streams, context, processor };
    window.captureBridge.started({ sessionId: options.sessionId, sampleRate: context.sampleRate });
  } catch (error) {
    window.captureBridge.error(options.sessionId, error instanceof Error ? error.message : String(error));
  }
});

window.captureBridge.onStop(async ({ sessionId }) => {
  try {
    if (!active || active.options.sessionId !== sessionId) return;
    active.streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    active.processor.disconnect();
    const sampleRate = active.context.sampleRate;
    await active.context.close();
    active = undefined;
    window.captureBridge.stopped({ sessionId, sampleRate });
  } catch (error) {
    window.captureBridge.error(sessionId, error instanceof Error ? error.message : String(error));
  }
});
