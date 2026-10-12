import { CFG } from './config.js';
import { rawCadence } from './sim.js';
import { rect, panel, disc, ring, line, hash, mod } from './pix.js';
import { createBackdrop } from './backdrop.js';

// Size of the low-res pixel buffer; main.js scales it up to the device.
export const W = 270;
export const H = 480;

const PPM = 48;          // pixels per metre
const EXAG = 2.5;        // vertical exaggeration so gradients read on screen
const RIDER_X = 104;
const ROAD_Y = 335;      // screen row where the wheels touch the road
const TAU = Math.PI * 2;

export const UI = {
  plus: { x: 17, y: 362, w: 38, h: 26 },
  minus: { x: 17, y: 424, w: 38, h: 26 },
  ring: { cx: 124, cy: 402, r: 42 },
  pedal: { cx: 222, cy: 404, r: 42 },
};

const FONT = '"Trebuchet MS", "DejaVu Sans", Verdana, sans-serif';
const NAVY = '#141a2e';
const NAVY_EDGE = '#0a0e1c';
const MUTED = '#9aa6c4';
const KIND_COLOR = { perfect: '#5dff7a', good: '#ffd84d', weak: '#ff9a3d', miss: '#ff5a5a' };

const backdrop = createBackdrop(W, H);

// Text is drawn at full device resolution on top of the pixel buffer, so it stays readable.
// `color` may be a [top, bottom] pair for a vertical gradient.
const labels = [];
function label(str, x, y, size, color = '#fff', align = 'left', outline = null) {
  labels.push({ str, x, y, size, color, align, outline });
}

function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

const STONES = ['#cdbb98', '#bda982', '#d8c8a6'];
const VERGE = '#4f8a3a';

// Wall, gravel and verge are painted once per scene into a strip that repeats every 24 m;
// each frame copies it column by column at the height of the road. The verge is the
// bottom band of the scene's painting, or plain grass until that has loaded.
const STRIP_W = 9 * 128;
const STRIP_H = 215;
const WALL_H = 17; // strip rows above the road surface row
function buildRoadStrip(scene) {
  const canvas = document.createElement('canvas');
  canvas.width = STRIP_W;
  canvas.height = STRIP_H;
  const c = canvas.getContext('2d');
  const y = WALL_H;
  const near = scene.near;
  for (let wp = 0; wp < STRIP_W; wp++) {
    // Dry stone wall on the far side: two staggered courses
    for (let k = 0; k < 2; k++) {
      const top = y - 17 + k * 6;
      const col = wp + k * 4;
      if (mod(col, 9) === 0) {
        rect(c, wp, top, 1, 6, '#6f6046');
      } else {
        rect(c, wp, top, 1, 6, STONES[hash(Math.floor(col / 9) * 2 + k) % 3]);
        rect(c, wp, top, 1, 1, '#e6dabd');
        rect(c, wp, top + 5, 1, 1, '#6f6046');
      }
    }

    // Gravel
    rect(c, wp, y - 5, 1, 15, '#d8b678');
    rect(c, wp, y - 5, 1, 1, '#b08f58');
    rect(c, wp, y + 9, 1, 1, '#a88750');
    const p = hash(wp);
    if ((p & 7) === 0) rect(c, wp, y - 3 + ((p >>> 3) % 11), 1, 1, '#9c7d4a');
    if (((p >>> 8) & 7) === 0) rect(c, wp, y - 3 + ((p >>> 11) % 11), 1, 1, '#ecd4a0');

    // Verge in front of the road, with a fringe of grass over the gravel's edge
    if (!near) rect(c, wp, y + 10, 1, STRIP_H - y - 10, VERGE);
    const tuft = (hash(wp + 7777) >>> 4) % 4;
    rect(c, wp, y + 10 - tuft, 1, tuft + 2, '#3c7030');
    const f = hash(wp * 3 + 1);
    if (!near && f % 23 === 0 && wp < STRIP_W - 1) {
      rect(c, wp, y + 14 + ((f >>> 5) % 58), 2, 2, f & 64 ? '#f2d24a' : '#b98be0');
    }
  }
  if (near) {
    if (scene.tint) {
      c.globalCompositeOperation = 'multiply';
      rect(c, 0, 0, STRIP_W, y + 12, scene.tint);
      c.globalCompositeOperation = 'source-over';
    }
    rect(c, 0, y + 10 + near.height, STRIP_W, STRIP_H, scene.ground);
    for (let x = 0; x < STRIP_W; x += near.width) c.drawImage(near, x, y + 10);
  }
  return canvas;
}

