// Les bases : lecture de notes et reconnaissance d'intervalles.
import { NAMES, noteName, intervalInfo, mod, midi, BEAT } from './music.js';
import { ensureAudio, playSequence, playStep, stopAll } from './audio.js';
import { Score } from './staff.js';

let env = null; // { app, store, save, record }
let st = null; // état de la série en cours
let score = null;
let timer = null;

const BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.500z"/></svg>';

const READ_COUNT = 20;
const READ_RANGES = [['0,4', 'do → sol'], ['0,7', 'do → do aigu'], ['-2,10', 'la grave → fa aigu']];
const IV_COUNT = 15;
const IV_NAMES = ['', 'Seconde', 'Tierce', 'Quarte', 'Quinte', 'Sixte', 'Septième', 'Octave'];
const IV_SETS = [['4', 'Seconde → quinte'], ['7', "Jusqu'à l'octave"]];
const IV_FROM = [['do', 'Depuis do'], ['all', 'Depuis toute note']];

const prefs = () => (env.store.learn ||= {});
const rnd = (n) => Math.floor(Math.random() * n);
const seg = (name, opts, val) => `<div class="seg small" role="group">${opts.map(([v, lab]) => `<button data-learn="set" data-key="${name}" data-val="${v}" class="${v === val ? 'on' : ''}">${lab}</button>`).join('')}</div>`;
const bar = (title) => `<header class="bar"><button class="back" data-act="home">${BACK}<span>Accueil</span></button><div class="bar-title">${title}</div></header>`;

export function initLearn(e) {
  env = e;
  env.app.addEventListener('click', onClick);
}

export function stopLearn() {
  clearTimeout(timer);
  st = null;
  if (score) { score.destroy(); score = null; }
}

export function learnCards(statLine) {
  const card = (id, mark, title, desc) => `
    <button class="level" data-learn="open" data-id="${id}">
      <span class="level-n">${mark}</span>
      <span class="level-body">
        <span class="level-title">${title}</span>
        <span class="level-desc">${desc}</span>
        ${statLine(id, 'série')}
      </span>
    </button>`;
  return card('read', 'A', 'Lecture de notes', `Une note s'affiche sur la portée, tu donnes son nom · ${READ_COUNT} notes`)
    + card('iv', 'B', 'Intervalles', `Deux notes sont jouées, tu reconnais l'intervalle · ${IV_COUNT} questions`);
}

function mountScore(slots) {
  if (score) score.destroy();
  score = new Score(document.getElementById('score'), { mode: 'pitch', slots, size: 15, dots: false });
}

// ---------- Lecture de notes ----------
function openRead() {
  stopLearn();
  stopAll();
  ensureAudio();
  const p = prefs();
  p.readRange ||= '0,4';
  const [lo, hi] = p.readRange.split(',').map(Number);
  st = { kind: 'read', lo, hi, i: 0, ok: 0, cur: null, times: [], miss: {}, locked: false, picked: null };
  env.app.innerHTML = `
    ${bar('Lecture de notes')}
    <main class="ex learn">
      <div class="field"><h3>Notes à lire</h3>${seg('readRange', READ_RANGES, p.readRange)}</div>
      <p class="progress" id="progress"></p>
      <div class="sheet"><div id="score"></div></div>
      <p class="feedback" id="feedback" role="status"></p>
      <div id="result"></div>
    </main>
    <footer class="pad" id="pad"></footer>`;
  mountScore(1);
  nextRead();
  window.scrollTo(0, 0);
}

