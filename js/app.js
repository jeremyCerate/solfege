import { LEVELS, DEFAULT_CUSTOM, describeLevel, generate, noteLabel, noteName, intervalInfo, MEASURE, BEAT } from './music.js';
import { ensureAudio, playSequence, playStep, stopAll } from './audio.js';
import { Score } from './staff.js';

const app = document.getElementById('app');
const KEY = 'solfege.v1';

// ---------- Sauvegarde locale ----------
const store = { prefs: { input: 'staff', echo: false, metro: false }, stats: {}, custom: { ...DEFAULT_CUSTOM } };
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  Object.assign(store.prefs, saved.prefs);
  Object.assign(store.stats, saved.stats);
  Object.assign(store.custom, saved.custom);
} catch { /* première visite ou stockage indisponible */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* ignore */ } };

// ---------- Petits outils ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.500z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h11.500v14H9l-6.500-7zM12 9.500l5 5M17 9.500l-5 5" fill="none" stroke="currentColor" stroke-width="1.900" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
// icône de figure de note (police Bravura)
const fig = (ch, y = 30, extra = '') => `<svg class="fig" viewBox="0 0 30 38" aria-hidden="true"><text x="15" y="${y}" text-anchor="middle">${ch}</text>${extra}</svg>`;
const FIGS = [
  { dur: 48, label: 'ronde', icon: fig('', 24) },
  { dur: 24, label: 'blanche', icon: fig('') },
  { dur: 12, label: 'noire', icon: fig('') },
  { dur: 6, label: 'croche', icon: fig('') },
  { dur: 4, label: 'triolet', icon: fig('', 30, '<text class="three" x="24" y="12">3</text>') },
];
const RESTS = [
  { dur: 12, label: 'soupir', icon: fig('', 20) },
  { dur: 24, label: '½ pause', icon: fig('', 21, '<line x1="6" x2="24" y1="21" y2="21"/>') },
];

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------- Accueil ----------
function statLine(id) {
  const st = store.stats[id];
  if (!st) return '<span class="stat none">Pas encore essayé</span>';
  return `<span class="stat">Meilleur ${Math.round(st.best * 100)} % · ${st.n} dictée${st.n > 1 ? 's' : ''}</span>`;
}

function renderHome() {
  stopAll();
  ex = null;
  const card = (l, n) => `
    <button class="level" data-act="start" data-id="${l.id}">
      <span class="level-n">${n}</span>
      <span class="level-body">
        <span class="level-title">${esc(l.title)}</span>
        <span class="level-desc">${describeLevel(l).map(esc).join(' · ')}</span>
        ${statLine(l.id)}
      </span>
    </button>`;
  const pitch = LEVELS.filter((l) => l.mode === 'pitch');
  const rhythm = LEVELS.filter((l) => l.mode === 'rhythm');
  app.innerHTML = `
    <main class="home">
      <header class="hero">
        <p class="eyebrow">Solfège</p>
        <h1>Dictée musicale</h1>
        <p class="lede">Écoute la mélodie au piano, puis replace les notes sur la portée. Tout est en do majeur, et la mélodie part du do grave.</p>
      </header>
      <section>
        <h2>Hauteurs seules</h2>
        <div class="levels">${pitch.map((l, i) => card(l, i + 1)).join('')}</div>
      </section>
      <section>
        <h2>Hauteurs et rythme</h2>
        <div class="levels">${rhythm.map((l, i) => card(l, pitch.length + i + 1)).join('')}</div>
      </section>
      <section>
        <h2>À ta mesure</h2>
        <div class="levels">
          <button class="level" data-act="custom">
            <span class="level-n">✎</span>
            <span class="level-body">
              <span class="level-title">Dictée personnalisée</span>
              <span class="level-desc">${describeLevel(store.custom).map(esc).join(' · ')}</span>
              ${statLine('custom')}
            </span>
          </button>
        </div>
      </section>
      <section>
        <h2>Préférences</h2>
        <div class="prefs">
          <label class="switch"><input type="checkbox" data-pref="metro" ${store.prefs.metro ? 'checked' : ''}><span>Garder la pulsation pendant l'écoute <small>dictées avec rythme</small></span></label>
          <label class="switch"><input type="checkbox" data-pref="echo" ${store.prefs.echo ? 'checked' : ''}><span>Entendre les notes que je pose <small>plus facile : à désactiver pour s'entraîner sérieusement</small></span></label>
        </div>
      </section>
      <p class="credits">Piano : Salamander Grand Piano, Alexander Holm (CC-BY 3.0). Notation : police Bravura (SIL OFL).</p>
    </main>`;
  window.scrollTo(0, 0);
}