function roadStripFor(scene) {
  if (!scene.strip || scene.stripNear !== scene.near) {
    scene.strip = buildRoadStrip(scene);
    scene.stripNear = scene.near;
  }
  return scene.strip;
}

function drawRoad(c, state, course, scenes) {
  const h0 = course.heightAt(state.x);
  const roadY = (wx) => Math.round(ROAD_Y - (course.heightAt(wx) - h0) * PPM * EXAG);
  const screenX = (wx) => Math.round(RIDER_X + (wx - state.x) * PPM);

  const wp0 = Math.floor((state.x - RIDER_X / PPM) * PPM);
  const topAt = (sx) => roadY(state.x + (sx - RIDER_X) / PPM) - WALL_H;
  const paint = (scene) => {
    const strip = roadStripFor(scene);
    c.fillStyle = scene.near ? scene.ground : VERGE;
    // Neighbouring columns at the same height are copied in one go
    let start = 0;
    let top = topAt(0);
    for (let sx = 1; sx <= W; sx++) {
      const next = sx < W ? topAt(sx) : NaN;
      if (next === top && mod(wp0 + sx, STRIP_W) !== 0) continue;
      const n = sx - start;
      c.drawImage(strip, mod(wp0 + start, STRIP_W), 0, n, STRIP_H, start, top, n, STRIP_H);
      c.fillRect(start, top + STRIP_H, n, H - top - STRIP_H);
      start = sx;
      top = next;
    }
  };
  paint(scenes.base);
  if (scenes.over) {
    c.globalAlpha = scenes.t;
    paint(scenes.over);
    c.globalAlpha = 1;
  }

  // Distance posts every 10 m, labelled every 50 m
  const first = Math.max(0, Math.ceil((state.x - RIDER_X / PPM) / 10) * 10);
  const last = Math.min(course.length, state.x + (W - RIDER_X) / PPM);
  for (let wx = first; wx <= last; wx += 10) {
    const sx = screenX(wx);
    const y = roadY(wx);
    rect(c, sx, y - 16, 2, 11, '#f4f1e6');
    rect(c, sx, y - 16, 2, 3, '#d93636');
    if (wx % 50 === 0 && wx > 0) label(`${wx}m`, sx + 1, y - 21, 7, '#fff', 'center', NAVY_EDGE);
  }

  const fx = screenX(course.length);
  if (fx < W + 30) {
    const fy = roadY(course.length);
    rect(c, fx, fy - 62, 2, 57, '#2a2a2a');
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 4; j++) {
        rect(c, fx + 2 + i * 3, fy - 62 + j * 3, 3, 3, (i + j) % 2 ? '#111' : '#fff');
      }
    }
  }
}

// The rider is a sheet of frames, all the same size with the bike in the same place. They
// are not evenly spread round the pedal stroke, so each is listed with the crank position
// it shows (in turns, 0 = near pedal at the top) and the closest one is drawn.
const SPRITE = {
  src: 'assets/rider.webp',
  turns: [10, 55, 90, 100, 120, 135, 150, 165, 285, 325, 330, 345].map((deg) => deg / 360),
  w: 284,
  h: 248,
  hub: [61, 185],    // rear hub within a frame
  wheelbase: 161.6,
  wheelR: 60,        // hub to the bottom of the tyre
  spokeR: 44,
};
const RIDER_WHEELBASE = 78; // on screen, in buffer pixels

let riderSheet = null;
{
  const img = new Image();
  img.onload = () => {
    riderSheet = img;
  };
  img.src = SPRITE.src;
}

