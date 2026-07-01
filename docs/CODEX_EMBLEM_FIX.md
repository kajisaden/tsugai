# Codex handoff: エンブレム後光(halo) — 対応済み(クローズ)

> このタスクはクローズ済み。当時の作業指示(emblem-overrides.css を読み込ませる／ビルド 120→121 等)は破棄。下記の最終結論のみ残す。

## 結論(現行の halo 設計)

後光/にじみの問題は、`emblem-overrides.css` を配線する当初案ではなく **`web/style.css` と `web/app.js` 側で halo を直接整理する別方式**で解決済み。

- **halo はホーム画面のエンブレムだけ**残す(`.home-emblem.best/.win .emblem-halo` を控えめに表示。最短=金 / クリア=銀、`blur(4px)`・低透過)。
- **結果画面(A画面, `#gap-emblem`)と問題一覧(`.lv-emblem`)は halo 無し**。既定の `.emblem-halo` は `display:none`、一覧エンブレムは生成マークアップから **`le-halo` 要素ごと削除**済み(`web/app.js` の一覧エンブレム生成)。
- 一覧エンブレムはその後 **ロック表現**(`le-lock-shackle`/`le-lock-latch`)を含む構造に作り替え済み(レベルロック機能)。ホーム/結果のエンブレムにも `emblem-lock-shackles`/`emblem-lock-latches` がある。
- 抑制用に作った **`web/emblem-overrides.css` は一度も `index.html` から読み込まれず(孤立)、不要となり削除済み**。
- ビルド番号は `web/index.html` の `var V` を正とする(当時の 120/121 はとうに陳腐化)。

## 経緯(要約)

一時、後光や外側発光でエンブレムの金/銀の状態色が読みにくいという課題があり、`emblem-overrides.css` で halo を `display:none !important` で強制的に消す案を検討した。最終的には overrides を配線せず、`style.css`/`app.js` 側で「ホームのみ halo・結果/一覧は halo 無し」に直接整えて解決した。`emblem-overrides.css` はファイルごと撤去した。