// ---------- Dictée personnalisée ----------
function renderCustom() {
  const c = store.custom;
  const seg = (name, opts, val) => `<div class="seg" role="group">${opts.map(([v, lab]) => `<button data-set="${name}" data-val="${v}" class="${String(v) === String(val) ? 'on' : ''}">${lab}</button>`).join('')}</div>`;
  const chips = (name, opts, on) => `<div class="chips">${opts.map(([v, lab]) => `<button data-toggle="${name}" data-val="${v}" class="chip ${on(v) ? 'on' : ''}">${lab}</button>`).join('')}</div>`;
  app.innerHTML = `
    <header class="bar"><button class="back" data-act="home">${ICON.back}<span>Niveaux</span></button><div class="bar-title">Dictée personnalisée</div></header>
    <main class="custom">
      <div class="field"><h3>Type de dictée</h3>${seg('mode', [['pitch', 'Hauteurs seules'], ['rhythm', 'Hauteurs + rythme']], c.mode)}</div>
      ${c.mode === 'pitch'
        ? `<div class="field"><h3>Nombre de notes</h3>${seg('count', [4, 5, 6, 8, 10, 12, 16].map((n) => [n, n]), c.count)}</div>`
        : `<div class="field"><h3>Nombre de mesures</h3>${seg('measures', [2, 4, 8].map((n) => [n, n]), c.measures)}</div>`}
      <div class="field"><h3>Intervalles</h3><p class="hint">Les degrés conjoints (secondes) sont toujours présents. Ajoute les sauts que tu veux travailler.</p>
        ${chips('leaps', [[2, 'Tierces'], [3, 'Quartes'], [4, 'Quintes'], [5, 'Sixtes'], [7, 'Octaves']], (v) => c.leaps.includes(v))}</div>
      ${c.mode === 'rhythm' ? `<div class="field"><h3>Rythmes</h3><p class="hint">Noires et blanches toujours présentes.</p>
        ${chips('figs', [['croches', 'Croches'], ['triolets', 'Triolets'], ['silences', 'Silences']], (v) => !!c.figs[v])}</div>` : ''}
      <div class="field"><h3>Note de départ</h3><p class="hint">La mélodie reste en do majeur. La note de départ est toujours annoncée, et tu peux la réentendre.</p>
        ${seg('start', [...['do', 'ré', 'mi', 'fa', 'sol', 'la', 'si'].map((n, i) => [i, n]), ['random', 'Au hasard']], c.start ?? 0)}</div>
      <div class="field"><h3>Nombre d'écoutes</h3>${seg('listens', [[1, 1], [2, 2], [3, 3], [5, 5], [0, 'Illimité']], c.listens)}</div>
      <div class="field"><h3>Tempo <span class="val" id="tempo-val">${c.tempo} à la noire</span></h3>
        <input type="range" min="40" max="100" step="2" value="${c.tempo}" data-range="tempo" aria-label="Tempo"></div>
      <div class="field"><h3>Étendue</h3>${seg('range', [['0,7', 'do → do aigu'], ['-2,9', 'la grave → mi aigu']], c.range.join(','))}</div>
      <button class="primary big" data-act="start" data-id="custom">Commencer</button>
    </main>`;
}

// ---------- Exercice ----------
let ex = null;
let score = null;
let solution = null;

const levelById = (id) => (id === 'custom' ? store.custom : LEVELS.find((l) => l.id === id));
const isPitch = () => ex.level.mode === 'pitch';
const totalTicks = () => ex.events.reduce((a, e) => a + e.dur, 0);
const initialEvents = () => (isPitch() ? [{ step: ex.mel[0].step, dur: BEAT, fixed: true }] : []);
const startName = () => noteName(ex.mel[0].step);

function start(level, melody = null) {
  ensureAudio();
  stopAll();
  ex = {
    level,
    mel: melody || generate(level),
    events: [],
    listensLeft: level.listens || Infinity,
    phase: 'input',
    dur: BEAT,
    sel: null,
    drag: null,
    playing: null,
    which: null,
  };
  ex.events = initialEvents();
  renderExercise();
}

