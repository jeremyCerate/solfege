// Piano : enregistrements du Salamander Grand Piano (Yamaha C5, Alexander Holm, CC-BY 3.0),
// une note sur trois, transposée d'un demi-ton au plus. Tant qu'ils ne sont pas chargés
// (ou si le chargement échoue), un piano de synthèse prend le relais.
import { midi, BEAT } from './music.js';

let ctx = null;
let master = null;
let wave = null;
const live = new Set();

// note MIDI -> fichier
const SAMPLES = { 57: 'A3', 60: 'C4', 63: 'Ds4', 66: 'Fs4', 69: 'A4', 72: 'C5', 75: 'Ds5', 78: 'Fs5' };
const raw = {}; // fichiers téléchargés, pas encore décodés
const buffers = {}; // sons prêts à jouer
let decoding = false;
const samplesReady = () => Object.keys(buffers).length === Object.keys(SAMPLES).length;

// Téléchargement dès l'ouverture de l'app (le décodage attend le premier geste de l'utilisateur).
const fetched = Promise.all(Object.entries(SAMPLES).map(([m, name]) =>
  fetch(`piano/${name}.mp3`)
    .then((r) => { if (!r.ok) throw new Error(name); return r.arrayBuffer(); })
    .then((ab) => { raw[m] = ab; })
    .catch(() => {})));

function decodeSamples() {
  if (decoding) return;
  decoding = true;
  fetched.then(() => {
    for (const [m, ab] of Object.entries(raw)) {
      ctx.decodeAudioData(ab, (buf) => {
        // niveau de crête, pour que toutes les notes sonnent à la même force
        const d = buf.getChannelData(0);
        let peak = 0.05;
        for (let i = 0; i < d.length && i < buf.sampleRate * 2; i++) peak = Math.max(peak, Math.abs(d[i]));
        buf.level = 0.7 / peak;
        buffers[m] = buf;
      }, () => {});
    }
  });
}

function sampleTone(dest, m, t, dur, vel) {
  let base = 60;
  for (const k of Object.keys(buffers)) if (Math.abs(k - m) < Math.abs(base - m)) base = Number(k);
  const src = ctx.createBufferSource();
  src.buffer = buffers[base];
  src.playbackRate.value = 2 ** ((m - base) / 12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vel * src.buffer.level, t);
  g.gain.setTargetAtTime(0.0001, t + dur, 0.11); // étouffoir
  src.connect(g);
  g.connect(dest);
  src.start(t);
  src.stop(t + dur + 0.9);
}

export function ensureAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    // iPhone : jouer même quand le bouton latéral est sur silencieux
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* non pris en charge */ }
    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
    const amps = [0, 1, 0.55, 0.32, 0.2, 0.13, 0.09, 0.06, 0.045, 0.03, 0.02, 0.015, 0.01];
    wave = ctx.createPeriodicWave(new Float32Array(amps.length), new Float32Array(amps));
  }
  decodeSamples();
  if (ctx.state !== 'running') ctx.resume();
  return ctx;
}

function tone(dest, m, t, dur, vel = 0.8) {
  if (samplesReady()) return sampleTone(dest, m, t, dur, vel);
  const f = 440 * 2 ** ((m - 69) / 12);
  const g = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.4;
  lp.frequency.setValueAtTime(Math.min(f * 9, 9000), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(f * 2.4, 600), t + 0.7);
  const peak = vel * 0.42;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.006);
  g.gain.setTargetAtTime(peak * 0.05, t + 0.006, 1.0); // la corde s'éteint doucement
  g.gain.setTargetAtTime(0.0001, t + dur, 0.07); // étouffoir
  const end = t + dur + 0.6;
  for (const cents of [-3, 3]) {
    const o = ctx.createOscillator();
    o.setPeriodicWave(wave);
    o.frequency.value = f;
    o.detune.value = cents;
    o.connect(lp);
    o.start(t);
    o.stop(end);
  }
  lp.connect(g);
  g.connect(dest);
}

function click(dest, t, accent) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'square';
  o.frequency.value = accent ? 1568 : 1046;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(accent ? 0.16 : 0.1, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + 0.07);
}

export function playStep(step, dur = 0.7) {
  ensureAudio();
  tone(master, midi(step), ctx.currentTime + 0.02, dur);
}

// Instant (horloge performance.now, en ms) où un temps audio donné sort réellement des haut-parleurs
export function perfTimeOf(audioTime) {
  const ts = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : null;
  if (ts && ts.performanceTime > 0) return ts.performanceTime + (audioTime - ts.contextTime) * 1000;
  const latency = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
  return performance.now() + (audioTime - ctx.currentTime + latency) * 1000;
}

// Petit son de frappe, immédiat
export function tapSound() {
  ensureAudio();
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(330, t);
  o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + 0.14);
}

export function stopAll() {
  for (const p of [...live]) p.stop();
}

// events : [{ step | null, dur (ticks) }]
// countIn : nombre de battues avant la mélodie ; metronome : battue pendant la mélodie
export function playSequence(events, { tempo = 60, countIn = 0, metronome = false, onEnd } = {}) {
  ensureAudio();
  stopAll();
  const bus = ctx.createGain();
  bus.connect(master);
  const beat = 60 / tempo;
  const tick = beat / BEAT;
  let t = ctx.currentTime + 0.15;
  for (let i = 0; i < countIn; i++) click(bus, t + i * beat, i === 0);
  t += countIn * beat;
  const start = t;
  let total = 0;
  for (const e of events) {
    if (e.step !== null && e.step !== undefined) tone(bus, midi(e.step), t, e.dur * tick * 0.96);
    t += e.dur * tick;
    total += e.dur;
  }
  if (metronome) {
    const beats = Math.ceil(total / BEAT);
    for (let i = 0; i < beats; i++) click(bus, start + i * beat, i % 4 === 0);
  }
  let done = false;
  const handle = {
    startTime: start, // temps audio du premier temps de la mélodie
    beat,
    stop() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      live.delete(handle);
      const now = ctx.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setTargetAtTime(0, now, 0.02);
      setTimeout(() => bus.disconnect(), 300);
    },
  };
  const timer = setTimeout(() => {
    if (done) return;
    done = true;
    live.delete(handle);
    setTimeout(() => bus.disconnect(), 1000);
    if (onEnd) onEnd();
  }, (t - ctx.currentTime + 0.35) * 1000);
  live.add(handle);
  return handle;
}
