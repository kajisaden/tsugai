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

const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]]; // 0=上 1=下 2=左 3=右
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOVE_MS = REDUCED ? 0 : 120;
const BUMP_MS = REDUCED ? 0 : 200;
const ANSWER_AUTO_GAP = REDUCED ? 260 : 520; // 答え自動再生の手間

// ---- 章編成: 2段階構造 (章=気づき / 章内=サイズ→手数) ----
// 外側(章) = episodes(ズレ調整エピソード数 = プレイヤーが要する「気づき」の数)。最大の難度区分。
// 内側(章内) = サイズ→手数 の昇順。盤が 4x4→5x5 と広がり、各サイズ内で手数が滑らかに増える。
// 章境界での手数リセットは「新章の自然な再上昇」になり、見た目(手数)と難度の逆行が消える。
// 視認性の限界は 5x5。6x6 は本体から外す。導入(第一章の頭)は ep0 の 1〜2手のみ(ただ歩く体験)。
const ep = (p) => p.analysis.episodes;
const sz = (p) => p.size.w;
const mv = (p) => p.solution.minMoves;
const SMALL = (p) => p.size.w <= 5; // 6x6廃止(視認性の限界は5x5)
// 章名は i18n(Chapter {n} / 第{n}章)。難度区分は気づき(ep)で、章番号≒気づき数。
const CHAPTERS = [
  { id: 'ch1', count: 20, pick: (p) => SMALL(p) && ((ep(p) === 0 && mv(p) <= 2) || ep(p) === 1) },
  { id: 'ch2', count: 20, pick: (p) => SMALL(p) && ep(p) === 2 },
  { id: 'ch3', count: 20, pick: (p) => SMALL(p) && ep(p) === 3 },
  { id: 'ch4', count: 20, pick: (p) => SMALL(p) && ep(p) === 4 },
  { id: 'ch5', count: 20, pick: (p) => SMALL(p) && ep(p) === 5 },
  // ep6以上は MVP 除外(在庫僅少。プールには残し、将来のアップデート章に回す)
];

// 章内は サイズ→手数 の昇順(案X内側)。全域から等間隔に count 問とり、章内に勾配をつくる。
function sliceChapter(ch) {
  const all = POOL.puzzles
    .filter(ch.pick)
    .sort((a, b) => sz(a) - sz(b) || mv(a) - mv(b) || a.id - b.id);
  if (all.length <= ch.count) return all;
  const out = [];
  for (let i = 0; i < ch.count; i++) {
    out.push(all[Math.floor((i * (all.length - 1)) / (ch.count - 1))]);
  }
  return out;
}
const chapterLevels = new Map(CHAPTERS.map((c) => [c.id, sliceChapter(c)]));

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

// ヒント設定(全問持続)。light=ぶつかる壁を常時光らせる / next=次の一手ボタンを出す
const HINT_KEY = 'nikenzume.hints.v1';
const hintSettings = Object.assign(
  { light: false, next: false },
  JSON.parse(localStorage.getItem(HINT_KEY) ?? '{}')
);
function saveHintSettings() {
  localStorage.setItem(HINT_KEY, JSON.stringify(hintSettings));
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
  }
  $('#btn-back').hidden = name === 'chapters';
}
$('#btn-back').addEventListener('click', () => {
  if (!$('#view-play').hidden) showLevels(curChapter);
  else showChapters();
});

function showChapters() {
  showView('chapters');
  const list = $('#chapter-list');
  list.replaceChildren();
  CHAPTERS.forEach((ch, i) => {
    const levels = chapterLevels.get(ch.id);
    const done = levels.filter((p) => cleared.has(p.id)).length;
    const btn = document.createElement('button');
    btn.className = 'chapter-card';
    btn.innerHTML = `<span class="ch-name">${t('chapter', { n: i + 1 })}</span>` +
      `<span class="ch-meta">${done} / ${levels.length}</span>`;
    btn.addEventListener('click', () => showLevels(ch));
    list.append(btn);
  });
}