// Drawn with the midpoint between the tyre contact patches on the road, tilted to the slope
function drawRider(c, state, course) {
  if (!riderSheet) return;
  const { w, h, hub, wheelbase, wheelR, spokeR } = SPRITE;
  const k = RIDER_WHEELBASE / wheelbase;
  const turn = mod(state.crank, 1);
  let frame = 0;
  let nearest = 1;
  SPRITE.turns.forEach((t, i) => {
    const d = Math.abs(mod(turn - t + 0.5, 1) - 0.5);
    if (d < nearest) {
      nearest = d;
      frame = i;
    }
  });

  c.save();
  c.translate(RIDER_X, ROAD_Y);
  c.rotate(-Math.atan(course.gradeAt(state.x) * EXAG));
  c.scale(k, k);
  c.translate(-hub[0] - wheelbase / 2, -hub[1] - wheelR);

  // The painted spokes are faint and never move, so a few turning ones go behind them
  const spin = state.x / 0.35;
  c.strokeStyle = 'rgba(30,30,38,0.55)';
  c.lineWidth = 1.5;
  c.beginPath();
  for (const hx of [hub[0], hub[0] + wheelbase]) {
    for (let i = 0; i < 6; i++) {
      const a = spin + (i * Math.PI) / 6;
      const dx = Math.cos(a) * spokeR;
      const dy = Math.sin(a) * spokeR;
      c.moveTo(hx - dx, hub[1] - dy);
      c.lineTo(hx + dx, hub[1] + dy);
    }
  }
  c.stroke();

  c.imageSmoothingQuality = 'high';
  c.drawImage(riderSheet, frame * w, 0, w, h, 0, 0, w, h);
  c.restore();
}

const GRADE_BARS = ['#ffd84d', '#ffb347', '#ff8a3d', '#ff6a4a', '#ff5a5a'];

// Mountain range behind the title: [peak x, peak y, half-width at the base]
const PEAKS = [[W / 2 - 62, 14, 24], [W / 2 - 26, 6, 32], [W / 2 + 16, 2, 38], [W / 2 + 58, 11, 28]];
const PEAK_BASE = 36;
function drawPeaks(c) {
  for (const [px, top, half] of PEAKS) {
    for (let y = top; y < PEAK_BASE; y++) {
      const w = Math.round(((y - top) / (PEAK_BASE - top)) * half);
      rect(c, px - w - 1, y, 2 * w + 3, 1, NAVY_EDGE);
    }
  }
  for (const [px, top, half] of PEAKS) {
    for (let y = top + 1; y < PEAK_BASE; y++) {
      const w = Math.round(((y - top) / (PEAK_BASE - top)) * half);
      rect(c, px - w, y, 2 * w + 1, 1, '#2f3a5c');
      // Sunlit snow on the right face, ragged along its lower edge
      const snow = Math.round(w * 0.75) - Math.max(0, y - top - 9 - (hash(px + y) % 3)) * 2;
      if (snow > 0) rect(c, px + w - snow + 1, y, snow, 1, '#f6e3b0');
    }
  }
}

const HEART = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];

