// Pixel-exact drawing helpers. Canvas paths are anti-aliased, which smears when the
// low-res buffer is scaled up, so everything here is built from whole-pixel rects.

export function rect(c, x, y, w, h, color) {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

// Rectangle with 2px rounded corners
export function panel(c, x, y, w, h, color) {
  c.fillStyle = color;
  c.fillRect(x + 2, y, w - 4, h);
  c.fillRect(x, y + 2, w, h - 4);
  c.fillRect(x + 1, y + 1, w - 2, h - 2);
}

export function disc(c, cx, cy, r, color) {
  cx = Math.round(cx);
  cy = Math.round(cy);
  c.fillStyle = color;
  const rr = (r + 0.5) * (r + 0.5);
  const R = Math.floor(r);
  for (let dy = -R; dy <= R; dy++) {
    const w = Math.floor(Math.sqrt(rr - dy * dy));
    c.fillRect(cx - w, cy + dy, 2 * w + 1, 1);
  }
}

const TAU = Math.PI * 2;

// Ring of thickness t with outer radius r; a0..a1 (radians, clockwise from +x) limits it to an arc
export function ring(c, cx, cy, r, t, color, a0, a1) {
  cx = Math.round(cx);
  cy = Math.round(cy);
  c.fillStyle = color;
  const outer = (r + 0.5) * (r + 0.5);
  const inner = (r - t + 0.5) * (r - t + 0.5);
  const R = Math.ceil(r);
  for (let dy = -R; dy <= R; dy++) {
    // Collect each row into runs, so a ring costs a few rects per row instead of one per pixel
    let run = 0;
    for (let dx = -R; dx <= R + 1; dx++) {
      const d = dx * dx + dy * dy;
      let inside = dx <= R && d <= outer && d > inner;
      if (inside && a0 !== undefined) {
        const rel = (((Math.atan2(dy, dx) - a0) % TAU) + TAU) % TAU;
        inside = rel <= a1 - a0;
      }
      if (inside) {
        run++;
      } else if (run) {
        c.fillRect(cx + dx - run, cy + dy, run, 1);
        run = 0;
      }
    }
  }
}

// Line of thickness t (round brush)
export function line(c, x0, y0, x1, y1, color, t = 1) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const r = (t - 1) / 2;
  c.fillStyle = color;
  for (;;) {
    if (t <= 1) c.fillRect(x0, y0, 1, 1);
    else if (t === 2) c.fillRect(x0, y0, 2, 2);
    else disc(c, x0, y0, r, color);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

// Stable pseudo-random integer for a world position, so scenery doesn't shimmer as it scrolls
export function hash(n) {
  n = Math.imul(n ^ (n >>> 15), 2246822519);
  n ^= n >>> 13;
  n = Math.imul(n, 3266489917);
  return (n ^ (n >>> 16)) >>> 0;
}

export function mod(a, m) {
  return ((a % m) + m) % m;
}
