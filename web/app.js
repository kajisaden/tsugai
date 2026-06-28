// 二間詰 プレイ側ビューア(タスクB)
// プールJSONを読んで盤を描くだけ。ソルバーは積まない(SPEC.md 3-3)。
'use strict';

const POOL = window.NIKENZUME_POOL;

// ---- i18n: 文言は strings.js に分離。ロケールはデバイス言語(navigator.language)で自動、?lang= で上書き可 ----
const STRINGS = window.NIKENZUME_STRINGS;
const LANG_KEY = 'nikenzume.lang.v1';
let locale = (() => {
  const q = new URLSearchParams(location.search).get('lang');
  if (q && STRINGS[q]) { localStorage.setItem(LANG_KEY, q); return q; }
  const saved = localStorage.getItem(LANG_KEY);
  if (saved && STRINGS[saved]) return saved;
  return (navigator.language || '').startsWith('en') ? 'en' : 'ja';
})();
function t(key, params) {
  let v = (STRINGS[locale] || STRINGS.ja)[key];
  if (v == null) v = STRINGS.ja[key];
  if (v == null) return key;
  if (typeof v === 'function') return v(params || {});
  if (params) { let s = v; for (const k in params) s = s.split('{' + k + '}').join(params[k]); return s; }
  return v;
}
// 静的文言を data-i18n / data-i18n-aria から流し込む(起動時)
function fillI18n() {
  document.documentElement.lang = locale;
  document.title = t('title');
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
}

// ---- テーマ(ライト/ダーク): 手動トグル。A Blue Ring刷新版の既定はライト ----
// テーマ(UI色) / 盤スキン / ボールスキン の3軸自由組み合わせ。
// data-theme=dark|light, data-board=dark|light, data-ball=dark|light
const THEME_KEY = 'nikenzume.theme.v1';
const THEME_DESIGN_KEY = 'nikenzume.themeDesign.v2';
if (localStorage.getItem(THEME_DESIGN_KEY) !== 'blue-ring') {
  localStorage.setItem(THEME_KEY, 'light');
  localStorage.setItem(THEME_DESIGN_KEY, 'blue-ring');
}
let theme = localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
let boardSkin = theme;
let ballSkin = theme;
function applyTheme() {
  const root = document.documentElement;
  boardSkin = theme;
  ballSkin = theme;
  root.dataset.theme = theme;
  root.dataset.board = theme;
  root.dataset.ball = theme;
  const btn = document.querySelector('#btn-theme');
  if (btn) btn.setAttribute('aria-pressed', String(theme === 'light'));
}

const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]]; // 0=上 1=下 2=左 3=右
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOVE_MS = REDUCED ? 0 : 240; // 移動(スライド)。120→240=体感ほぼ半分の速さ。CSS --move-ms と必ず一致させる
const BUMP_MS = REDUCED ? 0 : 200;
const ANSWER_AUTO_GAP = REDUCED ? 260 : 520; // 答え自動再生の手間
const MISS_HOLD_MS = REDUCED ? 0 : 600; // 反則の局面＋赤みを見せる一拍(戻り開始まで)
const RETURN_MS = REDUCED ? 0 : 340;    // 反則から初形へ「直線で」戻るスライド時間(手数に依らず一定)
// クリア時、ゴール吸着(白い輪の伸縮 ~320ms)の余韻を見せてから球を点火するまでの待ち。ダークのみ使用。
// checkClear は着地(MOVE_MS=240)で走るので、ここを足すと点火が吸着の収まり(~320)直後に来る
const GOAL_SUCK_HOLD_MS = REDUCED ? 0 : 200;

// ---- 章編成: 2段階構造 (章=気づき / 章内=サイズ→手数) ----
// 外側(章) = episodes(ズレ調整エピソード数 = プレイヤーが要する「気づき」の数)。最大の難度区分。
// 内側(章内) = サイズ→手数 の昇順。盤が 4x4→5x5 と広がり、各サイズ内で手数が滑らかに増える。
// 章境界での手数リセットは「新章の自然な再上昇」になり、見た目(手数)と難度の逆行が消える。
// 視認性の限界は 5x5。6x6 は本体から外す。導入(第一章の頭)は ep0 の 1〜2手のみ(ただ歩く体験)。
const ep = (p) => p.analysis.episodes;
// モード別レベルリスト（select-normal/advanced.mjs が生成した ID 配列から構築）
const poolById = new Map(POOL.puzzles.map(p => [p.id, p]));
const MODES = {
  normal: {
    levels: window.NORMAL_LEVEL_IDS.map(id => poolById.get(id)),
    boss: window.NORMAL_BOSS_FLAGS,
  },
  advanced: {
    levels: window.ADVANCED_LEVEL_IDS.map(id => poolById.get(id)),
    boss: window.ADVANCED_BOSS_FLAGS,
  },
};
let curMode = 'normal';
function modeData() { return MODES[curMode]; }
const CHAPTERS = [{ id: 'ch1', from: 0, to: MODES.normal.levels.length }];
function switchMode(mode) {
  curMode = mode;
  CHAPTERS[0].to = modeData().levels.length;
  showLevels(CHAPTERS[0]);
}
function chapterLevels(ch) {
  return modeData().levels.slice(ch.from, ch.to);
}

// ---- クリア記録 ----
const STORE_KEY = 'nikenzume.cleared.v1';
const cleared = new Set(JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]'));
function markCleared(puzId) {
  cleared.add(puzId);
  localStorage.setItem(STORE_KEY, JSON.stringify([...cleared]));
}

// 最短達成記録(金星)。クリア記録とは別枠
const BEST_KEY = 'nikenzume.best.v1';
const bestCleared = new Set(JSON.parse(localStorage.getItem(BEST_KEY) ?? '[]'));
function markBest(puzId) {
  bestCleared.add(puzId);
  localStorage.setItem(BEST_KEY, JSON.stringify([...bestCleared]));
}

// ヒント設定(問題ごと)。違う問題に移ると必ずオフから始める(同じ問題の初形/答え再生では保持)。
// light=ぶつかる壁を常時光らせる。next は旧UI互換の保存値だけ残す。
const hintSettings = { light: false };
let hintPuzzleId = null; // hintSettings が今ひもづく問題ID。別問題になったらオフへ戻す

// ---- ヒント残数(ストック制: ログインボーナスで補充) ----
const HINT_KEY = 'nikenzume.hints.v2';
function loadHintCredits() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(HINT_KEY)); } catch (e) {}
  if (!s) s = { light: 0, next: 0, answer: 0 };
  if (s.answer === undefined) s.answer = 0;
  return s;
}
let hintCredits = loadHintCredits();
function saveHintCredits() { localStorage.setItem(HINT_KEY, JSON.stringify(hintCredits)); }
function addHints(light, next, answer) {
  hintCredits.light += light;
  hintCredits.next += next;
  hintCredits.answer += (answer || 0);
  saveHintCredits();
}

// ---- ログインボーナス(7日サイクル) ----
const LOGIN_KEY = 'nikenzume.login.v1';
const LOGIN_REWARDS = [
  { light: 3, next: 0, answer: 0 },
  { light: 3, next: 0, answer: 0 },
  { light: 5, next: 0, answer: 0 },
  { light: 5, next: 0, answer: 1 },
  { light: 5, next: 0, answer: 3 },
  { light: 5, next: 0, answer: 5 },
  { light: 8, next: 0, answer: 5 },
];
const FIRST_LOGIN_BONUS = { light: 10, next: 0, answer: 10 };

function loginToday() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
function loadLoginState() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(LOGIN_KEY)); } catch (e) {}
  if (!s) s = { day: 0, lastDate: null, claimed: false, firstDone: false };
  return s;
}
function saveLoginState(s) { localStorage.setItem(LOGIN_KEY, JSON.stringify(s)); }

function checkLoginBonus() {
  const s = loadLoginState();
  const today = loginToday();
  if (s.lastDate === today && s.claimed) return null;

  if (!s.firstDone) {
    addHints(FIRST_LOGIN_BONUS.light, FIRST_LOGIN_BONUS.next, FIRST_LOGIN_BONUS.answer);
    s.firstDone = true;
    s.day = 0;
    s.lastDate = today;
    s.claimed = true;
    saveLoginState(s);
    return { type: 'first', reward: FIRST_LOGIN_BONUS };
  }

  if (s.lastDate !== today) {
    const reward = LOGIN_REWARDS[s.day % 7];
    addHints(reward.light, reward.next, reward.answer);
    const dayIndex = s.day % 7;
    s.day++;
    s.lastDate = today;
    s.claimed = true;
    saveLoginState(s);
    return { type: 'daily', dayIndex, reward };
  }
  return null;
}
// ---- デイリーチャレンジ(毎日1問 + ストリーク + ヒント報酬) ----
const DAILY_KEY = 'nikenzume.daily.v1';
const DAILY_REWARDS = {
  clear: { light: 1, next: 1, answer: 0 },
  best:  { light: 2, next: 2, answer: 1 },
};
const STREAK_MILESTONES = [
  { days: 7,  reward: { light: 5, next: 5, answer: 5 } },
  { days: 14, reward: { light: 10, next: 10, answer: 10 } },
  { days: 30, reward: { light: 15, next: 15, answer: 15 } },
];
let dailyMode = false;

function loadDailyState() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(DAILY_KEY)); } catch (e) {}
  if (!s) s = { date: null, cleared: false, best: false, streak: 0, lastClearDate: null, totalDays: 0, maxStreak: 0 };
  if (s.maxStreak === undefined) s.maxStreak = s.streak || 0;
  return s;
}
function saveDailyState(s) { localStorage.setItem(DAILY_KEY, JSON.stringify(s)); }

