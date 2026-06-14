// 二間詰 コアロジック(生成 + BFSソルバー)
// SPEC.md 第3章のアルゴリズムを実装する。生成バッチ専用(プレイ側には積まない)。
// 方向コード: 0=上, 1=下, 2=左, 3=右 / 位置: index = y*w+x (SPEC.md 第4章)

// 1.2: 非同時のゴール進入を「反則手」とした。途中でゴールへ入る手は解に含めない
//      (1.1 の壁スキップ案=足踏みに使える、は廃止)
export const LOGIC_VERSION = '1.2';

export const DIRS = [
  { dx: 0, dy: -1 }, // 0=上
  { dx: 0, dy: 1 },  // 1=下
  { dx: -1, dy: 0 }, // 2=左
  { dx: 1, dy: 0 },  // 3=右
];

// 決定的乱数。seed が問題の再現キーになる(SPEC.md 3-3)
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// seed + サイズ から盤面を決定的に生成する。
// 乱数の消費順(壁密度 → 部屋ごとに[シャッフル→start→goal])を変えると
// 再現が壊れるため、変更時は LOGIC_VERSION を上げること。
export function generatePuzzle(seed, w, h, roomCount = 2) {
  const rng = mulberry32(seed);
  const cells = w * h;
  const ratio = 0.12 + rng() * 0.18; // 壁密度 12〜30%
  const wallCount = Math.round(cells * ratio);
  const rooms = [];
  for (let r = 0; r < roomCount; r++) {
    const order = shuffled([...Array(cells).keys()], rng);
    const walls = order.slice(0, wallCount).sort((x, y) => x - y);
    const free = order.slice(wallCount);
    const start = free[Math.floor(rng() * free.length)];
    let goal = start;
    while (goal === start) goal = free[Math.floor(rng() * free.length)];
    rooms.push({ walls, start, goal });
  }
  return { seed, w, h, rooms };
}

// 部屋ごとの遷移表 moveTo[pos*4+dir] = 移動先(壁/外周ならその場)
function buildMoveTable(walls, w, h) {
  const cells = w * h;
  const wall = new Uint8Array(cells);
  for (const i of walls) wall[i] = 1;
  const t = new Int32Array(cells * 4);
  for (let p = 0; p < cells; p++) {
    const x = p % w;
    const y = (p / w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d].dx;
      const ny = y + DIRS[d].dy;
      const np = ny * w + nx;
      t[p * 4 + d] =
        nx < 0 || nx >= w || ny < 0 || ny >= h || wall[np] ? p : np;
    }
  }
  return t;
}

const COUNT_CAP = 1e9; // 解数カウントの上限(8x8で2000解超の観測あり。暴走対策)

