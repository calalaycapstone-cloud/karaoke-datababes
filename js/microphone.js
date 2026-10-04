// Mic -> input gain -> (dry + effect) -> limiter -> output (monitor). Analyser taps before the monitor gate.
const F = (c, type, f, q = 1, g = 0) => { const n = c.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.gain.value = g; return n; };
const chain = (...n) => { n.reduce((a, b) => (a.connect(b), b)); return { i: n[0], o: n.at(-1) }; };
const ws = (c, k) => { const w = c.createWaveShaper(), n = 256, a = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; a[i] = (1 + k) * x / (1 + k * Math.abs(x)); } w.curve = a; return w; };
const irs = {};
const reverb = sec => c => { const v = c.createConvolver(); if (!irs[sec]) { const n = c.sampleRate * sec, b = c.createBuffer(2, n, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); } irs[sec] = b; } v.buffer = irs[sec]; return { i: v, o: v }; };
// add:true = wet added on top of dry; otherwise dry/wet crossfade
export const EFFECTS = {
  clean: { label: 'Clean', add: true, build: c => { const g = c.createGain(); return { i: g, o: g }; } },
  echo: { label: 'Echo', add: true, build: (c, a) => { const d = c.createDelay(1), fb = c.createGain(); d.delayTime.value = .32; fb.gain.value = a * .65; d.connect(fb); fb.connect(d); return { i: d, o: d }; } },
  reverb: { label: 'Reverb', add: true, build: reverb(1.8) },
  hall: { label: 'Hall', add: true, build: reverb(4.2) },
  radio: { label: 'Radio', build: c => chain(F(c, 'highpass', 500), F(c, 'lowpass', 3200), ws(c, 8)) },
  telephone: { label: 'Telephone', build: c => chain(F(c, 'highpass', 400), F(c, 'lowpass', 3400), ws(c, 25)) },
  megaphone: { label: 'Megaphone', build: c => { const g = c.createGain(); g.gain.value = 1.4; return chain(F(c, 'bandpass', 1800, 1.5), ws(c, 60), g); } },
  robot: { label: 'Robot', build: c => { const g = c.createGain(), o = c.createOscillator(); g.gain.value = 0; o.frequency.value = 55; o.connect(g.gain); o.start(); return { i: g, o: g, x: () => o.stop() }; } },
  deep: { label: 'Deep voice', build: (c, a) => chain(F(c, 'lowshelf', 220, 1, 6 + a * 10), F(c, 'lowpass', 2600)) },
  boost: { label: 'Vocal boost', build: c => { const k = c.createDynamicsCompressor(); k.threshold.value = -28; k.ratio.value = 5; return chain(k, F(c, 'peaking', 3000, 1, 6), F(c, 'highshelf', 8000, 1, 4)); } }
};
export const mic = {
  on: false, fx: 'clean', amt: .5, vol: 1, monitor: true,
  supported: () => !!(navigator.mediaDevices?.getUserMedia && (window.AudioContext || window.webkitAudioContext)),
  async start() {
    if (!this.supported()) throw new Error('This browser does not support microphone processing.');
    try { this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false, latency: 0 } }); }
    catch (e) { throw new Error({ NotAllowedError: 'Microphone permission was denied. Allow it in your browser’s site settings.', NotFoundError: 'No microphone found.', NotReadableError: 'Microphone is in use by another app.' }[e.name] || 'Could not open the microphone.'); }
    const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    this.src = c.createMediaStreamSource(this.stream); this.inG = c.createGain(); this.mix = c.createGain();
    this.lim = c.createDynamicsCompressor(); this.lim.threshold.value = -6; this.lim.ratio.value = 12; // tames feedback spikes
    this.an = c.createAnalyser(); this.an.fftSize = 1024; this.an.smoothingTimeConstant = .8; this.out = c.createGain();
    this.src.connect(this.inG); this.mix.connect(this.lim); this.lim.connect(this.an); this.lim.connect(this.out); this.out.connect(c.destination);
    this.fa = new Uint8Array(this.an.frequencyBinCount); this.wa = new Uint8Array(this.an.fftSize);
    this.on = true; this.apply(); this.rewire(); await c.resume();
  },
  stop() { this.x?.(); this.stream?.getTracks().forEach(t => t.stop()); this.ctx?.close(); this.on = false; this.ctx = null; },
  apply() { if (!this.on) return; this.inG.gain.value = this.vol; this.out.gain.value = this.monitor ? 1 : 0; },
  rewire() {
    if (!this.on) return; const c = this.ctx, e = EFFECTS[this.fx], a = this.amt;
    try { this.inG.disconnect(); this.dry?.disconnect(); this.wet?.disconnect(); this.x?.(); } catch {}
    const f = e.build(c, a); this.x = f.x; this.dry = c.createGain(); this.wet = c.createGain();
    const clean = this.fx === 'clean'; this.dry.gain.value = clean ? 1 : e.add ? 1 : 1 - a; this.wet.gain.value = clean ? 0 : e.add ? a * 1.2 : a;
    this.inG.connect(this.dry); this.dry.connect(this.mix); this.inG.connect(f.i); f.o.connect(this.wet); this.wet.connect(this.mix);
  },
  freq() { if (!this.on) return null; this.an.getByteFrequencyData(this.fa); return this.fa; },
  wave() { if (!this.on) return null; this.an.getByteTimeDomainData(this.wa); return this.wa; },
  latencyMs() { return this.on ? Math.round(((this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0)) * 1000) : 0; }
};
