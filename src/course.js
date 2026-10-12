// A course is a list of [length in metres, gradient] segments.
const SEGMENTS = [
  [40, 0],
  [55, 0.04],
  [30, 0],
  [75, 0.08],
  [25, 0.02],
  [50, -0.06],
  [35, 0],
  [65, 0.11],
  [20, 0.03],
  [80, -0.08],
  [45, 0],
];

const SMOOTH = 15; // metres either side used to round off gradient changes

export function buildCourse(segments = SEGMENTS) {
  const length = segments.reduce((sum, [len]) => sum + len, 0);

  const raw = new Float32Array(length + 1);
  let i = 0;
  for (const [len, grade] of segments) {
    for (let k = 0; k < len; k++) raw[i++] = grade;
  }
  raw[length] = 0;

  const grades = new Float32Array(length + 1);
  for (let m = 0; m <= length; m++) {
    let sum = 0;
    for (let k = -SMOOTH; k <= SMOOTH; k++) {
      sum += raw[Math.min(length, Math.max(0, m + k))];
    }
    grades[m] = sum / (2 * SMOOTH + 1);
  }

  const heights = new Float32Array(length + 1);
  for (let m = 1; m <= length; m++) heights[m] = heights[m - 1] + grades[m - 1];

  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (const h of heights) {
    minHeight = Math.min(minHeight, h);
    maxHeight = Math.max(maxHeight, h);
  }

  // Outside the course the road continues flat, so the camera can look past both ends.
  const sample = (arr, x) => {
    if (x <= 0) return arr[0];
    if (x >= length) return arr[length];
    const m = Math.floor(x);
    return arr[m] + (arr[m + 1] - arr[m]) * (x - m);
  };

  return {
    length,
    minHeight,
    maxHeight,
    gradeAt: (x) => (x < 0 || x > length ? 0 : sample(grades, x)),
    heightAt: (x) => sample(heights, x),
  };
}
