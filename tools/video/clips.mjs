// 解説動画で使うゲーム画面のクリップ定義。t はクリップ開始からのミリ秒。
// 例題は通常・上級のどちらにも出ない問題(プールの id 88 / 1516 / 66)を使う。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pool = JSON.parse(readFileSync(join(ROOT, 'data', 'pool.json'), 'utf8'));
export const byId = new Map(pool.puzzles.map((p) => [p.id, p]));
const idsOf = (f, key) => JSON.parse(readFileSync(join(ROOT, 'web', `${f}-levels.js`), 'utf8').match(new RegExp(key + '\\s*=\\s*(\\[[^\\]]+\\])'))[1]);
export const NORMAL_IDS = idsOf('normal', 'LEVEL_IDS');
export const NORMAL_BOSS = idsOf('normal', 'BOSS_FLAGS');
const three = JSON.parse(readFileSync(join(ROOT, 'web', 'pool-3room.js'), 'utf8').replace(/^[\s\S]*?=\s*/, '').replace(/;\s*$/, ''));

const D = [[0, -1], [0, 1], [-1, 0], [1, 0]];
export const wallsOf = (p) => p.rooms.map((r) => new Set(r.walls.split(',').filter(Boolean).map(Number)));
export function stepAll(p, walls, pos, d) {
  const { w, h } = p.size;
  return pos.map((v, i) => {
    const x = v % w, y = (v - x) / w, a = x + D[d][0], b = y + D[d][1];
    if (a < 0 || a >= w || b < 0 || b >= h) return v;
    const np = b * w + a;
    return walls[i].has(np) ? v : np;
  });
}
// 反則(片方だけゴールに入る)になる最短の手順を探す
function foulPath(p) {
  const walls = wallsOf(p), goals = p.rooms.map((r) => r.goal);
  const q = [{ pos: p.rooms.map((r) => r.start), path: [] }], seen = new Set([q[0].pos.join()]);
  for (const cur of q) for (let d = 0; d < 4; d++) {
    const nx = stepAll(p, walls, cur.pos, d), g = nx.map((v, i) => v === goals[i]);
    if (g.some(Boolean) && !g.every(Boolean)) { if (cur.path.length >= 1) return [...cur.path, d]; continue; }
    if (g.every(Boolean) || seen.has(nx.join())) continue;
    seen.add(nx.join()); q.push({ pos: nx, path: [...cur.path, d] });
  }
  return null;
}

const K = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
export const START = 800; // 最初の1手までの間(ms)
export const STEP = 900;  // 1手の間隔(ms)。動画側の図と同期させる
const moves = (path, start = START, gap = STEP) => path.map((d, i) => ({ t: start + i * gap, key: K[d] }));
const TAIL = 1000; // 最後の手のあと、ホームへ戻る前に切る
const play = (name, id, label) => { const p = byId.get(id); return { name, dur: START + (p.solution.path.length - 1) * STEP + TAIL, setup: `_initPuzzle(poolById.get(${id}), '${label}', true, false, 'normal')`, events: moves(p.solution.path) }; };

export const EX1 = 88, EXE = 1516, EXH = 66;
export const FOUL = foulPath(byId.get(EX1));
export const HINT_T = { wrong: START, light: 2600, resume: 6000 }; // 光ヒントのクリップ内の時刻
export const HINT_PATH = [0, 0, 2, 2]; // 「→」のあとの最短(↑↑←←)。build-data.mjs で検算する
const bossLv = 10, bossPuz = byId.get(NORMAL_IDS[bossLv - 1]);
export const THREE = three.puzzles[24];

export const CLIPS = [
  play('intro', EX1, '例題'),
  play('exE', EXE, '問題あ'),
  play('exH', EXH, '問題い'),
  { name: 'foul', dur: START + (FOUL.length - 1) * STEP + 2600, setup: `_initPuzzle(poolById.get(${EX1}), '例題', true, false, 'normal')`, events: moves(FOUL) },
  { name: 'hint', dur: HINT_T.resume + 3 * STEP + TAIL, setup: `_initPuzzle(poolById.get(${EX1}), '例題', true, false, 'normal')`,
    events: [{ t: HINT_T.wrong, key: K[3] }, { t: HINT_T.light, click: '#btn-hint-light' }, ...moves(HINT_PATH, HINT_T.resume)] },
  { name: 'boss', dur: START + (bossPuz.solution.path.length - 1) * STEP + TAIL, setup: `startPuzzle(CHAPTERS[0], ${bossLv - 1})`, events: moves(bossPuz.solution.path) },
  { name: 'three', dur: START + (THREE.solution.path.length - 1) * 700 + TAIL, setup: `_initPuzzle(THREE_POOL.puzzles.find(p => p.id === ${THREE.id}), '3面', true, false, 'normal')`, events: moves(THREE.solution.path, START, 700) },
  { name: 'home', dur: 2000, setup: `showView('home')`, events: [], settle: 1500 },
];
if (process.argv[1] && process.argv[1].endsWith('clips.mjs')) console.log(CLIPS.map((c) => [c.name, c.dur, c.events.length]), FOUL, THREE.solution.path, bossPuz.solution.path);
