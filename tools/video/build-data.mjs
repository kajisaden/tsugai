// 解説動画の図に使うデータを data.js に書き出す。数字はすべて現行のプール/レベル表から計算する。
// 使い方: node tools/video/build-data.mjs <出力ディレクトリ>
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mulberry32 } from '../core.mjs';
import { byId, wallsOf, stepAll, NORMAL_IDS, NORMAL_BOSS, EX1, EXE, EXH, FOUL, HINT_PATH, HINT_T, START, STEP, CLIPS } from './clips.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = resolve(process.argv[2]);
const pool = JSON.parse(readFileSync(join(ROOT, 'data', 'pool.json'), 'utf8'));

const lite = (p) => ({ id: p.id, seed: p.seed, w: p.size.w, h: p.size.h, rooms: p.rooms.map((r, i) => ({ walls: [...wallsOf(p)[i]], start: r.start, goal: r.goal })), path: p.solution.path });
// 手順をなぞり、各手で止まった盤と「気づき」の番号を出す
function sim(p, path = p.solution.path, from = p.rooms.map((r) => r.start)) {
  const walls = wallsOf(p); let pos = from.slice(); const steps = []; let ep = 0, prev = '';
  for (const d of path) {
    const nx = stepAll(p, walls, pos, d), blocked = nx.map((v, i) => v === pos[i]);
    const sig = blocked.some(Boolean) ? d + ':' + blocked.map(Number).join('') : '';
    const isNew = !!sig && sig !== prev; if (isNew) ep++; prev = sig;
    steps.push({ d, blocked, ep: sig ? ep : 0, isNew, from: pos, to: nx }); pos = nx;
  }
  return { steps, ep };
}
// 場面の地図: 幅優先探索で各場面の深さと「どこから来たか」を求める
function bfs(p, from) {
  const walls = wallsOf(p), goals = p.rooms.map((r) => r.goal), key = (a) => a.join(',');
  const depth = new Map([[key(from), 0]]), par = new Map(), q = [from];
  for (const pos of q) {
    if (pos.every((v, i) => v === goals[i])) continue;
    for (let d = 0; d < 4; d++) {
      const nx = stepAll(p, walls, pos, d), g = nx.map((v, i) => v === goals[i]);
      if (g.some(Boolean) && !g.every(Boolean)) continue;
      if (depth.has(key(nx))) continue;
      depth.set(key(nx), depth.get(key(pos)) + 1); par.set(key(nx), { from: pos, d }); q.push(nx);
    }
  }
  const path = [], nodes = [goals];
  for (let k = key(goals); par.get(k); k = key(par.get(k).from)) { path.push(par.get(k).d); nodes.push(par.get(k).from); }
  return { states: q.map((pos) => ({ pos, depth: depth.get(key(pos)) })), path: path.reverse(), nodes: nodes.reverse(), goalDepth: depth.get(key(goals)) };
}

const ex1 = byId.get(EX1), W1 = wallsOf(ex1);
const free = W1.map((ws) => [...Array(16).keys()].filter((k) => !ws.has(k)));
const start1 = ex1.rooms.map((r) => r.start);
const off = stepAll(ex1, W1, start1, 3);
const bStart = bfs(ex1, start1), bOff = bfs(ex1, off);
if (bStart.goalDepth !== ex1.solution.minMoves) throw new Error('BFS が最短手数と合いません');
if (bOff.path.join() !== HINT_PATH.join()) throw new Error('光ヒントの手順が想定と違います: ' + bOff.path);
for (const id of [EXE, EXH]) if (sim(byId.get(id)).ep !== byId.get(id).analysis.episodes) throw new Error('気づきの数が合いません: ' + id);

// 番号168から出る擬似乱数の最初の数個(実際に盤を決めている数)
const rng = mulberry32(ex1.seed); const rngHead = Array.from({ length: 8 }, () => rng());
// 12,000個の盤: 番号×大きさごとに、解けたか・気づきの数
const solved = {}; for (const p of pool.puzzles) solved[p.size.w + ':' + p.seed] = p.analysis.episodes;
const mass = []; for (const w of [4, 5]) for (let s = 1; s <= 6000; s++) mass.push(solved[w + ':' + s] ?? -1);
const epDist = []; for (const p of pool.puzzles) epDist[p.analysis.episodes] = (epDist[p.analysis.episodes] || 0) + 1;
const clips = {}; for (const c of CLIPS) clips[c.name] = { frames: Math.round(c.dur / (1000 / 30)) };

const DATA = {
  START, STEP, HINT_T, clips,
  ex1: lite(ex1), exE: lite(byId.get(EXE)), exH: lite(byId.get(EXH)),
  simE: sim(byId.get(EXE)).steps, simH: sim(byId.get(EXH)).steps, sim1: sim(ex1).steps,
  free, start1, off, bStart, bOff, simOff: sim(ex1, bOff.path, off).steps, foul: FOUL,
  rngHead, mass, epDist, total: pool.puzzles.length, rejected: 12000 - pool.puzzles.length,
  curve: NORMAL_IDS.map((id, i) => ({ ep: byId.get(id).analysis.episodes, boss: NORMAL_BOSS[i] })),
};
writeFileSync(join(OUT, 'data.js'), 'window.DATA = ' + JSON.stringify(DATA) + ';\n');
console.log('data.js', Object.keys(DATA).length, 'keys', 'reachable', bStart.states.length, bOff.states.length, 'rng', rngHead.slice(0, 3));
