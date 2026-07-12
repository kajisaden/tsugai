// 5x3・3面モード200問の選別スクリプト。
// 最短手数だけでなく「どの面が止まるか」と解手順の多様性を評価する。
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pool = JSON.parse(readFileSync(join(ROOT, 'data', 'pool-3room.json'), 'utf8'));
const P = pool.puzzles;
const DIRS = [[0,-1],[0,1],[-1,0],[1,0]];
const used = new Set();
const selected = [];
const pathUse = new Map(), prefixUse = new Map(), roleSigUse = new Map();

function step(p, d, walls, w, h) {
  const x = p % w, y = (p - x) / w;
  const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
  if (nx < 0 || nx >= w || ny < 0 || ny >= h) return p;
  const np = ny * w + nx;
  return walls.has(np) ? p : np;
}

function features(p) {
  const walls = p.rooms.map(r => new Set(r.walls.split(',').filter(Boolean).map(Number)));
  let pos = p.rooms.map(r => r.start);
  const masks = [];
  for (const d of p.solution.path) {
    const next = pos.map((v, i) => step(v, d, walls[i], p.size.w, p.size.h));
    let mask = 0;
    next.forEach((v, i) => { if (v === pos[i]) mask |= 1 << i; });
    masks.push(mask);
    pos = next;
  }
  const blocked = masks.filter(Boolean);
  const roles = new Set();
  const roleCounts = [0,0,0];
  blocked.forEach(mask => { for (let i=0;i<3;i++) if (mask & (1<<i)) { roles.add(i); roleCounts[i]++; } });
  let roleChanges = 0;
  for (let i=1;i<blocked.length;i++) if (blocked[i] !== blocked[i-1]) roleChanges++;
  return {
    masks, blocked, roles: [...roles], roleCounts, roleChanges,
    singleOnly: blocked.every(m => m === 1 || m === 2 || m === 4),
    path: p.solution.path.join(''), prefix: p.solution.path.slice(0,2).join(''),
    roleSig: blocked.join('-'), moves: p.solution.minMoves,
  };
}

const F = new Map(P.map(p => [p.id, features(p)]));
function remember(p) {
  selected.push(p); used.add(p.id);
  const f = F.get(p.id);
  for (const [map, key] of [[pathUse,f.path],[prefixUse,f.prefix],[roleSigUse,f.roleSig]]) map.set(key, (map.get(key)||0)+1);
}
function choose(candidates, score) {
  const ranked = candidates.filter(p => !used.has(p.id)).sort((a,b) => score(b)-score(a) || a.id-b.id);
  if (!ranked.length) throw new Error(`レベル${selected.length+1}の候補がありません`);
  remember(ranked[0]);
}

// Lv1〜3: 3面が同時に動くことだけを覚える。壁当てのない最短問題。
for (let i=0;i<3;i++) choose(P.filter(p => p.analysis.blockMoves === 0 && p.solution.minMoves <= 3), p => 100-p.solution.minMoves*10-(pathUse.get(F.get(p.id).path)||0)*50);

// Lv4〜10: 1面だけが止まる。止まる面を A→B→C→A… と交代させる。
const introMoves = [2,2,3,3,3,4,4];
for (let i=0;i<7;i++) {
  const role = i % 3, wanted = introMoves[i];
  choose(P.filter(p => {
    const f=F.get(p.id);
    return f.blocked.length>0 && f.singleOnly && f.roles.length===1 && f.roles[0]===role && f.moves<=5;
  }), p => {
    const f=F.get(p.id);
    return 100-Math.abs(f.moves-wanted)*25-(pathUse.get(f.path)||0)*60-(prefixUse.get(f.prefix)||0)*12-p.analysis.solutionCount;
  });
}

function desiredMoves(level) {
  if (level <= 40) return 3 + Math.floor((level-11)/15);
  if (level <= 90) return 5 + Math.floor((level-41)/25);
  if (level <= 140) return 6 + Math.floor((level-91)/25);
  if (level <= 180) return 7 + Math.floor((level-141)/20);
  return 9;
}

// Lv11〜200: 壁当ての主役交代を強く評価し、同じ手順・同じ役割列の近接を避ける。
while (selected.length < 200) {
  const level = selected.length + 1, wanted = desiredMoves(level);
  choose(P.filter(p => p.solution.minMoves >= 3 && p.solution.minMoves <= 9), p => {
    const f=F.get(p.id);
    const targetRoles = level <= 40 ? 2 : 3;
    const coverage = Math.min(f.roles.length, targetRoles) * 28;
    const alternation = f.roleChanges * 22;
    const balance = f.roles.length ? Math.max(...f.roleCounts)-Math.min(...f.roleCounts.filter(n=>n>0)) : 9;
    return 180-Math.abs(f.moves-wanted)*35 + coverage + alternation - balance*6
      -(pathUse.get(f.path)||0)*100 -(prefixUse.get(f.prefix)||0)*18 -(roleSigUse.get(f.roleSig)||0)*35
      -(p.analysis.solutionCount>3 ? 12 : 0) - Math.min(p.analysis.solutionCount,20);
  });
}

const ids = selected.map(p=>p.id);
const levelOut = `// select-three.mjs が生成。手で編集しない\nwindow.THREE_LEVEL_IDS = ${JSON.stringify(ids)};\nwindow.THREE_BOSS_FLAGS = ${JSON.stringify(ids.map(()=>false))};\n`;
writeFileSync(join(ROOT,'web','three-levels.js'), levelOut, 'utf8');
const compact = {...pool, puzzles:selected};
writeFileSync(join(ROOT,'web','pool-3room.js'), `// select-three.mjs が生成。手で編集しない\nwindow.NIKENZUME_POOL_3ROOM = ${JSON.stringify(compact)};\n`, 'utf8');

const first = selected.slice(0,11).map((p,i)=>({level:i+1,id:p.id,moves:p.solution.minMoves,path:p.solution.path,masks:F.get(p.id).masks}));
console.log(`3面モード ${ids.length}問 → web/three-levels.js, web/pool-3room.js`);
console.log(JSON.stringify(first,null,2));
