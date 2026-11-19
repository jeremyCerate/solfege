// Débuts des chants travaillés en cours, pour retenir un intervalle à l'oreille.
// Transcrits en do majeur (les leçons partent de ces notes), seulement les premiers mots.
import { playSequence, stopAll } from './audio.js';
import { Score } from './staff.js';

const n = (step, dur, lyric) => ({ step, dur, lyric });

export const CHANTS = {
  'tierce majeure': {
    title: 'In manus tuas, Pater',
    source: 'Taizé, leçon 3',
    tempo: 74,
    mark: [0, 1], // les deux notes qui forment l'intervalle
    notes: [n(0, 6, 'In'), n(2, 12, 'ma'), n(2, 12, 'nus'), n(4, 12, 'tu'), n(4, 12, 'as,'), n(3, 24, 'Pa'), n(2, 18, 'ter')],
  },
  'quarte juste': {
    title: 'Ostende nobis Domine',
    source: 'Taizé, leçon 1',
    tempo: 80,
    mark: [4, 5],
    notes: [n(5, 6, 'Os'), n(5, 6, 'ten'), n(5, 6, 'de'), n(5, 12, 'no'), n(5, 12, 'bis'), n(8, 6, 'Do'), n(8, 6, 'mi')],
  },
  'quinte juste': {
    title: 'Esprit consolateur',
    source: 'Taizé, leçon 2',
    tempo: 98,
    mark: [0, 1],
    notes: [n(5, 12, 'Es'), n(9, 24, 'prit'), n(7, 12, 'con'), n(7, 6, 'so'), n(8, 6, 'la'), n(9, 36, 'teur')],
  },
};

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
    const sc = new Score(el.querySelector('.chant-score'), { mode: 'pitch', slots: c.notes.length, size: 10, dots: false });
    sc.setData({ events: c.notes.map((x, i) => ({ ...x, state: c.mark.includes(i) ? 'sel' : '' })), cursor: false });
    live.push(sc);
  }
}

export function unmountChants() {
  if (playing) { playing.stop(); playing = null; }
  while (live.length) live.pop().destroy();
}

document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-chant-play]');
  if (!b) return;
  const c = CHANTS[b.dataset.chantPlay];
  stopAll();
  playing = playSequence(c.notes, { tempo: c.tempo, onEnd: () => { playing = null; } });
});
