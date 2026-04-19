# tet-js

HTML5 Canvas で動くテトリス風パズルゲームです。PC・スマートフォン対応のレスポンシブ UI と、チュートリアル・難易度選択・ライト/ダークテーマを備えています。

**プレイ**: https://tuki-sana.github.io/tet-js/

---

## 主な機能

- **ゲームコア**: 7 種類のテトラミノ、ライン消去、レベルアップで落下速度が上昇。ゴーストブロック（着地位置表示）、コンボボーナス、ホールド（C キー / ボタンでピースストック）
- **難易度**: かんたん / ふつう / むずかしい（開始レベルのみ。落下速度はレベルに連動）
- **チュートリアル**: 4 ステップで操作を体験しながら覚えられる
- **操作**  
  - **PC**: 移動 A/D、回転 W、落下 S、一時停止 P、ホールド C  
  - **モバイル**: 画面上のタップゾーン（回転・左・右・落下）、HOLD ボタン、長押しで連続落下
- **UI**: ライト/ダークテーマ切替、ボタンコンポーネントの統一、デスクトップでレイアウト拡大（1400px 以上でスケール）
- **PWA**: オフライン再生可能、ホーム画面に追加してアプリのように利用可能（`manifest.json` + Service Worker）
- **スコア永続化**: ハイスコア・テーマ・音量設定を `localStorage` に保存

---

## 技術スタック

- **フロント**: HTML5, CSS3（変数・Flexbox・Grid・メディアクエリ）, JavaScript（ES6+）
- **描画**: Canvas API 2D
- **フォント**: M PLUS Rounded 1c, JetBrains Mono（Google Fonts）
- **デプロイ**: GitHub Pages（静的サイト）
- **テスト**: Node 組み込み `node:test` による **ユニット**（`test/unit/`、`config.js` など）。**E2E** は Playwright（**Chromium / WebKit / Firefox** ＋ **Pixel 5** 相当のモバイル専用 spec）
- **CI**: GitHub Actions（`push` / `pull_request` で `test:unit` と E2E）

**こだわり**: ビルドなしのバニラ JS のみで動作。PC/モバイルでデバイスを検出し、キー操作とタップゾーンを自動切替。

**学び**: Canvas のゲームループ・当たり判定・描画、レスポンシブ/PWA/Web Audio を一通り経験した学習用クローン。

---

## 遊び方