function yesterdayStr() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function refreshDailyState() {
  const s = loadDailyState();
  const today = loginToday();
  if (s.date === today) return s;
  if (s.lastClearDate !== yesterdayStr()) s.streak = 0;
  s.date = today;
  s.cleared = false;
  s.best = false;
  saveDailyState(s);
  return s;
}

function getDailyPuzzle() {
  const today = loginToday();
  let hash = 0;
  for (let i = 0; i < today.length; i++) {
    hash = ((hash << 5) - hash) + today.charCodeAt(i);
    hash |= 0;
  }
  return POOL.puzzles[((hash % POOL.puzzles.length) + POOL.puzzles.length) % POOL.puzzles.length];
}

function dailyDayNumber() {
  const epoch = new Date(2026, 5, 25);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.floor((now - epoch) / 86400000) + 1;
}

function handleDailyClear(moves, min) {
  const s = loadDailyState();
  const isBest = moves <= min;
  if (s.cleared && (!isBest || s.best)) return null;
  const isFirst = !s.cleared;
  let reward, streakReward = null;
  if (isFirst) {
    s.cleared = true;
    s.streak++;
    if (s.streak > (s.maxStreak || 0)) s.maxStreak = s.streak;
    s.totalDays++;
    s.lastClearDate = loginToday();
    reward = isBest ? { ...DAILY_REWARDS.best } : { ...DAILY_REWARDS.clear };
    for (const m of STREAK_MILESTONES) {
      if (s.streak === m.days) { streakReward = m; addHints(m.reward.light, m.reward.next, m.reward.answer); break; }
    }
  } else {
    reward = {
      light: DAILY_REWARDS.best.light - DAILY_REWARDS.clear.light,
      next: DAILY_REWARDS.best.next - DAILY_REWARDS.clear.next,
      answer: DAILY_REWARDS.best.answer - DAILY_REWARDS.clear.answer,
    };
  }
  if (isBest) s.best = true;
  saveDailyState(s);
  addHints(reward.light, reward.next, reward.answer);
  return { reward, best: isBest, streak: s.streak, streakReward, isFirst };
}

// ---- 広告(AdMob via Capacitor) ----
// ネイティブ(Capacitor)なら @capacitor-community/admob を使う。PWA/ブラウザでは広告なし(即時実行)。
// テスト用 adId は Google 公式テストID。本番リリース前に実IDへ差し替える。
const AdMob = window.Capacitor?.Plugins?.AdMob;
const AD_IDS = {
  interstitial: 'ca-app-pub-3940256099942544/1033173712',  // テストID
  reward:       'ca-app-pub-3940256099942544/5224354917',  // テストID
};
let adReady = false;
(async function initAdMob() {
  if (!AdMob) return;
  try {
    await AdMob.initialize({ initializeForTesting: true });
    adReady = true;
    prepareInterstitial();
  } catch (e) { /* PWA では無視 */ }
})();
async function prepareInterstitial() {
  if (!adReady) return;
  try { await AdMob.prepareInterstitial({ adId: AD_IDS.interstitial }); } catch (e) {}
}
async function showInterstitial() {
  if (!adReady) return;
  try { await AdMob.showInterstitial(); } catch (e) {}
  prepareInterstitial();
}
function watchRewardAd(then) {
  if (!adReady) { then(); return; }
  (async () => {
    try {
      await AdMob.prepareRewardVideoAd({ adId: AD_IDS.reward });
      const result = await AdMob.showRewardVideoAd();
      if (result) then();
    } catch (e) { then(); }
  })();
}
// 残数を1消費して action。0なら広告(差し込み口)。
function spendHint(kind, action) {
  if (hintCredits[kind] > 0) { hintCredits[kind]--; saveHintCredits(); action(); }
  else watchRewardAd(action);
  updateHintUI();
}

// ---- DOM ユーティリティ ----
const $ = (sel) => document.querySelector(sel);
const el = (cls) => {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  return d;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 画面遷移 ----
let curChapter = null;
let curIndex = 0;
function showView(name) {
  for (const v of ['chapters', 'levels', 'play']) {
    $('#view-' + v).hidden = v !== name;
    document.body.classList.toggle('view-' + v, v === name);
  }
  // ③ 画面切り替えをふわっと立ち上げる(瞬間カットを和らげる)。表示中の画面に enter を付け直して毎回再生。
  // プレイ画面は②の専用登場(animatePuzzleEntrance)を使うので、ここの一律ライズは付けない。
  const cur = $('#view-' + name);
  if (!REDUCED && cur && name !== 'play') { cur.classList.remove('view-enter'); void cur.offsetWidth; cur.classList.add('view-enter'); }
  $('#btn-back').hidden = name === 'chapters';
}
$('#btn-back').addEventListener('click', () => {
  if (!$('#view-play').hidden) {
    dailyMode = false;
    showLevels(curChapter || CHAPTERS[0]);
  }
});

function showChapters() {
  showLevels(CHAPTERS[0]);
}

document.querySelectorAll('.mode-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const mode = tab.dataset.mode;
    if (mode === curMode) return;
    document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    switchMode(mode);
  });
});

function updateDailyCard() {
  const s = refreshDailyState();
  const puz = getDailyPuzzle();
  $('#daily-par').textContent = t('puzzlePar', { n: puz.solution.minMoves });
  const status = $('#daily-status');
  if (s.best) { status.textContent = t('dailyBest'); status.className = 'daily-status best'; }
  else if (s.cleared) { status.textContent = t('dailyCleared'); status.className = 'daily-status cleared'; }
  else { status.textContent = t('dailyNew'); status.className = 'daily-status new'; }
  const streak = $('#daily-streak');
  if (s.streak > 0) { streak.textContent = t('dailyStreak', { n: s.streak }); streak.hidden = false; }
  else streak.hidden = true;
}

function showLevels(ch) {
  curChapter = ch;
  showView('levels');
  updateDailyCard();
  document.querySelectorAll('.mode-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.mode === curMode);
  });
  const done = chapterLevels(ch).filter((p) => cleared.has(p.id)).length;
  $('#levels-title').textContent = `${done} / ${chapterLevels(ch).length}`;
  const grid = $('#level-grid');
  grid.replaceChildren();
  chapterLevels(ch).forEach((p, i) => {
    const globalIdx = ch.from + i;
    const isBoss = modeData().boss[globalIdx];
    const btn = document.createElement('button');
    const isCleared = cleared.has(p.id);
    const isBest = bestCleared.has(p.id);
    btn.className = 'level-tile' + (isCleared ? ' cleared' : '') + (isBest ? ' best' : '') + (isBoss ? ' boss' : '');
    const emblem = (state) =>
      `<span class="lv-emblem ${state}"><span class="le-inner">` +
      `<span class="le-halo"></span><span class="le-disc"></span>` +
      `<span class="le-ball eb1"></span><span class="le-ball eb2"></span></span></span>`;
    const mark = isBest
      ? emblem('best')
      : isCleared
        ? emblem('win')
        : t('levelMoves', { n: p.solution.minMoves });
    btn.innerHTML = `<span class="lv-no">${globalIdx + 1}</span>` +
      `<span class="lv-moves">${mark}</span>`;
    btn.addEventListener('click', () => startPuzzle(ch, i));
    grid.append(btn);
  });
}

// ---- プレイ ----
let G = null; // ゲーム状態
let lastClear = null; // 直近クリアの結果(A画面用): { moves, min, best }
let tsumiTimer = null; // クリア演出(2秒) → A画面 への自動遷移タイマー

function setCellPos(node, p, w, h) {
  node.style.width = 100 / w + '%';
  node.style.height = 100 / h + '%';
  setCellXY(node, p % w, (p - (p % w)) / w);
}
function setCellXY(node, x, y) {
  node.dataset.x = x;
  node.dataset.y = y;
  node.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
}

function buildBoard(room, w, h) {
  const board = el('board');
  const cells = el('cells');
  cells.style.gridTemplateColumns = `repeat(${w}, 1fr)`;
  cells.style.gridTemplateRows = `repeat(${h}, 1fr)`;
  const wallSet = new Set(room.walls.split(',').filter(Boolean).map(Number));
  for (let i = 0; i < w * h; i++) {
    cells.append(el('cell' + (wallSet.has(i) ? ' wall' : '')));
  }
  const goal = el('goal');
  setCellPos(goal, room.goal, w, h);
  const piece = el('piece');
  setCellPos(piece, room.start, w, h);
  const ball = el('ball');
  const ballFlash = el('ball-flash'); // 壁当ての一瞬の発光。ボールの子=crushに追従。主にライトの黒石用
  ball.append(ballFlash);
  piece.append(el('ball-glow'), ball);
  const bumpGlow = el('bump-glow'); // 壁当ての面ハイライト用(答え再生時)
  const ripple = el('bump-ripple'); // 壁当ての衝撃リップル(レバー6)。盤の外にはみ出すため #boards に置く
  const trailLayer = el('trail-layer'); // 通り道の尾引き(球の下に敷く)
  board.append(cells, goal, trailLayer, piece, bumpGlow); // trailLayer は piece より前=球の下
  return { board, goal, piece, ball, ballFlash, wallSet, goalIndex: room.goal, bumpGlow, ripple, trailLayer };
}

