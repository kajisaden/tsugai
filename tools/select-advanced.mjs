// 上級モード200問の選別スクリプト
// 通常モードの使用済みIDを除外し、ep=3以上から200問を選ぶ。
// 使い方: node tools/select-advanced.mjs (select-normal.mjs の後に実行)

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pool = JSON.parse(readFileSync(join(ROOT, 'data', 'pool.json'), 'utf8'));
const P = pool.puzzles;
const ep = p => p.analysis.episodes;
const sz = p => p.size.w;
const mv = p => p.solution.minMoves;
const bm = p => p.analysis.blockMoves;

// 通常モードで使用済みのIDを除外
const nlSrc = readFileSync(join(ROOT, 'web', 'normal-levels.js'), 'utf8');
const normalIds = new Set(JSON.parse(nlSrc.match(/NORMAL_LEVEL_IDS\s*=\s*(\[[^\]]+\])/)[1]));

const used = new Set(normalIds);

function pick(epVal, sizeVal, mvMin, mvMax) {
  const cands = P.filter(p => sz(p) <= 5 && ep(p) === epVal && sz(p) === sizeVal
    && mv(p) >= mvMin && mv(p) <= mvMax && !used.has(p.id))
    .sort((a, b) => mv(a) - mv(b) || bm(a) - bm(b) || a.id - b.id);
  if (cands.length === 0) return null;
  const idx = Math.floor(cands.length / 2);
  const p = cands[idx];
  used.add(p.id);
  return p;
}

// [ep, size, mvMin, mvMax, isBoss]
const slots = [
  // --- #1-50: ep=3中心、ボスep=5 ---
  [3,4,4,6],[3,4,5,7],[3,4,5,7],[3,4,5,7],[3,5,4,6],
  [3,4,5,7],[3,4,6,8],[3,4,5,7],[3,4,6,8],
  [5,4,7,10,1],
  [3,4,6,8],[3,4,6,8],[3,4,6,8],[3,5,5,7],[3,4,6,8],
  [3,4,7,9],[4,4,6,8],[3,4,6,8],[3,4,7,9],
  [5,4,8,11,1],
  [3,4,7,9],[3,4,7,9],[3,4,7,9],[3,5,6,8],[4,4,7,9],
  [3,4,7,9],[3,4,7,9],[3,4,7,9],[4,4,7,9],
  [5,4,9,12,1],
  [3,4,7,9],[3,4,8,10],[4,4,7,9],[3,4,8,10],[3,5,7,9],
  [3,4,8,10],[4,4,8,10],[3,4,8,10],[3,4,8,10],
  [5,4,9,12,1],
  [3,4,8,10],[4,4,8,10],[3,4,8,10],[3,4,8,10],[3,5,7,9],
  [4,4,8,10],[3,4,8,10],[4,5,7,9],[3,4,8,10],
  [5,4,10,13,1],

  // --- #51-100: ep=3-4半々、ボスep=5 ---
  [3,4,8,10],[4,4,8,10],[3,4,8,10],[3,5,8,10],[4,4,8,10],
  [3,4,9,11],[4,5,8,10],[3,4,9,11],[4,4,9,11],
  [5,4,10,13,1],
  [4,4,8,10],[3,4,9,11],[4,4,9,11],[3,5,8,10],[4,4,9,11],
  [3,4,9,11],[4,5,8,10],[4,4,9,11],[3,4,9,11],
  [5,4,10,13,1],
  [4,4,9,11],[3,4,9,11],[4,4,9,11],[4,5,9,11],[3,5,8,10],
  [4,4,9,11],[3,4,9,11],[4,4,9,11],[4,4,9,11],
  [5,5,10,13,1],
  [4,4,9,11],[3,4,9,11],[4,4,9,11],[4,5,9,11],[3,5,8,10],
  [4,4,10,12],[4,4,9,11],[3,4,10,12],[4,4,10,12],
  [5,4,10,14,1],
  [4,4,10,12],[3,4,9,11],[4,4,10,12],[4,5,9,11],[3,5,9,11],
  [4,4,10,12],[4,4,10,12],[3,4,10,12],[4,5,10,12],
  [5,4,11,14,1],

  // --- #101-150: ep=4中心、息抜きep=3、ボスep=5-6 ---
  [4,4,10,12],[4,4,10,12],[3,4,9,11],[4,5,10,12],[4,4,10,12],
  [3,5,8,10],[4,4,10,12],[4,4,10,12],[4,4,11,13],
  [5,4,11,14,1],
  [4,4,10,12],[3,4,10,12],[4,4,11,13],[4,5,10,12],[4,4,11,13],
  [3,5,9,11],[4,4,11,13],[5,4,10,13],[4,4,11,13],
  [6,4,11,15,1],
  [4,4,11,13],[4,4,11,13],[3,4,10,12],[4,5,10,12],[4,4,11,13],
  [3,5,9,11],[4,4,11,13],[5,4,11,14],[4,5,11,13],
  [6,4,12,16,1],
  [4,4,11,13],[4,4,11,13],[3,4,10,12],[4,5,11,13],[5,4,11,14],
  [3,5,9,11],[4,4,12,14],[4,4,11,13],[4,5,11,13],
  [6,4,13,17,1],
  [4,4,11,14],[4,4,12,14],[3,4,10,12],[4,5,11,13],[5,5,11,14],
  [3,5,10,12],[4,4,12,14],[5,4,12,15],[4,4,12,14],
  [6,5,12,17,1],

  // --- #151-200: ep=4中心、スパイクep=5、ボスep=6-7 ---
  [4,4,12,14],[4,4,12,14],[3,4,10,12],[4,5,11,13],[5,4,12,15],
  [4,4,12,14],[4,5,12,14],[5,4,12,15],[4,4,12,14],
  [6,4,13,18,1],
  [4,4,12,14],[4,4,12,14],[3,4,11,13],[4,5,12,14],[5,4,12,16],
  [4,4,12,15],[4,5,12,14],[5,5,12,16],[4,4,13,15],
  [6,4,14,19,1],
  [4,4,12,15],[4,4,13,15],[3,4,11,13],[4,5,12,14],[5,4,13,16],
  [4,4,13,15],[4,5,12,15],[5,4,13,17],[4,4,13,15],
  [7,4,13,18,1],
  [4,4,13,15],[4,4,13,16],[3,4,11,13],[4,5,13,16],[5,4,13,17],
  [4,4,13,16],[4,5,13,16],[5,5,13,18],[4,4,14,16],
  [7,4,14,19,1],
  [4,4,13,16],[5,4,14,18],[4,4,14,16],[4,5,14,17],[5,5,14,19],
  [4,4,14,17],[4,5,14,17],[5,4,15,20],[4,4,14,18],
  [7,5,15,21,1],
];

