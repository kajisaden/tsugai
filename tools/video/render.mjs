// 解説動画を書き出す。video.html を1コマずつ撮影し、ffmpeg で mp4 にまとめる。
// 使い方:
//   node tools/video/render.mjs <出力ディレクトリ>                 … 全編を書き出す(tsugai-howmade.mp4)
//   node tools/video/render.mjs <出力ディレクトリ> --shots 3,12.5  … 指定秒の静止画だけ撮る(確認用)
//   node tools/video/render.mjs <出力ディレクトリ> --beats         … 各字幕の中ほどを1枚ずつ撮る(確認用)
// 先に capture.mjs と build-data.mjs を同じ出力ディレクトリに対して実行しておくこと。
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(process.argv[2]);
const arg = (k) => { const i = process.argv.indexOf(k); return i < 0 ? null : (process.argv[i + 1] ?? ''); };
const FPS = 30, WORKERS = 4;
copyFileSync(join(HERE, 'video.html'), join(OUT, 'index.html'));
const url = pathToFileURL(join(OUT, 'index.html')).href;
const browser = await chromium.launch();
async function open() {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => { console.error('pageerror', e.message); process.exitCode = 1; });
  await page.goto(url); await page.evaluate(() => document.fonts.ready);
  return page;
}
const shot = async (page, t, file, type = 'jpeg') => { await page.evaluate((t) => window.seek(t), t); await page.screenshot({ path: file, type, ...(type === 'jpeg' ? { quality: 95 } : {}) }); };

if (process.argv.includes('--shots') || process.argv.includes('--beats')) {
  const page = await open(); const dir = join(OUT, 'shots'); mkdirSync(dir, { recursive: true });
  const info = await page.evaluate(() => ({ dur: window.DURATION, beats: window.BEAT_STARTS }));
  const frac = Number(arg('--at') ?? .8);
  const times = process.argv.includes('--beats') ? info.beats.map((s, i) => s + ((info.beats[i + 1] ?? info.dur) - s) * frac) : arg('--shots').split(',').map(Number);
  for (const [i, t] of times.entries()) await shot(page, t, join(dir, `s${String(i).padStart(2, '0')}.jpg`));
  console.log('duration', info.dur, 'shots', times.length);
} else {
  const frames = join(OUT, 'frames'); rmSync(frames, { recursive: true, force: true }); mkdirSync(frames, { recursive: true });
  const p0 = await open(); const dur = await p0.evaluate(() => window.DURATION); await p0.close();
  const total = Math.round(dur * FPS); let next = 0, done = 0;
  await Promise.all(Array.from({ length: WORKERS }, async () => {
    const page = await open();
    for (;;) { const i = next++; if (i >= total) break; await shot(page, i / FPS, join(frames, `f${String(i).padStart(6, '0')}.jpg`)); if (++done % 600 === 0) console.log(`${done}/${total}`); }
  }));
  const mp4 = join(OUT, 'tsugai-howmade.mp4');
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(frames, 'f%06d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
  console.log(r.status === 0 ? `書き出し完了: ${mp4} (${dur.toFixed(1)}秒)` : 'ffmpeg に失敗しました');
}
await browser.close();
