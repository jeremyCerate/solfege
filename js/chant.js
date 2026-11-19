// Débuts des chants travaillés en cours, pour retenir un intervalle à l'oreille.
// Transcrits en do majeur (les leçons partent de ces notes), seulement les premiers mots.
import { playSequence, stopAll } from './audio.js';

const n = (step, dur, lyric, beam) => ({ step, dur, lyric, beam });

// dur en ticks (12 = noire, 6 = croche, 18 = noire pointée, 24 = blanche, 36 = blanche pointée)
// beat : unité de la mesure ; pickup : durée de l'anacrouse ; beam : croches reliées entre elles
export const CHANTS = {
  'tierce majeure': {
    title: 'In manus tuas, Pater',
    source: 'Taizé, leçon 3',
    tempo: 74,
    meter: 4,
    pickup: 6,
    mark: [0, 1], // les deux notes qui forment l'intervalle
    notes: [n(0, 6, 'In'), n(2, 12, 'ma'), n(2, 12, 'nus'), n(4, 12, 'tu'), n(4, 12, 'as,'), n(3, 24, 'Pa'), n(2, 18, 'ter')],
  },
  'quarte juste': {
    title: 'Ostende nobis Domine',
    source: 'Taizé, leçon 1',
    tempo: 80,
    meter: 3,
    pickup: 18,
    mark: [4, 5],
    notes: [n(5, 6, 'Os'), n(5, 6, 'ten'), n(5, 6, 'de'), n(5, 12, 'no'), n(5, 12, 'bis'), n(8, 6, 'Do', 1), n(8, 6, 'mi', 1)],
  },
  'quinte juste': {
    title: 'Esprit consolateur',
    source: 'Taizé, leçon 2',
    tempo: 98,
    meter: 4,
    pickup: 12,
    mark: [0, 1],
    notes: [n(5, 12, 'Es'), n(9, 24, 'prit'), n(7, 12, 'con'), n(7, 6, 'so', 1), n(8, 6, 'la', 1), n(9, 36, 'teur')],
  },
};

// ---------- Dessin : clé de sol, chiffrage, anacrouse, vraies valeurs de notes ----------
const GL = { clef: '', whole: '', half: '', black: '', flagUp: '', flagDown: '', dot: '' };
const digit = (k) => String.fromCharCode(0xe080 + k);
const r1 = (v) => Math.round(v * 10) / 10;
const WEIGHT = { 6: 1.7, 12: 2.3, 18: 2.7, 24: 3.1, 36: 3.8, 48: 4.3 };

