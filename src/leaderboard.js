import { formatTime } from './render.js';

// Supabase project holding the shared leaderboard. The key is the public (publishable/anon)
// one, which is meant to ship in the page: row-level security only lets it read scores and
// add new ones. Leave either blank and the game runs without a leaderboard.
const SUPABASE_URL = 'https://kazqbqhzqevdnfdiqzad.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2_yti-wMa9CCIEtAHxyIog_ZCObXobd';

const NAME_KEY = 'gravel-montenegro-name';
const NAME_MAX = 16;
const TOP = 10;

export const enabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

const panel = document.getElementById('board');
const form = document.getElementById('board-form');
const nameInput = document.getElementById('board-name');
const submitButton = form.querySelector('button');
const status = document.getElementById('board-status');
const list = document.getElementById('board-list');

let runTime = 0;      // the run on show
let submitted = null; // { name, time } once this run is on the board
let shown = 0;        // counts show() calls, so a slow reply for an earlier run is dropped

async function request(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) throw new Error(`leaderboard ${res.status}`);
  return res;
}

async function fetchTop() {
  const res = await request(`scores?select=name,time_s&order=time_s.asc,created_at.asc&limit=${TOP}`);
  return res.json();
}

function loadName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(name) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // storage unavailable; the name just won't be remembered
  }
}

function renderList(rows) {
  list.replaceChildren();
  let marked = false;
  for (const row of rows) {
    const item = document.createElement('li');
    const name = document.createElement('span');
    const time = document.createElement('span');
    name.textContent = row.name;
    time.textContent = formatTime(row.time_s);
    item.append(name, time);
    // The stored time is single precision, so it only matches to within rounding
    if (!marked && submitted && row.name === submitted.name && Math.abs(row.time_s - submitted.time) < 0.005) {
      item.className = 'mine';
      marked = true;
    }
    list.append(item);
  }
}

async function refresh() {
  const token = shown;
  try {
    const rows = await fetchTop();
    if (token !== shown) return;
    renderList(rows);
    if (!rows.length) status.textContent = 'NO TIMES YET - BE THE FIRST';
  } catch {
    if (token === shown) status.textContent = 'LEADERBOARD UNAVAILABLE';
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim().slice(0, NAME_MAX);
  if (!name || submitted) return;
  const token = shown;
  const time = Math.round(runTime * 100) / 100;
  nameInput.blur();
  nameInput.disabled = submitButton.disabled = true;
  status.textContent = 'SAVING...';
  try {
    await request('scores', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ name, time_s: time }),
    });
  } catch {
    if (token !== shown) return;
    nameInput.disabled = submitButton.disabled = false;
    status.textContent = 'COULD NOT SAVE - TRY AGAIN';
    return;
  }
  saveName(name);
  if (token !== shown) return;
  submitted = { name, time };
  status.textContent = 'SAVED';
  refresh();
});

// Bring the board up for a run that just finished in `time` seconds
export function show(time) {
  if (!enabled) return;
  shown++;
  runTime = time;
  submitted = null;
  nameInput.value = loadName();
  nameInput.disabled = submitButton.disabled = false;
  status.textContent = '';
  panel.hidden = false;
  refresh();
}

export function hide() {
  shown++;
  panel.hidden = true;
}