// BFS全探索。解なしなら null。
// 最短解が複数あるときは「壁当て手が最も多い経路」を solution.path に採用する
// (妙手ハイライトの見栄えのため。解数・最短手数には影響しない)。
export function solve(puz) {
  const { w, h, rooms } = puz;
  const cells = w * h;
  const R = rooms.length;
  const tables = rooms.map((r) => buildMoveTable(r.walls, w, h));

  const nStates = cells ** R;
  const enc = (pos) => {
    let s = 0;
    for (let i = R - 1; i >= 0; i--) s = s * cells + pos[i];
    return s;
  };

  const startPos = rooms.map((r) => r.start);
  const goals = rooms.map((r) => r.goal);
  const goalId = enc(goals);
  const s0 = enc(startPos);
  if (s0 === goalId) return null; // 0手詰は問題として不成立

  const dist = new Int32Array(nStates).fill(-1);
  const cnt = new Float64Array(nStates);
  const blk = new Int16Array(nStates); // 始状態からの壁当て手の最大数(最短経路上)
  const parS = new Int32Array(nStates).fill(-1);
  const parD = new Int8Array(nStates);

  dist[s0] = 0;
  cnt[s0] = 1;
  const queue = [s0];
  let qi = 0;
  const pos = new Array(R);
  const npBuf = new Array(R);

  while (qi < queue.length) {
    const cur = queue[qi++];
    if (cur === goalId) continue; // 同時ゴール=終局。ここから先は指さない
    let c = cur;
    for (let i = 0; i < R; i++) {
      pos[i] = c % cells;
      c = (c - pos[i]) / cells;
    }
    for (let d = 0; d < 4; d++) {
      // 素の移動先を出し、ゴール進入の有無を判定する
      let allGoal = true;
      let anyGoal = false;
      for (let i = 0; i < R; i++) {
        const np = tables[i][pos[i] * 4 + d];
        npBuf[i] = np;
        if (np === goals[i]) anyGoal = true;
        else allGoal = false;
      }
      // 非同時のゴール進入は反則手。解の経路としては指せないので除外する
      // (全員同時にゴールへ入る手だけが、ゴールへ踏み込める)
      if (anyGoal && !allGoal) continue;
      let ns = 0;
      let moved = false;
      let blocked = false;
      for (let i = R - 1; i >= 0; i--) {
        const np = npBuf[i];
        if (np === pos[i]) blocked = true;
        else moved = true;
        ns = ns * cells + np;
      }
      if (!moved) continue; // 全員スキップ=無意味手(状態不変。手に数えない)
      const b = blocked ? 1 : 0; // 壁・外周での空振り=壁当て手
      if (dist[ns] === -1) {
        dist[ns] = dist[cur] + 1;
        cnt[ns] = cnt[cur];
        blk[ns] = blk[cur] + b;
        parS[ns] = cur;
        parD[ns] = d;
        queue.push(ns);
      } else if (dist[ns] === dist[cur] + 1) {
        cnt[ns] = Math.min(cnt[ns] + cnt[cur], COUNT_CAP);
        if (blk[cur] + b > blk[ns]) {
          blk[ns] = blk[cur] + b;
          parS[ns] = cur;
          parD[ns] = d;
        }
      }
    }
  }

  if (dist[goalId] === -1) return null;

  // 経路復元
  const path = [];
  for (let s = goalId; s !== s0; s = parS[s]) path.push(parD[s]);
  path.reverse();

  // 経路を再生して壁当て手の位置を抽出(blk[goalId] と一致するはず)
  const blockMoveIndices = [];
  {
    const p = startPos.slice();
    for (let k = 0; k < path.length; k++) {
      const d = path[k];
      let blocked = false; // 解pathは反則手を含まないので壁・外周の空振りだけ見ればよい
      for (let i = 0; i < R; i++) {
        const np = tables[i][p[i] * 4 + d];
        if (np === p[i]) blocked = true;
        p[i] = np;
      }
      if (blocked) blockMoveIndices.push(k);
    }
  }

  // 最短解の中で最小になる「ズレ調整エピソード数」(episodes)。
  // エピソード = 連続する壁当て手のかたまり。プレイヤーが要する「気づき」の近似単位。
  // 多解問題では最短解が複数あるので、最も楽な経路(エピソード最小)で測る(難度は最易解で決まる)。
  // best を「直前手がブロックだったか」で2分し、非ブロック→ブロックの遷移で +1 する DP。
  // 距離は上の BFS で確定済みなので、queue を BFS 順に再走するだけでよい。
  const epN = new Float64Array(nStates).fill(Infinity); // 直前が非ブロック での最小ラン数
  const epB = new Float64Array(nStates).fill(Infinity); // 直前がブロック での最小ラン数
  epN[s0] = 0; // 初形=直前手なし→非ブロック扱い・ラン0
  for (let k = 0; k < queue.length; k++) {
    const cur = queue[k];
    if (cur === goalId) continue;
    const cN = epN[cur];
    const cB = epB[cur];
    let c = cur;
    for (let i = 0; i < R; i++) {
      pos[i] = c % cells;
      c = (c - pos[i]) / cells;
    }
    for (let d = 0; d < 4; d++) {
      let allGoal = true;
      let anyGoal = false;
      for (let i = 0; i < R; i++) {
        const np = tables[i][pos[i] * 4 + d];
        npBuf[i] = np;
        if (np === goals[i]) anyGoal = true;
        else allGoal = false;
      }
      if (anyGoal && !allGoal) continue; // 反則手(本 BFS と同じ枝刈り)
      let ns = 0;
      let moved = false;
      let blocked = false;
      for (let i = R - 1; i >= 0; i--) {
        const np = npBuf[i];
        if (np === pos[i]) blocked = true;
        else moved = true;
        ns = ns * cells + np;
      }
      if (!moved) continue; // 無意味手
      if (dist[ns] !== dist[cur] + 1) continue; // 最短経路の辺だけ辿る
      if (blocked) {
        const v = Math.min(cN + 1, cB); // 非ブロック→ブロックで新ラン開始
        if (v < epB[ns]) epB[ns] = v;
      } else {
        const v = Math.min(cN, cB);
        if (v < epN[ns]) epN[ns] = v;
      }
    }
  }
  const episodes = Math.min(epN[goalId], epB[goalId]);

  // 部屋別の独立最短手数(同期解があれば必ず解ける)
  const soloMin = rooms.map((r, i) => {
    const dd = new Int32Array(cells).fill(-1);
    dd[r.start] = 0;
    const q = [r.start];
    let h2 = 0;
    while (h2 < q.length) {
      const u = q[h2++];
      for (let d = 0; d < 4; d++) {
        const v = tables[i][u * 4 + d];
        if (v !== u && dd[v] === -1) {
          dd[v] = dd[u] + 1;
          q.push(v);
        }
      }
    }
    return dd[r.goal];
  });

  return {
    minMoves: dist[goalId],
    path,
    solutionCount: Math.round(cnt[goalId]),
    blockMoves: blockMoveIndices.length,
    blockMoveIndices,
    soloMin,
    syncCost: dist[goalId] - Math.max(...soloMin),
    episodes,
  };
}

// 検算: path を再生して全キャラが同一ターンにゴール到達するか確認
export function verifySolution(puz, path) {
  const { w, h, rooms } = puz;
  const tables = rooms.map((r) => buildMoveTable(r.walls, w, h));
  const goals = rooms.map((r) => r.goal);
  const pos = rooms.map((r) => r.start);
  for (const d of path) {
    const raw = pos.map((p, i) => tables[i][p * 4 + d]);
    const allGoal = raw.every((np, i) => np === goals[i]);
    const anyGoal = raw.some((np, i) => np === goals[i]);
    if (anyGoal && !allGoal) return false; // 非同時のゴール進入(反則手)は解に含めない
    let moved = false;
    for (let i = 0; i < rooms.length; i++) {
      if (raw[i] !== pos[i]) moved = true;
      pos[i] = raw[i];
    }
    if (!moved) return false; // 無意味手が解に含まれるのは不正
  }
  return pos.every((p, i) => p === goals[i]);
}
