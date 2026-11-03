/**
 * 駒音：不載入音檔，用 WebAudio 合成「パチッ」。
 * 短促的噪音經帶通濾波，再加一個低頻的木頭共鳴。
 */
let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  context ??= new AudioContext();
  if (context.state === 'suspended') void context.resume();
  return context;
}

export function playKoma(strength: 'normal' | 'strong' = 'normal'): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const length = Math.floor(ctx.sampleRate * 0.09);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 6);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = strength === 'strong' ? 1900 : 2400;
  band.Q.value = 1.2;
  const gain = ctx.createGain();
  gain.gain.value = strength === 'strong' ? 1.1 : 0.7;
  noise.connect(band).connect(gain).connect(ctx.destination);

  const body = ctx.createOscillator();
  body.frequency.setValueAtTime(strength === 'strong' ? 210 : 260, now);
  body.frequency.exponentialRampToValueAtTime(90, now + 0.08);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.35, now);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  body.connect(bodyGain).connect(ctx.destination);

  noise.start(now);
  body.start(now);
  body.stop(now + 0.12);
}

/** 讀秒提示音 */
export function playTick(): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const tone = ctx.createOscillator();
  tone.frequency.value = 880;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  tone.connect(gain).connect(ctx.destination);
  tone.start(now);
  tone.stop(now + 0.13);
}
