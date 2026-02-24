# tet-js

HTML5 Canvas で動くテトリス風パズルゲームです。PC・スマートフォン対応のレスポンシブ UI と、チュートリアル・難易度選択・ライト/ダークテーマを備えています。

**プレイ**: https://tuki-sana.github.io/tet-js/

---

## 主な機能

- **ゲームコア**: 7 種類のテトラミノ、ライン消去、レベルアップで落下速度が上昇。ゴーストブロック（着地位置表示）、コンボボーナス、ホールド（C キー / ボタンでピースストック）
- **難易度**: かんたん / ふつう / むずかしい（開始レベル・落下間隔が変化）
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
- **E2E**: Playwright（スタート〜難易度〜ゲーム開始、チュートリアル、一時停止・メニュー、ゲームオーバー）

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
├── audio/             # BGM・効果音（mp3）
└── README.md
```

---

## メモ

- 学習用でバニラ JS のみ（ビルドなし）。ハイスコア・テーマ・音量は `localStorage` に保存。
- デスクトップ表示で試すときは `?desktop=true` を付ける。
- デプロイ時は `tetris.js` の `APP_VERSION` と `sw.js` の `CACHE_VERSION` を同じ値に。スタート画面に v を表示。
- E2E: `npm run test:e2e`（事前に `npx playwright install chromium`）。`test:e2e:ui` で UI モード。
- **BGM**: 魔王魂（[魔王魂](https://maou.audio)）。8bit29（通常）と 8bit25（ピンチ時）。
- **効果音**: イワシロ音楽素材（[イワシロ音楽素材](https://iwashiro-sounds.work/)）。ゲームオーバー・ライン消去を使用。
- 学習用クローン。Tetris は The Tetris Company の商標。
