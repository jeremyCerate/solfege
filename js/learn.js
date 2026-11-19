// Les bases : lecture de notes, reconnaissance d'intervalles, lecture de rythme.
import { NAMES, noteName, intervalInfo, mod, midi, BEAT, generateRhythm } from './music.js';
import { ensureAudio, playSequence, playStep, stopAll, perfTimeOf, tapSound } from './audio.js';
import { Score } from './staff.js';
import { chantCard, mountChants, unmountChants } from './chant.js';

let env = null; // { app, store, save, record }
let st = null; // état de la série en cours
let score = null;
let timer = null;

const BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.500z"/></svg>';

const READ_COUNT = 20;
const IV_COUNT = 15;
const IV_NAMES = ['', 'Seconde', 'Tierce', 'Quarte', 'Quinte', 'Sixte', 'Septième', 'Octave'];

// step 0 = do du milieu (do grave de la clé de sol, sur la ligne supplémentaire du dessous)
const G = (lo, hi) => [{ clef: 'g', range: [lo, hi] }];
const F = (lo, hi) => [{ clef: 'f', range: [lo, hi] }];
const READ_LEVELS = [
  { id: 'read1', group: 'Clé de sol', title: 'De do à sol', desc: 'Les cinq premières notes', parts: G(0, 4) },
  { id: 'read2', group: 'Clé de sol', title: 'De do à do aigu', desc: 'Toute la gamme', parts: G(0, 7) },
  { id: 'read3', group: 'Clé de sol', title: "Jusqu'au fa aigu", desc: 'La gamme et le haut de la portée : ré, mi, fa aigus', parts: G(0, 10) },
  { id: 'read4', group: 'Clé de sol', title: 'Du la grave au fa aigu', desc: 'Toute la portée, avec les notes sous le do', parts: G(-2, 10) },
  { id: 'read5', group: 'Clé de sol', title: 'Au-dessus de la portée', desc: 'Du do aigu au do suraigu, avec les lignes supplémentaires', parts: G(7, 14) },
  { id: 'read6', group: 'Clé de sol', title: 'Toute la clé de sol', desc: 'Du fa grave au do suraigu', parts: G(-4, 14) },
  { id: 'readf1', group: 'Clé de fa', title: 'Du do au fa', desc: 'Le do du milieu, au-dessus de la portée, et les notes qui descendent jusqu\u2019au fa de la clé', parts: F(-4, 0) },
  { id: 'readf2', group: 'Clé de fa', title: 'Une octave', desc: 'Du do du milieu au do grave', parts: F(-7, 0) },
  { id: 'readf3', group: 'Clé de fa', title: 'Toute la portée', desc: 'Du sol grave, première ligne, au do du milieu', parts: F(-10, 0) },
  { id: 'readf4', group: 'Clé de fa', title: 'Avec les lignes supplémentaires', desc: 'Du do très grave au mi au-dessus du do du milieu', parts: F(-14, 2) },
  { id: 'readmix', group: 'Les deux clés', title: 'Clé de sol et clé de fa', desc: 'La clé change d\u2019une note à l\u2019autre : regarde-la avant de lire', parts: [...G(-2, 10), ...F(-10, 0)] },
];
// sizes : intervalles proposés (1 = seconde … 7 = octave) ; dir : up, down ou both
const S2_5 = [1, 2, 3, 4];
const IV_LEVELS = [
  { id: 'iv1', group: 'Depuis do', title: 'De la seconde à la quinte', desc: 'do-ré, do-mi, do-fa, do-sol', from: 'do', sizes: S2_5, dir: 'up' },
  { id: 'iv2', group: 'Depuis do', title: "Jusqu'à l'octave", desc: "Avec la sixte, la septième et l'octave", from: 'do', sizes: [1, 2, 3, 4, 5, 6, 7], dir: 'up' },
  { id: 'iv5', group: 'De la seconde à la quinte, depuis toute note', title: 'Seconde ou tierce ?', desc: 'Montants : pas conjoint ou petit saut', from: 'all', sizes: [1, 2], dir: 'up' },
  { id: 'iv6', group: 'De la seconde à la quinte, depuis toute note', title: 'Tierce ou quarte ?', desc: 'Montants : In manus tuas ou Ostende nobis', from: 'all', sizes: [2, 3], dir: 'up' },
  { id: 'iv7', group: 'De la seconde à la quinte, depuis toute note', title: 'Quarte ou quinte ?', desc: 'Montants : Ostende nobis ou Esprit consolateur', from: 'all', sizes: [3, 4], dir: 'up' },
  { id: 'iv8', group: 'De la seconde à la quinte, depuis toute note', title: 'Les quatre, montants', desc: 'Seconde, tierce, quarte, quinte vers le haut', from: 'all', sizes: S2_5, dir: 'up' },
  { id: 'iv9', group: 'De la seconde à la quinte, depuis toute note', title: 'Les quatre, descendants', desc: 'Seconde, tierce, quarte, quinte vers le bas', from: 'all', sizes: S2_5, dir: 'down' },
  { id: 'iv3', group: 'De la seconde à la quinte, depuis toute note', title: 'Montants et descendants', desc: 'Les quatre intervalles, dans les deux sens', from: 'all', sizes: S2_5, dir: 'both' },
  { id: 'iv4', group: "Jusqu'à l'octave", title: 'Depuis toute note', desc: 'Tous les intervalles, montants et descendants', from: 'all', sizes: [1, 2, 3, 4, 5, 6, 7], dir: 'both' },
];
const IV_FROM = [['rnd', 'Au hasard'], ...NAMES.map((n, k) => [String(k), n])];
const RH_LEVELS = [
  { id: 'rh1', title: 'Noires et blanches', desc: 'La pulsation et les valeurs longues', figs: {} },
  { id: 'rh2', title: 'Croches et silences', desc: 'Deux notes par temps, soupirs et demi-pauses', figs: { croches: true, silences: true } },
  { id: 'rh3', title: 'Triolets', desc: 'Trois notes par temps, avec croches et silences', figs: { croches: true, triolets: true, silences: true } },
];