// ② 問題の登場: 盤がフェードイン(上→下の軽いスタッガー) → ゴールが現れる → 球がコトッと収まる(着地squash・2球同時=つがい)。
// 入れ子の transform 競合を避けるため、親(view/board)は opacity だけ動かし、transform は goal/ball だけにする。
function animatePuzzleEntrance() {
  if (REDUCED) return;
  const view = $('#view-play');
  if (view.animate) view.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
  G.rooms.forEach((rm, i) => {
    if (rm.board.animate) rm.board.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 300, delay: i * 80, easing: 'ease-out', fill: 'backwards' }); // B: 盤が上→下で置かれる
    if (rm.goal.animate) { // C: ゴールの輪が遅れてスケールイン(位置の translate は保持)
      const gx = +rm.goal.dataset.x, gy = +rm.goal.dataset.y;
      const base = `translate(${gx * 100}%, ${gy * 100}%)`;
      rm.goal.animate([
        { opacity: 0, transform: base + ' scale(0.78)' },
        { opacity: 1, transform: base + ' scale(1)' },
      ], { duration: 240, delay: 180, easing: 'ease-out', fill: 'backwards' });
    }
    if (rm.ball.animate) rm.ball.animate([ // A: 球がコトッと収まる(スケールイン→着地squash→settle)
      { opacity: 0, transform: 'scale(0.5)',        offset: 0 },
      { opacity: 1, transform: 'scale(1.12, 0.9)',  offset: 0.55 },
      {             transform: 'scale(0.97, 1.04)', offset: 0.75 },
      {             transform: 'scale(1, 1)',       offset: 1 },
    ], { duration: 320, delay: 520, easing: 'ease-out', fill: 'backwards' }); // 盤・ゴールが据わってから一拍おいて出す
  });
}

function _initPuzzle(puz, label, entrance) {
  hintGlows = [];
  AV = null;
  $('#answer-bar').hidden = true;
  $('#controls').hidden = false;
  $('#hint-keys').hidden = false;
  $('#move-count').hidden = false;
  if (puz.id !== hintPuzzleId) {
    hintSettings.light = false;
    hintPuzzleId = puz.id;
  }
  const { w, h } = puz.size;
  const boardsEl = $('#boards');
  boardsEl.replaceChildren();
  boardsEl.classList.remove('clear-best', 'clear-win', 'bouncing');
  const rooms = puz.rooms.map((r, i) => {
    const b = buildBoard(r, w, h);
    b.board.classList.toggle('active', i === 0);
    boardsEl.append(b.board);
    boardsEl.append(b.ripple);
    return b;
  });
  G = {
    puz, w, h, rooms,
    pos: puz.rooms.map((r) => r.start),
    moves: 0,
    history: [],
    busy: false,
    cleared: false,
  };
  $('#puzzle-label').textContent = label;
  $('#puzzle-no').textContent = label;
  updateInfo();
  updateGoals();
  updateHintUI();
  refreshWallHints();
  showView('play');
  if (entrance) animatePuzzleEntrance();
}

function startPuzzle(ch, index, entrance = true) {
  dailyMode = false;
  curChapter = ch;
  curIndex = index;
  const puz = chapterLevels(ch)[index];
  const globalNo = curChapter.from + index + 1;
  _initPuzzle(puz, `#${globalNo}`, entrance);
}

function startDailyPuzzle(entrance = true) {
  dailyMode = true;
  const puz = getDailyPuzzle();
  _initPuzzle(puz, t('dailyTitle'), entrance);
}

function restartCurrentPuzzle(entrance = true) {
  if (dailyMode) startDailyPuzzle(entrance);
  else startPuzzle(curChapter, curIndex, entrance);
}

function updateInfo() {
  $('#move-count').textContent = t('moveCount', { n: G.moves });
  $('#play-progress').textContent = `${G.moves}/${G.puz.solution.minMoves}${locale === 'ja' ? '手詰' : ''}`;
}

function updateGoals() {
  G.rooms.forEach((rm, i) => {
    rm.goal.classList.toggle('on', G.pos[i] === G.puz.rooms[i].goal);
  });
}

function step(p, d, wallSet, w, h) {
  const x = p % w;
  const y = (p - x) / w;
  const nx = x + DIRS[d][0];
  const ny = y + DIRS[d][1];
  if (nx < 0 || nx >= w || ny < 0 || ny >= h) return p;
  const np = ny * w + nx;
  return wallSet.has(np) ? p : np;
}

// ---- ジューシー化(操作の手応え): scale で「伸びて潰れて戻る」を出す ----
// 真上視点なので squash&stretch は scale で表現。位置(translate)は既存ロジックのまま壊さない。
// .piece には移動の transition が乗るので、scale は子の .ball にだけ重ねる(競合しない)。
const AXIS_H = (d) => d === 2 || d === 3; // 横移動(左/右)なら true

// 触覚: Capacitor Haptics(iOS/Android ネイティブ)優先、Web Vibration API フォールバック。
// style は 'light'(移動) / 'medium'(壁当て) / 'heavy'(反則・クリア)。
// Capacitor 未ロード(PWA/ブラウザ)では navigator.vibrate にフォールバック(iOS非対応=無音)。
const capHaptics = window.Capacitor?.Plugins?.Haptics;
function haptic(style) {
  if (REDUCED || !hapticsOn) return;
  if (capHaptics) {
    try { capHaptics.impact({ style: style || 'medium' }); } catch (e) {}
  } else {
    const ms = style === 'light' ? 7 : style === 'heavy' ? 20 : 14;
    try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {}
  }
}

// ---- 効果音(Web Audio 合成。音源ファイル不要)。静かな高級感に合わせ低音量・短い減衰 ----
// AudioContext は自動再生ポリシー対策で、入力(ユーザー操作)中に遅延生成し resume する。
// master に lowpass を噛ませ角の立たない丸い音に。鳴動は設定 seOn で制御(既定ON)。
let audioCtx = null, audioMaster = null;
function audio() {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      // latencyHint:'interactive' = 出力バッファを小さくし操作→発音の遅延を最小化。
      // 古い webkitAudioContext は options 非対応なので失敗時は無引数で生成。
      try { audioCtx = new AC({ latencyHint: 'interactive' }); }
      catch (e) { audioCtx = new AC(); }
      audioMaster = audioCtx.createGain();
      audioMaster.gain.value = 1.75; // 全体音量の底上げ(個々のgainはクリアに揃えた上で master で一律up)
      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 3200; lp.Q.value = 0.6;
      audioMaster.connect(lp).connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  } catch (e) { return null; }
}
// 遅延対策: 入力の最初の瞬間(capture段)に AudioContext を生成・resume して「温めて」おく。
// モバイルは無操作で AudioContext を suspend するため、温めずに鳴らすと初鳴り/間隔後の一手が
// 「currentTime に積んだのに resume 完了待ちで遅れて鳴る」状態になる。capture で doMove より先に
// resume を始め、初回だけ無音バッファでグラフを始動。実際の発音は各 playXxx が同じgesture内で即時スケジュール。
function warmAudio() {
  const ctx = audio();
  if (!ctx || ctx._warmed) return;
  ctx._warmed = true;
  try {
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); // 無音1サンプルでオーディオグラフを始動
    src.connect(ctx.destination); src.start(0);
  } catch (e) {}
}
['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
  document.addEventListener(ev, warmAudio, { passive: true, capture: true }));
// 1音: 周波数/波形/長さ/音量/ピッチ滑り/開始遅延を指定して鳴らす(指数減衰)
function tone(ctx, { freq, type = 'sine', dur = 0.12, gain = 0.07, glideTo = null, attack = 0.005, t0 = 0, cutoff = null }) {
  const start = ctx.currentTime + t0;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  if (cutoff) {
    // この音だけさらに低域寄りに丸める(こもり/サイレンサー感)。クリアには通さない
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 0.7;
    g.connect(lp); lp.connect(audioMaster);
  } else {
    g.connect(audioMaster);
  }
  osc.start(start);
  osc.stop(start + dur + 0.03);
}
// 移動: サイレンサー風。低く暗く・とても静か。鋭い立ち上がりを消す(やわらかいアタック)＋低めのlowpass
function playMove() {
  if (!seOn) return;
  const ctx = audio(); if (!ctx) return;
  tone(ctx, { freq: 360, glideTo: 260, type: 'sine', dur: 0.09, gain: 0.13, attack: 0.012, cutoff: 760 });
}
// 壁当て: 軽くこもった当たり。低い重さを抜いて高め・短く・小さめに(軽い「トッ」寄り)。lowpassで丸さは維持
function playBump() {
  if (!seOn) return;
  const ctx = audio(); if (!ctx) return;
  tone(ctx, { freq: 300, glideTo: 235, type: 'sine', dur: 0.075, gain: 0.13, attack: 0.005, cutoff: 1300 });
}
// クリア「ふわ〜ん」: やわらかいサインの上昇アルペジオ(C-E-G)＋余韻。最短は C6 のきらめきを追加
function playClear(best) {
  if (!seOn) return;
  const ctx = audio(); if (!ctx) return;
  tone(ctx, { freq: 523.25, dur: 0.9, gain: 0.05,  attack: 0.02, t0: 0.00 }); // C5
  tone(ctx, { freq: 659.25, dur: 0.9, gain: 0.045, attack: 0.02, t0: 0.08 }); // E5
  tone(ctx, { freq: 783.99, dur: 1.1, gain: 0.05,  attack: 0.02, t0: 0.16 }); // G5
  if (best) tone(ctx, { freq: 1046.5, dur: 1.0, gain: 0.04, attack: 0.02, t0: 0.30 }); // C6
}
// 反則(おてつき): やさしい否定。下行する2音(完全4度下げ)。角を取って低め・小さめ
function playFoul() {
  if (!seOn) return;
  const ctx = audio(); if (!ctx) return;
  tone(ctx, { freq: 392, glideTo: 372, type: 'sine', dur: 0.13, gain: 0.11, attack: 0.006, cutoff: 1400, t0: 0.00 }); // G4
  tone(ctx, { freq: 294, glideTo: 262, type: 'sine', dur: 0.24, gain: 0.12, attack: 0.006, cutoff: 1100, t0: 0.10 }); // D4→C4(沈む余韻)
}
// UIタップ音: ボタン押下の極小ティック(ゲーム音と別の軽い高め・とても静か)。設定SEで制御
function playTap() {
  if (!seOn) return;
  const ctx = audio(); if (!ctx) return;
  tone(ctx, { freq: 680, type: 'sine', dur: 0.045, gain: 0.052, attack: 0.004, cutoff: 2400 });
}

