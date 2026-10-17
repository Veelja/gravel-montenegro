import { formatTime } from './render.js';

// Supabase project holding the shared leaderboard. The key is the public (publishable/anon)
// one, which is meant to ship in the page: it can only read the board's names and times,
// and save a time through a database function. Leave either blank and the game runs
// without a leaderboard.
const SUPABASE_URL = 'https://kazqbqhzqevdnfdiqzad.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2_yti-wMa9CCIEtAHxyIog_ZCObXobd';

const NAME_KEY = 'gravel-montenegro-name';
const PLAYER_KEY = 'gravel-montenegro-player';
const NAME_MAX = 16;
const TOP = 10;

export const enabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

const panel = document.getElementById('board');
const form = document.getElementById('board-form');
const nameInput = document.getElementById('board-name');
const submitButton = form.querySelector('button');
const status = document.getElementById('board-status');
const list = document.getElementById('board-list');

function load(key) {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable; it just won't be remembered
  }
}

// A random UUID. crypto.randomUUID needs a secure context, which a phone opening the
// game over the LAN doesn't get.
function newId() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// This device's player: the board keeps one row per id, holding that player's best time.
// The id is never readable from the board, so only this device can replace its row.
let player = load(PLAYER_KEY);
if (!player) {
  player = newId();
  save(PLAYER_KEY, player);
}

let runTime = 0; // the run on show
let mine = null; // { name, time } of this player's row on the board, once known
let shown = 0;   // counts show() calls, so a slow reply for an earlier run is dropped

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
    if (!marked && mine && row.name === mine.name && Math.abs(row.time_s - mine.time) < 0.005) {
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
    if (!rows.length && !status.textContent) status.textContent = 'NO TIMES YET - BE THE FIRST';
  } catch {
    if (token === shown) status.textContent = 'LEADERBOARD UNAVAILABLE';
  }
}

// Put this run on the board under `name`. The board only takes it if it beats the player's
// time already there, and answers with their best time and its place either way.
async function submit(name) {
  const token = shown;
  nameInput.disabled = submitButton.disabled = true;
  status.textContent = 'SAVING...';
  let result;
  try {
    const res = await request('rpc/submit_score', {
      method: 'POST',
      body: JSON.stringify({ p_player: player, p_name: name, p_time: Math.round(runTime * 100) / 100 }),
    });
    result = await res.json();
  } catch {
    if (token !== shown) return;
    // The form doubles as a retry button for a player who already has a name
    form.hidden = false;
    nameInput.disabled = submitButton.disabled = false;
    status.textContent = 'COULD NOT SAVE - TRY AGAIN';
    refresh();
    return;
  }
  save(NAME_KEY, name);
  mine = { name, time: result.time_s };
  if (token !== shown) return;
  form.hidden = true;
  status.textContent = `${name} - BEST ${formatTime(result.time_s)} - #${result.rank}`;
  refresh();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = nameInput.value.trim().slice(0, NAME_MAX);
  if (!name || submitButton.disabled) return;
  nameInput.blur();
  submit(name);
});

// Bring the board up for a run that just finished in `time` seconds. The name is asked for
// once; after that every run is sent in under it.
export function show(time) {
  if (!enabled) return;
  shown++;
  runTime = time;
  const name = load(NAME_KEY);
  nameInput.value = name;
  nameInput.readOnly = Boolean(name);
  nameInput.disabled = submitButton.disabled = false;
  form.hidden = Boolean(name);
  status.textContent = '';
  panel.hidden = false;
  if (name) submit(name);
  else refresh();
}

// Bring the board up on its own, without a run to save, for the title screen
export function showTop() {
  if (!enabled) return;
  shown++;
  form.hidden = true;
  status.textContent = '';
  panel.hidden = false;
  refresh();
}

export function hide() {
  shown++;
  panel.hidden = true;
}