console.log("Total slots: " + slots.length);

const ids = [];
let fails = 0;
for (let i = 0; i < slots.length; i++) {
  const [epVal, sizeVal, mvMin, mvMax] = slots[i];
  const p = pick(epVal, sizeVal, mvMin, mvMax);
  if (!p) {
    console.error(`#${i + 1}: 在庫切れ ep=${epVal} ${sizeVal}x${sizeVal} ${mvMin}-${mvMax}手`);
    fails++;
    ids.push(-1);
  } else {
    ids.push(p.id);
  }
}

if (fails) {
  console.error(`${fails}問が在庫不足で未割当`);
  process.exit(1);
}

const bossFlags = slots.map(s => !!s[4]);

const out = `// select-advanced.mjs が生成。手で編集しない
window.ADVANCED_LEVEL_IDS = ${JSON.stringify(ids)};
window.ADVANCED_BOSS_FLAGS = ${JSON.stringify(bossFlags)};
`;
writeFileSync(join(ROOT, 'web', 'advanced-levels.js'), out, 'utf8');

// 統計出力
const byId = new Map(P.map(p => [p.id, p]));
const levels = ids.map(id => byId.get(id));
const epDist = {};
levels.forEach(p => { epDist[ep(p)] = (epDist[ep(p)]||0) + 1; });
console.log(`上級モード ${ids.length}問 → web/advanced-levels.js`);
console.log('ep分布: ' + Object.entries(epDist).sort((a,b)=>a[0]-b[0]).map(([k,v])=>'ep'+k+'='+v).join(' '));
console.log('5x5: ' + levels.filter(p => sz(p) === 5).length + '問');
console.log('手数: ' + Math.min(...levels.map(p=>mv(p))) + '〜' + Math.max(...levels.map(p=>mv(p))));
