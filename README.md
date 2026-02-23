# tet-js

HTML5 Canvas で動くテトリス風パズルゲームです。PC・スマートフォン対応のレスポンシブ UI と、チュートリアル・難易度選択・ライト/ダークテーマを備えています。

**プレイ**: https://tuki-sana.github.io/tet-js/

---

## 主な機能

- **ゲームコア**: 7 種類のテトラミノ、ライン消去、レベルアップで落下速度が上昇
- **難易度**: かんたん / ふつう / むずかしい（開始レベル・落下間隔が変化）
- **チュートリアル**: 4 ステップで操作を体験しながら覚えられる
- **操作**  
  - **PC**: 移動 A/D、回転 W、落下 S、一時停止 P  
  - **モバイル**: 画面上のタップゾーン（回転・左・右・落下）、長押しで連続落下
- **UI**: ライト/ダークテーマ切替、ボタンコンポーネントの統一、デスクトップでレイアウト拡大（1400px 以上でスケール）
- **PWA**: オフライン再生可能、ホーム画面に追加してアプリのように利用可能（`manifest.json` + Service Worker）
- **スコア永続化**: ハイスコアを `localStorage` に保存（プレイ中に更新・ゲームオーバー時に最終反映）

---

## 遊び方

1. ブラウザで `index.html` を開くか、[デモ](https://tuki-sana.github.io/tet-js/)にアクセス
2. 「ゲーム開始」で難易度を選び「スタート」、または「チュートリアル」で操作を練習
3. 横一列を揃えるとラインが消え、10 ラインでステージクリア。ブロックが積み上がるとゲームオーバー

---

## 技術スタック

- **フロント**: HTML5, CSS3（変数・Flexbox・Grid・メディアクエリ）, JavaScript（ES6+）
- **描画**: Canvas API 2D
- **フォント**: M PLUS Rounded 1c, JetBrains Mono（Google Fonts）
- **デプロイ**: GitHub Pages（静的サイト）
- **E2E**: Playwright（スタート〜難易度〜ゲーム開始、チュートリアル、一時停止・メニュー、ゲームオーバー）

---

## プロジェクト構成

```
tet-js/
├── index.html         # 画面・モーダル・キャンバス
├── manifest.json      # PWA マニフェスト（名前・アイコン・theme_color）
├── sw.js              # Service Worker（オフラインキャッシュ）
├── package.json       # npm スクリプト（test:e2e）・Playwright / serve
├── playwright.config.js  # E2E 設定・webServer（serve）
├── css/
│   └── style.css      # レイアウト・テーマ・ボタン・タップゾーン
├── js/
│   └── tetris.js      # Tetris クラス・ゲームループ・画面制御・チュートリアル・SW 登録
├── e2e/               # Playwright E2E テスト
│   ├── start.spec.js      # スタート・難易度・ゲーム画面・チュートリアル
│   └── game-over.spec.js  # ゲームオーバーまでプレイ
├── icons/             # PWA アイコン（icon-192.png / icon-512.png）
│   ├── README.md      # アイコンの置き方
│   └── generate-icons.html  # アイコン PNG 生成用（ブラウザで開いて保存）
└── README.md
```

- **tetris.js**: ゲームロジック（`Tetris` クラス）、デバイス判定、タップ/キー操作、`performZoneAction` による共通タップ処理、チュートリアル進行
- **style.css**: ボタンコンポーネント（`.btn`, `.btn-primary` 等）、タップゾーン用 CSS 変数（`--tap-top-h` 等）、レスポンシブとテーマ

---

## メモ

- 学習用にバニラ JS で実装（ビルドツールなし）
- **ハイスコア**は `localStorage` に保存（キー: `tetrisHighScore`）。プレイ中にハイスコアを更新するたびに保存し、ゲームオーバー時にも最終反映する。
- デスクトップモードを強制する場合は URL に `?desktop=true` を付与
- **PWA アイコン**: `icons/generate-icons.html` をブラウザで開き、192px / 512px の PNG を保存して `icons/` に置くと、ホーム画面追加時にアイコンが表示されます（未設定でも PWA は動作します）
- **E2E テスト**: `npm install` のあと `npx playwright install chromium` でブラウザを入れ、`npm run test:e2e` で実行。`npm run test:e2e:ui` で UI モード。
- 本プロジェクトは学習用のクローンです。Tetris は The Tetris Company の商標です。