export const LEARN_CATS = [
  { id: 'read', title: 'Lecture de notes', desc: 'Nommer les notes sur la portée', unit: 'série', intro: `Une note s'affiche, tu donnes son nom. Série de ${READ_COUNT} notes.`, levels: READ_LEVELS },
  { id: 'iv', title: 'Intervalles', desc: "Reconnaître deux notes à l'oreille", unit: 'série', intro: `Deux notes sont jouées, tu reconnais l'intervalle. Série de ${IV_COUNT} questions.`, levels: IV_LEVELS },
  { id: 'rh', title: 'Lecture de rythme', desc: 'Frapper un rythme sur la pulsation', unit: 'rythme', intro: "Un rythme de 4 mesures s'affiche, tu le frappes sur la pulsation.", levels: RH_LEVELS },
];
const catOf = (levelId) => LEARN_CATS.find((c) => c.levels.some((l) => l.id === levelId));
const levelOf = (levelId) => catOf(levelId).levels.find((l) => l.id === levelId);

const prefs = () => (env.store.learn ||= {});
const rnd = (n) => Math.floor(Math.random() * n);
const seg = (name, opts, val) => `<div class="seg small" role="group">${opts.map(([v, lab]) => `<button data-learn="set" data-key="${name}" data-val="${v}" class="${v === val ? 'on' : ''}">${lab}</button>`).join('')}</div>`;
const bar = (title, cat) => `<header class="bar"><button class="back" data-act="${cat ? 'cat' : 'home'}" data-id="${cat || ''}">${BACK}<span>${cat ? 'Niveaux' : 'Accueil'}</span></button><div class="bar-title">${title}</div></header>`;

export function initLearn(e) {
  env = e;
  env.app.addEventListener('click', onClick);
  env.app.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('.tapzone')) { ev.preventDefault(); tap(ev.timeStamp); }
  });
  window.addEventListener('audio-interrupted', () => {
    if (st && st.kind === 'rh' && st.playing) { st.playing = null; rhStop(); }
  });
  document.addEventListener('keydown', (ev) => {
    if (st && st.kind === 'rh' && st.phase === 'perform' && !ev.repeat && (ev.code === 'Space' || ev.code === 'Enter')) {
      ev.preventDefault();
      tap(ev.timeStamp);
    }
  });
}