function drawHud(c, state, course) {
  drawPeaks(c);
  label('MONTENEGRO', W / 2, 44, 28, ['#ffd257', '#f0861a'], 'center', '#1a1208');
  label('GRAVEL', W / 2, 59, 14, '#f6e3b0', 'center', '#1a1208');

  panel(c, 8, 64, W - 16, 42, NAVY_EDGE);
  panel(c, 9, 65, W - 18, 40, NAVY);
  rect(c, 88, 70, 1, 30, '#3a4257');
  rect(c, 192, 70, 1, 30, '#3a4257');

  // Speedometer icon
  ring(c, 20, 76, 5, 1, '#fff', Math.PI, TAU);
  line(c, 20, 76, 23, 73, '#fff');
  label('SPEED', 29, 77, 7, MUTED);
  label((state.v * 3.6).toFixed(1), 15, 96, 16);
  label('km/h', 84, 96, 7, MUTED, 'right');

  HEART.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (row[i] === '1') rect(c, 95 + i, 71 + j, 1, 1, '#ff4d5e');
  });
  rect(c, 96, 72, 1, 1, '#ffb0b8');
  label('STAMINA', 106, 77, 7, MUTED);
  panel(c, 94, 80, 94, 11, '#56607c');
  panel(c, 95, 81, 92, 9, NAVY_EDGE);
  const s = state.stamina / 100;
  const sColor = state.bonked ? '#ff5a5a' : s > 0.5 ? '#5dff7a' : s > 0.25 ? '#ffd84d' : '#ff8a3d';
  rect(c, 96, 82, Math.round(90 * s), 7, sColor);
  rect(c, 96, 82, Math.round(90 * s), 2, 'rgba(255,255,255,0.35)');
  const rpm = Math.round(rawCadence(state) * 60);
  label(`${rpm} rpm  ${Math.round(state.power)} W`, 95, 101, 7, MUTED);
  label(`${Math.round(state.stamina)}%`, 187, 101, 7, '#fff', 'right');

  const grade = course.gradeAt(state.x) * 100;
  const gColor = grade > 6 ? '#ff5a5a' : grade > 2 ? '#ffd84d' : grade < -2 ? '#6fc3ff' : '#fff';
  // Mountain icon
  for (let j = 0; j < 6; j++) {
    rect(c, 203 - j, 71 + j, 2 * j + 1, 1, j < 2 ? '#fff' : MUTED);
    if (j > 1) rect(c, 209 - (j - 2), 71 + j, 2 * (j - 2) + 1, 1, MUTED);
  }
  label('GRADIENT', W - 15, 77, 7, MUTED, 'right');
  label(`${grade.toFixed(0)}%`, W - 15, 96, 14, gColor, 'right');
  // Bar chart icon, more bars lit the steeper it gets
  const lit = Math.max(0, Math.min(5, Math.ceil(grade / 2.5)));
  for (let i = 0; i < 5; i++) {
    rect(c, 198 + i * 4, 95 - i * 2, 3, 3 + i * 2, i < lit ? GRADE_BARS[i] : '#3a4257');
  }

  // Course profile with a position marker, so climbs can be anticipated
  const px = 8;
  const py = 109;
  const pw = W - 16;
  const ph = 24;
  panel(c, px, py, pw, ph, 'rgba(20,26,46,0.85)');
  const span = Math.max(1, course.maxHeight - course.minHeight);
  const profX = (wx) => px + 5 + (wx / course.length) * (pw - 10);
  const profY = (wx) => py + ph - 4 - ((course.heightAt(wx) - course.minHeight) / span) * (ph - 9);
  const N = 60;
  for (let k = 0; k < N; k++) {
    const w0 = (k / N) * course.length;
    const w1 = ((k + 1) / N) * course.length;
    line(c, profX(w0), profY(w0), profX(w1), profY(w1), '#d8b678');
  }
  const wx = Math.min(state.x, course.length);
  disc(c, profX(wx), profY(wx), 2, '#fff');
  label(formatTime(state.time), px + 5, py + 9, 7, '#fff');
  label(`${Math.floor(wx)}/${course.length} m`, px + pw - 5, py + ph - 3, 6, MUTED, 'right');

  let hint = '';
  let hintColor = '#ffd84d';
  if (state.bonked) {
    hint = 'BONKED - EASE OFF AND RECOVER';
    hintColor = '#ff5a5a';
  } else if (!state.started) {
    hint = 'TAP PEDAL TO PUSH OFF';
    hintColor = '#fff';
  } else if (rawCadence(state) > CFG.spinStart + 0.2 && state.gear < CFG.gears) {
    hint = 'SPINNING OUT - SHIFT UP +';
  } else if (rawCadence(state) < CFG.grindBelow * 0.8 && state.gear > 1) {
    hint = 'GRINDING - SHIFT DOWN -';
  }
  if (hint) {
    panel(c, 40, 137, W - 80, 14, 'rgba(20,26,46,0.85)');
    label(hint, W / 2, 147, 7, hintColor, 'center');
  }
}