function nextRead() {
  let s;
  do { s = st.lo + rnd(st.hi - st.lo + 1); } while (s === st.cur);
  st.cur = s;
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
  env.record('read', ratio);
  const avg = st.times.reduce((a, b) => a + b, 0) / st.times.length;
  const missed = Object.entries(st.miss).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${NAMES[k]} (${n})`);
  document.getElementById('feedback').textContent = '';
  document.getElementById('progress').textContent = 'Série terminée';
  document.getElementById('result').innerHTML = resultCard(st.ok, READ_COUNT,
    `${avg.toFixed(1).replace('.', ',')} s par note en moyenne.`,
    missed.length ? `À revoir : ${missed.join(', ')}.` : '');
  endPad('read');
}

// ---------- Intervalles ----------
function openIv() {
  stopLearn();
  stopAll();
  ensureAudio();
  const p = prefs();
  p.ivSet ||= '4';
  p.ivFrom ||= 'do';
  st = { kind: 'iv', max: Number(p.ivSet), from: p.ivFrom, i: 0, ok: 0, a: 0, b: 0, answered: null, miss: {} };
  env.app.innerHTML = `
    ${bar('Intervalles')}
    <main class="ex learn">
      <div class="field"><h3>Note de départ</h3>${seg('ivFrom', IV_FROM, p.ivFrom)}</div>
      <div class="field"><h3>Intervalles</h3>${seg('ivSet', IV_SETS, p.ivSet)}</div>
      <p class="progress" id="progress"></p>
      <div class="listen"><button class="play" data-learn="replay">${PLAY}<span><strong>Écouter</strong><small>autant de fois que tu veux</small></span></button></div>
      <div class="sheet"><div class="sheet-label" id="sheet-label"></div><div id="score"></div></div>
      <p class="feedback" id="feedback" role="status"></p>
      <div id="result"></div>
    </main>
    <footer class="pad" id="pad"></footer>`;
  mountScore(2);
  nextIv();
  window.scrollTo(0, 0);
}

function nextIv() {
  let a, b;
  for (;;) {
    const size = 1 + rnd(st.max);
    if (st.from === 'do') { a = 0; b = size; }
    else {
      a = rnd(8);
      b = a + (Math.random() < 0.5 ? size : -size);
    }
    if (b < 0 || b > 7) continue;
    if (Math.abs(midi(b) - midi(a)) === 6) continue; // pas de triton
    if (a === st.a && b === st.b) continue;
    break;
  }
  st.a = a;
  st.b = b;
  st.answered = null;
  document.getElementById('feedback').textContent = 'Quel est cet intervalle ?';
  document.getElementById('feedback').className = 'feedback';
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
    let h = '';
    for (let k = 1; k <= st.max; k++) h += `<button class="namebtn" data-learn="iv" data-val="${k}">${IV_NAMES[k]}</button>`;
    pad.innerHTML = `<div class="row names" style="--n:${st.max > 4 ? 4 : st.max}">${h}</div>`;
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
  fb.className = 'feedback ' + (good ? 'ok' : 'bad');
  drawIv();
  playIv();
}

function finishIv() {
  env.record('iv', st.ok / IV_COUNT);
  const missed = Object.entries(st.miss).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${IV_NAMES[k].toLowerCase()} (${n})`);
  document.getElementById('feedback').textContent = '';
  document.getElementById('progress').textContent = 'Série terminée';
  document.getElementById('result').innerHTML = resultCard(st.ok, IV_COUNT,
    'intervalles reconnus.', missed.length ? `À revoir : ${missed.join(', ')}.` : '');
  endPad('iv');
}

// ---------- Commun ----------
function resultCard(ok, total, line, extra) {
  const r = ok / total;
  const verdict = r === 1 ? 'Sans faute !' : r >= 0.8 ? 'Très bien.' : r >= 0.5 ? 'En bonne voie.' : 'À retravailler.';
  return `<div class="result ${r === 1 ? 'perfect' : ''}">
      <div class="result-score"><strong>${ok}</strong><span>/ ${total}</span></div>
      <div class="result-text"><p class="verdict">${verdict}</p><p>${line} ${extra}</p></div>
    </div>`;
}

function endPad(id) {
  st.finished = true;
  document.getElementById('pad').innerHTML = `<div class="row actions"><button class="secondary" data-act="home">Accueil</button><button class="primary" data-learn="open" data-id="${id}">Recommencer</button></div>`;
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function onClick(ev) {
  const el = ev.target.closest('[data-learn]');
  if (!el || el.disabled) return;
  const d = el.dataset;
  if (d.learn === 'open') return d.id === 'read' ? openRead() : openIv();
  if (!st) return;
  if (d.learn === 'set') {
    prefs()[d.key] = d.val;
    env.save();
    return st.kind === 'read' ? openRead() : openIv();
  }
  if (d.learn === 'name') return answerRead(Number(d.val));
  if (d.learn === 'iv') return answerIv(Number(d.val));
  if (d.learn === 'replay') { ensureAudio(); return playIv(); }
  if (d.learn === 'next') {
    st.i++;
    if (st.i >= IV_COUNT) return finishIv();
    return nextIv();
  }
}