export function stopLearn() {
  clearTimeout(timer);
  unmountChants();
  if (st && st.playing) st.playing.stop();
  st = null;
  if (score) { score.destroy(); score = null; }
}

export function renderLearnCat(id, statLine) {
  stopLearn();
  stopAll();
  const c = LEARN_CATS.find((x) => x.id === id);
  env.app.innerHTML = `
    ${bar(c.title)}
    <main class="home cat">
      <p class="lede">${c.intro} Un niveau est validé à partir de 80 %.</p>
      <div class="levels">${c.levels.map((l, i) => `${l.group && l.group !== (c.levels[i - 1] || {}).group ? `<h2 class="level-group">${l.group}</h2>` : ''}
        <button class="level" data-learn="open" data-id="${l.id}">
          <span class="level-n">${i + 1}</span>
          <span class="level-body">
            <span class="level-title">${l.title}</span>
            <span class="level-desc">${l.desc}</span>
            ${statLine(l.id, c.unit)}
          </span>
        </button>`).join('')}</div>
    </main>`;
  window.scrollTo(0, 0);
}

function mountScore(slots, clef = 'g') {
  if (score) score.destroy();
  score = new Score(document.getElementById('score'), { mode: 'pitch', slots, size: 15, dots: false, clef });
}

// ---------- Lecture de notes ----------
function openRead(level) {
  stopLearn();
  stopAll();
  ensureAudio();
  st = { kind: 'read', level, part: null, i: 0, ok: 0, cur: null, times: [], miss: {}, locked: false, picked: null };
  env.app.innerHTML = `
    ${bar(level.title, 'read')}
    <main class="ex learn">
      <p class="progress" id="progress"></p>
      <div class="sheet"><div id="score"></div></div>
      <p class="feedback" id="feedback" role="status"></p>
      <div id="result"></div>
    </main>
    <footer class="pad" id="pad"></footer>`;
  mountScore(1, level.parts[0].clef);
  nextRead();
  window.scrollTo(0, 0);
}

function nextRead() {
  let part, s;
  do {
    part = st.level.parts[rnd(st.level.parts.length)];
    const [lo, hi] = part.range;
    s = lo + rnd(hi - lo + 1);
  } while (s === st.cur && part === st.part);
  st.cur = s;
  st.part = part;
  score.setClef(part.clef);
  st.locked = false;
  st.picked = null;
  st.t0 = performance.now();
  document.getElementById('feedback').textContent = 'Quelle est cette note ?';
  drawRead('');
}

function drawRead(state) {
  score.setData({ events: [{ step: st.cur, dur: BEAT, state }], cursor: false });
  document.getElementById('progress').textContent = `Note ${Math.min(st.i + 1, READ_COUNT)} sur ${READ_COUNT} · ${st.ok} juste${st.ok > 1 ? 's' : ''}`;
  const right = mod(st.cur, 7);
  document.getElementById('pad').innerHTML = `<div class="row names" style="--n:7">${NAMES.map((n, k) => {
    const cls = st.locked ? (k === right ? 'ok' : k === st.picked ? 'bad' : '') : '';
    return `<button class="namebtn ${cls}" data-learn="name" data-val="${k}">${n}</button>`;
  }).join('')}</div>`;
}

function answerRead(k) {
  if (!st || st.locked) return;
  ensureAudio();
  const right = mod(st.cur, 7);
  const good = k === right;
  st.locked = true;
  st.picked = k;
  st.times.push((performance.now() - st.t0) / 1000);
  if (good) st.ok++;
  else st.miss[right] = (st.miss[right] || 0) + 1;
  playStep(st.cur, 0.8);
  const fb = document.getElementById('feedback');
  fb.textContent = good ? `Oui, ${NAMES[right]}.` : `C'était ${NAMES[right]}, pas ${NAMES[k]}.`;
  fb.className = 'feedback ' + (good ? 'ok' : 'bad');
  drawRead(good ? 'ok' : 'bad');
  timer = setTimeout(() => {
    if (!st) return;
    st.i++;
    document.getElementById('feedback').className = 'feedback';
    if (st.i >= READ_COUNT) finishRead(); else nextRead();
  }, good ? 650 : 1600);
}

