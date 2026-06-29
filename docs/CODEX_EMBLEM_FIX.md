# Codex handoff: エンブレムの色が後光・発光で潰れる問題

## 課題

現在、`Tsugai` のエンブレム表示で、色が後光や発光に埋もれて見えにくくなっている。

主に問題が出ている画面は以下。

1. クリア後の結果画面
   - 中央の大きいエンブレムで、後光が強く、金/銀などの状態色が読み取りにくい。
2. 問題一覧画面
   - クリア済み/最短クリア済みの小さいエンブレムで、色がにじんで見える。
   - ユーザーから「一覧画面のエンブレムの色もおかしくなってるのでエンブレ自体を疑うのが妥当」と指摘あり。

当初はクリア画面の `emblem-halo` だけを疑っていたが、一覧画面でも問題が出ているため、エンブレム共通スタイル全体を調整する必要がある。

## 重要な結論

問題は `emblem-halo` だけではない。

以下の複数要素が発光・にじみの原因になっている。

- クリア画面/ホーム画面系
  - `#gap-emblem .emblem-halo`
  - `.home-emblem .emblem-halo`
  - `#gap-emblem .emblem-ball`
  - `.home-emblem .emblem-ball`
  - `#gap-emblem .emblem-disc`
  - `.home-emblem .emblem-disc`

- 一覧画面系
  - `.lv-emblem .le-halo`
  - `.lv-emblem .le-ball`
  - `.lv-emblem .le-disc`

特に一覧画面は `emblem-halo` ではなく `.le-halo` を使っているため、`emblem-halo` だけを消しても直らない。

## 現在の関連ファイル

### `web/app.js`

一覧画面のエンブレムは `showLevels()` 内で生成される。

```js
const emblem = (state) =>
  `<span class="lv-emblem ${state}${isBoss ? ' boss' : ''}"><span class="le-inner">` +
  `<span class="le-halo"></span><span class="le-disc"></span>` +
  `<span class="le-ball eb1"></span><span class="le-ball eb2"></span></span></span>`;
```

つまり一覧側は `lv-emblem / le-halo / le-disc / le-ball` 系。

### `web/index.html`

クリア画面・ホーム画面のエンブレムは、以下のような構造。

```html
<div class="emblem home-emblem best" id="home-emblem" aria-hidden="true">
  <div class="emblem-halo"></div>
  <div class="emblem-disc"></div>
  <div class="emblem-balls">
    <div class="emblem-ball eb1"></div>
    <div class="emblem-ball eb2"></div>
  </div>
</div>
```

クリア画面側は `#gap-emblem`。

### `web/style.css`

後段に、ライトテーマ用のエンブレム定義がある。

特に以下が発光/にじみの主因。

```css
#gap-emblem.best .emblem-halo,
.home-emblem.best .emblem-halo {
  display: block;
  background: radial-gradient(...);
  filter: blur(4px);
}

#gap-emblem.win .emblem-halo,
.home-emblem.win .emblem-halo {
  display: block;
  background: radial-gradient(...);
  filter: blur(4px);
}

.lv-emblem.best .le-halo {
  display: block;
  background: radial-gradient(...);
  filter: blur(4px);
}

.lv-emblem.win .le-halo {
  display: block;
  background: radial-gradient(...);
  filter: blur(4px);
}
```

また、ball/discにも外側影がある。

```css
#gap-emblem .emblem-ball,
.home-emblem .emblem-ball {
  box-shadow: ..., 0 8px 14px rgba(...);
}

.lv-emblem .le-ball {
  box-shadow: ..., 0 8px 14px rgba(...);
}

#gap-emblem.best .emblem-disc,
.home-emblem.best .emblem-disc,
.lv-emblem.best .le-disc {
  box-shadow: ...;
}
```

## すでにやったこと

### 1. `web/emblem-overrides.css` を追加済み

追加済みコミット:

```text
0f5dc771c24992dfb435bc22d7229773ef018521
```

このファイルには、エンブレムの後光/外側発光を抑えるCSSが入っている。

