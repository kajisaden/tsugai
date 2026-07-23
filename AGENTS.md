# AGENTS.md — AIエージェント向け作業規約 (Tsugai)

このリポジトリで作業するAIエージェント(Codex / Claude Code / その他)への共通指示。

## 最初に読むもの

1. [docs/SPEC.md](docs/SPEC.md) — 安定した設計仕様(ゲームルール・UI原則・データ形式)
2. [docs/HANDOVER.md](docs/HANDOVER.md) — 作業の現在地。**先頭の最新「現在地」節が正**(下の日付つき節は履歴)

## 必ず守るルール

- **言語**: ユーザーとのやり取りは日本語。
- **正は origin/main**: 分析・コミット前に `git fetch origin` で差分確認。force-push禁止。
- **コミット前に必ず** `node tools/stamp-cache.mjs` を実行(キャッシュバスティング+ビルド印+1。web資産を変更していない場合も慣例として実行)。
- 仕様とコードが食い違う場合は**コードが正**(SPEC/HANDOVERを現実に合わせて更新する)。
- 秘密値(秘密APIキー・.p8・パスワード等)をリポジトリに書かない。`appl_` などアプリ埋め込み前提の公開キーは可。

## 技術スタック / 構成

- Vanilla JS/HTML/CSS(バンドラなし)。本体は `web/`(`app.js` / `style.css` / `index.html` / `strings.js`)。
- iOSネイティブは Capacitor 8(`ios/`、SPM構成)。プラグインは `window.Capacitor?.Plugins?.X` 経由で、PWA/ブラウザでは未定義のため必ずオプショナルに扱う。
- 課金は RevenueCat(entitlement `three_pack` / `ad_free` が正、localStorageはオフラインキャッシュ)。広告は AdMob(実IDは HANDOVER 参照)。
- 問題データ生成は `tools/generate-pool.mjs` ほか(HANDOVER参照)。

## 動作確認

- ローカル: `node tools/static-server.mjs`(port 8000、`PORT`環境変数可)→ `http://localhost:8000/?dev=1`(dev=1で全解放)
- 構文チェック: `node --check web/app.js`
- ネイティブ反映: `npx cap sync ios` → Codemagic(https://codemagic.io/apps)で手動ビルド → TestFlight

## 記録

- 作業の節目で `docs/HANDOVER.md` の「現在地」節を更新する(古い節は消さず履歴として残す)。