// Parts of the controls that never change, painted once
let controlsBase = null;
function buildControlsBase() {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d');

  panel(c, 11, 356, 50, 100, NAVY_EDGE);
  panel(c, 12, 357, 48, 98, NAVY);

  const { cx, cy, r } = UI.ring;
  const top = -Math.PI / 2;
  disc(c, cx, cy, r + 7, NAVY_EDGE);
  disc(c, cx, cy, r + 5, NAVY);
  ring(c, cx, cy, r, 9, '#4a5166');
  ring(c, cx, cy, r, 9, '#2f8f45', top - CFG.good * TAU, top + CFG.good * TAU);
  ring(c, cx, cy, r, 9, '#5dff7a', top - CFG.perfect * TAU, top + CFG.perfect * TAU);
  // Gaps that break the track into segments
  for (let k = 0; k < 8; k++) {
    const a = top + ((k + 0.5) * TAU) / 8;
    const ax = Math.cos(a);
    const ay = Math.sin(a);
    line(c, cx + ax * (r - 9), cy + ay * (r - 9), cx + ax * (r + 1), cy + ay * (r + 1), NAVY, 2);
  }

  // Rays over the sweet spot
  for (const k of [-1, 0, 1]) {
    const a = top + k * 0.2;
    const ax = Math.cos(a);
    const ay = Math.sin(a);
    line(c, cx + ax * (r + 8), cy + ay * (r + 8), cx + ax * (r + 11), cy + ay * (r + 11), '#5dff7a', 2);
  }

  panel(c, 66, 459, 116, 14, '#2f8f45');
  panel(c, 67, 460, 114, 12, '#12301c');

  const p = UI.pedal;
  disc(c, p.cx, p.cy, p.r + 1, NAVY_EDGE);
  disc(c, p.cx, p.cy, p.r, '#6e1414');
  disc(c, p.cx, p.cy, p.r - 3, '#d93636');
  disc(c, p.cx, p.cy + 2, p.r - 7, '#c42c2c');
  disc(c, p.cx, p.cy, p.r - 8, '#e04a40');
  ring(c, p.cx, p.cy, p.r - 4, 2, '#ff8f7d', Math.PI * 1.1, Math.PI * 1.9);
  ring(c, p.cx, p.cy, p.r - 4, 1, '#f06a5a');
  return canvas;
}

