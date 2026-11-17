# 解説動画「Tsugaiの作り方」の書き出し

ゲームの仕組み(難易度・問題の作り方・光ヒント)を解説する動画を、コードから書き出す道具一式。
音声は入らない(字幕のみ)。ナレーションやBGMは書き出した mp4 に後から重ねる。

## 構成

| ファイル | 役割 |
|---|---|
| `clips.mjs` | ゲーム画面のクリップ定義(どの問題を、いつ、どう操作するか)。例題は本編に出ない問題(プール id 88 / 1516 / 66) |
| `capture.mjs` | 実際のゲーム(`web/`)を自動操作し、1コマずつ撮影する。時計とアニメーションを止めて手動で進めるので、毎回同じ絵になる |
| `build-data.mjs` | 図に使う数字を `data/pool.json` とレベル表から計算して `data.js` に書き出す。BFSの結果・気づきの数は検算し、合わなければ止まる |
| `video.html` | 動画の全画面。末尾の `BEATS` が台本(シーン・秒数・字幕)。`window.seek(秒)` で任意の時刻の絵を出す |
| `render.mjs` | `video.html` を1コマずつ撮影し、ffmpeg で mp4 にまとめる |

## 手順

出力ディレクトリ(以下 `OUT`)はリポジトリの外に置く(コマ画像が数GBになる)。

```sh
OUT=/path/to/out && mkdir -p $OUT && cd $OUT && npm init -y && npm i @fontsource/noto-sans-jp
cd <リポジトリ>
node tools/video/capture.mjs $OUT/clips        # ゲーム画面を録る(約2分)
node tools/video/build-data.mjs $OUT           # 図のデータを作る
node tools/video/render.mjs $OUT --beats       # 各字幕の静止画を $OUT/shots に出す(確認用)
node tools/video/render.mjs $OUT               # 全編を書き出す → $OUT/tsugai-howmade.mp4
```

前提: `playwright`(Chromium)と `ffmpeg` が使えること。フォントは Noto Sans JP を npm から読む。

## 直し方

- 字幕や尺を変える: `video.html` の `BEATS` を編集する。
- 図の動きを変える: `video.html` の各 `scene(...)`。`step` は同じシーン内で何番目の字幕か、`tau` はその字幕が始まってからの秒数。
- ゲーム画面を変える: `clips.mjs` を編集して `capture.mjs` を再実行する。ゲームの見た目を変えたときも再実行する。
- 問題データやレベル表を作り直したとき: `build-data.mjs` と `capture.mjs` を再実行する(数字と図が追従する)。
