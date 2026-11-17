// 解説動画用: ゲーム画面を自動操作し、コマ画像(JPEG)と時刻表を書き出す。
// 使い方: node tools/video/capture.mjs <出力ディレクトリ> [クリップ名...]
// 前提: playwright が require でき、<出力ディレクトリ>/../node_modules に @fontsource/noto-sans-jp があること。
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { CLIPS } from './clips.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = resolve(process.argv[2]);
const only = process.argv.slice(3);
const FONT_DIR = join(OUT, '..', 'node_modules', '@fontsource');
const PORT = 8123;
const FPS = 30;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn('node', [join(ROOT, 'tools', 'static-server.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await sleep(600);
const browser = await chromium.launch();
try {
  for (const clip of CLIPS) {
    if (only.length && !only.includes(clip.name)) continue;
    const dir = join(OUT, clip.name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ja-JP', hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    // 日本語フォント(Noto Sans JP)をローカルから配信する
    await page.route('**/__font/**', (route) => {
      const rel = new URL(route.request().url()).pathname.replace('/__font/', '');
      const file = join(FONT_DIR, rel);
      if (!existsSync(file)) return route.fulfill({ status: 404 });
      route.fulfill({ body: readFileSync(file), contentType: file.endsWith('.css') ? 'text/css' : 'font/woff2' });
    });
    await page.clock.install();
    await page.goto(`http://localhost:${PORT}/?dev=1&lang=ja`);
    for (const w of [400, 500, 700, 800]) await page.addStyleTag({ url: `/__font/noto-sans-jp/${w}.css` });
    await page.addStyleTag({ content: '#build-mark{display:none!important}' });
    await page.evaluate(() => document.fonts.ready);
    await sleep(500);
    // ログインボーナスなど、起動時に重なる画面を閉じる
    await page.evaluate(() => { const b = document.querySelector('#btn-login-close'); if (b && b.offsetParent) b.click(); });
    await sleep(600);
    await page.evaluate(clip.setup); // setup は式の文字列
    await page.evaluate(() => document.fonts.ready);
    await sleep(clip.settle ?? 1200); // 入場アニメが終わるまで待つ

    // 時計とアニメーションを止め、1コマ(1/30秒)ずつ手動で進めて撮る。実時間に左右されず毎回同じ絵になる。
    await page.clock.pauseAt(new Date(Date.now() + 50));
    const advance = (dt) => page.evaluate((dt) => {
      for (const a of document.getAnimations()) {
        if (a.playState === 'running') a.pause();
        if (a.playState !== 'paused') continue;
        const end = a.effect ? a.effect.getComputedTiming().endTime : Infinity;
        const t = (Number(a.currentTime) || 0) + dt;
        if (t >= end) a.finish(); else a.currentTime = t;
      }
    }, dt);
    const DT = 1000 / FPS;
    const total = Math.round(clip.dur / DT);
    const evs = clip.events.slice();
    for (let i = 0; i < total; i++) {
      while (evs.length && evs[0].t <= i * DT) {
        const ev = evs.shift();
        if (ev.key) await page.keyboard.press(ev.key);
        else if (ev.click) await page.evaluate((sel) => document.querySelector(sel).click(), ev.click);
        else if (ev.eval) await page.evaluate(ev.eval);
      }
      await page.clock.runFor(DT);
      await advance(DT);
      writeFileSync(join(dir, `f${String(i).padStart(5, '0')}.jpg`), await page.screenshot({ type: 'jpeg', quality: 92 }));
    }
    writeFileSync(join(dir, 'index.json'), JSON.stringify({ name: clip.name, fps: FPS, frames: total }));
    console.log(clip.name, total, 'frames');
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