function showLevels(ch) {
  curChapter = ch;
  showView('levels');
  $('#levels-title').textContent = t('chapter', { n: CHAPTERS.indexOf(ch) + 1 });
  const grid = $('#level-grid');
  grid.replaceChildren();
  chapterLevels.get(ch.id).forEach((p, i) => {
    const btn = document.createElement('button');
    const isCleared = cleared.has(p.id);
    const isBest = bestCleared.has(p.id);
    btn.className = 'level-tile' + (isCleared ? ' cleared' : '') + (isBest ? ' best' : '');
    // 最短=金ボール / クリア(非最短)=白ボール / 未クリア=手数 (クリア画面の金/白と統一)
    const mark = isBest
      ? '<span class="lv-ball"></span>'
      : isCleared
        ? '<span class="lv-ball win"></span>'
        : t('levelMoves', { n: p.solution.minMoves });
    btn.innerHTML = `<span class="lv-no">${i + 1}</span>` +
      `<span class="lv-moves">${mark}</span>`;
    btn.addEventListener('click', () => startPuzzle(ch, i));
    grid.append(btn);
  });
}

// ---- プレイ ----
let G = null; // ゲーム状態

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
  const wallSet = new Set(room.walls.split(',').filter(Boolean).map(Number));
  for (let i = 0; i < w * h; i++) {
    cells.append(el('cell' + (wallSet.has(i) ? ' wall' : '')));
  }
  const goal = el('goal');
  setCellPos(goal, room.goal, w, h);
  const piece = el('piece');
  setCellPos(piece, room.start, w, h);
  piece.append(el('ball-glow'), el('ball'));
  const bumpGlow = el('bump-glow'); // 壁当ての面ハイライト用(答え再生時)
  board.append(cells, goal, piece, bumpGlow);
  return { board, goal, piece, wallSet, goalIndex: room.goal, bumpGlow };
}

function startPuzzle(ch, index) {
  curChapter = ch;
  curIndex = index;
  hintGlows = []; // 盤を作り直すので壁ヒントの参照を捨てる
  // 答えビューア状態を必ず終了させる(別問題を開いたとき前問の答えが残るバグ対策)
  AV = null;
  $('#answer-bar').hidden = true;
  $('#controls').hidden = false;
  $('#hint-toggles').hidden = false;
  $('#hint-keys').hidden = false;
  $('#move-count').hidden = false;
  const puz = chapterLevels.get(ch.id)[index];
  const { w, h } = puz.size;
  const boardsEl = $('#boards');
  boardsEl.replaceChildren();
  boardsEl.classList.remove('clear-best', 'clear-win'); // 前問のクリア発光を消す
  const rooms = puz.rooms.map((r) => {
    const b = buildBoard(r, w, h);
    boardsEl.append(b.board);
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
  $('#puzzle-label').textContent = t('puzzlePar', { n: puz.solution.minMoves });
  updateInfo();
  updateGoals();
  updateHintUI(); // トグル状態と「次の一手」ボタンを反映
  refreshWallHints(); // 光ONなら新しい盤でも光らせる
  showView('play');
}

function updateInfo() {
  $('#move-count').textContent = t('moveCount', { n: G.moves });
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

// 壁当て: 進行方向に少しめり込んで戻る。「入力は通ったが空振り」の情報(SPEC.md 5章)
function bumpPiece(piece, d) {
  const x = +piece.dataset.x;
  const y = +piece.dataset.y;
  const base = `translate(${x * 100}%, ${y * 100}%)`;
  const off = `translate(${(x + DIRS[d][0] * 0.18) * 100}%, ${(y + DIRS[d][1] * 0.18) * 100}%)`;
  piece.animate(
    [{ transform: base }, { transform: off, offset: 0.4 }, { transform: base }],
    { duration: BUMP_MS || 1, easing: 'ease-out' }
  );
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
  placeEdgeGlow(g, p, d);
  g.classList.remove('show');
  void g.offsetWidth; // アニメ再始動
  g.classList.add('show');
  clearTimeout(g._bumpTimer);
  g._bumpTimer = setTimeout(() => g.classList.remove('show'), 600);
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
      bumpPiece(rm.piece, d);
      showBumpGlow(rm, G.pos[i], d); // ぶつかった面を光らせる
    } else {
      setCellXY(rm.piece, next[i] % G.w, (next[i] - (next[i] % G.w)) / G.w);
    }
  });

  if (!anyMoved) {
    // 全員スキップ=無意味手。状態も手数も変えず、壁当てbumpだけ見せる(SPEC.md 3-1)
    await sleep(anyBumped ? BUMP_MS : 0);
    G.busy = false;
    refreshWallHints(); // 局面は不変だが光ヒントを出し直す
    return;
  }

  const allGoal = next.every((np, i) => np === G.rooms[i].goalIndex);
  const anyGoal = next.some((np, i) => np === G.rooms[i].goalIndex);
  G.history.push(G.pos);
  G.pos = next;
  G.moves++;
  updateInfo();

  await sleep(Math.max(MOVE_MS, anyBumped ? BUMP_MS : 0));
  updateGoals();

  // 同時でないのにゴールへ入った=反則。行って → 一手戻す/初形へ を選ばせる
  if (anyGoal && !allGoal) {
    await sleep(REDUCED ? 0 : 260);
    $('#overlay-miss').hidden = false;
    return; // G.busy のまま選択を待つ
  }

  G.busy = false;
  refreshWallHints(); // 動いた先の局面で光ヒントを出し直す
  checkClear();
}