function drawChant(c, W) {
  const s = 10;
  const top = 3.6 * s;
  const y = (step) => top + 4 * s - ((step - 2) * s) / 2;
  const t = (x, yy, ch, cls = '') => `<text${cls ? ` class="${cls}"` : ''} x="${r1(x)}" y="${r1(yy)}">${ch}</text>`;
  const measure = c.meter * 12;

  // positions : poids par valeur, plus un espace à chaque barre de mesure
  let tick = -c.pickup;
  const items = [];
  for (const [i, nt] of c.notes.entries()) {
    if (tick > -c.pickup && tick % measure === 0) items.push({ bar: true, w: 1.2, min: 1.2 * s });
    // une valeur longue prend plus de place, mais chaque syllabe garde au moins sa largeur
    items.push({ ...nt, i, w: WEIGHT[nt.dur] || 2.3, min: 7.6 * nt.lyric.length + 9 });
    tick += nt.dur;
  }
  const x0 = 6.6 * s;
  const avail = W - x0 - 1.5 * s;
  const span = (u) => items.reduce((a, it) => a + Math.max(it.w * u, it.min), 0);
  let lo = 0, hi = 1.6 * s; // plus grand pas permis, pour ne pas trop étirer sur grand écran
  for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (span(mid) > avail) hi = mid; else lo = mid; }
  let x = x0;
  for (const it of items) { it.x = x; x += Math.max(it.w * lo, it.min); }
  const end = Math.min(W - 1, x + 0.6 * s);

  let h = '<g class="lines">';
  for (let k = 0; k < 5; k++) h += `<line x1="0.5" x2="${r1(end)}" y1="${r1(top + k * s)}" y2="${r1(top + k * s)}"/>`;
  h += '</g><g class="ink">' + t(0.6 * s, y(4), GL.clef) + t(4.1 * s, y(8), digit(c.meter)) + t(4.1 * s, y(4), digit(4)) + '</g><g class="bars">';
  for (const it of items) if (it.bar) h += `<line x1="${r1(it.x + 0.2 * s)}" x2="${r1(it.x + 0.2 * s)}" y1="${r1(top)}" y2="${r1(top + 4 * s)}"/>`;
  h += '</g>';

  const notes = items.filter((it) => !it.bar);
  // ligatures : croches consécutives portant le même numéro
  const beams = {};
  for (const nt of notes) if (nt.beam) (beams[nt.beam] ||= []).push(nt);
  for (const grp of Object.values(beams)) {
    const down = grp.reduce((a, b) => a + b.step, 0) / grp.length >= 6;
    const ys = grp.map((nt) => y(nt.step));
    const by = down ? Math.max(...ys) + 3.5 * s : Math.min(...ys) - 3.5 * s;
    for (const nt of grp) { nt.down = down; nt.stemTo = by; }
    grp.by = by;
    grp.down = down;
  }

  for (const nt of notes) {
    const cls = c.mark.includes(nt.i) ? 'nt sel' : 'nt';
    const yN = y(nt.step);
    const ch = nt.dur >= 48 ? GL.whole : nt.dur >= 24 ? GL.half : GL.black;
    const hw = (ch === GL.whole ? 1.69 : 1.18) * s;
    const xl = nt.x;
    let o = `<g class="${cls}">`;
    for (const L of [0, -2]) if (nt.step <= L) o += `<line class="ledger" x1="${r1(xl - 0.45 * s)}" x2="${r1(xl + hw + 0.45 * s)}" y1="${r1(y(L))}" y2="${r1(y(L))}"/>`;
    for (const L of [12, 14]) if (nt.step >= L) o += `<line class="ledger" x1="${r1(xl - 0.45 * s)}" x2="${r1(xl + hw + 0.45 * s)}" y1="${r1(y(L))}" y2="${r1(y(L))}"/>`;
    o += t(xl, yN, ch);
    if (nt.dur < 48) {
      const down = nt.down ?? nt.step >= 6;
      const sx = down ? xl + 0.07 * s : xl + hw - 0.07 * s;
      const y1 = down ? yN + 0.17 * s : yN - 0.17 * s;
      const y2 = nt.stemTo ?? (down ? yN + 3.5 * s : yN - 3.5 * s);
      o += `<line class="stem" x1="${r1(sx)}" x2="${r1(sx)}" y1="${r1(y1)}" y2="${r1(y2)}"/>`;
      nt.sx = sx;
      if (nt.dur < 12 && !nt.beam) o += t(sx - 0.07 * s, y2, down ? GL.flagDown : GL.flagUp);
    }
    // point : pour une note pointée, décalé dans l'interligne si la note est sur une ligne
    if (nt.dur === 18 || nt.dur === 36) o += t(xl + hw + 0.35 * s, nt.step % 2 === 0 ? yN - 0.5 * s : yN, GL.dot);
    h += o + '</g>';
    h += `<text class="lyric" x="${r1(xl + hw / 2)}" y="${r1(top + 7.6 * s)}">${nt.lyric}</text>`;
  }
  for (const grp of Object.values(beams)) {
    const a = grp[0], b = grp[grp.length - 1];
    const marked = grp.every((nt) => c.mark.includes(nt.i));
    const yb = grp.down ? grp.by - 0.5 * s : grp.by;
    h += `<g class="nt${marked ? ' sel' : ''}"><rect x="${r1(a.sx - 0.07 * s)}" y="${r1(yb)}" width="${r1(b.sx - a.sx + 0.14 * s)}" height="${r1(0.5 * s)}"/></g>`;
  }
  const H = top + 8.6 * s;
  return `<svg class="score" width="${W}" height="${r1(H)}" viewBox="0 0 ${W} ${r1(H)}" style="font-size:${4 * s}px">${h}</svg>`;
}

const live = [];
let playing = null;

// Carte à insérer dans la page, puis à activer avec mountChants()
export function chantCard(name) {
  const c = CHANTS[name];
  if (!c) return '';
  return `<div class="chant" data-chant-name="${name}">
    <div class="chant-head">
      <div><p class="chant-title">${c.title}</p><p class="chant-sub">${name} entre les notes en doré · ${c.source}</p></div>
      <button class="secondary small" data-chant-play="${name}">Écouter</button>
    </div>
    <div class="chant-score"></div>
  </div>`;
}

export function mountChants(root) {
  unmountChants();
  for (const el of root.querySelectorAll('.chant')) {
    const c = CHANTS[el.dataset.chantName];
    const host = el.querySelector('.chant-score');
    let w = 0;
    const draw = () => {
      const nw = Math.floor(host.clientWidth);
      if (nw && nw !== w) { w = nw; host.innerHTML = drawChant(c, w); }
    };
    const ro = new ResizeObserver(draw);
    ro.observe(host);
    draw();
    live.push(ro);
  }
}

export function unmountChants() {
  if (playing) { playing.stop(); playing = null; }
  while (live.length) live.pop().disconnect();
}

document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-chant-play]');
  if (!b) return;
  const c = CHANTS[b.dataset.chantPlay];
  stopAll();
  playing = playSequence(c.notes, { tempo: c.tempo, onEnd: () => { playing = null; } });
});
