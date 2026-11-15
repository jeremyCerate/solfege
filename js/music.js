// Modèle musical : do majeur, clé de sol.
// Une hauteur est un "degré" diatonique : 0 = do (do4), 1 = ré, … 7 = do aigu.
// Une durée est en "ticks" : 12 ticks = une noire (un temps).

export const BEAT = 12;
export const MEASURE = 48; // 4/4
export const NAMES = ['do', 'ré', 'mi', 'fa', 'sol', 'la', 'si'];
const SCALE = [0, 2, 4, 5, 7, 9, 11];

export const mod = (n, m) => ((n % m) + m) % m;
export const midi = (step) => 60 + 12 * Math.floor(step / 7) + SCALE[mod(step, 7)];
export const noteName = (step) => NAMES[mod(step, 7)];
export function noteLabel(step) {
  const o = Math.floor(step / 7);
  return NAMES[mod(step, 7)] + (o > 0 ? '↑' : o < 0 ? '↓' : '');
}

const SIZE_NAMES = ['unisson', 'seconde', 'tierce', 'quarte', 'quinte', 'sixte', 'septième', 'octave'];
const CHANTS = {
  'tierce majeure': 'In manus tuas, Pater',
  'quarte juste': 'Ostende nobis Domine',
  'quinte juste': 'Esprit consolateur',
};

export function intervalInfo(a, b) {
  const size = Math.abs(b - a);
  const semi = Math.abs(midi(b) - midi(a));
  let quality = '';
  if (size === 1) quality = semi === 1 ? 'mineure' : 'majeure';
  else if (size === 2) quality = semi === 3 ? 'mineure' : 'majeure';
  else if (size === 3) quality = semi === 5 ? 'juste' : 'augmentée';
  else if (size === 4) quality = semi === 7 ? 'juste' : 'diminuée';
  else if (size === 5) quality = semi === 8 ? 'mineure' : 'majeure';
  else if (size === 6) quality = semi === 10 ? 'mineure' : 'majeure';
  else if (size === 7) quality = 'juste';
  const name = size === 0 ? 'unisson' : `${SIZE_NAMES[Math.min(size, 7)]} ${quality}`;
  const dir = b > a ? 'ascendante' : b < a ? 'descendante' : '';
  return { size, semi, name, dir, chant: CHANTS[name] || null, conjoint: size <= 1 };
}

// ---------- Niveaux ----------
// leaps : tailles de sauts autorisées en degrés (2 = tierce, 3 = quarte, 4 = quinte, 5 = sixte, 7 = octave)
// listens : 0 = illimité

export const LEVELS = [
  { id: 'n1', mode: 'pitch', title: 'Premiers pas', count: 5, leaps: [], listens: 0, tempo: 60, range: [0, 7] },
  { id: 'n2', mode: 'pitch', title: 'Mouvements conjoints', count: 8, leaps: [], listens: 5, tempo: 66, range: [0, 7] },
  { id: 'n3', mode: 'pitch', title: 'La tierce', count: 8, leaps: [2], listens: 5, tempo: 66, range: [0, 7] },
  { id: 'n4', mode: 'pitch', title: 'Tierce, quarte, quinte', count: 8, leaps: [2, 3, 4], listens: 3, tempo: 66, range: [0, 7] },
  { id: 'n5', mode: 'rhythm', title: 'Noires et blanches', measures: 2, leaps: [], figs: {}, listens: 5, tempo: 60, range: [0, 7] },
  { id: 'n6', mode: 'rhythm', title: 'Avec les croches', measures: 4, leaps: [2], figs: { croches: true }, listens: 5, tempo: 60, range: [0, 7] },
  { id: 'n7', mode: 'rhythm', title: 'Triolets et silences', measures: 4, leaps: [2, 3, 4], figs: { croches: true, triolets: true, silences: true }, listens: 3, tempo: 60, range: [0, 7] },
  { id: 'n8', mode: 'rhythm', title: 'Dictée complète', measures: 8, leaps: [2, 3, 4], figs: { croches: true, triolets: true, silences: true }, listens: 3, tempo: 60, range: [0, 7] },
];

