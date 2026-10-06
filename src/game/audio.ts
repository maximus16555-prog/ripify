import type { Settings } from '../core/types';
export type Sound = 'step' | 'click' | 'buy' | 'crinkle' | 'rip' | 'swipe' | 'rare' | 'return';
export class GameAudio {
  private context?: AudioContext;
  private ambience?: OscillatorNode;
  private ambienceGain?: GainNode;
  private noiseBuffers = new Map<Sound, AudioBuffer>();
  constructor(private settings: () => Settings) {}
  unlock() {
    try {
      this.context ??= new AudioContext(); void this.context.resume();
      if (!this.ambience) {
        this.ambience = this.context.createOscillator(); this.ambience.type = 'sine'; this.ambience.frequency.value = 130.81;
        this.ambienceGain = this.context.createGain(); this.ambienceGain.gain.value = 0; this.ambience.connect(this.ambienceGain).connect(this.context.destination); this.ambience.start(); this.update();
      }
    } catch { /* Audio is optional. */ }
  }
  update() { if (this.context && this.ambienceGain) { const s = this.settings(); this.ambienceGain.gain.setTargetAtTime(s.master * s.music * .013, this.context.currentTime, .2); } }
  suspend() { void this.context?.suspend(); }
  resume() { if (this.context) void this.context.resume(); }
  play(sound: Sound) {
    const ctx = this.context; if (!ctx || ctx.state !== 'running') return;
    const s = this.settings(); const volume = s.master * s.sfx;
    if (volume <= .0001) return;
    const noise = ['step', 'crinkle', 'rip', 'swipe'].includes(sound);
    const duration = sound === 'rip' ? .36 : sound === 'crinkle' ? .07 : sound === 'rare' || sound === 'return' ? .75 : .13;
    const gain = ctx.createGain(); gain.gain.setValueAtTime(volume * (sound === 'step' ? .03 : sound === 'crinkle' ? .028 : noise ? .09 : .045), ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + duration); gain.connect(ctx.destination);
    if (noise) {
      let buffer = this.noiseBuffers.get(sound);
      if (!buffer) {
        buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate); const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (sound === 'rip' || sound === 'crinkle' ? .5 + .5 * Math.sin(i * .018) : 1);
        this.noiseBuffers.set(sound, buffer);
      }
      const source = ctx.createBufferSource(); source.buffer = buffer; const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = sound === 'step' ? 380 : sound === 'rip' ? 2900 : 1400;
      source.connect(filter).connect(gain); source.start(); source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    } else {
      const frequencies = sound === 'rare' || sound === 'return' ? [523.25, 659.25, 783.99] : sound === 'buy' ? [660, 880] : [460];
      frequencies.forEach((f, i) => { const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = f; osc.connect(gain); osc.start(ctx.currentTime + i * .08); osc.stop(ctx.currentTime + duration); osc.onended = () => osc.disconnect(); });
      setTimeout(() => gain.disconnect(), (duration + .1) * 1000);
    }
  }
  dispose() { this.ambience?.stop(); this.noiseBuffers.clear(); void this.context?.close(); }
}