// 移動の手応え: 進行軸へ少し伸び → 着地で直交に潰れて戻る(settle)。「スッと行ってコトッ」
function squashMove(ball, d) {
  if (REDUCED || !ball || !ball.animate) return;
  const h = AXIS_H(d);
  const stretch = h ? 'scale(1.12, 0.90)' : 'scale(0.90, 1.12)';
  const squash  = h ? 'scale(0.93, 1.09)' : 'scale(1.09, 0.93)';
  ball.animate([
    { transform: 'scale(1,1)', offset: 0 },
    { transform: stretch,      offset: 0.45 },
    { transform: squash,       offset: 0.70 },
    { transform: 'scale(1,1)', offset: 1 },
  ], { duration: Math.round(MOVE_MS * 5 / 3), easing: 'ease-out' }); // 移動時間に比例(着地の潰れが滑り終わり直後に来る)
}

// 当たった部屋だけを進行軸へ極小シェイク(±2px)。室外には波及させない
function shakeBoard(board, d) {
  if (REDUCED || !board || !board.animate) return;
  const ax = DIRS[d][0] * 2, ay = DIRS[d][1] * 2;
  board.animate([
    { transform: 'translate(0,0)' },
    { transform: `translate(${ax}px, ${ay}px)`, offset: 0.35 },
    { transform: `translate(${-ax * 0.5}px, ${-ay * 0.5}px)`, offset: 0.7 },
    { transform: 'translate(0,0)' },
  ], { duration: 110, easing: 'ease-out' });
}

// 壁当て: 進行方向に少しめり込んで戻る + ボールが進行軸に潰れて弾き返す + 盤の微震。
// 「入力は通ったが空振り」の情報(SPEC.md 5章)を、手応えとして増幅する。
function bumpPiece(rm, d) {
  const piece = rm.piece;
  const x = +piece.dataset.x;
  const y = +piece.dataset.y;
  const base = `translate(${x * 100}%, ${y * 100}%)`;
  const off = `translate(${(x + DIRS[d][0] * 0.18) * 100}%, ${(y + DIRS[d][1] * 0.18) * 100}%)`;
  piece.animate(
    [{ transform: base }, { transform: off, offset: 0.4 }, { transform: base }],
    { duration: BUMP_MS || 1, easing: 'ease-out' }
  );
  if (!REDUCED && rm.ball && rm.ball.animate) {
    const h = AXIS_H(d);
    const crush = h ? 'scale(0.80, 1.16)' : 'scale(1.16, 0.80)';
    const rebound = h ? 'scale(1.05, 0.97)' : 'scale(0.97, 1.05)';
    rm.ball.animate([
      { transform: 'scale(1,1)', offset: 0 },
      { transform: crush,        offset: 0.4 },
      { transform: rebound,      offset: 0.72 }, // 反発のわずかな伸び
      { transform: 'scale(1,1)', offset: 1 },
    ], { duration: BUMP_MS || 1, easing: 'ease-out' });
    // レバー5: 当たった瞬間ボール自身も一瞬発光(輝度を上げて戻す)。filter なのでテーマに自然追従し、
    // 暗背景の金球では強く、ライトのマット黒石では控えめに出る(黒石の意匠を壊さない)。
    rm.ball.animate([
      { filter: 'brightness(1)',    offset: 0 },
      { filter: 'brightness(1.55)', offset: 0.32 },
      { filter: 'brightness(1)',    offset: 1 },
    ], { duration: (BUMP_MS || 1) * 2, easing: 'ease-out' });
    // 球面側にも接触光を一瞬だけ重ねる。ライトの黒石は強め、ダークの金球は薄くして
    // 既存の質感を保ったまま、壁当てがゲームの主役だと分かる手応えを出す。
    if (rm.ballFlash && rm.ballFlash.animate) {
      const peak = ballSkin === 'light' ? 0.8 : 0.32;
      rm.ballFlash.animate([
        { opacity: 0,   offset: 0 },
        { opacity: peak, offset: 0.28 },
        { opacity: 0,   offset: 1 },
      ], { duration: (BUMP_MS || 1) * 2, easing: 'ease-out' });
    }
  }
  shakeBoard(rm.board, d);
}

// 辺グローの配置: マス p の方向 d 側の辺(=ぶつかる面)に細い光を合わせる。
// 光は常にボールのマス内側へ寄せる(外周でも overflow で切れず、内部の壁と同じ太さに揃う)
function placeEdgeGlow(g, p, d) {
  const x = p % G.w;
  const y = (p - x) / G.w;
  const cw = 100 / G.w;
  const ch = 100 / G.h;
  g.style.cssText = '';
  if (d === 0 || d === 1) {
    // 上(0)/下(1): 横辺
    g.style.left = `${x * cw}%`;
    g.style.width = `${cw}%`;
    g.style.height = '4px';
    g.style.top = `${(d === 0 ? y : y + 1) * ch}%`;
    g.style.transform = d === 0 ? 'translateY(0)' : 'translateY(-4px)';
  } else {
    // 左(2)/右(3): 縦辺
    g.style.top = `${y * ch}%`;
    g.style.height = `${ch}%`;
    g.style.width = '4px';
    g.style.left = `${(d === 2 ? x : x + 1) * cw}%`;
    g.style.transform = d === 2 ? 'translateX(0)' : 'translateX(-4px)';
  }
}

// 壁当ての可視化(答え再生時): ぶつかった面だけを一瞬光らせる
function showBumpGlow(rm, p, d) {
  const g = rm.bumpGlow;
  placeEdgeGlow(g, p, d); // バーは細いまま、接触面だけを白熱させる。強調はにじみ/タイミング(CSS)で出す
  // レバー2: にじみ外層を、当たった壁の反対=開いた室内側へ寄せる方向ベクトル(キーフレームが使う)。
  // 当たり方向 DIRS[d] は壁側を指すので、室内側はその逆 -DIRS[d]。
  g.style.setProperty('--bloom-x', `${-DIRS[d][0] * 12}px`);
  g.style.setProperty('--bloom-y', `${-DIRS[d][1] * 12}px`);
  g.classList.remove('show');
  void g.offsetWidth; // アニメ再始動
  g.classList.add('show');
  clearTimeout(g._bumpTimer);
  g._bumpTimer = setTimeout(() => g.classList.remove('show'), 750); // 強調アニメ(750ms)を切らないよう延長
}

// レバー6: 衝撃リップル。接触辺の中点から金環が広がって消える。
// リップルは #boards 直下に置き、盤の overflow:hidden を超えて広がる。
function showRipple(rm, p, d) {
  if (REDUCED || !rm.ripple || !rm.ripple.animate) return;
  const r = rm.ripple;
  const boardRect = rm.board.getBoundingClientRect();
  const parentRect = rm.board.parentElement.getBoundingClientRect();
  const cellW = boardRect.width / G.w;
  const cellH = boardRect.height / G.h;
  const x = p % G.w, y = (p - (p % G.w)) / G.w;
  const dia = Math.min(cellW, cellH);
  // 中心 = 接触辺の中点(セル中心から当たり方向 DIRS[d] へ半セル寄せ)。#boards 相対の px 座標
  const cx = (boardRect.left - parentRect.left) + (x + 0.5 + DIRS[d][0] * 0.5) * cellW;
  const cy = (boardRect.top - parentRect.top) + (y + 0.5 + DIRS[d][1] * 0.5) * cellH;
  r.style.width = `${dia}px`;
  r.style.height = `${dia}px`;
  r.style.left = `${cx}px`;
  r.style.top = `${cy}px`;
  const isLight = theme === 'light';
  r.animate([
    { transform: 'translate(-50%, -50%) scale(0.3)', opacity: isLight ? 0.65 : 0.55, offset: 0 },
    { transform: 'translate(-50%, -50%) scale(1.5)', opacity: isLight ? 0.45 : 0.4,  offset: 0.35 },
    { transform: 'translate(-50%, -50%) scale(3.0)', opacity: 0,                      offset: 1 },
  ], { duration: isLight ? 720 : 560, easing: 'ease-out' });
}

// 通り道の尾引き: きれいに滑ったとき、通過したマスを順に一瞬照らして後ろへ消す。
// 壁当ての反発演出に対し「すっと通った」側の手応えを足し、どこを通ったかも読みやすくする。
// from→to は直線(片軸のみ移動)。着地マスは球自身が居るので除き、出発〜一つ手前を照らす。
function showTrail(rm, from, to, d) {
  if (REDUCED || !rm.trailLayer || !rm.trailLayer.animate) return;
  const [dx, dy] = DIRS[d];
  const fx = from % G.w, fy = (from - (from % G.w)) / G.w;
  const tx = to % G.w, ty = (to - (to % G.w)) / G.w;
  const steps = Math.abs(tx - fx) + Math.abs(ty - fy);
  if (steps <= 0) return;
  for (let s = 0; s < steps; s++) {
    const cx = fx + dx * s, cy = fy + dy * s;
    const cell = el('trail-cell');
    cell.style.width = 100 / G.w + '%';
    cell.style.height = 100 / G.h + '%';
    cell.style.transform = `translate(${cx * 100}%, ${cy * 100}%)`;
    rm.trailLayer.append(cell);
    const reach = (s / steps) * MOVE_MS; // 球がそのマスに差し掛かる頃に点灯(進行方向へ流れる)
    const a = cell.animate([
      { opacity: 0,    offset: 0 },
      { opacity: 0.72, offset: 0.18 },
      { opacity: 0,    offset: 1 },
    ], { duration: 460, delay: reach, easing: 'ease-out', fill: 'backwards' });
    a.onfinish = a.oncancel = () => cell.remove(); // 退色しきったら DOM を片付ける
  }
}

