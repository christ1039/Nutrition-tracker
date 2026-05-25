/* =====================================================================
   DESTINY FUEL — Application Logic
   ---------------------------------------------------------------------
   All data is stored in localStorage under the key "destinyFuelData".
   No backend, no auth, no external APIs.
   ===================================================================== */

'use strict';

/* ---------------------------------------------------------------------
   Constants
   --------------------------------------------------------------------- */
const STORAGE_KEY = 'destinyFuelData';

const MEAL_TAGS = [
  'High Protein',
  'Balanced',
  'Low Carb',
  'High Carb',
  'Meal Prep',
  'Snack',
  'Treat Meal',
  'Plant Based',
  'Quick Meal'
];

/* ---------------------------------------------------------------------
   Default empty data shape
   --------------------------------------------------------------------- */
function emptyData() {
  return {
    profile: {
      name: '',
      photo: '',
      currentWeight: '',
      goalWeight: '',
      goalType: '',
      calorieTarget: '',
      proteinTarget: '',
      carbTarget: '',
      fatTarget: '',
      waterTarget: '',
      mealsTarget: ''
    },
    dailyLogs: {}
  };
}

/* ---------------------------------------------------------------------
   In-memory state mirrors localStorage.
   --------------------------------------------------------------------- */
let state = emptyData();

/* In-memory tag selection for the "Add meal" form */
let pendingMealTags = new Set();

/* In-memory tag selection for the "Edit meal" form */
let editingMealTags = new Set();

/* ---------------------------------------------------------------------
   Date helpers
   --------------------------------------------------------------------- */
function getTodayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getLastNDates(n) {
  const dates = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d);
  }
  return dates;
}

/* ---------------------------------------------------------------------
   Storage helpers
   --------------------------------------------------------------------- */
function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      state = emptyData();
      return state;
    }
    const parsed = JSON.parse(raw);
    // Merge with empty data shape to ensure all keys exist
    state = {
      profile: { ...emptyData().profile, ...(parsed.profile || {}) },
      dailyLogs: parsed.dailyLogs || {}
    };
    return state;
  } catch (e) {
    console.warn('Failed to load data, resetting.', e);
    state = emptyData();
    return state;
  }
}

function saveProfile() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save data', e);
    showToast('Could not save — storage full?');
  }
}

function loadDailyData(dateKey) {
  if (!state.dailyLogs[dateKey]) {
    state.dailyLogs[dateKey] = { meals: [], water: 0 };
  }
  return state.dailyLogs[dateKey];
}

function saveDailyData() {
  saveProfile();
}

function hasCompletedOnboarding() {
  const p = state.profile;
  return (
    p.name &&
    Number(p.currentWeight) > 0 &&
    Number(p.goalWeight) > 0 &&
    p.goalType &&
    Number(p.calorieTarget) > 0 &&
    Number(p.proteinTarget) > 0 &&
    Number(p.waterTarget) > 0 &&
    Number(p.mealsTarget) > 0
  );
}

/* ---------------------------------------------------------------------
   Math helpers
   --------------------------------------------------------------------- */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safePct(current, target) {
  if (!target || target <= 0) return 0;
  return clamp((current / target) * 100, 0, 999);
}