1. ブラウザで `index.html` を開くか、[デモ](https://tuki-sana.github.io/tet-js/)にアクセス
2. 「ゲーム開始」で難易度を選び「スタート」、または「チュートリアル」で操作を練習
3. 横一列を揃えるとラインが消え、10 ラインでステージクリア。ブロックが積み上がるとゲームオーバー

---

## プロジェクト構成

```
tet-js/
├── index.html         # 画面・モーダル・キャンバス
├── manifest.json      # PWA マニフェスト（名前・アイコン・theme_color）
├── sw.js              # Service Worker（オフラインキャッシュ）
├── package.json       # npm スクリプト（test / test:unit / test:e2e）・Playwright / serve
├── playwright.config.js  # E2E（chromium・webkit・firefox・mobile-chrome）・webServer（serve）
├── .github/workflows/test.yml  # CI: ユニット + Playwright（Ubuntu）
├── css/
│   ├── style.css      # テーマ・共通 UI・.screen の safe-area・タップゾーン・PC レイアウト
│   └── game-shell.css # モバイルプレイ画面（HUD・盤列・HOLD・#mobile-game の枠・--shell-*）
├── js/
│   ├── app.js           # エントリ（ES modules・window 公開・SW 登録）
│   ├── config.js        # 定数・落下間隔式
│   ├── audio.js         # 音量・BGM・効果音
│   ├── score.js         # ハイスコア
│   ├── game-session.js  # メイン Tetris インスタンス参照
│   ├── input.js         # モバイル判定・タップゾーン・スワイプ一気落下
│   ├── tetris-game.js   # Tetris クラス・ゲームループ
│   ├── screens.js       # 画面遷移・開始・ポーズ
│   ├── tutorial.js      # チュートリアル
│   └── theme-settings.js # テーマ・設定モーダル
├── test/unit/         # Node ユニット（*.test.mjs）
├── e2e/               # Playwright E2E
│   ├── start.spec.js      # デスクトップ: スタート〜難易度・ゲーム・チュートリアル
│   ├── game-over.spec.js  # デスクトップ: ゲームオーバー
│   └── mobile/            # Pixel 5 プロジェクトのみ実行
│       └── layout.spec.js
├── icons/             # PWA アイコン（icon-192.png / icon-512.png）
│   ├── README.md      # アイコンの置き方
│   └── generate-icons.html  # アイコン PNG 生成用（ブラウザで開いて保存）
├── audio/             # BGM・効果音（mp3）
└── README.md
```

---

## モバイル UI とビューポート（開発メモ）

### CSS の分担

| ファイル | 役割 |
|----------|------|
| `css/style.css` | テーマ変数、共通コンポーネント、**`.screen` にだけ** `env(safe-area-inset-*)` を付与、`#game-screen` のモバイル固定、`touch-action` など |
| `css/game-shell.css` | `#game-screen` 内の **`.game-layout-mobile`**（ヘッダー統計・NEXT・中央の盤・HOLD バー）、`--shell-*` トークン、`#mobile-game` の枠線・角丸 |

モバイルの safe-area は **子要素に `env()` を増やさず**、`.screen` のパディングで一度吸収する方針です（`game-shell.css` 先頭コメント参照）。

### 三行レイアウトの幅を揃える

ヘッダー・盤エリア・HOLD で左右パディングが違うと、中央の盤パネルだけが横に「一段広い」ように見えます。  
**`--shell-mobile-inline-pad`** を共通にし、`.mobile-header` / `.mobile-game-area` / `.mobile-hold-bar` の左右インセットを揃えています。

### 盤の水色背景とキャンバス枠

`.mobile-board-with-panels` に `width: 100%` で海面グラデ（`--board-bg`）を敷くと、**キャンバス（1:2）が高さ制限で細いとき**、枠の外側まで水色が伸びて不自然に見えます。  
そのため **`width: fit-content` + `align-self: center`** で、背景付きパネルの横幅を **内側の `.game-area`（キャンバス幅）** に寄せています。

### キャンバス寸法とリサイズ

- **`js/tetris-game.js`** の `adjustMobileCanvasSize()` が、`.mobile-board-with-panels` の `getBoundingClientRect()` から利用可能矩形を取り、**10:20 のアスペクト比**で `#mobile-game` の `width` / `height`（属性とインラインスタイル）を更新します。
- **`js/app.js`** で `window.resize` に加え、**`visualViewport` の `resize`** からも `handleResize()` を呼び、iOS の動的ツールバー等に追従します。
- ゲーム開始直後は **`js/screens.js`** で `requestAnimationFrame` を二重に挟み、flex 確定後に再計測しています。

### `100vh` と高さ

`body` / `.screen` / `#game-screen` では **`100dvh`**（動的ビューポート高）を併記しています。  
さらに厳密に詰める場合の候補として、一般的な **`--vh`（`innerHeight * 0.01` を CSS 変数に流す）** 手法がありますが、本プロジェクトでは **現状 `dvh` + `visualViewport` + DOM 計測**で実用上そこまでに留めています（追い込みは実機で困ったときに検討でよい、という割り切り）。

### 費用対効果の目安

- **ここまで（インセット統一・パネル `fit-content`・`dvh` / `visualViewport`・盤の矩形ベース計測）** は、再現の難しいレイアウト不具合をまとめて潰しやすく、**手を入れる価値が大きい**ゾーンです。
- **ホームインジケータ周りの余白の「きれいさ」など**は端末・PWA・シミュレータ差が残りやすく、**急激に効果対工数が悪化**しがちです。商用でない場合は、現状を許容ラインにして切り上げて問題ありません。

---

## メモ

- 学習用でバニラ JS＋**ES modules**（ビルドなし）。ハイスコア・テーマ・音量は `localStorage` に保存。
- デスクトップ表示で試すときは `?desktop=true` を付ける。
- デプロイ時は `js/config.js` の `APP_VERSION` と `sw.js` の `CACHE_VERSION` を同じ値に。スタート画面に v を表示。（モバイルシェルや盤サイズを変えたあと、古い CSS が Service Worker に残っていると見た目がずれることがある）
- テスト一式: `npm test`（`test:unit` のあと `test:e2e`）。GitHub Actions も同じです。
- ユニットのみ: `npm run test:unit`（`node --test test/unit/*.test.mjs`。`**` は CI の sh で展開されないためワイルドカードは 1 段のみ）。
- E2E: `npm run test:e2e`。初回は `npx playwright install chromium firefox webkit`（モバイル含む全体なら `npx playwright install --with-deps` 推奨）。個別: `test:e2e:chromium` / `webkit` / `firefox` / `test:e2e:mobile`（Pixel 5 のみ）。`test:e2e:ui` で UI モード。WebKit は **Safari と同系エンジン**であって **Safari.app そのものではない**。
- **GitHub Actions**: `main` / `master` への `push` と `pull_request` で `.github/workflows/test.yml` が実行されます。
- **BGM**: 魔王魂（[魔王魂](https://maou.audio)）。8bit29（通常）と 8bit25（ピンチ時）。
- **効果音**: イワシロ音楽素材（[イワシロ音楽素材](https://iwashiro-sounds.work/)）。ゲームオーバー・ライン消去を使用。
- 学習用クローン。Tetris は The Tetris Company の商標。