async function doMove(d) {
  if (!G || G.busy || G.cleared) return;
  clearWallHints(); // 局面が動くと壁ヒントの位置がずれるので消す
  const next = G.pos.map((p, i) => step(p, d, G.rooms[i].wallSet, G.w, G.h));
  const anyMoved = next.some((np, i) => np !== G.pos[i]);
  const anyBumped = next.some((np, i) => np === G.pos[i]);
  G.busy = true;

  // 動かす/弾く(反則でも、まず「行って」見せてから判定する)
  G.rooms.forEach((rm, i) => {
    if (next[i] === G.pos[i]) {
      bumpPiece(rm, d);
      showBumpGlow(rm, G.pos[i], d); // ぶつかった面を光らせる
      showRipple(rm, G.pos[i], d);   // 衝撃リップル(レバー6)
    } else {
      setCellXY(rm.piece, next[i] % G.w, (next[i] - (next[i] % G.w)) / G.w);
      squashMove(rm.ball, d); // 進行軸へ伸び→着地でつぶれて戻る(settle)
      showTrail(rm, G.pos[i], next[i], d); // 通り道の尾引き(G.pos はこの後で next に更新される=ここは旧位置)
    }
  });
  // 触覚＋効果音: ぶつかれば firm/「コッ」、きれいに動けば light/「トッ」。一手につき一度(両部屋で二度鳴らさない)。
  if (anyBumped) { haptic('medium'); playBump(); }
  else if (anyMoved) { haptic('light'); playMove(); }

  if (!anyMoved) {
    // 全員スキップ=無意味手。状態も手数も変えず、壁当てbumpだけ見せる(SPEC.md 3-1)
    await sleep(anyBumped ? BUMP_MS : 0);
    G.busy = false;
    refreshWallHints(); // 局面は不変だが光ヒントを出し直す
    return;
  }

  const allGoal = next.every((np, i) => np === G.rooms[i].goalIndex);
  const anyGoal = next.some((np, i) => np === G.rooms[i].goalIndex);
  // つがいの連動感: 片方が壁で止まり片方が進む=対が引き裂かれた「綻び」(章名の核)。二球の息を同時に
  // 一拍ひるませ、対であることを直感させる。クリア/反則(ゴール絡み)は専用演出があるので !anyGoal に限る。
  // ダークのみ(ライトは黒石を発光させない)。#boards 共有クラス=両球が完全同期。
  if (anyMoved && anyBumped && !anyGoal && !REDUCED && ballSkin !== 'light') {
    const be = $('#boards');
    be.classList.remove('strain'); void be.offsetWidth; be.classList.add('strain');
    clearTimeout(be._strainT); be._strainT = setTimeout(() => be.classList.remove('strain'), 460);
  }
  // ゴール吸着: クリアの一手(=両球が同時にゴールへ収まる)では、滑り込む間に輪がきゅっと締まって弾ける。
  // 反則(anyGoal && !allGoal)は祝福しないので対象外。スライドに重なるよう、await の前=今ここで点火する。
  if (allGoal && !REDUCED) G.rooms.forEach((rm) => {
    rm.goal.classList.remove('sucking'); void rm.goal.offsetWidth; rm.goal.classList.add('sucking');
    // 600ms まで保持: 黒皿のバウンド一発(plate-pop 560ms: ゆっくり拡大→0へ縮小)を最後まで見せてから外す
    clearTimeout(rm.goal._suckT); rm.goal._suckT = setTimeout(() => rm.goal.classList.remove('sucking'), 600);
  });
  G.history.push(G.pos);
  G.pos = next;
  G.moves++;
  updateInfo();

  await sleep(Math.max(MOVE_MS, anyBumped ? BUMP_MS : 0));
  updateGoals();

  // 同時でないのにゴールへ入った=反則。行って見せてから → 初形へ戻す
  if (anyGoal && !allGoal) {
    playFoul(); // C: やさしい否定音
    haptic('heavy'); // 反則の手触り
    if (!REDUCED) G.rooms.forEach((rm) => { // C: 盤に一拍の赤み
      rm.board.classList.remove('foul'); void rm.board.offsetWidth; rm.board.classList.add('foul');
      clearTimeout(rm.board._foulT); rm.board._foulT = setTimeout(() => rm.board.classList.remove('foul'), 560);
    });
    // 反則の局面(＋赤み)を一拍見せてから、履歴を逆再生して初形まで巻き戻す。メッセージは出さない。
    if (REDUCED) { restartCurrentPuzzle(); return; }
    await sleep(MISS_HOLD_MS);
    await slideToStart();
    restartCurrentPuzzle(false);
    return;
  }

  G.busy = false;
  refreshWallHints(); // 動いた先の局面で光ヒントを出し直す
  checkClear();
}

// 反則からの復帰: 初形へ戻してやり直す
// 反則メッセージを閉じる。初形への復帰は反則検出時(doMove)に済んでいるので、ここでは消すだけ
function dismissMiss() {
  $('#overlay-miss').hidden = true;
}

// 反則からの復帰: 現局面から初形へ、ボールを「直線で」一回のスライドで戻す。
// 手数が伸びても所要時間は一定(逆再生のように長くならない)。startPuzzle 前に見た目だけ先に戻す。
async function slideToStart() {
  const starts = G.puz.rooms.map((r) => r.start);
  const root = document.documentElement;
  const prev = root.style.getPropertyValue('--move-ms'); // インラインの上書き(通常は空=CSSの240ms)
  root.style.setProperty('--move-ms', RETURN_MS + 'ms'); // 戻りのスライド速度
  G.rooms.forEach((rm, i) => setCellXY(rm.piece, starts[i] % G.w, (starts[i] - (starts[i] % G.w)) / G.w));
  await sleep(RETURN_MS);
  if (prev) root.style.setProperty('--move-ms', prev); else root.style.removeProperty('--move-ms');
}

async function checkClear() {
  if (!G.pos.every((p, i) => p === G.puz.rooms[i].goal)) return;
  G.cleared = true;
  G.busy = true;
  const min = G.puz.solution.minMoves;
  const best = G.moves === min;
  if (!dailyMode) {
    markCleared(G.puz.id);
    if (best) markBest(G.puz.id);
  }
  lastClear = { moves: G.moves, min, best };

  // 点火: ボールが金(最短)/白(クリア)に発光して弾み、ゴールに光が満ちる。約1秒見せて A画面へ。
  // ダークは球が自発光するため、ゴール吸着(白い輪の伸縮 ~320ms)が収まってから点火し、吸着を潰さない。
  // ライト/モーション無効は球がマット or 演出なしで干渉しないので即時(従来どおり)。
  const afterSuck = !REDUCED && boardSkin !== 'light';
  const ignite = () => {
    if (!G.cleared || !$('#overlay-gap').hidden) return; // 待ちの間に遷移済みなら何もしない
    G.rooms.forEach((rm) => rm.goal.classList.add('filled')); // 光が満ちる
    $('#boards').classList.add(best ? 'clear-best' : 'clear-win', 'bouncing');
    playClear(best); // クリアの効果音(最短はきらめきを追加)。音はモーション無効でも鳴らす
    haptic('heavy'); // クリアの祝福
    if (REDUCED) { goToGap(); return; } // モーション無効: 演出を飛ばして A画面へ
    // A: つがいが同時に座る瞬間の一発演出(チャイムと同期)。両部屋のボールが祝福発光し、ゴールが一拍明るむ。
    // 既存のメダリオン/バウンスを壊さないよう、ジオメトリ非干渉(opacity/filter)だけで重ねる。
    G.rooms.forEach((rm) => {
      if (rm.ballFlash && rm.ballFlash.animate) {
        rm.ballFlash.animate([
          { opacity: 0,    offset: 0 },
          { opacity: 0.95, offset: 0.22 },
          { opacity: 0,    offset: 1 },
        ], { duration: 600, easing: 'ease-out' });
      }
      if (rm.goal && rm.goal.animate) {
        rm.goal.animate([
          { filter: 'brightness(1)',   offset: 0 },
          { filter: 'brightness(1.6)', offset: 0.28 },
          { filter: 'brightness(1)',   offset: 1 },
        ], { duration: 620, easing: 'ease-out' });
      }
    });
    // 球の発光＋弾みを約1秒見せてから A画面へ自動遷移(幕は廃止)。旧 200ms の余韻＋1秒を畳む
    clearTimeout(tsumiTimer);
    tsumiTimer = setTimeout(goToGap, 1200);
  };

  if (afterSuck) setTimeout(ignite, GOAL_SUCK_HOLD_MS); // 吸着の収まりを見せてから点火
  else ignite();
}

function resetPuzzle() {
  if (!G || G.busy || G.cleared) return;
  restartCurrentPuzzle();
}

// ---- ヒント(妙手の数 → 次の一手 → 答え。SPEC.md 6章) ----

