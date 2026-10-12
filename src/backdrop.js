import { rect, disc, hash } from './pix.js';

// Everything behind the road. The course passes through one scene per stage, each a
// full-screen painting in assets/bg. The painting stays put as the distant view, and its
// bottom band is handed to the road renderer, which scrolls it past as the near verge.
// Until a painting has loaded, a code-drawn placeholder stands in.
const SCENES = [
  { image: 'assets/bg/sveti-stefan.webp', from: 0, ground: '#3c6a2c' },
  { image: 'assets/bg/lovcen.webp', from: 0.4, ground: '#3c6a2c' },
  // Night: the road is tinted to match
  { image: 'assets/bg/podgorica.webp', from: 0.77, ground: '#161c30', tint: '#6f78b4' },
];
const FADE = 0.012;  // fraction of the course over which one scene fades into the next
const ZOOM = 1.1;    // paintings are drawn a little oversize, leaving room to pan
const NEAR = 0.36;   // bottom fraction of a painting used as the verge
const NEAR_W = 288;  // verge tile width; mirrored, it divides the road strip exactly
export const BACK_H = 360;
const PLACEHOLDER_W = 540;

function lerpColor(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
}

function bands(c, w, y0, y1, top, bottom, steps) {
  const h = (y1 - y0) / steps;
  for (let i = 0; i < steps; i++) {
    rect(c, 0, y0 + i * h, w, Math.ceil(h), lerpColor(top, bottom, i / (steps - 1)));
  }
}

function house(c, x, y, w, h, seed) {
  const wall = ['#efe3c8', '#e2d2ae', '#f4ecd8'][seed % 3];
  rect(c, x, y, w, h, wall);
  rect(c, x - 1, y - 2, w + 2, 2, '#c8553a');
  rect(c, x, y - 3, w, 1, '#de7250');
  if (w >= 5) rect(c, x + 1 + (seed % 2), y + 2, 1, 2, '#5b4a3a');
  if (w >= 7) rect(c, x + w - 3, y + 2, 1, 2, '#5b4a3a');
}

function cypress(c, x, base, h) {
  for (let i = 0; i < h; i++) {
    const t = i / h;
    const half = Math.max(0, Math.round(Math.sin(Math.min(1, t * 1.3) * Math.PI * 0.55) * (h / 9)));
    rect(c, x - half, base - h + i, half * 2 + 1, 1, '#1f4a2c');
    if (half > 0) rect(c, x - half, base - h + i, 1, 1, '#2f6a3c');
  }
}

function paintPlaceholder(c, w) {
  const horizon = 200;
  bands(c, w, 0, horizon, '#2f7fd6', '#a9daf4', 14);

  for (const [cx, cy, s] of [[70, 40, 9], [240, 70, 7], [410, 34, 10], [500, 96, 6]]) {
    for (const [dx, dy, r] of [[0, 0, s], [s, 2, s * 0.8], [-s, 3, s * 0.7], [s * 2, 5, s * 0.5]]) {
      disc(c, cx + dx, cy + dy + 2, r, '#cfe6f7');
      disc(c, cx + dx, cy + dy, r, '#ffffff');
    }
  }

  // Two mountain ridges
  for (let x = 0; x < w; x++) {
    const far = horizon - 46 - 22 * Math.sin(x * 0.012 + 1) - 12 * Math.sin(x * 0.031);
    rect(c, x, far, 1, horizon - far, '#7f8fc4');
    const near = horizon - 20 - 14 * Math.sin(x * 0.02 + 4) - 7 * Math.sin(x * 0.053 + 2);
    rect(c, x, near, 1, horizon - near, '#5f73ad');
  }

  bands(c, w, horizon, BACK_H, '#4a9be6', '#1c63c4', 12);
  for (let i = 0; i < 260; i++) {
    const r = hash(i * 7 + 3);
    const y = horizon + 4 + (r % (BACK_H - horizon - 70));
    rect(c, (r >>> 8) % w, y, 3 + ((r >>> 20) % 5), 1, y < horizon + 50 ? '#8cc7f5' : '#5fb0f0');
  }

  // Island with a walled old town, joined to the shore by a strip of beach
  const ix = 330;
  const iy = 252;
  for (let x = -70; x <= 70; x++) {
    const t = x / 70;
    const top = iy - 22 * Math.sqrt(1 - t * t) - 3 * Math.sin(x * 0.3);
    rect(c, ix + x, top, 1, iy + 6 - top, '#3f7a3c');
    rect(c, ix + x, iy - 2, 1, 8, '#b9a27c');
    rect(c, ix + x, iy + 5, 1, 2, '#8a7a60');
  }
  for (let i = 0; i < 26; i++) {
    const r = hash(i + 100);
    const hx = ix - 60 + (r % 116);
    const t = (hx - ix) / 70;
    const ground = iy - 4 - 16 * Math.sqrt(1 - t * t) * (((r >>> 8) % 100) / 100);
    house(c, hx, ground - 6, 5 + ((r >>> 16) % 4), 7, r >>> 20);
  }
  for (let x = 120; x < ix - 68; x++) {
    const y = iy + 10 + Math.round(10 * Math.sin((x - 120) * 0.018));
    rect(c, x, y, 1, 4, '#ecd9a6');
  }

  // Mainland shore on the left, with a small town
  for (let x = 0; x < 190; x++) {
    const top = 232 + x * 0.22 + 6 * Math.sin(x * 0.07);
    rect(c, x, top, 1, BACK_H - top, '#4f8f45');
  }
  for (let i = 0; i < 16; i++) {
    const r = hash(i + 300);
    const hx = 6 + (r % 150);
    house(c, hx, 250 + hx * 0.22 + ((r >>> 8) % 14), 6 + ((r >>> 16) % 3), 7, r >>> 20);
  }

  // Hillside the road runs along
  for (let x = 0; x < w; x++) {
    const top = 318 - 8 * Math.sin(x * 0.015 + 2) - 4 * Math.sin(x * 0.06);
    rect(c, x, top, 1, BACK_H - top, '#3f7d38');
  }
  for (let i = 0; i < 70; i++) {
    const r = hash(i + 500);
    const x = r % w;
    const y = 316 + ((r >>> 10) % 40);
    disc(c, x, y, 4 + ((r >>> 16) % 6), (r >>> 20) % 2 ? '#356e30' : '#4c9040');
    if ((r >>> 22) % 3 === 0) rect(c, x, y - 4, 2, 2, (r >>> 25) % 2 ? '#f2d24a' : '#b98be0');
  }
  for (let i = 0; i < 14; i++) {
    const r = hash(i + 900);
    cypress(c, r % w, 326 + ((r >>> 10) % 30), 46 + ((r >>> 16) % 40));
  }
}

