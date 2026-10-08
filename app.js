'use strict';

/* =====================================================================
   Habits — a local-only habit tracker.
   All data lives in localStorage on the device under STORAGE_KEY.

   Data shape:
   {
     habits:    [{ id, name, color, days: [0..6], createdAt: 'YYYY-MM-DD' }],
                // days use JS numbering: 0 = Sunday ... 6 = Saturday
     overrides: { 'YYYY-MM-DD': { [habitId]: true | false } },
                // per-date exceptions to the weekly schedule
     log:       { 'YYYY-MM-DD': [habitId, ...] }   // completed habits
   }
   ===================================================================== */

const STORAGE_KEY = 'habits-app-v1';

// How fast the consistency score reacts. Higher = moves faster on each day.
const SCORE_SPEED = 0.12;
// Score a brand-new habit starts at (0..1). 0.5 = neutral yellow.
const SCORE_START = 0.5;

const COLORS = ['#4caf7a', '#4f8ef7', '#f2a33a', '#c86dd7', '#e05656', '#3fc1c9', '#e8d44d'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday-first display
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* ---------------- Storage ---------------- */

function emptyState() {
  return { habits: [], overrides: {}, log: {} };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    return { ...emptyState(), ...JSON.parse(raw) };
  } catch {
    return emptyState();
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    document.getElementById('storage-warning').classList.remove('hidden');
  }
}

let state = load();

/* ---------------- Date helpers (local time) ---------------- */

const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOf = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const todayKey = () => keyOf(new Date());

/* ---------------- Core logic ---------------- */

function isScheduled(habit, key) {
  const o = state.overrides[key];
  if (o && habit.id in o) return o[habit.id];
  return key >= habit.createdAt && habit.days.includes(dateOf(key).getDay());
}

function isDone(habit, key) {
  return (state.log[key] || []).includes(habit.id);
}

function setDone(habit, key, done) {
  const list = new Set(state.log[key] || []);
  done ? list.add(habit.id) : list.delete(habit.id);
  if (list.size) state.log[key] = [...list]; else delete state.log[key];
}

function setScheduled(habit, key, on) {
  const o = { ...(state.overrides[key] || {}) };
  const byDefault = key >= habit.createdAt && habit.days.includes(dateOf(key).getDay());
  if (on === byDefault) delete o[habit.id]; else o[habit.id] = on;
  if (Object.keys(o).length) state.overrides[key] = o; else delete state.overrides[key];
  if (!on) setDone(habit, key, false);
}

/** Earliest date that could matter for this habit. */
function startKey(habit) {
  let start = habit.createdAt;
  for (const k of Object.keys(state.overrides)) {
    if (k < start && state.overrides[k][habit.id] === true) start = k;
  }
  return start;
}

/**
 * Consistency score in [0, 1], an exponential moving average over the
 * habit's scheduled days: each scheduled day pulls the score toward 1
 * (done) or 0 (missed). Today only counts once it's done, so you aren't
 * punished before the day is over.
 */
function habitStats(habit) {
  const today = todayKey();
  const monthAgo = keyOf(addDays(new Date(), -29));
  let score = SCORE_START, streak = 0, done30 = 0, sched30 = 0;

  for (let d = dateOf(startKey(habit)); keyOf(d) <= today; d = addDays(d, 1)) {
    const k = keyOf(d);
    if (!isScheduled(habit, k)) continue;
    const done = isDone(habit, k);
    if (k === today && !done) continue;
    score += SCORE_SPEED * ((done ? 1 : 0) - score);
    streak = done ? streak + 1 : 0;
    if (k >= monthAgo) { sched30++; if (done) done30++; }
  }
  return { score, streak, done30, sched30 };
}

function overallScore() {
  if (!state.habits.length) return null;
  const sum = state.habits.reduce((acc, h) => acc + habitStats(h).score, 0);
  return sum / state.habits.length;
}

/** Red (0) → yellow (0.5) → green (1). */
function scoreColor(s) {
  return `hsl(${Math.round(s * 120)}, 65%, 48%)`;
}

/* ---------------- DOM helpers ---------------- */