function renderExercise() {
  const l = ex.level;
  const n = l.id === 'custom' ? '' : `Niveau ${LEVELS.indexOf(l) + 1} · `;
  const brief = isPitch()
    ? `Do majeur · ${l.count} notes · la première note (${startName()}) est déjà posée`
    : `Do majeur · 4/4 · ${l.measures} mesures · note de départ : ${startName()} · une mesure de pulsation précède la mélodie`;
  app.innerHTML = `
    <header class="bar"><button class="back" data-act="home">${ICON.back}<span>Niveaux</span></button><div class="bar-title">${n}${esc(l.title)}</div></header>
    <main class="ex">
      <p class="brief">${brief}</p>
      <div class="listen">
        <button class="play" data-act="listen" id="listen"></button>
        <button class="secondary" data-act="do">Donner le ${startName()}</button>
      </div>
      <div id="result"></div>
      <div class="sheet"><div class="sheet-label" id="answer-label"></div><div id="score"></div></div>
      <div id="solution-wrap"></div>
    </main>
    <footer class="pad" id="pad"></footer>`;
  if (score) score.destroy();
  if (solution) { solution.destroy(); solution = null; }
  score = new Score(document.getElementById('score'), {
    mode: l.mode, slots: l.count, measures: l.measures, onPointer,
  });
  draw();
  updateListen();
  updatePad();
  window.scrollTo(0, 0);
}

function draw() {
  if (ex.phase === 'input') {
    score.setData({
      events: ex.events.map((e, i) => ({ ...e, state: e.fixed ? 'fixed' : i === ex.sel || i === ex.drag ? 'sel' : '' })),
      cursor: ex.sel == null,
      label: ex.drag != null ? { index: ex.drag, text: noteLabel(ex.events[ex.drag].step) } : null,
    });
  } else {
    score.setData({ events: ex.shown, cursor: false });
  }
}

function updateListen() {
  const b = document.getElementById('listen');
  if (!b) return;
  const playing = !!ex.playing;
  let sub;
  if (ex.phase !== 'input') sub = 'la mélodie originale';
  else if (ex.listensLeft === Infinity) sub = 'écoutes illimitées';
  else if (ex.listensLeft <= 0) sub = "plus d'écoute disponible";
  else sub = `${ex.listensLeft} écoute${ex.listensLeft > 1 ? 's' : ''} restante${ex.listensLeft > 1 ? 's' : ''}`;
  b.disabled = !playing && ex.phase === 'input' && ex.listensLeft <= 0;
  b.classList.toggle('playing', playing && ex.which === 'orig');
  b.innerHTML = `${playing && ex.which === 'orig' ? ICON.stop : ICON.play}<span><strong>${playing && ex.which === 'orig' ? 'Arrêter' : 'Écouter'}</strong><small>${sub}</small></span>`;
  const mine = document.getElementById('mine');
  if (mine) mine.innerHTML = `${playing && ex.which === 'mine' ? ICON.stop : ICON.play}<span>Ma réponse</span>`;
}

function updatePad() {
  const pad = document.getElementById('pad');
  if (!pad) return;
  if (ex.phase !== 'input') {
    pad.innerHTML = `
      <div class="row actions">
        <button class="secondary" data-act="mine" id="mine"></button>
        <button class="secondary" data-act="retry">Réessayer</button>
        <button class="primary" data-act="next">Suivante</button>
      </div>`;
    updateListen();
    return;
  }
  const names = store.prefs.input === 'names';
  let h = '';
  if (!isPitch()) {
    h += `<div class="row figs">${FIGS.map((f) => `<button class="figbtn ${ex.dur === f.dur ? 'on' : ''}" data-dur="${f.dur}" aria-label="${f.label}" aria-pressed="${ex.dur === f.dur}">${f.icon}<small>${f.label}</small></button>`).join('')}
      <span class="sep"></span>
      ${RESTS.map((f) => `<button class="figbtn rest" data-rest="${f.dur}" aria-label="Ajouter un silence : ${f.label}">${f.icon}<small>${f.label}</small></button>`).join('')}</div>`;
  }
  if (names) {
    const [lo, hi] = ex.level.range;
    let b = '';
    for (let s = lo; s <= hi; s++) b += `<button class="namebtn" data-name="${s}">${noteLabel(s)}</button>`;
    h += `<div class="row names" style="--n:${Math.min(hi - lo + 1, 8)}">${b}</div>`;
  }
  const filled = ex.events.filter((e) => !e.fixed).length;
  h += `<div class="row tools">
      <div class="seg small" role="group" aria-label="Mode de saisie">
        <button data-input="staff" class="${names ? '' : 'on'}">Portée</button>
        <button data-input="names" class="${names ? 'on' : ''}">Noms</button>
      </div>
      <button class="tool" data-act="undo" ${filled ? '' : 'disabled'} aria-label="Effacer la dernière note">${ICON.undo}</button>
      <button class="primary" data-act="check" ${filled ? '' : 'disabled'}>Valider</button>
    </div>`;
  pad.innerHTML = h;
  const hintEl = document.getElementById('answer-label');
  if (hintEl) {
    hintEl.textContent = names
      ? 'Choisis le nom de chaque note ci-dessous. Touche une note posée pour la corriger.'
      : isPitch()
        ? 'Touche la portée pour poser chaque note. Glisse vers le haut ou le bas pour ajuster.'
        : 'Choisis une durée, puis touche la portée pour poser la note. Glisse pour ajuster.';
  }
}