function drawControls(c, state, pressed) {
  controlsBase ??= buildControlsBase();
  c.drawImage(controlsBase, 0, 0);

  for (const key of ['plus', 'minus']) {
    const b = UI[key];
    const down = pressed[key] > 0;
    panel(c, b.x, b.y, b.w, b.h, '#2a3042');
    panel(c, b.x, b.y, b.w, b.h - 2, down ? '#8a93a8' : '#5a6274');
    rect(c, b.x + 2, b.y + 1, b.w - 4, 1, down ? '#aab2c4' : '#737b8e');
    const mx = b.x + b.w / 2;
    const my = b.y + b.h / 2 - 1;
    rect(c, mx - 6, my - 1, 12, 3, '#fff');
    if (key === 'plus') rect(c, mx - 1, my - 6, 3, 13, '#fff');
  }
  label('GEAR', 36, 402, 8, MUTED, 'center');
  label(`${state.gear}/${CFG.gears}`, 36, 417, 13, '#fff', 'center');

  // Timing ring: the dot is the pedal, and whole crank revolutions put it at the top
  const { cx, cy, r } = UI.ring;
  const a = -Math.PI / 2 + (state.crank % 1) * TAU;
  const ax = Math.cos(a);
  const ay = Math.sin(a);
  // Chainring with a crank arm and pedal pointing at the dot
  for (let k = 0; k < 16; k++) {
    const t = a + (k * TAU) / 16;
    disc(c, cx + Math.cos(t) * 19, cy + Math.sin(t) * 19, 1, '#9a9da4');
  }
  ring(c, cx, cy, 18, 4, '#9a9da4');
  ring(c, cx, cy, 15, 1, '#5d6068');
  for (let k = 0; k < 5; k++) {
    const t = a + ((k + 0.5) * TAU) / 5;
    line(c, cx, cy, cx + Math.cos(t) * 14, cy + Math.sin(t) * 14, '#6d7078', 3);
  }
  line(c, cx, cy, cx + ax * 27, cy + ay * 27, NAVY_EDGE, 7);
  line(c, cx, cy, cx + ax * 27, cy + ay * 27, '#d4d8e0', 5);
  line(c, cx, cy, cx + ax * 25, cy + ay * 25, '#a4a8b2', 2);
  disc(c, cx, cy, 5, NAVY_EDGE);
  disc(c, cx, cy, 4, '#6d7078');
  disc(c, cx, cy, 1, '#d4d8e0');
  disc(c, cx + ax * 27, cy + ay * 27, 2, '#3a3d44');
  disc(c, cx + ax * (r - 4.5), cy + ay * (r - 4.5), 6, NAVY_EDGE);
  disc(c, cx + ax * (r - 4.5), cy + ay * (r - 4.5), 5, state.coasting ? '#7d8599' : '#fff');

  const fb = state.feedback;
  if (fb && fb.age < 0.6) {
    label(fb.text, cx, cy - r - 12 - fb.age * 20, 12, KIND_COLOR[fb.kind], 'center', NAVY_EDGE);
  }
  label('TAP AS THE DOT HITS GREEN', cx, 469, 6.5, '#8dffa3', 'center');

  const p = UI.pedal;
  if (pressed.pedal > 0) disc(c, p.cx, p.cy, p.r - 9, '#ff8a8a');
  // Crank icon
  line(c, p.cx - 9, p.cy - 22, p.cx + 6, p.cy - 8, '#6e1414', 7);
  line(c, p.cx - 9, p.cy - 22, p.cx + 6, p.cy - 8, '#fff', 5);
  disc(c, p.cx + 6, p.cy - 8, 5, '#6e1414');
  disc(c, p.cx + 6, p.cy - 8, 4, '#fff');
  disc(c, p.cx + 6, p.cy - 8, 2, '#d93636');
  disc(c, p.cx - 9, p.cy - 22, 1, '#d93636');
  label('PEDAL', p.cx, p.cy + 18, 14, '#fff', 'center', '#6e1414');
}

function drawFinish(c, state, best) {
  rect(c, 0, 0, W, H, 'rgba(10,14,28,0.8)');
  label('FINISHED', W / 2, 190, 26, '#ffd84d', 'center');
  label(formatTime(state.time), W / 2, 228, 30, '#fff', 'center');
  if (best != null) label(`BEST ${formatTime(best)}`, W / 2, 250, 11, MUTED, 'center');
  label('TAP TO RIDE AGAIN', W / 2, 290, 11, '#5dff7a', 'center');
}

// `c` is the low-res pixel buffer; `out` is the device canvas, already scaled so that
// one unit is one buffer pixel.
export function draw(c, out, state, course, pressed, best) {
  labels.length = 0;
  rect(c, 0, 0, W, H, '#3f7d38');
  const progress = Math.min(1, Math.max(0, state.x / course.length));
  backdrop.draw(c, progress);
  drawRoad(c, state, course, backdrop.at(progress));
  drawRider(c, state, course);
  drawHud(c, state, course);
  drawControls(c, state, pressed);
  if (state.finished) {
    // Only the result is readable over the dimmed screen
    labels.length = 0;
    drawFinish(c, state, best);
  }

  out.imageSmoothingEnabled = false;
  out.drawImage(c.canvas, 0, 0, W, H);
  out.lineJoin = 'round';
  for (const t of labels) {
    out.font = `bold ${t.size}px ${FONT}`;
    out.textAlign = t.align;
    if (t.outline) {
      out.lineWidth = Math.max(1.5, t.size / 5);
      out.strokeStyle = t.outline;
      out.strokeText(t.str, t.x, t.y);
    }
    if (Array.isArray(t.color)) {
      const grad = out.createLinearGradient(0, t.y - t.size * 0.75, 0, t.y);
      grad.addColorStop(0, t.color[0]);
      grad.addColorStop(1, t.color[1]);
      out.fillStyle = grad;
    } else {
      out.fillStyle = t.color;
    }
    out.fillText(t.str, t.x, t.y);
  }
}