// 反則からの復帰
function undoMistake() {
  if ($('#overlay-miss').hidden) return;
  $('#overlay-miss').hidden = true;
  G.pos = G.history.pop(); // 直前の局面へ(行って戻る)
  G.moves--;
  G.rooms.forEach((rm, i) =>
    setCellXY(rm.piece, G.pos[i] % G.w, (G.pos[i] - (G.pos[i] % G.w)) / G.w)
  );
  updateInfo();
  updateGoals();
  G.busy = false;
  refreshWallHints();
}
function restartFromMistake() {
  $('#overlay-miss').hidden = true;
  startPuzzle(curChapter, curIndex); // 初形へ
}

async function checkClear() {
  if (!G.pos.every((p, i) => p === G.puz.rooms[i].goal)) return;
  G.cleared = true;
  G.busy = true;
  G.rooms.forEach((rm) => rm.goal.classList.add('filled')); // 光が満ちる
  const min = G.puz.solution.minMoves;
  const best = G.moves === min; // 最短達成か
  markCleared(G.puz.id);
  if (best) markBest(G.puz.id);
  // 言葉でなく光で伝える: 盤上のボールが金(最短)/白(クリア)に発光する(SPEC.md 5章)
  $('#boards').classList.add(best ? 'clear-best' : 'clear-win');
  $('#tsumi-moves-1').textContent = t('clearedMoves', { n: G.moves });
  $('#tsumi-moves-2').textContent = best ? t('fewest') : t('fewestIs', { n: min });
  $('#tsumi-moves').classList.toggle('best', best);
  await sleep(REDUCED ? 0 : 800); // 盤上のグローを一拍見せてから手数を静かに添える
  $('#overlay-tsumi').hidden = false;
}

function undo() {
  if (!G || G.busy || G.cleared || !G.history.length) return;
  clearWallHints();
  G.pos = G.history.pop();
  G.moves--;
  G.rooms.forEach((rm, i) =>
    setCellXY(rm.piece, G.pos[i] % G.w, (G.pos[i] - (G.pos[i] % G.w)) / G.w)
  );
  updateInfo();
  updateGoals();
  refreshWallHints();
}