function addEvent(step, restDur = 0) {
  const l = ex.level;
  const dur = isPitch() ? BEAT : restDur || ex.dur;
  if (isPitch()) {
    if (ex.events.length >= l.count) { toast('Toutes les notes sont posées. Touche une note pour la corriger.'); return false; }
  } else {
    const t = totalTicks();
    if (t >= l.measures * MEASURE) { toast('Toutes les mesures sont remplies.'); return false; }
    if (dur > MEASURE - (t % MEASURE)) { toast('Cette durée ne rentre pas dans la mesure.'); return false; }
  }
  ex.events.push({ step, dur });
  return true;
}

function onPointer(type, h) {
  if (!ex || ex.phase !== 'input') return;
  const staffInput = store.prefs.input === 'staff';
  if (type === 'down') {
    ensureAudio();
    if (h.index != null) {
      const e = ex.events[h.index];
      if (!e || e.fixed || e.step == null) return;
      if (staffInput) { e.step = h.step; ex.drag = h.index; }
      else ex.sel = ex.sel === h.index ? null : h.index;
    } else if (h.append) {
      if (!staffInput) { ex.sel = null; }
      else if (addEvent(h.step)) ex.drag = ex.events.length - 1;
    }
    draw();
  } else if (type === 'move') {
    if (ex.drag != null && ex.events[ex.drag].step !== h.step) { ex.events[ex.drag].step = h.step; draw(); }
  } else if (ex.drag != null) {
    const st = ex.events[ex.drag].step;
    ex.drag = null;
    if (store.prefs.echo) playStep(st);
    draw();
    updatePad();
  }
}

function listen() {
  ensureAudio();
  if (ex.playing) {
    const was = ex.which;
    ex.playing.stop();
    ex.playing = null;
    updateListen();
    if (was === 'orig') return;
  }
  if (ex.phase === 'input') {
    if (ex.listensLeft <= 0) return;
    ex.listensLeft--;
  }
  playIt(ex.mel, 'orig');
}

function playIt(events, which) {
  const rhythm = !isPitch();
  ex.which = which;
  const mine = ex;
  ex.playing = playSequence(events, {
    tempo: ex.level.tempo,
    countIn: rhythm ? 4 : 0,
    metronome: rhythm && store.prefs.metro,
    onEnd: () => { if (ex === mine) { ex.playing = null; updateListen(); } },
  });
  updateListen();
}