export const DEFAULT_CUSTOM = {
  id: 'custom', mode: 'pitch', title: 'Personnalisé', count: 8, measures: 4, leaps: [2],
  figs: { croches: true }, listens: 3, tempo: 66, range: [0, 7], start: 0,
};

const LEAP_LABELS = { 2: 'tierces', 3: 'quartes', 4: 'quintes', 5: 'sixtes', 7: 'octaves' };

export function describeLevel(l) {
  const parts = [];
  parts.push(l.mode === 'pitch' ? `${l.count} notes` : `${l.measures} mesures`);
  parts.push(l.leaps.length ? 'sauts : ' + l.leaps.map((x) => LEAP_LABELS[x]).join(', ') : 'degrés conjoints');
  if (l.mode === 'rhythm') {
    const f = ['noires', 'blanches'];
    if (l.figs.croches) f.push('croches');
    if (l.figs.triolets) f.push('triolets');
    if (l.figs.silences) f.push('silences');
    parts.push(f.join(', '));
  }
  if (l.start === 'random') parts.push('départ au hasard');
  else if (l.start) parts.push(`départ sur ${NAMES[l.start]}`);
  parts.push(l.listens ? `${l.listens} écoute${l.listens > 1 ? 's' : ''}` : 'écoutes illimitées');
  return parts;
}

// ---------- Génération ----------

function pick(weighted) {
  let total = 0;
  for (const [, w] of weighted) total += w;
  let r = Math.random() * total;
  for (const [item, w] of weighted) {
    r -= w;
    if (r <= 0) return item;
  }
  return weighted[weighted.length - 1][0];
}

function nextStep(prev, prevMove, cfg, stepOnly) {
  const [lo, hi] = cfg.range;
  const leaps = stepOnly ? [] : cfg.leaps;
  const leapW = leaps.length ? 3.7 / leaps.length : 0;
  const cands = [];
  for (const size of [1, ...leaps]) {
    for (const dir of [1, -1]) {
      const s = prev + dir * size;
      if (s < lo || s > hi) continue;
      if (Math.abs(midi(s) - midi(prev)) === 6) continue; // pas de triton
      let w = size === 1 ? 6 : leapW;
      if (Math.abs(prevMove) > 1) {
        // après un saut : on revient plutôt par mouvement conjoint contraire
        if (size === 1 && dir === -Math.sign(prevMove)) w *= 2.5;
        if (size > 1 && dir === Math.sign(prevMove)) w *= 0.15;
      } else if (prevMove !== 0 && size === 1 && dir === Math.sign(prevMove)) {
        w *= 1.4;
      }
      cands.push([s, w]);
    }
  }
  return pick(cands);
}

// stepOnlyFlags[i] : la note i doit être conjointe à la précédente (notes rapides)
function walk(n, cfg, stepOnlyFlags = []) {
  const steps = [cfg.start || 0];
  let move = 0;
  for (let i = 1; i < n; i++) {
    const s = nextStep(steps[i - 1], move, cfg, !!stepOnlyFlags[i]);
    move = s - steps[i - 1];
    steps.push(s);
  }
  return steps;
}

function goodWalk(n, cfg, flags, endOnDo) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const steps = walk(n, cfg, flags);
    if (endOnDo && mod(steps[n - 1], 7) !== 0) continue;
    if (cfg.leaps.length && n >= 5 && !steps.some((s, i) => i > 0 && Math.abs(s - steps[i - 1]) > 1)) continue;
    // éviter les allers-retours trop longs sur deux notes
    let bounce = 0, maxBounce = 0;
    for (let i = 2; i < n; i++) {
      bounce = steps[i] === steps[i - 2] ? bounce + 1 : 0;
      maxBounce = Math.max(maxBounce, bounce);
    }
    if (maxBounce > 2) continue;
    return steps;
  }
  return null; // impossible avec ces contraintes (ex. parité en mouvement conjoint)
}

