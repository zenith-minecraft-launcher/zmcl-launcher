# **Zenith · Minecraft ランチャー**

> Electron で構築された、モダンで機能が充実した Minecraft ランチャー。

---

## ✨ **プロジェクト紹介**

**Zenith** は、ゲームのダウンロード、バージョン管理、MOD 統合、マルチプレイ対戦、AI アシスタントを統合した **オールインワンの Minecraft ランチャー** です。シンプルで洗練されたユーザーインターフェースを提供し、公式 / オフライン / Authlib の複数のログイン方式に対応。Fabric、Forge、NeoForge、OptiFine などの主流 MOD ローダーを統合し、EasyTier ベースの P2P マルチプレイ機能と DeepSeek ベースの AI アシスタントを内蔵しています（AI 機能はスポンサーシップが必要です）。

---

## 🚀 **主な機能**

### 🎮 **ゲーム起動とバージョン管理**
- すべての Minecraft バージョンに対応：正式版、スナップショット版、過去バージョン、エイプリルフール版
- ワンクリックでダウンロード、リソースファイル（Client / Assets / Libraries）を自動補完
- 複数バージョンの共存、バージョン切り替えは即時反映
- スマートな Java 検出と自動推奨、対応する Java バージョンを自動ダウンロード

### 🔐 **複数の認証方式**
- ✅ **Microsoft 公式ログイン**：完全な OAuth2 フロー、正規 Xbox アカウントに対応
- ✅ **オフラインログイン**：カスタムユーザー名、ネット接続なしでゲームを起動
- ✅ **Authlib サードパーティログイン**：カスタム認証サーバーに対応、オフラインサーバー向け

### 🧩 **MOD とリソースパックのエコシステム**
- **Modrinth** と **CurseForge** の 2 大プラットフォームを統合検索
- MOD / リソースパック / シェーダー / データパック / ワールド / モッドパックに対応
- 依存関係を自動解析し、ワンクリックでダウンロード & インストール
- 日本語名の拡張（MC百科から日本語化情報を取得）

### 🔧 **MOD ローダーのワンクリックインストール**
- **Fabric** — 軽量で互換性が高い
- **Forge** — 古典的な老舗ローダー
- **NeoForge** — Forge のフォーク、新バージョン向け
- **OptiFine** — パフォーマンス最適化とシェーダー対応
- バージョン互換性を自動検出し、競合を通知

### 🌐 **陶瓦マルチプレイ（EasyTier）**
- **パブリック IP 不要**、P2P ホールパンチ / リレーを自動切替
- ルームコード方式：招待コードを生成し、友人がワンクリックで参加
- 複数のコミュニティノード、低遅延・高安定性
- コアのダウンロードと管理を内蔵、すぐに使える

### 🤖 **AI アシスタント（DeepSeek）**
- AI アシスタントを内蔵し、Minecraft に関する質問に回答
- **ストリーミング出力** に対応し、リアルタイムで逐次返信
- **ディープシンキングモード** と **ウェブ検索** を選択可能
- **カスタム OpenAI 互換モデル** に対応し、利用制限なし
- 愛発電（ifdian.net）でのスポンサーシップでアクティベート、開発者モードに対応

### 🛠️ **ツールボックス**
- ゲームディレクトリ / バージョンディレクトリ / ログディレクトリを開く
- セーブデータのバックアップと復元
- キャッシュクリーン、古いログの削除
- ネットワーク診断、Java 環境の検出

### 🎨 **その他の機能**
- ダーク / ライトテーマの切り替え
- カスタムダウンロードソース（公式 / BMCLAPI / 自作ミラー）
- カスタム JVM 引数、メモリ割り当て
- 自動アップデート（electron-updater ベース）
- ダウンロード進捗の可視化、タスク管理を明確に表示
- 起動ログのリアルタイムキャプチャとエクスポート

---

## 🛠️ **技術スタック**

| 階層 | 技術 |
|------|------|
| **ランタイム** | Electron 28+ |
| **メインプロセス** | Node.js + ネイティブ IPC |
| **フロントエンド** | ネイティブ HTML / CSS / JavaScript |
| **パッケージ** | electron-builder（NSIS / DMG / AppImage） |
| **自動アップデート** | electron-updater |
| **外部依存** | axios, adm-zip, fs-extra |
| **マルチプレイコア** | EasyTier（外部バイナリ） |
| **AI モデル** | DeepSeek API（OpenAI 互換） |

---

## 📁 **プロジェクト構成**

