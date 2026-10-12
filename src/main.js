import { buildCourse } from './course.js';
import { createState, step, pedal, shift } from './sim.js';
import { draw, W, H, UI } from './render.js';

const BEST_KEY = 'gravel-montenegro-best';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
// The game is drawn into a small pixel buffer, then scaled up without smoothing
const buffer = document.createElement('canvas');
buffer.width = W;
buffer.height = H;
const pixels = buffer.getContext('2d');
const course = buildCourse();

let state = createState();
let finishedAt = 0;
let best = loadBest();
const pressed = { pedal: 0, minus: 0, plus: 0 }; // seconds of button highlight left

function loadBest() {
  try {
    const v = parseFloat(localStorage.getItem(BEST_KEY));
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

function saveBest(time) {
  if (best != null && best <= time) return;
  best = time;
  try {
    localStorage.setItem(BEST_KEY, String(time));
  } catch {
    // storage unavailable; best time just won't persist
  }
}

function resize() {
  const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
  canvas.width = Math.round(W * scale * dpr);
  canvas.height = Math.round(H * scale * dpr);
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
}

let audio = null;
function beep(freq, duration, type = 'square', volume = 0.06) {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + duration);
  } catch {
    // no audio available
  }
}

function doPedal() {
  pressed.pedal = 0.1;
  const kind = pedal(state);
  if (kind === 'perfect') beep(880, 0.08);
  else if (kind === 'good') beep(660, 0.08);
  else if (kind === 'weak') beep(330, 0.08);
  else beep(150, 0.12, 'sawtooth');
}

function doShift(delta) {
  pressed[delta < 0 ? 'minus' : 'plus'] = 0.1;
  const changed = shift(state, delta);
  if (changed) beep(delta < 0 ? 300 : 420, 0.04, 'triangle');
  return changed;
}

function restart() {
  state = createState();
}

// Ignore input briefly after finishing so a late pedal tap doesn't skip the result
function canRestart() {
  return state.finished && performance.now() - finishedAt > 800;
}

function inRect(b, x, y, pad) {
  return x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;
}

// Pointer position in buffer pixels
function locate(e) {
  const rect = canvas.getBoundingClientRect();
  return [((e.clientX - rect.left) / rect.width) * W, ((e.clientY - rect.top) / rect.height) * H];
}

// The gear slider is relative: dragging from anywhere on it shifts one gear per GEAR_STEP
// buffer pixels (up is harder), so it can be worked without looking. The step matches the
// spacing of the slider's points, so the knob keeps pace with the finger. A touch that
// never drags that far is a tap, shifting one gear up or down by which half it landed on.
const GEAR_STEP = UI.gear.step;
let gearDrag = null; // { id, y0, shifted: gears moved so far, dragged }

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (state.finished) {
    if (canRestart()) restart();
    return;
  }
  const [x, y] = locate(e);
  if (inRect(UI.gear, x, y, 8)) {
    gearDrag = { id: e.pointerId, y0: y, shifted: 0, dragged: false };
    try {
      // Keep following the finger when it slides off the slider
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // pointer already gone; the drag just ends where it left the canvas
    }
  } else if (Math.hypot(x - UI.pedal.cx, y - UI.pedal.cy) <= UI.pedal.r + 16) doPedal();
});

canvas.addEventListener('pointermove', (e) => {
  if (!gearDrag || e.pointerId !== gearDrag.id || state.finished) return;
  const y = locate(e)[1];
  // Whole steps travelled since the last shift, so it takes a full step either way
  const want = gearDrag.shifted + Math.trunc((gearDrag.y0 - y) / GEAR_STEP - gearDrag.shifted);
  while (gearDrag.shifted !== want) {
    const delta = Math.sign(want - gearDrag.shifted);
    gearDrag.dragged = true;
    if (!doShift(delta)) {
      // Out of gears: re-anchor here so turning back shifts straight away
      gearDrag.y0 = y + gearDrag.shifted * GEAR_STEP;
      break;
    }
    gearDrag.shifted += delta;
  }
});

function endGearDrag(e) {
  if (!gearDrag || e.pointerId !== gearDrag.id) return;
  if (e.type === 'pointerup' && !gearDrag.dragged && !state.finished) {
    doShift(gearDrag.y0 < UI.gear.y + UI.gear.h / 2 ? 1 : -1);
  }
  gearDrag = null;
}
canvas.addEventListener('pointerup', endGearDrag);
canvas.addEventListener('pointercancel', endGearDrag);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const isPedal = e.code === 'Space' || e.code === 'Enter';
  const isUp = e.code === 'ArrowUp' || e.code === 'KeyW';
  const isDown = e.code === 'ArrowDown' || e.code === 'KeyS';
  if (!isPedal && !isUp && !isDown && e.code !== 'KeyR') return;
  e.preventDefault();
  if (e.code === 'KeyR') restart();
  else if (state.finished) {
    if (isPedal && canRestart()) restart();
  } else if (isPedal) doPedal();
  else doShift(isUp ? 1 : -1);
});

window.addEventListener('resize', resize);
resize();

// Console access for tuning, e.g. __game.state.x = 400
window.__game = {
  get state() {
    return state;
  },
  course,
};

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const wasFinished = state.finished;
  step(state, course, dt);
  if (state.finished && !wasFinished) {
    finishedAt = now;
    saveBest(state.time);
    beep(990, 0.4, 'triangle');
  }
  for (const key in pressed) pressed[key] = Math.max(0, pressed[key] - dt);

  draw(pixels, ctx, state, course, pressed, best);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
