// 二間詰 プール生成バッチ(タスクA)
// オフラインで問題を量産し、nikenzume-pool-v1 形式の JSON を吐く。
// SPEC.md 3-3「事前生成プール方式」/ 第4章スキーマ厳守。
//
// 使い方:
//   node tools/generate-pool.mjs [--sizes 4x4,5x5,6x6] [--seeds 1-1000] [--rooms 2]
//
// 出力:
//   data/pool.json  … 全部入りプール(1問1行。git diff で差分が見える)
//   data/stats.md   … サイズ×手数ごとの問題数・解数分布(章編成の根拠資料)
//   web/pool.js     … ビューア用(同内容を window.NIKENZUME_POOL に積む)

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOGIC_VERSION, generatePuzzle, solve, verifySolution } from './core.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---- 引数 ----
const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, all) =>
    a.startsWith('--') ? [a.slice(2), all[i + 1]] : []
  ).filter((p) => p.length)
);
// 既定: 6x6 は視認性の限界から本体除外(4x4/5x5 のみ)。seeds は ep5 を20問そろえるため 1-6000(SPEC 2-4)
const sizes = (args.sizes ?? '4x4,5x5')
  .split(',')
  .map((s) => s.split('x').map(Number));
const [seedFrom, seedTo] = (args.seeds ?? '1-6000').split('-').map(Number);
const roomCount = Number(args.rooms ?? 2);

// ---- 生成 ----
const puzzles = [];
let id = 0;
let rejected = 0;
const t0 = Date.now();

for (const [w, h] of sizes) {
  for (let seed = seedFrom; seed <= seedTo; seed++) {
    const puz = generatePuzzle(seed, w, h, roomCount);
    const res = solve(puz);
    if (!res) {
      rejected++; // フィルタは「解の存在のみ」(SPEC.md 捨てない方針)
      continue;
    }
    if (!verifySolution(puz, res.path)) {
      throw new Error(`検算失敗: seed=${seed} size=${w}x${h}`);
    }
    const tags = [
      `${w}x${h}`,
      'strict',
      `${res.minMoves}move`,
      ...(res.solutionCount === 1 ? ['unique'] : []),
      ...(res.blockMoves > 0 ? ['hasMyoushu'] : []),
    ];
    puzzles.push({
      id: ++id,
      seed,
      size: { w, h },
      rule: 'strict',
      rooms: puz.rooms.map((r) => ({
        walls: r.walls.join(','),
        start: r.start,
        goal: r.goal,
      })),
      solution: { path: res.path, minMoves: res.minMoves },
      analysis: {
        solutionCount: res.solutionCount,
        blockMoves: res.blockMoves,
        blockMoveIndices: res.blockMoveIndices,
        soloMin: res.soloMin,
        syncCost: res.syncCost,
        episodes: res.episodes,
      },
      tags,
    });
  }
}

const pool = {
  schema: 'nikenzume-pool-v1',
  generator: {
    logicVersion: LOGIC_VERSION,
    createdAt: new Date().toISOString().slice(0, 10),
    roomCount,
  },
  puzzles,
};

// 部屋数で出力先を分ける。2部屋=本体(pool.json)、3部屋以上=EXTRAとして別ファイル(本体を上書きしない)
const fileSuffix = roomCount === 2 ? '' : `-${roomCount}room`;
const globalVar = roomCount === 2 ? 'NIKENZUME_POOL' : `NIKENZUME_POOL_${roomCount}ROOM`;

// ---- 出力(1問1行で人間可読・diff可読を保つ) ----
mkdirSync(join(ROOT, 'data'), { recursive: true });
mkdirSync(join(ROOT, 'web'), { recursive: true });
const poolJson =
  '{\n' +
  `  "schema": ${JSON.stringify(pool.schema)},\n` +
  `  "generator": ${JSON.stringify(pool.generator)},\n` +
  '  "puzzles": [\n' +
  puzzles.map((p) => '    ' + JSON.stringify(p)).join(',\n') +
  '\n  ]\n}\n';
writeFileSync(join(ROOT, 'data', `pool${fileSuffix}.json`), poolJson, 'utf8');
writeFileSync(
  join(ROOT, 'web', `pool${fileSuffix}.js`),
  `// generate-pool.mjs が生成。手で編集しない\nwindow.${globalVar} = ` +
    JSON.stringify(pool) +
    ';\n',
  'utf8'
);

// ---- 統計(章編成パラメータ表の根拠。HANDOVER.md の保留事項に対応) ----
const median = (xs) => {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]
    : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
let md = `# プール統計 (logicVersion ${LOGIC_VERSION}, seeds ${seedFrom}-${seedTo}, ${pool.generator.createdAt})\n\n`;
md += `- 採用 ${puzzles.length} 問 / 棄却(解なし) ${rejected} 問\n\n`;
for (const [w, h] of sizes) {
  const ofSize = puzzles.filter((p) => p.size.w === w && p.size.h === h);
  md += `## ${w}x${h} (${ofSize.length}問)\n\n`;
  md += `| 手数 | 問題数 | 一意 | 解≤3 | 妙手あり | 解数中央値 | 解数最大 |\n`;
  md += `|---|---|---|---|---|---|---|\n`;
  const byMoves = new Map();
  for (const p of ofSize) {
    const k = p.solution.minMoves;
    if (!byMoves.has(k)) byMoves.set(k, []);
    byMoves.get(k).push(p);
  }
  for (const k of [...byMoves.keys()].sort((a, b) => a - b)) {
    const g = byMoves.get(k);
    const sc = g.map((p) => p.analysis.solutionCount);
    md += `| ${k} | ${g.length} | ${sc.filter((c) => c === 1).length} | ${
      sc.filter((c) => c <= 3).length
    } | ${g.filter((p) => p.analysis.blockMoves > 0).length} | ${median(
      sc
    )} | ${Math.max(...sc)} |\n`;
  }
  md += '\n';
}
writeFileSync(join(ROOT, 'data', `stats${fileSuffix}.md`), md, 'utf8');

console.log(
  `採用 ${puzzles.length} 問 / 棄却 ${rejected} 問 (${roomCount}部屋, ${Date.now() - t0}ms)\n` +
    `→ data/pool${fileSuffix}.json, data/stats${fileSuffix}.md, web/pool${fileSuffix}.js`
);
