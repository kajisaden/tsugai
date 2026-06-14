# 二間詰(にけんづめ・仮称)

ふたつの部屋、ひとつの操作。詰将棋を目標体験とするターン制グリッドパズル。
設計の全体像は [docs/SPEC.md](docs/SPEC.md)、作業の現在地は [docs/HANDOVER.md](docs/HANDOVER.md)。

## 構成

| パス | 役割 |
|---|---|
| `tools/core.mjs` | コアロジック(決定的生成 + BFSソルバー)。生成バッチ専用 |
| `tools/generate-pool.mjs` | プール生成バッチ(タスクA)。オフラインで問題を量産・検証 |
| `data/pool.json` | 全部入りプール(`nikenzume-pool-v1`)。1問1行で diff 可読 |
| `data/stats.md` | サイズ×手数ごとの問題数・解数分布(章編成の根拠資料) |
| `web/` | プレイ側ビューア(タスクB)。素のHTML/CSS/JS、ソルバーなし |
| `web/pool.js` | バッチが生成するビューア用プール(手で編集しない) |
| `web/strings.js` | UI文言(ja/en)。`t()` で参照、HTMLの `data-i18n` で静的流し込み。`?lang=en` で切替 |

## プール生成

```
node tools/generate-pool.mjs [--sizes 4x4,5x5] [--seeds 1-6000] [--rooms 2]
```

- 既定は `4x4,5x5` / `1-6000`。**6x6 は視認性の限界(5x5まで)から本体除外**、seeds は ep5 を20問そろえるため拡大(SPEC.md 2-4)。引数なしで配信プールを再現できる
- フィルタは「解の存在のみ」。緩い問題も捨てず、品質判定は tags に寄せる(SPEC.md 4章)
- 全問について正解 path を検算してから出力する(検算失敗は即エラー)
- `--rooms 3` で3枚版も同じバッチで生成できる(スキーマは rooms 配列が伸びるだけ)。出力は本体を上書きしないよう別ファイル `data/pool-3room.json` / `web/pool-3room.js`(`window.NIKENZUME_POOL_3ROOM`) になる

## ビューア

`web/index.html` をブラウザで開くだけ(fetch 不使用なので `file://` で動く)。

- 操作: 矢印キー / WASD / スワイプ
- 章編成は `web/app.js` 冒頭の `CHAPTERS` で tags/analysis によりスライス
- `index.html?debug=1` で「解答」ボタンが出る(解答再生+妙手ハイライト)。リリースUIでは非表示
- クリア記録は localStorage(`nikenzume.cleared.v1`)