function round(n, decimals = 0) {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

/* ---------------------------------------------------------------------
   Logo fallback (called from inline onerror)
   --------------------------------------------------------------------- */
function handleLogoError(imgEl) {
  imgEl.classList.add('hidden');
  // Find sibling fallback in same parent
  const parent = imgEl.parentElement;
  if (!parent) return;
  const fallback = parent.querySelector('.brand-fallback');
  if (fallback) fallback.classList.remove('hidden');
}
window.handleLogoError = handleLogoError;

/* ---------------------------------------------------------------------
   Totals — sum of all meals for given day
   --------------------------------------------------------------------- */
function calculateTotals(dateKey) {
  const day = loadDailyData(dateKey);
  let calories = 0, protein = 0, carbs = 0, fats = 0;
  for (const m of day.meals) {
    calories += Number(m.calories) || 0;
    protein  += Number(m.protein)  || 0;
    carbs    += Number(m.carbs)    || 0;
    fats     += Number(m.fats)     || 0;
  }
  return {
    calories: round(calories),
    protein: round(protein, 1),
    carbs: round(carbs, 1),
    fats: round(fats, 1),
    water: day.water || 0,
    mealsLogged: day.meals.length
  };
}

/* ---------------------------------------------------------------------
   Destiny Score — out of 100
   Breakdown:
     Calories  25
     Protein   25
     Water     20
     Meals     15
     Macro Bal 15
   --------------------------------------------------------------------- */
function calculateDestinyScore(dateKey) {
  const p = state.profile;
  const t = calculateTotals(dateKey);

  // Calories: full 25 if 80-110% of target, partial otherwise
  let calScore = 0;
  if (Number(p.calorieTarget) > 0) {
    const pct = t.calories / Number(p.calorieTarget);
    if (pct >= 0.8 && pct <= 1.1) {
      calScore = 25;
    } else if (pct < 0.8) {
      // Linear ramp 0..1 over 0..0.8
      calScore = clamp((pct / 0.8) * 25, 0, 25);
    } else {
      // Over 110% — taper down. At 150%+ go to 0.
      const overage = pct - 1.1; // 0..inf
      calScore = clamp(25 - (overage / 0.4) * 25, 0, 25);
    }
  }

  // Protein: % of target capped at 25
  let proteinScore = 0;
  if (Number(p.proteinTarget) > 0) {
    proteinScore = clamp((t.protein / Number(p.proteinTarget)) * 25, 0, 25);
  }

  // Water: % of target capped at 20
  let waterScore = 0;
  if (Number(p.waterTarget) > 0) {
    waterScore = clamp((t.water / Number(p.waterTarget)) * 20, 0, 20);
  }

  // Meals: % of preferred meals capped at 15
  let mealsScore = 0;
  if (Number(p.mealsTarget) > 0) {
    mealsScore = clamp((t.mealsLogged / Number(p.mealsTarget)) * 15, 0, 15);
  }

  // Macro balance — simple, functional. Awards up to 5 per macro for progress
  // toward target, scaled to 15 total. Carbs/Fats targets may be 0; in which
  // case that macro is considered satisfied (full points share).
  let macroScore = 0;
  const macroSubScores = [];
  [['protein', p.proteinTarget], ['carbs', p.carbTarget], ['fats', p.fatTarget]].forEach(([key, tgt]) => {
    const target = Number(tgt) || 0;
    const value  = Number(t[key]) || 0;
    if (target <= 0) {
      // No target -> auto full share if any food logged at all
      macroSubScores.push(t.mealsLogged > 0 ? 1 : 0);
    } else {
      macroSubScores.push(clamp(value / target, 0, 1));
    }
  });
  macroScore = (macroSubScores.reduce((a, b) => a + b, 0) / 3) * 15;
  macroScore = clamp(macroScore, 0, 15);

  const total = clamp(Math.round(calScore + proteinScore + waterScore + mealsScore + macroScore), 0, 100);
  return total;
}

function scoreMessage(score) {
  if (score >= 90) return "You're locked in today.";
  if (score >= 75) return "Strong day. Keep the momentum going.";
  if (score >= 50) return "You're building consistency. Focus on the next meal.";
  return "Start simple. Log your next meal and get back on track.";
}

/* ---------------------------------------------------------------------
   Today's Focus
   --------------------------------------------------------------------- */
function calculateTodayFocus(dateKey) {
  const p = state.profile;
  const t = calculateTotals(dateKey);

  if (t.mealsLogged === 0) {
    return 'Start by logging your first meal.';
  }
  const proteinPct = Number(p.proteinTarget) > 0 ? t.protein / Number(p.proteinTarget) : 1;
  if (proteinPct < 0.5) {
    return 'Focus on adding protein to your next meal.';
  }
  const waterPct = Number(p.waterTarget) > 0 ? t.water / Number(p.waterTarget) : 1;
  if (waterPct < 0.5) {
    return 'Focus on hydration today.';
  }
  if (t.mealsLogged < Number(p.mealsTarget)) {
    return 'Add your next balanced meal when ready.';
  }
  const caloriePct = Number(p.calorieTarget) > 0 ? t.calories / Number(p.calorieTarget) : 0;
  if (caloriePct >= 0.7 && proteinPct >= 0.7) {
    return 'Stay consistent and finish the day strong.';
  }
  return 'Keep going — every choice adds up.';
}

/* ---------------------------------------------------------------------
   Streak — number of consecutive recent days (ending today or yesterday)
   that had at least 1 meal logged.
   --------------------------------------------------------------------- */
function calculateStreak() {
  let count = 0;
  const today = new Date();
  // Allow streak to roll if today has no activity yet but yesterday did
  const todayKey = getDateKey(today);
  const todayData = state.dailyLogs[todayKey];
  const todayActive = todayData && (todayData.meals.length > 0 || todayData.water > 0);

  const startOffset = todayActive ? 0 : 1;

  for (let i = startOffset; i < 365; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = getDateKey(d);
    const log = state.dailyLogs[key];
    if (log && (log.meals.length > 0 || log.water > 0)) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/* ---------------------------------------------------------------------
   Weekly summary (last 7 days)
   --------------------------------------------------------------------- */
function calculateWeeklySummary() {
  const dates = getLastNDates(7);
  let totalCal = 0, totalProtein = 0, totalCarbs = 0, totalFats = 0, totalWater = 0;
  let trackedDays = 0;
  let totalMeals = 0;
  let bestScore = 0;
  let bestScoreDate = null;
  const dayBreakdown = [];

  for (const d of dates) {
    const key = getDateKey(d);
    const log = state.dailyLogs[key];
    const totals = log ? calculateTotals(key) : { calories: 0, protein: 0, carbs: 0, fats: 0, water: 0, mealsLogged: 0 };
    const score = log ? calculateDestinyScore(key) : 0;
    const hasActivity = log && (log.meals.length > 0 || log.water > 0);
    if (hasActivity) {
      trackedDays++;
      totalCal     += totals.calories;
      totalProtein += totals.protein;
      totalCarbs   += totals.carbs;
      totalFats    += totals.fats;
      totalWater   += totals.water;
      totalMeals   += totals.mealsLogged;
      if (score > bestScore) { bestScore = score; bestScoreDate = d; }
    }
    dayBreakdown.push({ date: d, key, totals, score, hasActivity });
  }

  const divisor = trackedDays || 1;
  return {
    daysTracked: trackedDays,
    avgCalories: trackedDays ? Math.round(totalCal / divisor) : 0,
    avgProtein:  trackedDays ? round(totalProtein / divisor, 1) : 0,
    avgCarbs:    trackedDays ? round(totalCarbs / divisor, 1) : 0,
    avgFats:     trackedDays ? round(totalFats / divisor, 1) : 0,
    avgWater:    trackedDays ? round(totalWater / divisor, 1) : 0,
    totalMeals,
    bestScore,
    bestScoreDate,
    streak: calculateStreak(),
    dayBreakdown
  };
}

/* =====================================================================
   RENDERING
   ===================================================================== */

/* --- Onboarding ---------------------------------------------------- */
function renderOnboarding() {
  const screen = document.getElementById('onboarding');
  screen.classList.remove('hidden');
  document.getElementById('mainApp').classList.add('hidden');

  // Reset photo preview
  const preview = document.getElementById('onboardingPhotoPreview');
  preview.innerHTML = `
    <svg class="photo-default-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.33 0-8 1.67-8 5v1h16v-1c0-3.33-4.67-5-8-5Z" fill="currentColor"/>
    </svg>`;
  // Hold the uploaded photo on the form element itself
  document.getElementById('onboardingForm').dataset.photo = '';
}

/* --- Header avatar + greeting --------------------------------------- */
function renderHeader() {
  const avatar = document.getElementById('headerAvatar');
  if (state.profile.photo) {
    avatar.innerHTML = `<img src="${state.profile.photo}" alt="${state.profile.name}" />`;
  } else {
    avatar.innerHTML = `
      <svg class="photo-default-icon small" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.33 0-8 1.67-8 5v1h16v-1c0-3.33-4.67-5-8-5Z" fill="currentColor"/>
      </svg>`;
  }
}

function renderGreeting() {
  const hour = new Date().getHours();
  let greeting = 'Good evening';
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 18) greeting = 'Good afternoon';

  const name = state.profile.name || '';
  document.getElementById('greetingText').textContent = `${greeting}, ${name}`;
}

/* --- Dashboard ----------------------------------------------------- */
function renderDashboard() {
  const todayKey = getTodayKey();
  const totals = calculateTotals(todayKey);
  const p = state.profile;

  renderGreeting();
  renderHeader();

  // Destiny Score ring
  const score = calculateDestinyScore(todayKey);
  document.getElementById('scoreValue').textContent = score;
  const fill = document.getElementById('scoreRingFill');
  const circumference = 2 * Math.PI * 52; // ~326.7
  const offset = circumference - (score / 100) * circumference;
  fill.style.strokeDashoffset = offset;
  document.getElementById('scoreMessage').textContent = totals.mealsLogged === 0 && totals.water === 0
    ? 'Start by logging your first meal.'
    : scoreMessage(score);

  // Today's Focus
  document.getElementById('focusMessage').textContent = calculateTodayFocus(todayKey);

  // Progress cards
  updateProgress('calories', totals.calories, p.calorieTarget, '');
  updateProgress('protein', totals.protein, p.proteinTarget, 'g');
  updateProgress('carbs', totals.carbs, p.carbTarget, 'g');
  updateProgress('fats', totals.fats, p.fatTarget, 'g');
  updateProgress('water', totals.water, p.waterTarget, 'cups');
  updateProgress('meals', totals.mealsLogged, p.mealsTarget, '');

  // Special override for meals target label (no unit)
  document.getElementById('mealsTargetText').textContent = `/ ${Number(p.mealsTarget) || 0}`;

  // Streak
  document.getElementById('streakCount').textContent = calculateStreak();

  // Empty state
  const emptyEl = document.getElementById('homeEmpty');
  if (totals.mealsLogged === 0 && totals.water === 0) {
    emptyEl.classList.remove('hidden');
  } else {
    emptyEl.classList.add('hidden');
  }
}

function updateProgress(prefix, current, target, unit) {
  const tgt = Number(target) || 0;
  const pct = safePct(current, tgt);
  const displayPct = Math.min(Math.round(pct), 999);
  const current$ = document.getElementById(`${prefix}Current`);
  const target$ = document.getElementById(`${prefix}Target`);
  const bar$ = document.getElementById(`${prefix}Bar`);
  const pct$ = document.getElementById(`${prefix}Pct`);

  if (current$) current$.textContent = current;
  if (target$ && prefix !== 'meals') {
    target$.textContent = unit ? `/ ${tgt} ${unit}` : `/ ${tgt}`;
  }
  if (bar$) bar$.style.width = Math.min(pct, 100) + '%';
  if (pct$) pct$.textContent = displayPct + '%';
}

/* --- Water UI ------------------------------------------------------ */
function renderWater() {
  const todayKey = getTodayKey();
  const day = loadDailyData(todayKey);
  const target = Number(state.profile.waterTarget) || 0;

  document.getElementById('waterCountValue').textContent = day.water;
  document.getElementById('waterCountTarget').textContent = `/ ${target} cups`;

  const cupsEl = document.getElementById('waterCups');
  if (cupsEl) {
    cupsEl.innerHTML = '';
    // Render at least up to target, but allow extras to show too
    const totalToRender = Math.max(target, day.water);
    for (let i = 0; i < totalToRender; i++) {
      const cup = document.createElement('div');
      cup.className = 'water-cup' + (i < day.water ? ' filled' : '');
      cupsEl.appendChild(cup);
    }
  }
}

/* --- Meal list ----------------------------------------------------- */
function renderMealList() {
  const todayKey = getTodayKey();
  const day = loadDailyData(todayKey);
  const list = document.getElementById('mealsList');
  const empty = document.getElementById('mealsEmpty');

  list.innerHTML = '';

  if (!day.meals.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  for (const meal of day.meals) {
    const li = document.createElement('li');
    li.className = 'meal-item';
    const tagsHtml = (meal.tags && meal.tags.length)
      ? `<div class="meal-item-tags">${meal.tags.map(t => `<span class="meal-item-tag">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';
    const notesHtml = meal.notes
      ? `<p class="meal-item-notes">${escapeHtml(meal.notes)}</p>`
      : '';
    li.innerHTML = `
      <div class="meal-item-head">
        <span class="meal-item-type">${escapeHtml(meal.type)}</span>
        <span class="meal-item-cal">${Number(meal.calories)} cal</span>
      </div>
      <p class="meal-item-name">${escapeHtml(meal.name)}</p>
      <div class="meal-item-macros">
        <span><strong>${Number(meal.protein)}g</strong> protein</span>
        <span><strong>${Number(meal.carbs)}g</strong> carbs</span>
        <span><strong>${Number(meal.fats)}g</strong> fat</span>
      </div>
      ${tagsHtml}
      ${notesHtml}
      <div class="meal-item-actions">
        <button type="button" class="meal-action-btn" data-edit="${meal.id}">Edit</button>
        <button type="button" class="meal-action-btn danger" data-delete="${meal.id}">Delete</button>
      </div>
    `;
    list.appendChild(li);
  }
}

/* --- Tag chips for meal form -------------------------------------- */
function renderMealTags(containerId, selectedSet) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  for (const tag of MEAL_TAGS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-chip' + (selectedSet.has(tag) ? ' active' : '');
    btn.textContent = tag;
    btn.addEventListener('click', () => {
      if (selectedSet.has(tag)) selectedSet.delete(tag);
      else selectedSet.add(tag);
      btn.classList.toggle('active');
    });
    container.appendChild(btn);
  }
}

/* --- Weekly progress tab ------------------------------------------- */
function renderProgress() {
  const summary = calculateWeeklySummary();
  const emptyEl = document.getElementById('progressEmpty');
  const contentEl = document.getElementById('progressContent');

  if (summary.daysTracked === 0) {
    emptyEl.classList.remove('hidden');
    contentEl.classList.add('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  contentEl.classList.remove('hidden');

  // Chart target
  const calTarget = Number(state.profile.calorieTarget) || 0;
  document.getElementById('chartCalorieTarget').textContent = calTarget ? `Target ${calTarget}` : 'Target —';

  // Build bar chart of calories per day
  const chart = document.getElementById('weeklyChart');
  chart.innerHTML = '';
  // Determine max scale: target * 1.2 or max observed calories
  let maxVal = calTarget * 1.2 || 0;
  for (const d of summary.dayBreakdown) {
    if (d.totals.calories > maxVal) maxVal = d.totals.calories;
  }
  if (maxVal <= 0) maxVal = 1;

  const todayKey = getTodayKey();
  for (const d of summary.dayBreakdown) {
    const col = document.createElement('div');
    col.className = 'chart-day' + (d.key === todayKey ? ' today' : '');

    const barWrap = document.createElement('div');
    barWrap.className = 'chart-bar-wrap';
    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    if (!d.hasActivity) bar.classList.add('empty');
    if (calTarget && d.totals.calories > calTarget * 1.1) bar.classList.add('over');
    const heightPct = Math.min((d.totals.calories / maxVal) * 100, 100);
    bar.style.height = (d.hasActivity ? Math.max(heightPct, 4) : 4) + '%';
    bar.title = `${d.totals.calories} cal`;
    barWrap.appendChild(bar);

    const label = document.createElement('div');
    label.className = 'chart-day-label';
    label.textContent = d.date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3);

    col.appendChild(barWrap);
    col.appendChild(label);
    chart.appendChild(col);
  }

  // Summary tiles
  document.getElementById('summaryDaysTracked').textContent = summary.daysTracked;
  document.getElementById('summaryStreak').textContent = summary.streak;
  document.getElementById('summaryAvgCalories').textContent = summary.avgCalories;
  document.getElementById('summaryAvgProtein').innerHTML = `${summary.avgProtein} <span>g</span>`;
  document.getElementById('summaryAvgCarbs').innerHTML = `${summary.avgCarbs} <span>g</span>`;
  document.getElementById('summaryAvgFats').innerHTML = `${summary.avgFats} <span>g</span>`;
  document.getElementById('summaryAvgWater').innerHTML = `${summary.avgWater} <span>cups</span>`;
  document.getElementById('summaryMealsCount').textContent = summary.totalMeals;
  document.getElementById('summaryBestScore').textContent = summary.bestScore;
  const bestDateEl = document.getElementById('summaryBestScoreDate');
  if (summary.bestScoreDate) {
    bestDateEl.textContent = summary.bestScoreDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  } else {
    bestDateEl.textContent = '';
  }
}

/* --- Settings page ------------------------------------------------- */
function renderSettings() {
  const p = state.profile;
  document.getElementById('settingsName').value = p.name || '';
  document.getElementById('settingsCurrentWeight').value = p.currentWeight || '';
  document.getElementById('settingsGoalWeight').value = p.goalWeight || '';
  document.getElementById('settingsGoalType').value = p.goalType || '';
  document.getElementById('settingsCalorieTarget').value = p.calorieTarget || '';
  document.getElementById('settingsProteinTarget').value = p.proteinTarget || '';
  document.getElementById('settingsCarbTarget').value = p.carbTarget || '';
  document.getElementById('settingsFatTarget').value = p.fatTarget || '';
  document.getElementById('settingsWaterTarget').value = p.waterTarget || '';
  document.getElementById('settingsMealsTarget').value = p.mealsTarget || '';

  const preview = document.getElementById('settingsPhotoPreview');
  if (p.photo) {
    preview.innerHTML = `<img src="${p.photo}" alt="${p.name}" />`;
  } else {
    preview.innerHTML = `
      <svg class="photo-default-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.33 0-8 1.67-8 5v1h16v-1c0-3.33-4.67-5-8-5Z" fill="currentColor"/>
      </svg>`;
  }
}

/* =====================================================================
   VALIDATION
   ===================================================================== */

function clearFieldErrors(formEl) {
  formEl.querySelectorAll('.field-error').forEach(e => e.textContent = '');
  formEl.querySelectorAll('[aria-invalid="true"]').forEach(e => e.removeAttribute('aria-invalid'));
}

function showFieldError(inputId, message) {
  const input = document.getElementById(inputId);
  if (input) input.setAttribute('aria-invalid', 'true');
  const errEl = document.querySelector(`[data-error-for="${inputId}"]`);
  if (errEl) errEl.textContent = message;
}

function validateOnboarding() {
  const form = document.getElementById('onboardingForm');
  clearFieldErrors(form);
  let ok = true;
  const name = document.getElementById('onboardingName').value.trim();
  if (!name) { showFieldError('onboardingName', 'Please enter your name.'); ok = false; }

  const checks = [
    ['onboardingCurrentWeight', 'Must be greater than 0.', v => Number(v) > 0],
    ['onboardingGoalWeight',    'Must be greater than 0.', v => Number(v) > 0],
    ['onboardingGoalType',      'Please select a goal.',   v => !!v],
    ['onboardingCalorieTarget', 'Must be greater than 0.', v => Number(v) > 0],
    ['onboardingProteinTarget', 'Must be greater than 0.', v => Number(v) > 0],
    ['onboardingCarbTarget',    'Must be 0 or greater.',   v => Number(v) >= 0 && v !== ''],
    ['onboardingFatTarget',     'Must be 0 or greater.',   v => Number(v) >= 0 && v !== ''],
    ['onboardingWaterTarget',   'Must be greater than 0.', v => Number(v) > 0],
    ['onboardingMealsTarget',   'Must be greater than 0.', v => Number(v) > 0],
  ];

  for (const [id, msg, test] of checks) {
    const v = document.getElementById(id).value;
    if (!test(v)) { showFieldError(id, msg); ok = false; }
  }
  return ok;
}

function validateMeal(prefix) {
  // prefix is 'meal' or 'editMeal'
  const form = document.getElementById(prefix === 'meal' ? 'mealForm' : 'editMealForm');
  clearFieldErrors(form);
  let ok = true;
  const checks = [
    [`${prefix}Type`,     'Select a meal type.',   v => !!v],
    [`${prefix}Name`,     'Enter a meal name.',    v => !!v.trim()],
    [`${prefix}Calories`, 'Must be 0 or greater.', v => v !== '' && Number(v) >= 0],
    [`${prefix}Protein`,  'Must be 0 or greater.', v => v !== '' && Number(v) >= 0],
    [`${prefix}Carbs`,    'Must be 0 or greater.', v => v !== '' && Number(v) >= 0],
    [`${prefix}Fats`,     'Must be 0 or greater.', v => v !== '' && Number(v) >= 0],
  ];
  for (const [id, msg, test] of checks) {
    const v = document.getElementById(id).value;
    if (!test(v)) { showFieldError(id, msg); ok = false; }
  }
  return ok;
}

function validateSettings() {
  const form = document.getElementById('settingsForm');
  clearFieldErrors(form);
  let ok = true;
  const name = document.getElementById('settingsName').value.trim();
  if (!name) { showFieldError('settingsName', 'Please enter your name.'); ok = false; }

  const checks = [
    ['settingsCurrentWeight', 'Must be greater than 0.', v => Number(v) > 0],
    ['settingsGoalWeight',    'Must be greater than 0.', v => Number(v) > 0],
    ['settingsGoalType',      'Please select a goal.',   v => !!v],
    ['settingsCalorieTarget', 'Must be greater than 0.', v => Number(v) > 0],
    ['settingsProteinTarget', 'Must be greater than 0.', v => Number(v) > 0],
    ['settingsCarbTarget',    'Must be 0 or greater.',   v => Number(v) >= 0 && v !== ''],
    ['settingsFatTarget',     'Must be 0 or greater.',   v => Number(v) >= 0 && v !== ''],
    ['settingsWaterTarget',   'Must be greater than 0.', v => Number(v) > 0],
    ['settingsMealsTarget',   'Must be greater than 0.', v => Number(v) > 0],
  ];
  for (const [id, msg, test] of checks) {
    const v = document.getElementById(id).value;
    if (!test(v)) { showFieldError(id, msg); ok = false; }
  }
  return ok;
}

/* =====================================================================
   ACTIONS — Meals
   ===================================================================== */

function addMeal(meal) {
  const todayKey = getTodayKey();
  const day = loadDailyData(todayKey);
  meal.id = `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  day.meals.push(meal);
  saveDailyData();
  renderDashboard();
  renderMealList();
  showToast('Meal added.');
}

function editMeal(id) {
  const todayKey = getTodayKey();
  const day = loadDailyData(todayKey);
  const meal = day.meals.find(m => m.id === id);
  if (!meal) return;

  // Populate edit modal
  document.getElementById('editMealId').value = meal.id;
  document.getElementById('editMealType').value = meal.type;
  document.getElementById('editMealName').value = meal.name;
  document.getElementById('editMealCalories').value = meal.calories;
  document.getElementById('editMealProtein').value = meal.protein;
  document.getElementById('editMealCarbs').value = meal.carbs;
  document.getElementById('editMealFats').value = meal.fats;
  document.getElementById('editMealNotes').value = meal.notes || '';

  editingMealTags = new Set(meal.tags || []);
  renderMealTags('editMealTagGrid', editingMealTags);

  showModal('editMealModal');
}

function saveMealEdit() {
  if (!validateMeal('editMeal')) return;
  const id = document.getElementById('editMealId').value;
  const todayKey = getTodayKey();
  const day = loadDailyData(todayKey);
  const meal = day.meals.find(m => m.id === id);
  if (!meal) return;

  meal.type    = document.getElementById('editMealType').value;
  meal.name    = document.getElementById('editMealName').value.trim();
  meal.calories = Number(document.getElementById('editMealCalories').value) || 0;
  meal.protein = Number(document.getElementById('editMealProtein').value)  || 0;
  meal.carbs   = Number(document.getElementById('editMealCarbs').value)    || 0;
  meal.fats    = Number(document.getElementById('editMealFats').value)     || 0;
  meal.notes   = document.getElementById('editMealNotes').value.trim();
  meal.tags    = Array.from(editingMealTags);

  saveDailyData();
  renderDashboard();
  renderMealList();
  closeModal('editMealModal');
  showToast('Meal updated.');
}

function deleteMeal(id) {
  const todayKey = getTodayKey();
  const day = loadDailyData(todayKey);
  day.meals = day.meals.filter(m => m.id !== id);
  saveDailyData();
  renderDashboard();
  renderMealList();
  showToast('Meal removed.');
}

/* =====================================================================
   ACTIONS — Water
   ===================================================================== */

function addWater() {
  const todayKey = getTodayKey();
  const day = loadDailyData(todayKey);
  day.water = (day.water || 0) + 1;
  saveDailyData();
  renderDashboard();
  renderWater();
}

function subtractWater() {
  const todayKey = getTodayKey();
  const day = loadDailyData(todayKey);
  day.water = Math.max(0, (day.water || 0) - 1);
  saveDailyData();
  renderDashboard();
  renderWater();
}

function resetWater() {
  const todayKey = getTodayKey();
  const day = loadDailyData(todayKey);
  day.water = 0;
  saveDailyData();
  renderDashboard();
  renderWater();
  showToast('Water reset.');
}

/* =====================================================================
   ACTIONS — Reset
   ===================================================================== */

function resetToday() {
  const todayKey = getTodayKey();
  state.dailyLogs[todayKey] = { meals: [], water: 0 };
  saveDailyData();
  renderDashboard();
  renderMealList();
  renderWater();
  showToast("Today's data has been reset.");
}

function resetAll() {
  localStorage.removeItem(STORAGE_KEY);
  state = emptyData();
  // Send back to onboarding
  renderOnboarding();
  // Clear the onboarding form values
  document.getElementById('onboardingForm').reset();
  showToast('All data cleared.');
}

/* =====================================================================
   MODAL helpers
   ===================================================================== */

function showModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

let confirmHandler = null;
function showConfirm(title, body, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmBody').textContent = body;
  confirmHandler = onConfirm;
  showModal('confirmModal');
}

/* =====================================================================
   TAB switching
   ===================================================================== */

function switchTab(tabName) {
  const tabs = ['Home', 'Log', 'Progress', 'Settings'];
  for (const t of tabs) {
    const content = document.getElementById(`tab${t}`);
    const navBtn  = document.getElementById(`nav${t}`);
    const active = (t === tabName);
    content.hidden = !active;
    content.classList.toggle('tab-active', active);
    navBtn.classList.toggle('nav-active', active);
    navBtn.setAttribute('aria-selected', active ? 'true' : 'false');
  }
  // Re-render the active tab so it reflects current state
  if (tabName === 'Home')     renderDashboard();
  if (tabName === 'Log')      { renderWater(); renderMealList(); }
  if (tabName === 'Progress') renderProgress();
  if (tabName === 'Settings') renderSettings();

  // Scroll to top for new tab
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* =====================================================================
   TOAST
   ===================================================================== */

let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2400);
}

/* =====================================================================
   UTILS
   ===================================================================== */

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve('');
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/* =====================================================================
   BOOTSTRAP
   ===================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  loadProfile();

  // Decide: onboarding or main app?
  if (hasCompletedOnboarding()) {
    document.getElementById('onboarding').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    // Render initial tab
    switchTab('Home');
    // Pre-render Log tab tags & water for when it opens
    renderMealTags('mealTagGrid', pendingMealTags);
    renderWater();
    renderMealList();
  } else {
    renderOnboarding();
  }

  /* ---------- Onboarding events ---------- */
  const onboardingForm = document.getElementById('onboardingForm');
  const onboardingPhoto = document.getElementById('onboardingPhoto');
  const onboardingPreview = document.getElementById('onboardingPhotoPreview');

  onboardingPhoto.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      onboardingForm.dataset.photo = dataUrl;
      onboardingPreview.innerHTML = `<img src="${dataUrl}" alt="profile preview" />`;
    } catch (err) {
      console.warn('Photo upload failed', err);
      showToast('Could not load photo.');
    }
  });

  onboardingForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateOnboarding()) return;

    state.profile = {
      name: document.getElementById('onboardingName').value.trim(),
      photo: onboardingForm.dataset.photo || '',
      currentWeight: Number(document.getElementById('onboardingCurrentWeight').value),
      goalWeight: Number(document.getElementById('onboardingGoalWeight').value),
      goalType: document.getElementById('onboardingGoalType').value,
      calorieTarget: Number(document.getElementById('onboardingCalorieTarget').value),
      proteinTarget: Number(document.getElementById('onboardingProteinTarget').value),
      carbTarget: Number(document.getElementById('onboardingCarbTarget').value),
      fatTarget: Number(document.getElementById('onboardingFatTarget').value),
      waterTarget: Number(document.getElementById('onboardingWaterTarget').value),
      mealsTarget: Number(document.getElementById('onboardingMealsTarget').value)
    };
    saveProfile();

    document.getElementById('onboarding').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    switchTab('Home');
    renderMealTags('mealTagGrid', pendingMealTags);
    renderWater();
    renderMealList();
    showToast(`Welcome, ${state.profile.name}.`);
  });

  /* ---------- Bottom nav ---------- */
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  // Header avatar → settings
  document.getElementById('headerAvatarBtn').addEventListener('click', () => switchTab('Settings'));

  /* ---------- Water tracker ---------- */
  document.getElementById('waterAddBtn').addEventListener('click', addWater);
  document.getElementById('waterSubtractBtn').addEventListener('click', subtractWater);
  document.getElementById('waterResetBtn').addEventListener('click', resetWater);

  /* ---------- Add meal form ---------- */
  renderMealTags('mealTagGrid', pendingMealTags);

  const mealForm = document.getElementById('mealForm');
  mealForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateMeal('meal')) return;
    const meal = {
      type: document.getElementById('mealType').value,
      name: document.getElementById('mealName').value.trim(),
      calories: Number(document.getElementById('mealCalories').value) || 0,
      protein: Number(document.getElementById('mealProtein').value)  || 0,
      carbs: Number(document.getElementById('mealCarbs').value)      || 0,
      fats: Number(document.getElementById('mealFats').value)        || 0,
      notes: document.getElementById('mealNotes').value.trim(),
      tags: Array.from(pendingMealTags)
    };
    addMeal(meal);
    mealForm.reset();
    pendingMealTags.clear();
    renderMealTags('mealTagGrid', pendingMealTags);
  });

  /* ---------- Meal list (event delegation) ---------- */
  document.getElementById('mealsList').addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit]');
    const delBtn  = e.target.closest('[data-delete]');
    if (editBtn) editMeal(editBtn.dataset.edit);
    if (delBtn)  deleteMeal(delBtn.dataset.delete);
  });

  /* ---------- Edit meal modal ---------- */
  document.getElementById('editMealForm').addEventListener('submit', (e) => {
    e.preventDefault();
    saveMealEdit();
  });

  /* ---------- Modal close (backdrop, X, cancel) ---------- */
  document.querySelectorAll('[data-close-modal]').forEach(el => {
    el.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal');
      if (modal) modal.classList.add('hidden');
    });
  });
  // ESC closes any open modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
    }
  });

  /* ---------- Confirm modal ---------- */
  document.getElementById('confirmActionBtn').addEventListener('click', () => {
    closeModal('confirmModal');
    if (typeof confirmHandler === 'function') {
      const fn = confirmHandler;
      confirmHandler = null;
      fn();
    }
  });

  /* ---------- Settings ---------- */
  const settingsForm = document.getElementById('settingsForm');
  const settingsPhoto = document.getElementById('settingsPhoto');
  const settingsPreview = document.getElementById('settingsPhotoPreview');

  settingsPhoto.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      state.profile.photo = dataUrl;
      saveProfile();
      settingsPreview.innerHTML = `<img src="${dataUrl}" alt="profile" />`;
      renderHeader();
      showToast('Photo updated.');
    } catch (err) {
      console.warn('Photo upload failed', err);
      showToast('Could not load photo.');
    }
  });

  document.getElementById('settingsPhotoRemoveBtn').addEventListener('click', () => {
    state.profile.photo = '';
    saveProfile();
    settingsPreview.innerHTML = `
      <svg class="photo-default-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.33 0-8 1.67-8 5v1h16v-1c0-3.33-4.67-5-8-5Z" fill="currentColor"/>
      </svg>`;
    renderHeader();
    showToast('Photo removed.');
  });

  settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateSettings()) return;
    state.profile.name          = document.getElementById('settingsName').value.trim();
    state.profile.currentWeight = Number(document.getElementById('settingsCurrentWeight').value);
    state.profile.goalWeight    = Number(document.getElementById('settingsGoalWeight').value);
    state.profile.goalType      = document.getElementById('settingsGoalType').value;
    state.profile.calorieTarget = Number(document.getElementById('settingsCalorieTarget').value);
    state.profile.proteinTarget = Number(document.getElementById('settingsProteinTarget').value);
    state.profile.carbTarget    = Number(document.getElementById('settingsCarbTarget').value);
    state.profile.fatTarget     = Number(document.getElementById('settingsFatTarget').value);
    state.profile.waterTarget   = Number(document.getElementById('settingsWaterTarget').value);
    state.profile.mealsTarget   = Number(document.getElementById('settingsMealsTarget').value);
    saveProfile();
    renderDashboard();
    renderWater();
    showToast('Settings saved.');
  });

  /* ---------- Reset buttons ---------- */
  document.getElementById('resetTodayBtn').addEventListener('click', () => {
    showConfirm(
      "Reset today's data?",
      "This will clear today's meals and water. Your profile and previous days will stay safe.",
      resetToday
    );
  });
  document.getElementById('resetAllBtn').addEventListener('click', () => {
    showConfirm(
      'Reset everything?',
      "This will erase your profile, photo, goals, and every saved day. You'll be taken back to onboarding.",
      resetAll
    );
  });

  /* ---------- Day rollover ---------- */
  // Re-render once per minute so a new local day flips the dashboard.
  let lastDay = getTodayKey();
  setInterval(() => {
    const now = getTodayKey();
    if (now !== lastDay) {
      lastDay = now;
      // Ensure a fresh blank log exists for the new day
      loadDailyData(now);
      saveDailyData();
      renderDashboard();
      renderWater();
      renderMealList();
    }
  }, 60 * 1000);

  /* ---------- When tab/page becomes visible, refresh in case day changed */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && hasCompletedOnboarding()) {
      renderDashboard();
      renderWater();
      renderMealList();
    }
  });
});