function mirrored(tile) {
  const out = document.createElement('canvas');
  out.width = tile.width * 2;
  out.height = tile.height;
  const c = out.getContext('2d');
  c.drawImage(tile, 0, 0);
  c.translate(out.width, 0);
  c.scale(-1, 1);
  c.drawImage(tile, 0, 0);
  return out;
}

function load(scene, w, h) {
  const img = new Image();
  img.onload = () => {
    const far = document.createElement('canvas');
    far.width = Math.round(w * ZOOM);
    far.height = h;
    const fh = (far.width * img.height) / img.width;
    far.getContext('2d').drawImage(img, 0, (h - fh) / 3, far.width, fh);

    const sy = img.height * (1 - NEAR);
    const near = document.createElement('canvas');
    near.width = NEAR_W;
    near.height = Math.round((NEAR_W * (img.height - sy)) / img.width);
    near
      .getContext('2d')
      .drawImage(img, 0, sy, img.width, img.height - sy, 0, 0, near.width, near.height);

    scene.far = far;
    scene.near = mirrored(near);
  };
  img.src = scene.image;
}

// w, h: size of the pixel buffer the backdrop fills
export function createBackdrop(w, h) {
  const tile = document.createElement('canvas');
  tile.width = PLACEHOLDER_W;
  tile.height = BACK_H;
  paintPlaceholder(tile.getContext('2d'), PLACEHOLDER_W);
  const placeholder = mirrored(tile);

  SCENES.forEach((scene, i) => {
    scene.to = i + 1 < SCENES.length ? SCENES[i + 1].from : 1;
    load(scene, w, h);
  });

  // The distant view pans slowly across the painting over the length of its stage
  const paint = (c, scene, progress) => {
    if (!scene.far) {
      c.drawImage(placeholder, 0, 0);
      return;
    }
    const local = Math.min(1, Math.max(0, (progress - scene.from) / (scene.to - scene.from)));
    c.drawImage(scene.far, -Math.round(local * (scene.far.width - w)), 0);
  };

  // Scenes at `progress` (0..1 along the course): the one in view and, while it fades in,
  // the next one with its opacity
  const at = (progress) => {
    let i = 0;
    while (i + 1 < SCENES.length && progress >= SCENES[i + 1].from - FADE / 2) i++;
    const t = i > 0 ? (progress - SCENES[i].from) / FADE + 0.5 : 1;
    return t < 1 ? { base: SCENES[i - 1], over: SCENES[i], t } : { base: SCENES[i], over: null, t: 0 };
  };

  return {
    at,
    draw(c, progress) {
      const { base, over, t } = at(progress);
      paint(c, base, progress);
      if (over) {
        c.globalAlpha = t;
        paint(c, over, progress);
        c.globalAlpha = 1;
      }
    },
  };
}