```
Zenith/
├── src/
│   ├── main/                 # メインプロセス
│   │   ├── main.js          # エントリー / IPC ルーティング / 自動アップデート
│   │   ├── auth/            # 認証モジュール
│   │   │   ├── microsoft.js   # Microsoft OAuth
│   │   │   ├── offline.js     # オフラインログイン
│   │   │   └── authlib.js     # Authlib サードパーティ
│   │   ├── minecraft/       # ゲームコア
│   │   │   ├── launcher.js    # 起動引数の構築とプロセス管理
│   │   │   ├── java.js        # Java の検出と選択
│   │   │   ├── version.js     # バージョンメタデータの解析
│   │   │   └── assets.js      # Assets のダウンロードと検証
│   │   ├── download/        # ダウンロードモジュール
│   │   │   ├── manager.js     # バージョンファイルのダウンロード
│   │   │   ├── sources.js     # マルチソース切替
│   │   │   ├── modrinth.js    # Modrinth API
│   │   │   ├── curseforge.js  # CurseForge API
│   │   │   ├── addonSearch.js # 統合検索 + 日本語化強化
│   │   │   ├── addon.js       # MOD/リソースパックのインストール
│   │   │   └── loader.js      # ローダーの自動インストール
│   │   ├── net/             # ネットワークモジュール
│   │   │   ├── taowa.js       # 陶瓦マルチプレイ EasyTier ラッパー
│   │   │   └── toolbox.js     # ツールボックスのツール実装
│   │   ├── ai/              # AI アシスタント
│   │   │   ├── deepseek.js    # DeepSeek ストリーミングチャット
│   │   │   └── activation.js  # アクティベーションコードの検証
│   │   └── config/          # 設定ストレージ
│   │       └── store.js       # 設定とアカウントの永続化
│   ├── preload/
│   │   └── index.js           # プリロードスクリプト（contextBridge）
│   └── renderer/             # レンダラープロセス（フロントエンド UI）
│       ├── index.html
│       ├── css/
│       └── js/
├── resources/                # パッケージリソース
│   ├── icons/               # アプリアイコン
│   ├── installer.nsh       # NSIS インストーラースクリプト
│   └── license.txt         # エンドユーザーライセンス契約
├── package.json
└── build/                   # electron-builder 設定
```

---

## 📦 **クイックスタート**

### 環境要件
- **Node.js** ≥ 18
- **npm** / **pnpm** / **yarn** のいずれか
- Windows 10+ / macOS 11+ / Linux（AppImage に対応）

### ローカル開発

```bash
# 1. プロジェクトをクローン
git clone <your-repo-url>
cd Zenith

# 2. 依存関係をインストール
npm install

# 3. 開発モードで起動
npm run dev
```

### リリースパッケージのビルド

```bash
# 現在のプラットフォーム向けをビルド
npm run build

# またはプラットフォーム別にビルド
npm run build:win      # Windows（NSIS インストーラー）
npm run build:mac      # macOS（.dmg）
npm run build:linux    # Linux（.AppImage）
```

ビルド生成物は `dist-release/` ディレクトリに出力されます。

---

## 🔒 **セキュリティとプライバシー**

- ユーザーログイン情報（Microsoft Token、Authlib Token）はローカルにのみ保存
- AI チャットはデフォルトで DeepSeek API を使用、データはユーザーのデバイスにのみ保存
- 陶瓦マルチプレイは P2P プロトコルを使用、データは中央サーバーに保存されない
- ユーザーデータのアップロードは一切なし（自動アップデートの確認を除く）

---

## 📝 **開発ガイド**

### ツールボックスに新しいツールを追加する

`src/main/net/toolbox.js` を編集し、`tools` 配列にエントリーを追加してください：

```js
{
  key: 'my-tool',
  name: 'マイツール',
  description: 'ツールの説明',
  category: 'system',
  icon: '⚙️',
  async exec() {
    // ツールのロジック
    return { ok: true, message: '実行成功' };
  }
}
```

### 新しい MOD ローダーを追加する

`src/main/download/loader.js` の `detectLoaders()` メソッドを拡張し、`installLoaderVersion()` にダウンロードと展開のロジックを追加してください。

### カスタム API ミラー

`src/main/download/sources.js` の `sources` 配列を変更してください。

---

## 📄 **ライセンス**

- **ランチャーコード**：GPL-3.0
- **Minecraft EULA**：Minecraft は Mojang Studios の登録商標です。このランチャーに **Minecraft ゲームファイルは含まれません**。すべてのゲームファイルは Mojang / Microsoft の公式チャンネルからダウンロードされます。
- **エンドユーザーライセンス契約**：`resources/license.txt` を参照
- **利用規約**：`使用协议.txt` を参照
- **プライバシーポリシー**：`隐私政策.txt` を参照

---

## 💖 **スポンサーシップとサポート**

本プロジェクトは **愛発電（ifdian.net）** を通じてスポンサーを受け付けています。スポンサーの方は AI アシスタントの完全な利用枠をアンロックできます。すべてのサポーターに感謝いたします！

発電リンク：[リンクへ移動](https://ifdian.net/a/JasonDeng)

---

## 🌟 **特徴ハイライトまとめ**

| 機能 | 説明 |
|------|------|
| 🔄 **自動アップデート** | 起動時に新バージョンをサイレント確認、バックグラウンドでダウンロード、ワンクリックで更新 |
| 🎯 **スマート Java 選択** | MC バージョンに応じて適切な Java 環境を自動でマッチング |
| 🌍 **多言語対応** | 完全な日本語 / 中国語インターフェース、国内ユーザーの習慣に合わせた設計 |
| ⚡ **高速ダウンロード** | マルチソース切替、BMCLAPI による国内高速化に対応 |
| 🤝 **P2P マルチプレイ** | パブリック IP 不要、ルームコードでワンクリック対戦 |
| 🤖 **AI アシスタント** | DeepSeek を深く統合し、MC に関するすべての質問に回答 |

---

> **Zenith** — Minecraft の毎日が、新しい始まりになりますように。

---

## 📬 **お問い合わせ**

- プロジェクトリポジトリ：[リンクへ移動](https://github.com/zenith-minecraft-launcher/zmcl-launcher/)
- フィードバック：Issue を提出