ただし、現時点では `index.html` から読み込まれていないため、PWAには反映されない。

### 2. 一時workflow方式は失敗した

`.github/workflows/tone-down-emblem-glow.yml` のような一時workflowで自動修正しようとしたが、うまく反映されなかった。

考えられる原因:

- GitHub Actions の実行権限/設定
- `github.actor != 'github-actions[bot]'` によるスキップ
- workflowを新規追加した直後の有効化タイミング
- GITHUB_TOKENで作ったコミットがさらにworkflowを起動しない制限
- workflowが自分自身を削除する設計が不安定

今後はこの方式を使わないこと。

## Codexにやってほしいこと

### 最優先タスク

`web/index.html` に、追加済みの `web/emblem-overrides.css` を読み込ませる。

既存のこの行の直後に追加する。

```html
<link rel="stylesheet" href="style.css?v=halooff120">
```

追加する行:

```html
<link rel="stylesheet" href="emblem-overrides.css?v=121">
```

最終形:

```html
<link rel="stylesheet" href="style.css?v=halooff120">
<link rel="stylesheet" href="emblem-overrides.css?v=121">
```

### ビルド番号更新

同じ `web/index.html` 内で、ビルド番号を `120` から `121` に上げる。

変更対象:

```html
var V='120'
```

を

```html
var V='121'
```

へ。

また、ロゴ右上の初期表示も変更する。

```html
<span class="build-mark" id="build-mark" aria-hidden="true">120</span>
```

を

```html
<span class="build-mark" id="build-mark" aria-hidden="true">121</span>
```

へ。

## `web/emblem-overrides.css` の目的

追加済みCSSは、以下を狙っている。

1. クリア画面/ホーム/一覧の halo を全て消す
2. ball の外側発光を弱める
3. disc の外側発光を弱める
4. エンブレムの色そのものを読みやすくする

CSSの要点:

```css
#gap-emblem .emblem-halo,
.home-emblem .emblem-halo,
.lv-emblem .le-halo {
  display: none !important;
  opacity: 0 !important;
  background: none !important;
  filter: none !important;
}
```

一覧画面は `.lv-emblem .le-halo` が重要。

## 検証方法

1. PWAを開き直す
2. ロゴ右上の数字が `121` になっていることを確認
3. 問題一覧画面を確認
   - クリア済み/最短クリア済みエンブレムの色がにじまないか
   - 青/赤/金/銀の状態色が読めるか
4. 任意の問題をクリアして結果画面を確認
   - 中央エンブレムの後光が消えているか
   - 金/銀の土台色が見えるか

## もしまだ直らない場合

### 可能性1: `emblem-overrides.css` が読まれていない

確認すること:

- `index.html` に `<link rel="stylesheet" href="emblem-overrides.css?v=121">` が入っているか
- その行が `style.css` より後にあるか
- PWAのビルド番号が `121` になっているか

### 可能性2: CSS指定がまだ弱い

追加で以下を試す。

```css
#gap-emblem,
.home-emblem,
.lv-emblem {
  filter: none !important;
}

#gap-emblem *,
.home-emblem *,
.lv-emblem * {
  filter: none !important;
}
```

### 可能性3: glowではなく色設計自体が弱い

小さい一覧エンブレムでは、グラデーションが細かすぎて色が潰れる可能性がある。

その場合は、一覧専用にもっと単純な色面にする。

例:

```css
.lv-emblem.best .le-disc {
  background: #c59b3a !important;
}

.lv-emblem.win .le-disc {
  background: #9aa8b8 !important;
}

.lv-emblem.boss .le-ball {
  background: #c65b52 !important;
}
```

## 注意

- `style.css` は巨大なので、まずは直接大改修しない。
- 追加CSSで上書きする方針を優先する。
- 一時workflow方式は使わない。
- `index.html` 変更時は、ビルド番号も必ず更新する。
- PWAはキャッシュが強いので、CSSファイルには必ず `?v=...` を付ける。