// ヒント用の軽量BFS。今いる局面から最短で詰む「次の一手」と残り手数を返す。
// プールに答え(path)はあるが脇道に逸れると使えないため、その場で最短を解く。
// 新ルール(非同時のゴール進入は反則=枝刈り)を守る。状態空間は小さく一瞬。
function hintFromState(positions) {
  const { w, h, rooms } = G;
  const cells = w * h;
  const R = rooms.length;
  const goals = rooms.map((rm) => rm.goalIndex);
  const enc = (ps) => {
    let s = 0;
    for (let i = R - 1; i >= 0; i--) s = s * cells + ps[i];
    return s;
  };
  const start = enc(positions);
  const goalId = enc(goals);
  if (start === goalId) return { done: true };
  const dist = new Map([[start, 0]]);
  const parS = new Map();
  const parD = new Map();
  const queue = [start];
  let qi = 0;
  const ps = new Array(R);
  const nb = new Array(R);
  while (qi < queue.length) {
    const cur = queue[qi++];
    if (cur === goalId) break;
    let c = cur;
    for (let i = 0; i < R; i++) {
      ps[i] = c % cells;
      c = (c - ps[i]) / cells;
    }
    for (let d = 0; d < 4; d++) {
      let allGoal = true;
      let anyGoal = false;
      let moved = false;
      for (let i = 0; i < R; i++) {
        const np = step(ps[i], d, rooms[i].wallSet, w, h);
        nb[i] = np;
        if (np === goals[i]) anyGoal = true;
        else allGoal = false;
        if (np !== ps[i]) moved = true;
      }
      if (anyGoal && !allGoal) continue; // 反則手は指せない
      if (!moved) continue; // 無意味手
      let ns = 0;
      for (let i = R - 1; i >= 0; i--) ns = ns * cells + nb[i];
      if (!dist.has(ns)) {
        dist.set(ns, dist.get(cur) + 1);
        parS.set(ns, cur);
        parD.set(ns, d);
        queue.push(ns);
      }
    }
  }
  if (!dist.has(goalId)) return { unsolvable: true };
  const rev = [];
  for (let s = goalId; s !== start; s = parS.get(s)) rev.push(parD.get(s));
  const path = rev.reverse();
  return { dir: path[0], remaining: path.length, path };
}

// ヘルプボタンの状態(光の点灯・残数バッジ)を反映
function updateHintUI() {
  const lightBtn = $('#btn-hint-light');
  if (lightBtn) {
    lightBtn.classList.toggle('lit', hintSettings.light);
    setHintBadge(lightBtn, hintCredits.light);
  }
}
// 残数バッジ: 1以上は数字 / 0は ▶(広告)
function setHintBadge(btn, n) {
  const b = btn && btn.querySelector('.hint-badge');
  if (!b) return;
  if (n > 0) { b.textContent = String(n); b.classList.remove('ad'); }
  else { b.textContent = '▶'; b.classList.add('ad'); }
}
// 光ヒントONなら現局面のぶつかり面を出し直す。OFFなら消す
function refreshWallHints() {
  if (hintSettings.light && G && !G.cleared && !AV) showWallHints();
  else clearWallHints();
}

// ---- 壁ヒント: 今の局面からの解で「ぶつかる壁(妙手)」の面をすべて光らせる ----
let hintGlows = [];
function clearWallHints() {
  for (const g of hintGlows) g.remove();
  hintGlows = [];
}
// 現局面から解を解き、ボールがぶつかる面 {roomIndex, pos, dir} を全部集める
function collectWallHints() {
  const res = hintFromState(G.pos);
  if (!res.path) return []; // クリア済み/詰み筋なし
  const pos = G.pos.slice();
  const hints = [];
  const seen = new Set();
  for (const d of res.path) {
    const next = pos.map((p, i) => step(p, d, G.rooms[i].wallSet, G.w, G.h));
    for (let i = 0; i < G.rooms.length; i++) {
      if (next[i] === pos[i]) {
        // この部屋はこの手で壁/外周にぶつかった(=妙手の空振り)
        const key = `${i},${pos[i]},${d}`;
        if (!seen.has(key)) {
          seen.add(key);
          hints.push({ roomIndex: i, pos: pos[i], dir: d });
        }
      }
    }
    for (let i = 0; i < G.rooms.length; i++) pos[i] = next[i];
  }
  return hints;
}
function showWallHints() {
  clearWallHints();
  for (const h of collectWallHints()) {
    const g = el('hint-glow');
    placeEdgeGlow(g, h.pos, h.dir);
    G.rooms[h.roomIndex].board.appendChild(g);
    hintGlows.push(g);
  }
}

const ARROW = ['↑', '↓', '←', '→'];
let hintArrowTimer = null;
function showHintArrow(dir, sub) {
  $('#hint-arrow .arrow-mark').textContent = dir === null ? '—' : ARROW[dir];
  $('#hint-arrow .arrow-sub').textContent = sub;
  const node = $('#hint-arrow');
  node.hidden = false;
  node.classList.remove('show');
  void node.offsetWidth; // アニメ再始動
  node.classList.add('show');
  clearTimeout(hintArrowTimer);
  hintArrowTimer = setTimeout(() => {
    node.hidden = true;
  }, 2200);
}
function showNextMove() {
  if (!G || G.busy || G.cleared || AV) return;
  const res = hintFromState(G.pos);
  if (res.done) return;
  if (res.unsolvable) {
    showHintArrow(null, t('noSolution')); // 脇道で詰み筋を外した
    return;
  }
  showHintArrow(res.dir, t('nextMoveHint', { n: res.remaining }));
}

// ---- 答えビューア(自動再生 / 一手ずつ を切り替え) ----
// 答えは見せるだけ。クリア扱いにはせず、終了時に初形へ戻す。
let AV = null; // { path, blockSet, k, mode:'step'|'auto', playing, running }

// 初形から k 手適用した局面(戻る/頭出し用に再計算する)
function answerPosAt(k) {
  let pos = G.puz.rooms.map((r) => r.start);
  for (let j = 0; j < k; j++) {
    const d = AV.path[j];
    pos = pos.map((p, i) => step(p, d, G.rooms[i].wallSet, G.w, G.h));
  }
  return pos;
}
function placePieces(pos) {
  G.pos = pos;
  G.rooms.forEach((rm, i) =>
    setCellXY(rm.piece, pos[i] % G.w, (pos[i] - (pos[i] % G.w)) / G.w)
  );
  updateGoals();
}
function updateAnswerBar() {
  $('#ans-progress').textContent = `${AV.k} / ${AV.path.length}`;
  $('#btn-ans-play').textContent = AV.playing ? t('pause') : t('play');
  $('#btn-ans-prev').disabled = AV.k <= 0;
  $('#btn-ans-next').disabled = AV.k >= AV.path.length;
}

async function answerForward(animate) {
  if (!AV || AV.k >= AV.path.length) return;
  const d = AV.path[AV.k];
  const cur = G.pos;
  const next = cur.map((p, i) => step(p, d, G.rooms[i].wallSet, G.w, G.h));
  const anyBumped = next.some((np, i) => np === cur[i]);
  if (AV.blockSet.has(AV.k)) {
    // 妙手の可視化: ぶつかった壁/外周の、ぶつかった側面だけを光らせる
    G.rooms.forEach((rm, i) => {
      if (next[i] === cur[i]) { showBumpGlow(rm, cur[i], d); showRipple(rm, cur[i], d); }
    });
  }
  G.rooms.forEach((rm, i) => {
    if (next[i] === cur[i]) bumpPiece(rm, d);
    else { setCellXY(rm.piece, next[i] % G.w, (next[i] - (next[i] % G.w)) / G.w); squashMove(rm.ball, d); showTrail(rm, cur[i], next[i], d); }
  });
  G.pos = next;
  AV.k++;
  updateAnswerBar();
  updateGoals();
  if (animate) await sleep(Math.max(MOVE_MS, anyBumped ? BUMP_MS : 0));
}
function answerBack() {
  if (!AV || AV.k <= 0) return;
  AV.playing = false; // 手動操作で自動再生は止める
  AV.k--;
  placePieces(answerPosAt(AV.k)); // 戻りは滑らせるだけ(bumpなし)
  updateAnswerBar();
}
function pauseAnswerIfPlaying() {
  if (AV && AV.playing) {
    AV.playing = false;
    updateAnswerBar();
  }
}

async function answerAutoLoop() {
  if (AV.running) return; // 二重起動防止
  AV.running = true;
  while (AV && AV.playing && AV.k < AV.path.length) {
    await answerForward(true);
    if (!AV || !AV.playing) break;
    await sleep(ANSWER_AUTO_GAP);
  }
  if (!AV) return;
  const finished = AV.playing && AV.k >= AV.path.length; // 一時停止でなく最後まで再生し切った
  AV.playing = false;
  AV.running = false;
  if (finished) {
    await sleep(REDUCED ? 0 : 900); // 詰み形を一拍見せてから
    if (AV) {
      AV.k = 0; // 頭出し(0/N)へ戻す
      placePieces(answerPosAt(0));
    }
  }
  if (AV) updateAnswerBar();
}

function toggleAnswerPlay() {
  if (!AV) return;
  if (AV.k >= AV.path.length) {
    AV.k = 0; // 末尾なら頭出し
    placePieces(answerPosAt(0));
  }
  AV.playing = !AV.playing;
  updateAnswerBar();
  if (AV.playing) answerAutoLoop();
}

function enterAnswer() {
  if (!G || G.busy) return;
  restartCurrentPuzzle(); // 初形へ
  AV = {
    path: G.puz.solution.path,
    blockSet: new Set(G.puz.analysis.blockMoveIndices),
    k: 0,
    playing: false,
    running: false,
  };
  clearWallHints(); // 答えビューア中は光ヒントを出さない
  $('#controls').hidden = true;
  $('#hint-keys').hidden = true;
  $('#move-count').hidden = true; // 進捗は answer-bar に出す
  $('#answer-bar').hidden = false;
  updateAnswerBar();
}
function closeAnswer() {
  if (!AV) return;
  AV.playing = false;
  AV = null;
  $('#answer-bar').hidden = true;
  $('#controls').hidden = false;
  $('#hint-keys').hidden = false;
  $('#move-count').hidden = false;
  restartCurrentPuzzle(); // 初形へ戻して自力で挑戦(クリアにはしない)。光も復帰
}

