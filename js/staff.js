// Portée en SVG, dessinée avec la police Bravura (norme SMuFL).
// mode 'pitch'  : N emplacements réguliers, têtes de notes sans hampe.
// mode 'rhythm' : mesures à 4/4, notes placées selon leur position dans le temps.
import { MEASURE, BEAT } from './music.js';

const NS = 'http://www.w3.org/2000/svg';
const G = {
  fClef: '\uE062',
  clef: '', whole: '', half: '', black: '',
  restQ: '', restH: '', flagUp: '', flagDown: '', four: '',
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = (n) => Math.round(n * 10) / 10;

export class Score {
  constructor(host, { mode, slots = 0, measures = 0, onPointer = null, size = 11, dots = true, single = false, clef = 'g' }) {
    this.setClef(clef);
    this.single = single; // portée à une ligne, pour la lecture de rythme
    this.size = size;
    this.dots = dots;
    this.host = host;
    this.mode = mode;
    this.slots = slots;
    this.measures = measures;
    this.onPointer = onPointer;
    this.data = { events: [] };
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('class', 'score' + (onPointer ? ' interactive' : ''));
    host.appendChild(this.svg);
    this.width = host.clientWidth || 340;
    this.ro = new ResizeObserver(() => {
      const w = host.clientWidth;
      if (w && w !== this.width) { this.width = w; this.render(); }
    });
    this.ro.observe(host);
    if (onPointer) this.bind();
    this.render();
  }

  destroy() { this.ro.disconnect(); this.svg.remove(); }

  setData(data) { this.data = data; this.render(); }

  // Clé de fa : le do du milieu (step 0) passe sur la 1re ligne supplémentaire au-dessus,
  // soit 12 demi-interlignes plus haut qu'en clé de sol.
  setClef(clef) { this.clef = clef; this.shift = clef === 'f' ? 12 : 0; }

  geom() {
    const s = this.size;
    const g = this.single
      ? { s, sysH: 9 * s, top: 2.8 * s, clefW: 0.9 * s }
      : { s, sysH: 12 * s, top: 4.3 * s, clefW: 4.4 * s };
    if (this.mode === 'pitch') {
      const avail = this.width - g.clefW - 0.8 * s;
      const maxPer = Math.max(3, Math.floor(avail / (3.4 * s)));
      const lines = Math.ceil(this.slots / maxPer);
      g.per = Math.ceil(this.slots / lines);
      g.slotW = Math.min(avail / g.per, 6 * s);
      g.systems = lines;
    } else {
      g.per = Math.min(this.measures, this.width < 760 ? 2 : 4);
      g.systems = Math.ceil(this.measures / g.per);
    }
    return g;
  }

  x0(g, sys) { return g.clefW + (this.mode === 'rhythm' && sys === 0 ? 2.6 * g.s : 0); }
  posSlot(g, i) { return { sys: Math.floor(i / g.per), x: g.clefW + ((i % g.per) + 0.5) * g.slotW }; }
  y(g, sys, step) { return sys * g.sysH + g.top + 4 * g.s - ((step + this.shift - 2) * g.s) / 2; }

  render() {
    const g = (this.g = this.geom());
    const { s } = g;
    const W = this.width;
    const d = this.data;
    const pitch = this.mode === 'pitch';
    const glyph = (x, y, ch) => `<text x="${r1(x)}" y="${r1(y)}">${ch}</text>`;

    // --- placement des événements ---
    const placed = [];
    let t = 0;
    d.events.forEach((e, i) => {
      placed.push({ ...e, i, start: t });
      t += e.dur || BEAT;
    });
    this.placed = placed;
    let cur = null;
    if (pitch) {
      for (const p of placed) Object.assign(p, this.posSlot(g, p.i));
      if (d.cursor && d.events.length < this.slots) cur = this.posSlot(g, d.events.length);
    } else {
      // Espacement : chaque figure a une largeur propre (les notes rapides ne se chevauchent pas),
      // et la place restante de la mesure est réservée comme si elle était remplie de noires.
      const WIDTH = { 4: 1.3, 6: 1.5, 12: 2, 24: 2.8, 36: 3.4, 48: 4 };
      const ms = [];
      for (const p of placed) {
        const m = Math.floor(p.start / MEASURE);
        const c = (ms[m] ||= { w: 0, ticks: 0, items: [] });
        p.cum = c.w;
        c.w += WIDTH[p.dur] || 2;
        c.ticks += p.dur;
        c.items.push(p);
      }
      const totalOf = (c) => (c ? c.w + ((MEASURE - c.ticks) / BEAT) * 2 : 8);
      // Les mesures d'une même ligne se partagent la largeur selon leur densité.
      const PAD = 2.1 * s, padL = 1.5 * s;
      const box = [];
      for (let sys = 0; sys < g.systems; sys++) {
        const first = sys * g.per;
        const n = Math.min(g.per, this.measures - first);
        let sum = 0;
        for (let k = 0; k < n; k++) sum += totalOf(ms[first + k]);
        const unit = (W - this.x0(g, sys) - 0.3 * s - n * PAD) / sum;
        let x = this.x0(g, sys);
        for (let k = 0; k < n; k++) {
          const w = PAD + totalOf(ms[first + k]) * unit;
          box[first + k] = { sys, x, w, unit };
          x += w;
        }
      }
      this.box = box;
      const at = (m, cum) => ({ sys: box[m].sys, x: box[m].x + padL + cum * box[m].unit });
      ms.forEach((c, m) => { if (box[m]) for (const p of c.items) Object.assign(p, at(m, p.cum)); });
      if (d.cursor && t < this.measures * MEASURE) {
        const m = Math.floor(t / MEASURE);
        cur = at(m, ms[m] ? ms[m].w : 0);
      }
    }
    this.cur = cur;

    // --- groupes de croches / triolets (ligatures) ---
    const groups = [];
    if (!pitch) {
      let c = null;
      for (const p of placed) {
        if (p.step != null && (p.dur === 6 || p.dur === 4)) {
          const beat = Math.floor(p.start / BEAT);
          const max = p.dur === 6 ? 2 : 3;
          if (c && c.dur === p.dur && c.beat === beat && c.items.length < max && c.end === p.start) {
            c.items.push(p);
            c.end = p.start + p.dur;
          } else {
            c = { dur: p.dur, beat, items: [p], end: p.start + p.dur };
            groups.push(c);
          }
          p.group = c;
        } else c = null;
      }
      for (const c of groups) {
        const avg = c.items.reduce((a, p) => a + p.step, 0) / c.items.length;
        c.down = avg >= 6 && !this.single;
        const ys = c.items.map((p) => this.y(g, p.sys, p.step));
        c.beamY = c.down ? Math.max(...ys) + 3.5 * s : Math.min(...ys) - 3.5 * s;
      }
    }

    let h = '';
    // --- portées ---
    for (let sys = 0; sys < g.systems; sys++) {
      const top = sys * g.sysH + g.top;
      h += '<g class="lines">';
      for (let k = 0; k < 5; k++) if (!this.single || k === 2) h += `<line x1="0.5" x2="${W - 0.5}" y1="${r1(top + k * s)}" y2="${r1(top + k * s)}"/>`;
      h += '</g><g class="ink">';
      if (!this.single) h += this.clef === 'f' ? glyph(0.6 * s, this.y(g, sys, 8 - this.shift), G.fClef) : glyph(0.6 * s, this.y(g, sys, 4), G.clef);
      if (!pitch && sys === 0) {
        h += glyph(g.clefW - 0.3 * s, this.y(g, sys, 8), G.four) + glyph(g.clefW - 0.3 * s, this.y(g, sys, 4), G.four);
      }
      h += '</g><g class="bars">';
      const last = sys === g.systems - 1;
      const by = this.single ? top + s : top;
      const bh = this.single ? 2 * s : 4 * s;
      if (!pitch) {
        const n = Math.min(g.per, this.measures - sys * g.per);
        for (let m = 1; m <= n; m++) {
          const b = this.box[sys * g.per + m - 1];
          const x = b.x + b.w;
          const final = last && m === n;
          if (final) {
            h += `<line x1="${r1(x - 0.75 * s)}" x2="${r1(x - 0.75 * s)}" y1="${by}" y2="${by + bh}"/>`;
            h += `<rect x="${r1(x - 0.4 * s)}" y="${by}" width="${r1(0.4 * s + 0.3 * s)}" height="${bh}"/>`;
          } else h += `<line x1="${r1(x)}" x2="${r1(x)}" y1="${by}" y2="${by + bh}"/>`;
        }
      } else if (last) {
        h += `<line x1="${W - 0.8}" x2="${W - 0.8}" y1="${top}" y2="${top + 4 * s}"/>`;
      }
      h += '</g>';
      if (pitch && this.dots) {
        // repères : un point par note attendue
        for (let i = sys * g.per; i < Math.min(this.slots, (sys + 1) * g.per); i++) {
          const p = this.posSlot(g, i);
          h += `<circle class="slot${i < d.events.length ? ' filled' : ''}" cx="${r1(p.x)}" cy="${r1(top + 7.4 * s)}" r="2"/>`;
        }
      }
      if (cur && cur.sys === sys) {
        h += `<line class="cursor" x1="${r1(cur.x)}" x2="${r1(cur.x)}" y1="${r1(top - 1.2 * s)}" y2="${r1(top + 5.2 * s)}"/>`;
      }
    }

    // --- notes ---
    const head = (p, x, cls, stems) => {
      const yN = this.y(g, p.sys, p.step);
      const ch = pitch ? G.black : p.dur >= 48 ? G.whole : p.dur >= 24 ? G.half : G.black;
      const hw = (ch === G.whole ? 1.69 : 1.18) * s;
      const xl = x - hw / 2;
      let o = `<g class="nt ${cls || ''}">`;
      const ds = p.step + this.shift; // position sur la portée, quelle que soit la clé
      for (const L of [0, -2, -4, 12, 14, 16]) {
        if (L <= 0 ? ds <= L : ds >= L) {
          const yl = r1(this.y(g, p.sys, L - this.shift));
          o += `<line class="ledger" x1="${r1(xl - 0.45 * s)}" x2="${r1(xl + hw + 0.45 * s)}" y1="${yl}" y2="${yl}"/>`;
        }
      }
      o += glyph(xl, yN, ch);
      if (stems && p.dur < 48) {
        const grp = p.group;
        const beamed = grp && grp.items.length > 1;
        const down = grp ? grp.down : p.step + this.shift >= 6 && !this.single;
        const sx = down ? xl + 0.07 * s : xl + hw - 0.07 * s;
        const y1 = down ? yN + 0.17 * s : yN - 0.17 * s;
        const y2 = beamed ? grp.beamY : down ? yN + 3.5 * s : yN - 3.5 * s;
        o += `<line class="stem" x1="${r1(sx)}" x2="${r1(sx)}" y1="${r1(y1)}" y2="${r1(y2)}"/>`;
        p.sx = sx;
        p.stemEnd = y2;
        if (p.dur < BEAT && !beamed) o += glyph(sx - 0.07 * s, y2, down ? G.flagDown : G.flagUp);
      }
      return o + '</g>';
    };

    for (const p of placed) {
      const cls = p.state || '';
      if (p.missing) {
        h += head({ ...p, step: p.ghost }, p.x, 'ghost', false);
      } else if (p.step == null) {
        const top = p.sys * g.sysH + g.top;
        const ch = p.dur >= 24 ? G.restH : G.restQ;
        h += `<g class="nt ${cls}">${glyph(p.x - 0.55 * s, top + 2 * s, ch)}</g>`;
      } else {
        h += head(p, p.x, cls, !pitch);
        if (p.ghost != null) h += head({ ...p, step: p.ghost, group: null }, p.x + 1.4 * s, 'ghost', false);
      }
    }

    // --- ligatures et chiffre du triolet ---
    for (const c of groups) {
      const a = c.items[0], b = c.items[c.items.length - 1];
      const same = c.items.every((p) => p.state === a.state);
      const cls = same ? a.state || '' : '';
      let o = `<g class="nt ${cls}">`;
      if (c.items.length > 1) {
        const yb = c.down ? c.beamY - 0.5 * s : c.beamY;
        o += `<rect x="${r1(a.sx - 0.07 * s)}" y="${r1(yb)}" width="${r1(b.sx - a.sx + 0.14 * s)}" height="${r1(0.5 * s)}"/>`;
      }
      if (c.dur === 4) {
        const cx = (a.sx + b.sx) / 2;
        const end = c.items.length > 1 ? c.beamY : a.stemEnd;
        const yt = c.down ? end + 1.9 * s : end - 0.7 * s;
        o += `<text class="tuplet" x="${r1(cx)}" y="${r1(yt)}">3</text>`;
      }
      h += o + '</g>';
    }

    // --- étiquette pendant le glisser ---
    if (d.label && placed[d.label.index]) {
      const p = placed[d.label.index];
      const yl = p.sys * g.sysH + 1.25 * s;
      const x = clamp(p.x, 2.4 * s, W - 2.4 * s);
      h += `<g class="label"><rect x="${r1(x - 2.2 * s)}" y="${r1(yl - 1.15 * s)}" width="${r1(4.4 * s)}" height="${r1(1.9 * s)}" rx="${r1(0.95 * s)}"/>`;
      h += `<text x="${r1(x)}" y="${r1(yl + 0.22 * s)}">${d.label.text}</text></g>`;
    }

    const H = g.systems * g.sysH;
    this.svg.setAttribute('width', W);
    this.svg.setAttribute('height', H);
    this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    this.svg.style.fontSize = 4 * s + 'px';
    this.svg.innerHTML = h;
  }

  // Convertit un toucher en { index (note existante) | append, step }
  hit(ev, lockSys = null) {
    const g = this.g;
    const r = this.svg.getBoundingClientRect();
    const x = ev.clientX - r.left;
    const y = ev.clientY - r.top;
    const sys = lockSys ?? clamp(Math.floor(y / g.sysH), 0, g.systems - 1);
    const step = clamp(Math.round((sys * g.sysH + g.top + 4 * g.s - y) / (g.s / 2)) + 2, -2, 10);
    const cur = this.cur;
    const margin = this.mode === 'pitch' ? g.slotW / 2 : 0.9 * g.s;
    const append = !!cur && (sys > cur.sys || (sys === cur.sys && x >= cur.x - margin));
    let index = null;
    if (!append) {
      let best = Infinity;
      for (const p of this.placed) {
        if (p.sys !== sys) continue;
        const dx = Math.abs(p.x - x);
        if (dx < best) { best = dx; index = p.i; }
      }
    }
    return { index, append, step, sys };
  }

  bind() {
    const svg = this.svg;
    let active = false;
    let lock = null;
    svg.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      e.preventDefault();
      active = true;
      try { svg.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      const hit = this.hit(e);
      lock = hit.sys;
      this.onPointer('down', hit);
    });
    svg.addEventListener('pointermove', (e) => {
      if (active) this.onPointer('move', this.hit(e, lock));
    });
    const end = () => {
      if (!active) return;
      active = false;
      this.onPointer('up', {});
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
  }
}