function finishRead() {
  const ratio = st.ok / READ_COUNT;
  env.record(st.level.id, ratio);
  const avg = st.times.reduce((a, b) => a + b, 0) / st.times.length;
  const missed = Object.entries(st.miss).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${NAMES[k]} (${n})`);
  document.getElementById('feedback').textContent = '';
  document.getElementById('progress').textContent = 'Série terminée';
  document.getElementById('result').innerHTML = resultCard(st.ok, READ_COUNT,
    `${avg.toFixed(1).replace('.', ',')} s par note en moyenne.`,
    missed.length ? `À revoir : ${missed.join(', ')}.` : '');
  endPad(ratio);
}

// ---------- Intervalles ----------
function openIv(level) {
  stopLearn();
  stopAll();
  ensureAudio();
  const p = prefs();
  p.ivFrom ||= 'rnd';
  const start = level.from === 'do' ? 0 : p.ivFrom === 'rnd' ? null : Number(p.ivFrom);
  st = { kind: 'iv', level, sizes: level.sizes, dir: level.dir, start, i: 0, ok: 0, a: 0, b: 0, answered: null, miss: {} };
  env.app.innerHTML = `
    ${bar(level.title, 'iv')}
    <main class="ex learn">
      <p class="progress" id="progress"></p>
      ${level.from === 'do' ? '' : `<div class="field iv-from"><h3>Note de départ</h3>${seg('ivFrom', IV_FROM, p.ivFrom)}</div>`}
      <div class="listen"><button class="play" data-learn="replay">${PLAY}<span><strong>Écouter</strong><small>autant de fois que tu veux</small></span></button></div>
      <div class="sheet"><div class="sheet-label" id="sheet-label"></div><div id="score"></div></div>
      <p class="feedback" id="feedback" role="status"></p>
      <div id="chant"></div>
      <div id="result"></div>
    </main>
    <footer class="pad" id="pad"></footer>`;
  mountScore(2);
  nextIv();
  window.scrollTo(0, 0);
}

function nextIv() {
  let a, b;
  for (let tries = 0; ; tries++) {
    const size = st.sizes[rnd(st.sizes.length)];
    const up = st.dir === 'up' || (st.dir === 'both' && Math.random() < 0.5);
    a = st.start ?? (up ? rnd(7) : 1 + rnd(7)); // do à si, ou ré à do aigu en descendant
    b = up ? a + size : a - size;
    if (b < -4 || b > 11) continue;
    if (Math.abs(midi(b) - midi(a)) === 6) continue; // pas de triton
    if (a === st.a && b === st.b && tries < 50) continue;
    break;
  }
  st.a = a;
  st.b = b;
  st.answered = null;
  document.getElementById('feedback').textContent = 'Quel est cet intervalle ?';
  document.getElementById('feedback').className = 'feedback';
  unmountChants();
  document.getElementById('chant').innerHTML = '';
  drawIv();
  playIv();
}

function playIv() {
  if (!st) return;
  playSequence([{ step: st.a, dur: BEAT }, { step: st.b, dur: BEAT * 2 }], { tempo: 66 });
}

function drawIv() {
  const done = st.answered != null;
  const size = Math.abs(st.b - st.a);
  const good = st.answered === size;
  score.setData({
    events: done
      ? [{ step: st.a, dur: BEAT }, { step: st.b, dur: BEAT, state: good ? 'ok' : 'ghost' }]
      : [{ step: st.a, dur: BEAT }],
    cursor: !done,
  });
  document.getElementById('sheet-label').textContent = done
    ? `${noteName(st.a)} → ${noteName(st.b)}`
    : `La première note est ${noteName(st.a)}. Où va la seconde ?`;
  document.getElementById('progress').textContent = `Question ${Math.min(st.i + 1, IV_COUNT)} sur ${IV_COUNT} · ${st.ok} juste${st.ok > 1 ? 's' : ''}`;
  const pad = document.getElementById('pad');
  if (done) {
    pad.innerHTML = `<div class="row actions"><button class="secondary" data-learn="replay">Réécouter</button><button class="primary" data-learn="next">${st.i + 1 >= IV_COUNT ? 'Résultat' : 'Suivant'}</button></div>`;
  } else {
    const h = st.sizes.map((k) => `<button class="namebtn" data-learn="iv" data-val="${k}">${IV_NAMES[k]}</button>`).join('');
    pad.innerHTML = `<div class="row names" style="--n:${Math.min(st.sizes.length, 4)}">${h}</div>`;
  }
}

function answerIv(k) {
  if (!st || st.answered != null) return;
  const info = intervalInfo(st.a, st.b);
  const good = k === info.size;
  st.answered = k;
  if (good) st.ok++;
  else st.miss[info.size] = (st.miss[info.size] || 0) + 1;
  let txt = good ? 'Oui : ' : `Non, ce n'est pas une ${IV_NAMES[k].toLowerCase()} : `;
  txt += `${info.name} ${info.dir}.`;
  if (info.chant && info.dir === 'ascendante') txt += ` Pense à « ${info.chant} ».`;
  const fb = document.getElementById('feedback');
  fb.textContent = txt;
  if (info.chant && info.dir === 'ascendante') {
    const box = document.getElementById('chant');
    box.innerHTML = chantCard(info.name);
    mountChants(box);
  }
  fb.className = 'feedback ' + (good ? 'ok' : 'bad');
  drawIv();
  playIv();
}