// ---- クリア後の流れ: 盤の演出(2秒) → A画面(切れ目) → 次へ/もう一度/一覧 ----
// A画面: 手数/最短 ・ つがいエンブレム(最短=金/クリア=銀) ・ 章の進捗 を出す。弾みは盤からエンブレムへ継ぐ。
function goToGap() {
  if (!$('#overlay-gap').hidden) return; // 二重防止
  clearTimeout(tsumiTimer);
  $('#boards').classList.remove('bouncing'); // 盤の弾みは止める(エンブレムが弾む)
  const { moves, min, best } = lastClear || { moves: 0, min: 0, best: false };
  $('#gap-moves-1').textContent = t('clearedMoves', { n: moves });
  $('#gap-moves-2').textContent = best ? t('fewest') : t('fewestIs', { n: min });
  $('#gap-moves').classList.toggle('best', best);
  const em = $('#gap-emblem');
  em.classList.remove('best', 'win');
  em.classList.add(best ? 'best' : 'win');

  if (dailyMode) {
    const dr = handleDailyClear(moves, min);
    if (dr) {
      let html = `<span class="daily-streak-result">${t('dailyStreak', { n: dr.streak })}</span>`;
      const rw = dr.reward;
      html += `<span class="daily-reward-line">${t('dailyReward')}: ${t('hintLight')} ×${rw.light}`;
      if (rw.answer > 0) html += `　${t('hintAnswer')} ×${rw.answer}`;
      html += `</span>`;
      if (dr.streakReward) {
        const sr = dr.streakReward;
        html += `<span class="daily-reward-line streak-bonus">${t('dailyStreakBonus', { n: sr.days })}</span>`;
      }
      $('#gap-progress').innerHTML = html;
    } else {
      const ds = loadDailyState();
      $('#gap-progress').innerHTML = `<span class="daily-streak-result">${t('dailyStreak', { n: ds.streak })}</span>`;
    }
    $('#btn-next').textContent = t('levels');
    $('#btn-share').hidden = false;
  } else {
    const levels = chapterLevels(curChapter);
    const done = levels.filter((p) => cleared.has(p.id)).length;
    $('#gap-progress').innerHTML = `<b>${done}</b> / ${levels.length}`;
    $('#btn-next').textContent = t('nextPuzzle');
    $('#btn-share').hidden = true;
  }
  showInterstitial();
  $('#overlay-gap').hidden = false;
  if (!REDUCED) { // ① つなぎ演出: 背景フェード＋カード立ち上がり＋2球が寄り集まる(.enter を付け直して毎回再生)
    const ov = $('#overlay-gap');
    ov.classList.remove('enter'); void ov.offsetWidth; ov.classList.add('enter');
  }
}

$('#btn-next').addEventListener('click', () => {
  $('#overlay-gap').hidden = true;
  if (dailyMode) { dailyMode = false; showLevels(curChapter || CHAPTERS[0]); return; }
  const levels = chapterLevels(curChapter);
  if (curIndex + 1 < levels.length) startPuzzle(curChapter, curIndex + 1);
  else showLevels(curChapter);
});
$('#btn-list').addEventListener('click', () => {
  $('#overlay-gap').hidden = true;
  dailyMode = false;
  showLevels(curChapter || CHAPTERS[0]);
});
$('#btn-retry').addEventListener('click', () => {
  $('#overlay-gap').hidden = true;
  restartCurrentPuzzle();
});
$('#btn-share').addEventListener('click', async () => {
  const s = loadDailyState();
  const { moves, best } = lastClear;
  const text = t('dailyShareText', { day: dailyDayNumber(), moves, best: best ? '1' : '0', streak: s.streak });
  try {
    if (navigator.share) await navigator.share({ text });
    else { await navigator.clipboard.writeText(text); showToast(t('copied')); }
  } catch (e) {}
});

$('#btn-theme').addEventListener('click', () => {
  playTap();
  theme = theme === 'light' ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, theme);
  applyTheme();
});
// 設定ドロワー(右サイドシート): 歯車で開く / ×・スクリム・Esc で閉じる
function openSettings() { $('#settings-drawer').classList.add('open'); }
function closeSettings() { $('#settings-drawer').classList.remove('open'); }
$('#btn-settings').addEventListener('click', openSettings);
$('#btn-settings-close').addEventListener('click', closeSettings);
$('#settings-drawer').querySelector('.drawer-scrim').addEventListener('click', closeSettings);

// ---- 設定の中身 ----
// 音/触覚: 本体は実装済み(seOn=playMove/Bump/Clear/Foul/Tap、hapticsOn=haptic())。ここは設定値の保存/トグルのみ。既定ON
const SE_KEY = 'nikenzume.se.v1', HAPTICS_KEY = 'nikenzume.haptics.v1';
let seOn = localStorage.getItem(SE_KEY) !== '0';
let hapticsOn = localStorage.getItem(HAPTICS_KEY) !== '0';
function updateSettingsUI() {
  const lv = $('#lang-value'); if (lv) lv.textContent = locale === 'ja' ? '日本語' : 'English';
  const se = $('#sw-se'); if (se) se.setAttribute('aria-pressed', String(seOn));
  const hp = $('#sw-haptics'); if (hp) hp.setAttribute('aria-pressed', String(hapticsOn));
}
// 言語切替: ロケール変更→保存→静的文言再翻訳→表示中ビューの動的文言を再描画
function relocalize(newLocale) {
  if (!STRINGS[newLocale] || newLocale === locale) return;
  locale = newLocale;
  localStorage.setItem(LANG_KEY, newLocale);
  fillI18n();
  if (!$('#view-chapters').hidden) showChapters();
  else if (!$('#view-levels').hidden && curChapter) showLevels(curChapter);
  if (!$('#view-play').hidden && G) {
    const globalNo = dailyMode ? t('dailyTitle') : `#${curChapter.from + curIndex + 1}`;
    $('#puzzle-label').textContent = globalNo;
    $('#puzzle-no').textContent = globalNo;
    updateInfo();
  }
  updateSettingsUI();
}
// 進捗(クリア/最短)を消去
function resetProgress() {
  if (!confirm(t('resetConfirm'))) return;
  cleared.clear(); localStorage.removeItem(STORE_KEY);
  bestCleared.clear(); localStorage.removeItem(BEST_KEY);
  localStorage.removeItem(DAILY_KEY);
  if (!$('#view-chapters').hidden) showChapters();
  else if (!$('#view-levels').hidden && curChapter) showLevels(curChapter);
  closeSettings();
}
// 簡易トースト(未実装項目の「準備中」など)
let toastTimer = null;
function showToast(msg) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1300);
}
$('#set-lang').addEventListener('click', () => relocalize(locale === 'ja' ? 'en' : 'ja'));
$('#set-reset').addEventListener('click', resetProgress);
// 遊び方
function openHowto() { closeSettings(); $('#howto-overlay').hidden = false; }
function closeHowto() { $('#howto-overlay').hidden = true; }
$('#set-howto').addEventListener('click', openHowto);
$('#btn-howto-close').addEventListener('click', closeHowto);
// 情報オーバーレイ(バージョン/PP/お問い合わせ)
function openInfoOverlay(id) { closeSettings(); $(`#${id}-overlay`).hidden = false; }
function closeInfoOverlay(id) { $(`#${id}-overlay`).hidden = true; }
['version', 'privacy'].forEach(id => {
  $(`#set-${id}`).addEventListener('click', () => openInfoOverlay(id));
  $(`#btn-${id}-close`).addEventListener('click', () => closeInfoOverlay(id));
});
// 統計・実績
const ACHIEVEMENTS = [
  { id: 'clear1',   icon: '🎯', req: () => cleared.size >= 1 },
  { id: 'clear10',  icon: '🎯', req: () => cleared.size >= 10 },
  { id: 'clear50',  icon: '🎯', req: () => cleared.size >= 50 },
  { id: 'clear100', icon: '🎯', req: () => cleared.size >= 100 },
  { id: 'best1',    icon: '⭐', req: () => bestCleared.size >= 1 },
  { id: 'best10',   icon: '⭐', req: () => bestCleared.size >= 10 },
  { id: 'best50',   icon: '⭐', req: () => bestCleared.size >= 50 },
  { id: 'daily1',   icon: '📅', req: () => loadDailyState().totalDays >= 1 },
  { id: 'streak7',  icon: '🔥', req: () => loadDailyState().maxStreak >= 7 },
  { id: 'streak14', icon: '🔥', req: () => loadDailyState().maxStreak >= 14 },
  { id: 'streak30', icon: '🔥', req: () => loadDailyState().maxStreak >= 30 },
];
function renderStats() {
  const total = MODES.normal.levels.length;
  const ds = loadDailyState();
  const unlocked = ACHIEVEMENTS.filter(a => a.req()).length;
  let html = '<div class="stat-grid">';
  html += `<div class="stat-box"><div class="stat-val">${cleared.size}</div><div class="stat-lbl">${t('statCleared')}</div><div class="stat-sub">/ ${total}</div></div>`;
  html += `<div class="stat-box"><div class="stat-val">${bestCleared.size}</div><div class="stat-lbl">${t('statBest')}</div><div class="stat-sub">/ ${total}</div></div>`;
  html += '</div>';
  html += `<div class="stat-sec">${t('statDaily')}</div>`;
  html += '<div class="stat-grid tri">';
  html += `<div class="stat-box"><div class="stat-val">${ds.totalDays}</div><div class="stat-lbl">${t('statDaysPlayed')}</div></div>`;
  html += `<div class="stat-box"><div class="stat-val">${ds.streak}</div><div class="stat-lbl">${t('statCurrentStreak')}</div></div>`;
  html += `<div class="stat-box"><div class="stat-val">${ds.maxStreak || 0}</div><div class="stat-lbl">${t('statMaxStreak')}</div></div>`;
  html += '</div>';
  html += `<div class="stat-sec">${t('statAchievements')} <span class="stat-dim">${unlocked} / ${ACHIEVEMENTS.length}</span></div>`;
  html += '<div class="ach-list">';
  for (const a of ACHIEVEMENTS) {
    const done = a.req();
    html += `<div class="ach-row${done ? ' done' : ''}"><span class="ach-icon">${done ? a.icon : '🔒'}</span><span class="ach-name">${t('ach_' + a.id)}</span></div>`;
  }
  html += '</div>';
  $('#stats-content').innerHTML = html;
}
function openStats() { closeSettings(); renderStats(); $('#stats-overlay').hidden = false; }
$('#set-stats').addEventListener('click', openStats);
$('#btn-stats-close').addEventListener('click', () => { $('#stats-overlay').hidden = true; });
// お問い合わせ: Googleフォームへ外部遷移(TODO: URL差し替え)
$('#set-contact').addEventListener('click', () => {
  window.open('https://forms.gle/PLACEHOLDER', '_blank', 'noopener');
});
$('#sw-se').addEventListener('click', () => { seOn = !seOn; localStorage.setItem(SE_KEY, seOn ? '1' : '0'); updateSettingsUI(); });
$('#sw-haptics').addEventListener('click', () => { hapticsOn = !hapticsOn; localStorage.setItem(HAPTICS_KEY, hapticsOn ? '1' : '0'); updateSettingsUI(); });
// 未実装項目(data-soon)タップ → 「準備中」
$('#settings-drawer').addEventListener('click', (e) => {
  if (e.target.closest('[data-soon]')) showToast(t('soon'));
});