function resetPuzzle() {
  if (!G || G.busy || G.cleared) return;
  startPuzzle(curChapter, curIndex);
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

// トグルの見た目と「次の一手」ボタンの表示をヒント設定に同期する
function updateHintUI() {
  const tgl = $('#tg-light');
  const tgn = $('#tg-next');
  tgl.classList.toggle('on', hintSettings.light);
  tgl.setAttribute('aria-pressed', String(hintSettings.light));
  tgn.classList.toggle('on', hintSettings.next);
  tgn.setAttribute('aria-pressed', String(hintSettings.next));
  // 次の一手ボタンは「next ON」かつプレイ中(答えビューア/クリア中でない)のときだけ
  $('#btn-next-move').hidden = !(hintSettings.next && G && !AV && !G.cleared);
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
      if (next[i] === cur[i]) showBumpGlow(rm, cur[i], d);
    });
  }
  G.rooms.forEach((rm, i) => {
    if (next[i] === cur[i]) bumpPiece(rm.piece, d);
    else setCellXY(rm.piece, next[i] % G.w, (next[i] - (next[i] % G.w)) / G.w);
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
  startPuzzle(curChapter, curIndex); // 初形へ
  AV = {
    path: G.puz.solution.path,
    blockSet: new Set(G.puz.analysis.blockMoveIndices),
    k: 0,
    playing: false,
    running: false,
  };
  clearWallHints(); // 答えビューア中は光ヒントを出さない
  $('#controls').hidden = true;
  $('#hint-toggles').hidden = true;
  $('#btn-next-move').hidden = true;
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
  $('#hint-toggles').hidden = false;
  $('#hint-keys').hidden = false;
  $('#move-count').hidden = false;
  startPuzzle(curChapter, curIndex); // 初形へ戻して自力で挑戦(クリアにはしない)。光/次手も復帰
}

// ---- クリア後の流れ: 詰 → 切れ目(広告枠) → 次へ ----
function dismissTsumi() {
  if ($('#overlay-tsumi').hidden) return;
  $('#overlay-tsumi').hidden = true;
  $('#overlay-gap').hidden = false; // ここが広告の差し込み口(SPEC.md 6章)
}
$('#overlay-tsumi').addEventListener('click', dismissTsumi);

$('#btn-next').addEventListener('click', () => {
  $('#overlay-gap').hidden = true;
  const levels = chapterLevels.get(curChapter.id);
  if (curIndex + 1 < levels.length) startPuzzle(curChapter, curIndex + 1);
  else showLevels(curChapter); // 章の最後なら一覧へ
});
$('#btn-list').addEventListener('click', () => {
  $('#overlay-gap').hidden = true;
  showLevels(curChapter);
});

$('#btn-undo').addEventListener('click', undo);
$('#btn-reset').addEventListener('click', resetPuzzle);
$('#btn-miss-back').addEventListener('click', undoMistake);
$('#btn-miss-restart').addEventListener('click', restartFromMistake);
$('#btn-answer-open').addEventListener('click', enterAnswer);
$('#btn-next-move').addEventListener('click', showNextMove);
$('#tg-light').addEventListener('click', () => {
  hintSettings.light = !hintSettings.light;
  saveHintSettings();
  updateHintUI();
  refreshWallHints();
});
$('#tg-next').addEventListener('click', () => {
  hintSettings.next = !hintSettings.next;
  saveHintSettings();
  updateHintUI();
});
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
  if (!$('#overlay-tsumi').hidden) {
    if (e.key === 'Enter' || e.key === ' ') dismissTsumi();
    return;
  }
  if (!$('#overlay-miss').hidden) {
    if (e.key === 'Enter' || e.key === ' ') undoMistake(); // 既定は一手戻す
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
playView.addEventListener('touchstart', (e) => {
  touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
playView.addEventListener('touchend', (e) => {
  if (!touchStart) return;
  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  touchStart = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return; // タップは無視
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

// ---- 起動 ----
fillI18n(); // 静的文言(ボタン・タグライン等)をロケールで流し込む
showChapters();
