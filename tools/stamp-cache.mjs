// キャッシュバスティング用スタンパ(依存ゼロ)
// web/index.html が読む各アセット(css/js)の内容ハッシュを ?v=<hash> として URL に焼き込む。
// ファイルの中身が変わったときだけ ?v= が変わる → ブラウザは別ファイルと認識し、
// キャッシュ削除なしで必ず最新を取りに行く(GitHub Pages はヘッダを設定できないための代替)。
// 使い方: node tools/stamp-cache.mjs  (デプロイ前=コミット前に毎回走らせる)
// file:// でも query 付き src はそのまま読めるので、ローカル直開きの制約は壊さない。
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');
const HTML = join(WEB, 'index.html');
// index.html が src/href で読むローカルアセット(順不同)
const ASSETS = ['style.css', 'pool.js', 'normal-levels.js', 'strings.js', 'app.js'];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hashOf = (file) =>
  createHash('sha256').update(readFileSync(join(WEB, file))).digest('hex').slice(0, 10);

let html = readFileSync(HTML, 'utf8');
const stamped = [];
for (const file of ASSETS) {
  const v = hashOf(file);
  // (src|href)="file" もしくは "file?v=旧hash" を "file?v=新hash" に置換
  const re = new RegExp('((?:src|href)=")(' + esc(file) + ')(?:\\?v=[0-9a-f]+)?(")', 'g');
  let hit = 0;
  html = html.replace(re, (_m, pre, name, post) => {
    hit++;
    return `${pre}${name}?v=${v}${post}`;
  });
  stamped.push(`${file} -> v=${v}${hit ? '' : '  (参照が見つからない!)'}`);
}

// ビルド印(タイトル横の番号): スタンプを走らせる(=デプロイ前)たびに +1。
// 実機で配信が反映されたかを一目で確認するためのマーカー。番号の絶対値に意味はなく、変われば反映済み。
const buildRe = /(<span\b[^>]*\bclass="build-mark"[^>]*>)(\d+)(<\/span>)/;
const bm = html.match(buildRe);
let buildMsg;
if (bm) {
  const next = parseInt(bm[2], 10) + 1;
  html = html.replace(buildRe, (_m, pre, _n, post) => `${pre}${next}${post}`);
  buildMsg = `build-mark -> ${next}`;
} else {
  buildMsg = 'build-mark: 参照が見つからない!';
}

writeFileSync(HTML, html);
console.log('stamped web/index.html:\n  ' + stamped.join('\n  ') + '\n  ' + buildMsg);