// ---------- Correction ----------
function check() {
  stopAll();
  ex.playing = null;
  ex.sel = null;
  const mel = ex.mel;
  let ok = 0, total = 0;
  const hints = [];
  if (isPitch()) {
    ex.shown = mel.map((m, i) => {
      const u = ex.events[i];
      if (u && u.fixed) return { ...u, state: 'fixed' };
      total++;
      if (!u) return { step: null, dur: BEAT, missing: true, ghost: m.step };
      if (u.step === m.step) { ok++; return { ...u, state: 'ok' }; }
      return { ...u, state: 'bad', ghost: m.step };
    });
    mel.forEach((m, i) => {
      const u = ex.events[i];
      if (i === 0 || (u && u.step === m.step) || hints.length >= 3) return;
      const info = intervalInfo(mel[i - 1].step, m.step);
      let txt = `<strong>Note ${i + 1}</strong> : c'était ${noteName(m.step)}. De ${noteName(mel[i - 1].step)} à ${noteName(m.step)}, `;
      txt += info.size === 0 ? 'la note est répétée.' : `c'est une ${info.name} ${info.dir}.`;
      if (info.chant && info.dir === 'ascendante') txt += ` Pense à <em>${info.chant}</em>.`;
      hints.push(txt);
    });
  } else {
    const expected = new Map();
    let t = 0;
    for (const m of mel) { expected.set(t, m); t += m.dur; }
    total = mel.length;
    const matched = new Set();
    t = 0;
    ex.shown = ex.events.map((u) => {
      const m = expected.get(t);
      const good = !!m && m.dur === u.dur && m.step === u.step;
      if (good) { ok++; matched.add(t); }
      t += u.dur;
      return { ...u, state: good ? 'ok' : 'bad' };
    });
    t = 0;
    ex.solutionShown = mel.map((m) => {
      const e = { ...m, state: matched.has(t) ? '' : 'ghost' };
      t += m.dur;
      return e;
    });
  }
  ex.phase = 'result';
  const ratio = total ? ok / total : 0;
  const st = store.stats[ex.level.id] || { n: 0, best: 0, sum: 0 };
  st.n++;
  st.sum += ratio;
  st.best = Math.max(st.best, ratio);
  store.stats[ex.level.id] = st;
  save();

  const verdict = ratio === 1 ? 'Sans faute !' : ratio >= 0.75 ? 'Très bien, presque tout y est.' : ratio >= 0.5 ? 'En bonne voie.' : 'À retravailler.';
  const unit = isPitch() ? 'notes justes' : 'éléments justes (hauteur et durée)';
  document.getElementById('result').innerHTML = `
    <div class="result ${ratio === 1 ? 'perfect' : ''}">
      <div class="result-score"><strong>${ok}</strong><span>/ ${total}</span></div>
      <div class="result-text"><p class="verdict">${verdict}</p><p>${ok} sur ${total} ${unit}.</p></div>
    </div>
    ${hints.length ? `<ul class="hints">${hints.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}
    <p class="legend"><span class="dot ok"></span>juste <span class="dot bad"></span>à revoir <span class="dot ghost"></span>${isPitch() ? 'la bonne note' : 'ce qui manquait'}</p>`;
  document.getElementById('answer-label').textContent = 'Ta réponse';
  if (!isPitch()) {
    document.getElementById('solution-wrap').innerHTML = '<div class="sheet"><div class="sheet-label">La mélodie</div><div id="solution"></div></div>';
    solution = new Score(document.getElementById('solution'), { mode: 'rhythm', measures: ex.level.measures });
    solution.setData({ events: ex.solutionShown, cursor: false });
  }
  draw();
  updateListen();
  updatePad();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- Événements ----------
app.addEventListener('click', (ev) => {
  const el = ev.target.closest('button');
  if (!el || el.disabled) return;
  const d = el.dataset;
  if (d.act === 'home') return renderHome();
  if (d.act === 'custom') return renderCustom();
  if (d.act === 'start') { save(); return start(levelById(d.id)); }

  // réglages personnalisés
  if (d.set) {
    const c = store.custom;
    if (d.set === 'mode') c.mode = d.val;
    else if (d.set === 'range') c.range = d.val.split(',').map(Number);
    else if (d.set === 'start') c.start = d.val === 'random' ? 'random' : Number(d.val);
    else c[d.set] = Number(d.val);
    save();
    return renderCustom();
  }
  if (d.toggle) {
    const c = store.custom;
    if (d.toggle === 'leaps') {
      const v = Number(d.val);
      c.leaps = c.leaps.includes(v) ? c.leaps.filter((x) => x !== v) : [...c.leaps, v].sort((a, b) => a - b);
    } else c.figs = { ...c.figs, [d.val]: !c.figs[d.val] };
    save();
    return renderCustom();
  }

  if (!ex) return;
  if (d.act === 'listen') return listen();
  if (d.act === 'do') { ensureAudio(); return playStep(ex.mel[0].step, 1.2); }
  if (d.act === 'mine') {
    if (ex.playing) { const was = ex.which; ex.playing.stop(); ex.playing = null; updateListen(); if (was === 'mine') return; }
    return playIt(ex.events, 'mine');
  }
  if (d.act === 'retry') return start(ex.level, ex.mel);
  if (d.act === 'next') return start(ex.level);
  if (d.act === 'check') return check();
  if (d.act === 'undo') {
    const last = ex.events[ex.events.length - 1];
    if (last && !last.fixed) ex.events.pop();
    ex.sel = null;
    draw();
    return updatePad();
  }
  if (d.input) { store.prefs.input = d.input; ex.sel = null; save(); draw(); return updatePad(); }
  if (d.dur) { ex.dur = Number(d.dur); return updatePad(); }
  if (d.rest) { ex.sel = null; addEvent(null, Number(d.rest)); draw(); return updatePad(); }
  if (d.name) {
    const step = Number(d.name);
    ensureAudio();
    if (ex.sel != null) { ex.events[ex.sel].step = step; ex.sel = null; }
    else if (!addEvent(step)) return;
    if (store.prefs.echo) playStep(step);
    draw();
    return updatePad();
  }
});

app.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.dataset.pref) { store.prefs[el.dataset.pref] = el.checked; save(); }
});
app.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.dataset.range === 'tempo') {
    store.custom.tempo = Number(el.value);
    document.getElementById('tempo-val').textContent = `${el.value} à la noire`;
    save();
  }
});

renderHome();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