$('#daily-card').addEventListener('click', () => startDailyPuzzle());
$('#btn-reset').addEventListener('click', resetPuzzle);
$('#overlay-miss').addEventListener('click', dismissMiss); // 反則メッセージは任意の画面タップで閉じる
// 答え = 毎回リワード広告(差し込み口)→ 答えビューア
$('#btn-answer-open').addEventListener('click', () => spendHint('answer', enterAnswer));
// 光ヒント = 1回消費してその問題で点灯(点灯済みなら据え置き=消費しない)
$('#btn-hint-light').addEventListener('click', () => {
  if (!G || G.busy || G.cleared || AV) return;
  if (hintSettings.light) return;
  spendHint('light', () => { hintSettings.light = true; refreshWallHints(); });
});
// 次の手ヒントはUIから外した。関数/クレジットは既存データ互換のため残している。
$('#btn-ans-prev').addEventListener('click', answerBack);
$('#btn-ans-next').addEventListener('click', () => {
  pauseAnswerIfPlaying();
  answerForward(true);
});
$('#btn-ans-play').addEventListener('click', toggleAnswerPlay);
$('#btn-ans-close').addEventListener('click', closeAnswer);

// ---- 入力: 矢印キー + スワイプ(SPEC.md タスクB) ----
const KEYMAP = {
  ArrowUp: 0, ArrowDown: 1, ArrowLeft: 2, ArrowRight: 3,
  w: 0, s: 1, a: 2, d: 3,
};
document.addEventListener('keydown', (e) => {
  if (!$('#howto-overlay').hidden) {
    if (e.key === 'Escape') closeHowto();
    return;
  }
  if (!$('#stats-overlay').hidden) {
    if (e.key === 'Escape') $('#stats-overlay').hidden = true;
    return;
  }
  for (const id of ['version', 'privacy']) {
    if (!$(`#${id}-overlay`).hidden) {
      if (e.key === 'Escape') closeInfoOverlay(id);
      return;
    }
  }
  if ($('#settings-drawer').classList.contains('open')) {
    if (e.key === 'Escape') closeSettings();
    return; // 設定表示中は盤操作を受けない
  }
  if (!$('#overlay-miss').hidden) {
    dismissMiss(); // 任意キーで閉じる(復帰は済んでいる)
    return;
  }
  if (!$('#overlay-gap').hidden) return;
  if ($('#view-play').hidden) return;
  if (AV) {
    // 答えビューア中: ←/→ で一手ずつ、Space で再生/一時停止、Esc で終了
    if (e.key === 'ArrowLeft') { e.preventDefault(); answerBack(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); pauseAnswerIfPlaying(); answerForward(true); }
    else if (e.key === ' ') { e.preventDefault(); toggleAnswerPlay(); }
    else if (e.key === 'Escape') closeAnswer();
    return;
  }
  const d = KEYMAP[e.key];
  if (d !== undefined) {
    e.preventDefault();
    doMove(d);
  }
});

let touchStart = null;
const playView = $('#view-play');
// スワイプは画面全体で受ける(盤の外・下の余白でも効く)。プレイ中のみ・オーバーレイ表示中は無視。
document.addEventListener('touchstart', (e) => {
  touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
document.addEventListener('touchend', (e) => {
  if (!touchStart) return;
  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  touchStart = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return; // タップは無視
  if (playView.hidden) return; // プレイ画面以外(章/問題一覧)はスクロールを妨げない
  // クリア/反則/切れ目オーバーレイ表示中はスワイプ操作しない
  if (!$('#overlay-gap').hidden || !$('#overlay-miss').hidden) return;
  if (AV) {
    // 答えビューア中: 左右スワイプで一手ずつ進む/戻る
    if (Math.abs(dx) > Math.abs(dy)) {
      pauseAnswerIfPlaying();
      dx > 0 ? answerForward(true) : answerBack();
    }
    return;
  }
  const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 2) : (dy > 0 ? 1 : 0);
  doMove(d);
}, { passive: true });

// PC向け: マスのクリックでも操作できる(マウス/テスト用)。
// スワイプと同じく「方向を1つ決めて1マスだけ動く」に翻訳する(行き先へのワープではない)。
// クリックした部屋のボールから、クリック位置の優勢な軸で方向を出し、全部屋へ連動(doMove)。
// マウス限定(pointerType==='mouse'): スマホのタップは現状どおり無反応のままにし、出荷時の挙動を変えない。
$('#boards').addEventListener('pointerup', (e) => {
  if (e.pointerType !== 'mouse' || e.button !== 0) return;
  if (!G || G.busy || G.cleared) return;
  if ($('#view-play').hidden) return;
  if (!$('#overlay-gap').hidden || !$('#overlay-miss').hidden) return;
  if (AV) return; // 答えビューア中はクリック操作しない
  const board = e.target.closest('.board');
  if (!board) return;
  const i = G.rooms.findIndex((rm) => rm.board === board);
  if (i < 0) return;
  const rect = board.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const cx = Math.min(G.w - 1, Math.max(0, Math.floor((e.clientX - rect.left) / rect.width * G.w)));
  const cy = Math.min(G.h - 1, Math.max(0, Math.floor((e.clientY - rect.top) / rect.height * G.h)));
  const p = G.pos[i];
  const bx = p % G.w, by = (p - (p % G.w)) / G.w;
  const ddx = cx - bx, ddy = cy - by;
  if (ddx === 0 && ddy === 0) return; // ボール自身のマス=方向が決まらない
  // 優勢な軸で方向(0上1下2左3右)。45度ちょうど(|dx|==|dy|)は横を優先。
  const d = Math.abs(ddx) >= Math.abs(ddy) ? (ddx > 0 ? 3 : 2) : (ddy > 0 ? 1 : 0);
  doMove(d);
});

// ---- ログインボーナス表示 ----
function showLoginModal(result) {
  const overlay = $('#overlay-login');
  const daysEl = $('#login-days');
  const rewardEl = $('#login-reward');
  daysEl.replaceChildren();

  if (result.type === 'first') {
    for (let i = 0; i < 7; i++) {
      const d = el('login-day');
      d.textContent = `Day ${i + 1}`;
      daysEl.appendChild(d);
    }
    rewardEl.innerHTML = `<span class="reward-line">${t('hintLight')} ×${result.reward.light}</span>`
      + `<span class="reward-line">${t('hintAnswer')} ×${result.reward.answer}</span>`;
  } else {
    const s = loadLoginState();
    const cycleDay = (s.day - 1) % 7;
    for (let i = 0; i < 7; i++) {
      const d = el('login-day');
      d.textContent = `Day ${i + 1}`;
      if (i < cycleDay) d.classList.add('done');
      if (i === cycleDay) d.classList.add('today');
      daysEl.appendChild(d);
    }
    const rw = result.reward;
    let lines = `<span class="reward-line">${t('hintLight')} ×${rw.light}</span>`;
    if (rw.answer > 0) lines += `<span class="reward-line">${t('hintAnswer')} ×${rw.answer}</span>`;
    rewardEl.innerHTML = lines;
  }

  overlay.hidden = false;
  $('#btn-login-close').onclick = () => {
    overlay.hidden = true;
    updateHintUI();
  };
}

// ---- 起動 ----
applyTheme(); // data-theme を確定し、トグルの状態を反映
fillI18n(); // 静的文言(ボタン・タグライン等)をロケールで流し込む
updateSettingsUI(); // 設定の言語値・スイッチ状態を反映
showChapters();

const loginResult = checkLoginBonus();
if (loginResult) showLoginModal(loginResult);