const $ = sel => document.querySelector(sel);

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'style') Object.assign(node.style, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

function bar(score, thin = false) {
  const fill = el('div', { class: 'bar-fill' });
  fill.style.width = `${Math.round(score * 100)}%`;
  fill.style.backgroundColor = scoreColor(score);
  return el('div', { class: thin ? 'bar thin' : 'bar' }, fill);
}

function checkButton(on, onClick, disabled = false) {
  const b = el('button', { class: on ? 'check on' : 'check', 'aria-label': 'Done', onclick: onClick }, on ? '✓' : '');
  b.disabled = disabled;
  return b;
}

function dayPicker(container, selected) {
  container.innerHTML = '';
  for (const d of WEEK_ORDER) {
    const chip = el('button', { type: 'button', class: selected.has(d) ? 'day-chip on' : 'day-chip' }, DAY_SHORT[d][0]);
    chip.title = DAY_SHORT[d];
    chip.onclick = () => {
      selected.has(d) ? selected.delete(d) : selected.add(d);
      chip.classList.toggle('on');
    };
    container.append(chip);
  }
}

function colorPicker(container, current, onPick) {
  container.innerHTML = '';
  for (const c of COLORS) {
    const sw = el('button', { type: 'button', class: c === current ? 'swatch on' : 'swatch', 'aria-label': c });
    sw.style.background = c;
    sw.onclick = () => {
      container.querySelectorAll('.swatch').forEach(s => s.classList.remove('on'));
      sw.classList.add('on');
      onPick(c);
    };
    container.append(sw);
  }
}

function describeDays(days) {
  if (days.length === 7) return 'Every day';
  if (!days.length) return 'Only on days you pick in the calendar';
  return WEEK_ORDER.filter(d => days.includes(d)).map(d => DAY_SHORT[d]).join(', ');
}

/* ---------------- Rendering ---------------- */

function renderHeader() {
  const s = overallScore();
  const fill = $('#overall-fill');
  if (s == null) {
    fill.style.width = '0';
    $('#overall-pct').textContent = '–';
    $('#overall-label').textContent = 'Add a habit to start tracking';
    return;
  }
  fill.style.width = `${Math.round(s * 100)}%`;
  fill.style.backgroundColor = scoreColor(s);
  $('#overall-pct').textContent = `${Math.round(s * 100)}%`;
  $('#overall-pct').style.color = scoreColor(s);
  $('#overall-label').textContent =
    s >= 0.8 ? 'Very consistent, keep going' :
    s >= 0.6 ? 'Mostly on track' :
    s >= 0.4 ? 'Holding steady. A few more check-ins will help' :
    'Falling behind. Pick one habit and do it today';
}

function renderToday() {
  const key = todayKey();
  $('#today-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const list = $('#today-list');
  list.innerHTML = '';
  const todays = state.habits.filter(h => isScheduled(h, key));
  $('#today-empty').classList.toggle('hidden', todays.length > 0);

  for (const h of todays) {
    const done = isDone(h, key);
    const st = habitStats(h);
    list.append(el('li', { class: done ? 'habit done' : 'habit' },
      el('span', { class: 'dot', style: { background: h.color } }),
      el('div', { class: 'info' },
        el('div', { class: 'name' }, h.name),
        el('div', { class: 'meta' }, st.streak ? `🔥 ${st.streak} in a row` : 'No streak yet'),
        bar(st.score, true)),
      checkButton(done, () => { setDone(h, key, !done); commit(); })));
  }
}

let calCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

function renderCalendar() {
  $('#cal-title').textContent = calCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const grid = $('#cal-grid');
  grid.innerHTML = '';
  const today = todayKey();
  const offset = (calCursor.getDay() + 6) % 7; // Monday-first
  let d = addDays(calCursor, -offset);

  for (let i = 0; i < 42; i++, d = addDays(d, 1)) {
    const k = keyOf(d);
    const scheduled = state.habits.filter(h => isScheduled(h, k));
    const dots = el('div', { class: 'cal-dots' });
    let doneCount = 0;
    for (const h of scheduled) {
      const done = isDone(h, k);
      if (done) doneCount++;
      const dot = el('i', { class: !done && k < today ? 'missed' : '' });
      dot.style.borderColor = h.color;
      if (done) dot.style.background = h.color;
      dots.append(dot);
    }
    const cell = el('div', {
      class: ['cal-day', d.getMonth() !== calCursor.getMonth() && 'other', k === today && 'today'].filter(Boolean).join(' '),
      onclick: () => openDay(k),
    }, el('span', { class: 'num' }, d.getDate()), dots);

    if (scheduled.length && k <= today) {
      const ratio = doneCount / scheduled.length;
      cell.append(el('div', { class: 'day-bar', style: { background: scoreColor(ratio), width: `${Math.max(ratio, 0.08) * 100}%` } }));
    }
    grid.append(cell);
  }

  const legend = $('#cal-legend');
  legend.innerHTML = '';
  for (const h of state.habits) {
    legend.append(el('span', {}, el('span', { class: 'dot', style: { background: h.color } }), h.name));
  }
}

function renderHabits() {
  const list = $('#habit-list');
  list.innerHTML = '';
  $('#habits-empty').classList.toggle('hidden', state.habits.length > 0);

  for (const h of state.habits) {
    const st = habitStats(h);
    const pct = Math.round(st.score * 100);
    list.append(el('li', { class: 'habit', onclick: () => openEdit(h) },
      el('span', { class: 'dot', style: { background: h.color } }),
      el('div', { class: 'info' },
        el('div', { class: 'name' }, h.name),
        el('div', { class: 'meta' },
          `${describeDays(h.days)} · ${pct}% · last 30 days: ${st.done30}/${st.sched30}`),
        bar(st.score, true))));
  }
}

const VIEW_TITLES = { today: 'Today', calendar: 'Calendar', habits: 'Habits' };
let currentView = 'today';

function renderAll() {
  renderHeader();
  if (currentView === 'today') renderToday();
  if (currentView === 'calendar') renderCalendar();
  if (currentView === 'habits') renderHabits();
}

function commit() {
  save();
  renderAll();
}

/* ---------------- Day dialog ---------------- */

let openDayKey = null;

function openDay(key) {
  openDayKey = key;
  renderDayDialog();
  $('#day-dialog').showModal();
}

function renderDayDialog() {
  const key = openDayKey;
  const isFuture = key > todayKey();
  $('#day-title').textContent = dateOf(key).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const list = $('#day-list');
  list.innerHTML = '';
  if (!state.habits.length) {
    list.append(el('li', { class: 'empty' }, 'No habits yet.'));
    return;
  }
  for (const h of state.habits) {
    const sched = isScheduled(h, key);
    const done = isDone(h, key);
    const sw = el('button', { class: sched ? 'switch on' : 'switch', 'aria-label': 'Applies to this day' });
    sw.onclick = () => { setScheduled(h, key, !sched); commit(); renderDayDialog(); };
    const chk = checkButton(done, () => { setDone(h, key, !done); commit(); renderDayDialog(); }, !sched || isFuture);
    list.append(el('li', { class: done ? 'habit done' : 'habit' },
      sw,
      el('span', { class: 'dot', style: { background: h.color } }),
      el('div', { class: 'info' }, el('div', { class: 'name' }, h.name)),
      chk));
  }
}

/* ---------------- Edit dialog ---------------- */

let editing = null, editDays = null, editColor = null;

function openEdit(habit) {
  editing = habit;
  editDays = new Set(habit.days);
  editColor = habit.color;
  $('#edit-name').value = habit.name;
  dayPicker($('#edit-days'), editDays);
  colorPicker($('#edit-colors'), editColor, c => editColor = c);
  $('#edit-dialog').showModal();
}

$('#edit-save').onclick = () => {
  const name = $('#edit-name').value.trim();
  if (!name) return;
  editing.name = name;
  editing.days = [...editDays];
  editing.color = editColor;
  $('#edit-dialog').close();
  commit();
};

$('#edit-delete').onclick = () => {
  if (!confirm(`Delete "${editing.name}" and all its history?`)) return;
  const id = editing.id;
  state.habits = state.habits.filter(h => h.id !== id);
  for (const k of Object.keys(state.log)) {
    state.log[k] = state.log[k].filter(x => x !== id);
    if (!state.log[k].length) delete state.log[k];
  }
  for (const k of Object.keys(state.overrides)) {
    delete state.overrides[k][id];
    if (!Object.keys(state.overrides[k]).length) delete state.overrides[k];
  }
  $('#edit-dialog').close();
  commit();
};

document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
// Tap outside a dialog to close it
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

/* ---------------- Add form ---------------- */

let newDays = new Set(WEEK_ORDER);
let newColor = COLORS[0];

function resetAddForm() {
  $('#add-name').value = '';
  newDays = new Set(WEEK_ORDER);
  newColor = COLORS[state.habits.length % COLORS.length];
  dayPicker($('#add-days'), newDays);
  colorPicker($('#add-colors'), newColor, c => newColor = c);
}

$('#add-form').onsubmit = e => {
  e.preventDefault();
  const name = $('#add-name').value.trim();
  if (!name) return;
  state.habits.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    color: newColor,
    days: [...newDays],
    createdAt: todayKey(),
  });
  commit();
  resetAddForm();
};

/* ---------------- Tabs & calendar nav ---------------- */

document.querySelectorAll('.tab').forEach(tab => tab.onclick = () => {
  currentView = tab.dataset.view;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${currentView}`));
  $('#view-title').textContent = VIEW_TITLES[currentView];
  renderAll();
});

$('#cal-prev').onclick = () => { calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1); renderCalendar(); };
$('#cal-next').onclick = () => { calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1); renderCalendar(); };

/* ---------------- Backup ---------------- */

$('#export-btn').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `habits-backup-${todayKey()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
};

$('#import-file').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.habits)) throw new Error('missing habits');
    if (!confirm('Replace all current data with this backup?')) return;
    state = { ...emptyState(), ...data };
    commit();
    resetAddForm();
  } catch (err) {
    alert('That file is not a valid backup: ' + err.message);
  }
};

/* ---------------- Start ---------------- */

// Re-render when returning to the app (e.g. the next day)
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderAll(); });

resetAddForm();
renderAll();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js');
}