function rhythmMeasure(figs, isFirst, prevWasRest) {
  const cells = [];
  let beat = 0;
  let lastRest = prevWasRest;
  while (beat < 4) {
    const opts = [['noire', 4]];
    if (beat === 0 || beat === 2) opts.push(['blanche', 1.6]);
    if (figs.croches) opts.push(['croches', 2.5]);
    if (figs.triolets && !cells.includes('triolet')) opts.push(['triolet', 1.3]); // un seul par mesure
    if (figs.silences && !lastRest && !(isFirst && beat === 0)) {
      opts.push(['soupir', 0.6]);
      if (beat === 2) opts.push(['demipause', 0.25]);
    }
    const c = pick(opts);
    cells.push(c);
    lastRest = c === 'soupir' || c === 'demipause';
    beat += c === 'blanche' || c === 'demipause' ? 2 : 1;
  }
  return cells;
}

const CELL_EVENTS = {
  noire: [[12, false]],
  blanche: [[24, false]],
  ronde: [[48, false]],
  croches: [[6, false], [6, false]],
  triolet: [[4, false], [4, false], [4, false]],
  soupir: [[12, true]],
  demipause: [[24, true]],
};

function rhythm(cfg) {
  const figs = cfg.figs || {};
  for (let attempt = 0; attempt < 80; attempt++) {
    const cells = [];
    let lastRest = false;
    for (let m = 0; m < cfg.measures - 1; m++) {
      const mc = rhythmMeasure(figs, m === 0, lastRest);
      lastRest = ['soupir', 'demipause'].includes(mc[mc.length - 1]);
      cells.push(...mc);
    }
    if (lastRest) continue; // la dernière mesure commence par une note, pas après un silence
    if (cfg.measures >= 4) cells.push('ronde');
    else cells.push(...pick([[['noire', 'noire', 'blanche'], 1], [['blanche', 'blanche'], 1]]));
    if (figs.croches && !cells.includes('croches')) continue;
    if (figs.triolets && !cells.includes('triolet')) continue;
    if (figs.silences && cfg.measures >= 4 && !cells.some((c) => c === 'soupir' || c === 'demipause')) continue;
    return cells;
  }
  return Array((cfg.measures - 1) * 4).fill('noire').concat(['ronde']);
}

// Rythme seul (lecture de rythme) : toutes les notes sur la même hauteur
export function generateRhythm(cfg, step = 6) {
  const events = [];
  for (const c of rhythm(cfg)) for (const [dur, rest] of CELL_EVENTS[c]) events.push({ step: rest ? null : step, dur });
  return events;
}

// Renvoie la mélodie : [{ step: degré | null (silence), dur: ticks }]
export function generate(level) {
  // Départ sur le do grave (première ligne supplémentaire sous la portée),
  // sauf en dictée personnalisée où l'on peut choisir une autre note ou la tirer au hasard.
  const start = level.start === 'random' ? Math.floor(Math.random() * 7) : Number(level.start) || 0;
  const cfg = { ...level, start };
  if (cfg.mode === 'pitch') {
    // On ne finit sur do que si des sauts le permettent : en mouvement purement conjoint,
    // l'exiger ne laisserait presque que la gamme montante.
    const endOnDo = cfg.count >= 6 && cfg.leaps.length > 0;
    const steps = goodWalk(cfg.count, cfg, [], endOnDo) || goodWalk(cfg.count, cfg, [], false) || walk(cfg.count, cfg);
    return steps.map((step) => ({ step, dur: BEAT }));
  }
  for (let attempt = 0; ; attempt++) {
    const cells = rhythm(cfg);
    const events = [];
    const flags = [];
    for (const c of cells) {
      CELL_EVENTS[c].forEach(([dur, rest], k) => {
        events.push({ step: rest ? null : 0, dur });
        if (!rest) flags.push(k > 0); // à l'intérieur d'une cellule rapide : conjoint
      });
    }
    // si ce rythme ne permet pas de finir sur do, on en tire un autre
    const steps = goodWalk(flags.length, cfg, flags, true) || (attempt >= 40 ? walk(flags.length, cfg, flags) : null);
    if (!steps) continue;
    let k = 0;
    for (const e of events) if (e.step !== null) e.step = steps[k++];
    return events;
  }
}