function finishIv() {
  env.record(st.level.id, st.ok / IV_COUNT);
  const missed = Object.entries(st.miss).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${IV_NAMES[k].toLowerCase()} (${n})`);
  document.getElementById('feedback').textContent = '';
  document.getElementById('progress').textContent = 'Série terminée';
  document.getElementById('result').innerHTML = resultCard(st.ok, IV_COUNT,
    'intervalles reconnus.', missed.length ? `À revoir : ${missed.join(', ')}.` : '');
  endPad(st.ok / IV_COUNT);
}

// ---------- Lecture de rythme ----------
const RH_TEMPI = [['50', 'Lent'], ['60', 'Modéré'], ['72', 'Allant']];
const RH_MEASURES = 4;

function openRh(level) {
  stopLearn();
  stopAll();
  ensureAudio();
  const p = prefs();
  p.rhTempo ||= '60';
  st = {
    kind: 'rh', level, tempo: Number(p.rhTempo), phase: 'ready', taps: [], playing: null, done: false,
    events: generateRhythm({ measures: RH_MEASURES, figs: level.figs }),
  };
  env.app.innerHTML = `
    ${bar(level.title, 'rh')}
    <main class="ex learn">
      <div class="field"><h3>Tempo</h3>${seg('rhTempo', RH_TEMPI, p.rhTempo)}</div>
      <div class="sheet"><div class="sheet-label">4/4 · quatre temps pour rien, puis frappe chaque note. Ne frappe pas sur les silences.</div><div id="score"></div></div>
      <div class="beats" id="beats" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
      <p class="feedback" id="feedback" role="status"></p>
      <div id="result"></div>
    </main>
    <footer class="pad" id="pad"></footer>`;
  if (score) score.destroy();
  score = new Score(document.getElementById('score'), { mode: 'rhythm', measures: RH_MEASURES, single: true, size: 13 });
  rhReset();
  window.scrollTo(0, 0);
}

function rhReset() {
  if (st.playing) st.playing.stop();
  st.playing = null;
  st.phase = 'ready';
  st.taps = [];
  st.states = null;
  document.getElementById('result').innerHTML = '';
  setFeedback('Lis le rythme, écoute le modèle si tu veux, puis lance-toi.', '');
  drawRh();
}

function setFeedback(txt, cls) {
  const fb = document.getElementById('feedback');
  fb.textContent = txt;
  fb.className = 'feedback ' + cls;
}

function drawRh() {
  let k = 0;
  score.setData({
    events: st.events.map((e) => ({ ...e, state: e.step != null && st.states ? st.states[k++] : '' })),
    cursor: false,
  });
  const pad = document.getElementById('pad');
  if (st.phase === 'perform') {
    pad.innerHTML = '<div class="row"><button class="tapzone live">Frappe ici<small>ou la barre d\'espace</small></button></div><div class="row actions"><button class="secondary" data-learn="rh-stop">Arrêter</button></div>';
  } else if (st.phase === 'model') {
    pad.innerHTML = '<div class="row actions"><button class="secondary" data-learn="rh-stop">Arrêter</button></div>';
  } else if (st.done) {
    pad.innerHTML = '<div class="row actions"><button class="secondary" data-learn="rh-model">Modèle</button><button class="secondary" data-learn="rh-retry">Réessayer</button><button class="primary" data-learn="open" data-id="${st.level.id}">Nouveau</button></div>';
  } else {
    pad.innerHTML = '<div class="row actions"><button class="secondary" data-learn="rh-model">Écouter le modèle</button><button class="primary" data-learn="rh-go">À toi</button></div>';
  }
}

// Pastilles de pulsation, calées sur l'horloge audio
function rhBeats() {
  const mine = st;
  const beatMs = 60000 / st.tempo;
  const dots = [...document.querySelectorAll('#beats span')];
  const loop = () => {
    if (st !== mine || !st.playing) { dots.forEach((d) => d.classList.remove('on')); return; }
    const n = Math.floor((performance.now() - (st.t0 - 4 * beatMs)) / beatMs);
    dots.forEach((d, i) => d.classList.toggle('on', n >= 0 && i === n % 4));
    if (st.phase === 'perform') {
      if (n < 4) setFeedback(n < 0 ? 'Prêt…' : `Pour rien : ${n + 1}`, '');
      else if (n === 4) setFeedback('À toi !', '');
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function rhStart(events, phase, onEnd) {
  ensureAudio();
  if (st.playing) st.playing.stop();
  st.phase = phase;
  const mine = st;
  st.playing = playSequence(events, {
    tempo: st.tempo, countIn: 4, metronome: true,
    onEnd: () => { if (st === mine) { st.playing = null; onEnd(); } },
  });
  st.t0 = perfTimeOf(st.playing.startTime);
  drawRh();
  rhBeats();
}

function rhModel() {
  setFeedback('Le modèle, après quatre temps pour rien.', '');
  rhStart(st.events.map((e) => ({ step: e.step == null ? null : 4, dur: e.dur })), 'model', () => {
    st.phase = 'ready';
    setFeedback(st.done ? '' : 'À toi quand tu veux.', '');
    drawRh();
  });
}

function rhPerform() {
  st.taps = [];
  st.states = null;
  document.getElementById('result').innerHTML = '';
  rhStart(st.events.map((e) => ({ step: null, dur: e.dur })), 'perform', rhEvaluate);
}

function rhStop() {
  if (st.playing) st.playing.stop();
  st.playing = null;
  st.phase = 'ready';
  setFeedback('', '');
  drawRh();
}

function tap(time) {
  if (!st || st.kind !== 'rh' || st.phase !== 'perform') return;
  st.taps.push(time);
  tapSound();
  const z = document.querySelector('.tapzone');
  if (z) { z.classList.add('hit'); setTimeout(() => z.classList.remove('hit'), 80); }
}

function rhEvaluate() {
  const beatMs = 60000 / st.tempo;
  const tickMs = beatMs / BEAT;
  const onsets = [];
  let t = 0;
  for (const e of st.events) {
    if (e.step != null) onsets.push(st.t0 + t * tickMs);
    t += e.dur;
  }
  let minGap = Infinity;
  for (let i = 1; i < onsets.length; i++) minGap = Math.min(minGap, onsets[i] - onsets[i - 1]);
  const nearW = Math.min(190, minGap * 0.45); // au-delà : frappe manquée
  const okW = Math.min(100, nearW * 0.6); // en deçà : juste
  const taps = st.taps.filter((x) => x > st.t0 - beatMs * 0.3);
  const pairs = [];
  onsets.forEach((o, i) => taps.forEach((x, j) => { if (Math.abs(x - o) <= nearW) pairs.push([Math.abs(x - o), i, j]); }));
  pairs.sort((a, b) => a[0] - b[0]);
  const offset = Array(onsets.length).fill(null);
  const used = new Set();
  for (const [, i, j] of pairs) {
    if (offset[i] != null || used.has(j)) continue;
    offset[i] = taps[j] - onsets[i];
    used.add(j);
  }
  st.states = offset.map((d) => (d == null ? 'bad' : Math.abs(d) <= okW ? 'ok' : 'warn'));
  const ok = st.states.filter((x) => x === 'ok').length;
  const near = st.states.filter((x) => x === 'warn').length;
  const miss = st.states.filter((x) => x === 'bad').length;
  const extra = taps.length - used.size;
  const hit = offset.filter((d) => d != null);
  const avg = hit.length ? hit.reduce((a, b) => a + b, 0) / hit.length : 0;
  const ratio = Math.max(0, (ok + 0.5 * near - 0.5 * extra) / onsets.length);
  env.record(st.level.id, ratio);
  st.phase = 'ready';
  st.done = true;
  const parts = [`${near} décalée${near > 1 ? 's' : ''}`, `${miss} manquée${miss > 1 ? 's' : ''}`];
  if (extra) parts.push(`${extra} frappe${extra > 1 ? 's' : ''} en trop`);
  let tip = '';
  if (hit.length >= 3 && Math.abs(avg) > 45) tip = ` En moyenne tu frappes ${Math.round(Math.abs(avg))} ms ${avg < 0 ? 'en avance' : 'en retard'}.`;
  document.getElementById('result').innerHTML = resultCard(ok, onsets.length, `notes frappées juste · ${parts.join(' · ')}.`, tip)
    + '<p class="legend"><span class="dot ok"></span>juste <span class="dot warn"></span>décalée <span class="dot bad"></span>manquée</p>';
  setFeedback('', '');
  drawRh();
}

const OPEN = { read: openRead, iv: openIv, rh: openRh };

// ---------- Commun ----------
function resultCard(ok, total, line, extra) {
  const r = ok / total;
  const verdict = r === 1 ? 'Sans faute !' : r >= 0.8 ? 'Très bien.' : r >= 0.5 ? 'En bonne voie.' : 'À retravailler.';
  return `<div class="result ${r === 1 ? 'perfect' : ''}">
      <div class="result-score"><strong>${ok}</strong><span>/ ${total}</span></div>
      <div class="result-text"><p class="verdict">${verdict}</p><p>${line} ${extra}</p></div>
    </div>`;
}

function endPad(ratio) {
  st.finished = true;
  const cat = catOf(st.level.id);
  const next = cat.levels[cat.levels.indexOf(st.level) + 1];
  const goNext = ratio >= 0.8 && next;
  document.getElementById('pad').innerHTML = `<div class="row actions">
      <button class="secondary" data-act="cat" data-id="${cat.id}">Niveaux</button>
      <button class="${goNext ? 'secondary' : 'primary'}" data-learn="open" data-id="${st.level.id}">Recommencer</button>
      ${goNext ? `<button class="primary" data-learn="open" data-id="${next.id}">Suivant</button>` : ''}
    </div>`;
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function onClick(ev) {
  const el = ev.target.closest('[data-learn]');
  if (!el || el.disabled) return;
  const d = el.dataset;
  if (d.learn === 'open') return OPEN[catOf(d.id).id](levelOf(d.id));
  if (!st) return;
  if (d.learn === 'set') {
    prefs()[d.key] = d.val;
    env.save();
    return OPEN[st.kind](st.level);
  }
  if (d.learn === 'name') return answerRead(Number(d.val));
  if (d.learn === 'iv') return answerIv(Number(d.val));
  if (d.learn === 'rh-model') return rhModel();
  if (d.learn === 'rh-go') return rhPerform();
  if (d.learn === 'rh-stop') return rhStop();
  if (d.learn === 'rh-retry') return rhReset();
  if (d.learn === 'replay') { ensureAudio(); return playIv(); }
  if (d.learn === 'next') {
    st.i++;
    if (st.i >= IV_COUNT) return finishIv();
    return nextIv();
  }
}
