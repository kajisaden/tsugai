// UI文言テーブル(ja/en)。app.js より前に読み込む。手で編集してよい(生成物ではない)。
// fetch не使わず JS 埋め込み = file:// でも動く(README/SPEC の制約)。
// 値は文字列(={k} 補間) か 関数(複数形など)。英語は move/moves の単複を関数で処理する。
window.NIKENZUME_STRINGS = {
  ja: {
    title: 'Tsugai',
    tagline: 'ふたつの部屋、ひとつの操作。',
    chapter: ({ n }) => `第${n}章`,
    // ボタン
    back: '戻る', reset: '最初から', answer: '答え', theme: '表示テーマ', settings: '設定',
    light: '光ヒント', nextMove: '次の手ヒント',
    play: '再生', pause: '一時停止', prev: '前へ', next: '次へ', close: 'とじる',
    restart: '初手から', nextPuzzle: '次の問題へ', levels: '一覧へ', retryAgain: 'もう一度',
    // メッセージ
    controlsHint: '矢印キー / スワイプで両方の部屋が動く',
    missNote: 'ゴールは、ふたつ同時でなければ開かない',
    noSolution: 'この局面からは進めません',
    // 動的(数字埋め込み)
    puzzlePar: ({ n }) => `${n}手詰`,
    levelMoves: ({ n }) => `${n}手`,
    moveCount: ({ n }) => `${n}手`,
    clearedMoves: ({ n }) => `${n}手でクリア`,
    fewest: '最短手数です',
    fewestIs: ({ n }) => `最短は${n}手`,
    nextMoveHint: ({ n }) => `次の一手 ・ あと ${n} 手`,
  },
  en: {
    title: 'Tsugai',
    tagline: 'Two rooms, one move.',
    chapter: ({ n }) => `Chapter ${n}`,
    back: 'Back', reset: 'Restart', answer: 'Answer', theme: 'Theme', settings: 'Settings',
    light: 'Light hint', nextMove: 'Next move',
    play: 'Play', pause: 'Pause', prev: 'Prev', next: 'Next', close: 'Close',
    restart: 'Retry', nextPuzzle: 'Next puzzle', levels: 'Levels', retryAgain: 'Try again',
    controlsHint: 'Arrow keys or swipe move both rooms',
    missNote: 'The goal opens only when both arrive together.',
    noSolution: 'No solution from here',
    puzzlePar: ({ n }) => `Solve in ${n}`,
    levelMoves: ({ n }) => `${n}`,
    moveCount: ({ n }) => `${n} ${n === 1 ? 'move' : 'moves'}`,
    clearedMoves: ({ n }) => `Cleared in ${n} ${n === 1 ? 'move' : 'moves'}`,
    fewest: 'Fewest moves!',
    fewestIs: ({ n }) => `Fewest is ${n} ${n === 1 ? 'move' : 'moves'}`,
    nextMoveHint: ({ n }) => `Next · ${n} to go`,
  },
};
