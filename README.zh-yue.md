# **Zenith · Minecraft 啟動器**

> 一個以 Electron 建構嘅現代化、功能齊全嘅 Minecraft 啟動器。

---

## ✨ **項目簡介**

**Zenith** 係一個整合咗遊戲下載、版本管理、模組支援、連線對戰同 AI 助手嘅 **全功能 Minecraft 啟動器**。佢提供簡潔優雅嘅使用者介面，支援官方 / 離線 / Authlib 多種登入方式，整合 Fabric、Forge、NeoForge、OptiFine 等主流模組載入器，並內建基於 EasyTier 嘅 P2P 連線功能同埋基於 DeepSeek 嘅 AI 助手（AI 功能需要贊助先可以用）。

---

## 🚀 **核心功能**

### 🎮 **遊戲啟動與版本管理**
- 支援所有 Minecraft 版本：正式版、快照版、遠古版、愚人節版
- 一鍵下載、自動補全資源檔案（Client / Assets / Libraries）
- 多版本共存，版本切換即時生效
- 智能 Java 偵測與自動推薦，自動下載對應 Java 版本

### 🔐 **多種認證方式**
- ✅ **Microsoft 官方登入**：完整 OAuth2 流程，支援正版 Xbox 帳號
- ✅ **離線登入**：自訂使用者名稱，唔使網絡都可以啟動遊戲
- ✅ **Authlib 第三方登入**：支援自訂驗證伺服器，適用於離線伺服器

### 🧩 **模組與資源包生態**
- 聚合搜尋 **Modrinth** 同 **CurseForge** 兩大平台
- 支援 Mod / 資源包 / 光影 / 資料包 / 世界 / 整合包
- 自動解析依賴關係，一鍵下載安裝
- 中文/粵語名稱增強（由 MC百科 取得本地化資訊）

### 🔧 **模組載入器一鍵安裝**
- **Fabric** — 輕量級、高相容性
- **Forge** — 經典老牌載入器
- **NeoForge** — Forge 分支，新版本首選
- **OptiFine** — 性能優化與光影支援
- 自動偵測版本相容性，提示衝突

### 🌐 **陶瓦連線（EasyTier）**
- **無需公網 IP**，P2P 打洞 / 中繼自動切換
- 房間碼機制：生成邀請碼，朋友一鍵加入
- 多社區節點，低延遲、高穩定性
- 內建核心下載與管理，開箱即用

### 🤖 **AI 助手（DeepSeek）**
- 內建 AI 助手，解答 Minecraft 相關問題
- 支援 **串流輸出**，逐字實時回覆
- 可選 **深度思考模式** 同 **聯網搜尋**
- 支援 **自訂 OpenAI 相容模型**，冇使用限制
- 透過 爱发电（ifdian.net）贊助激活，支援開發者模式

### 🛠️ **工具箱**
- 打開遊戲目錄 / 版本目錄 / 日誌目錄
- 存檔備份與還原
- 快取清理、舊日誌清理
- 網絡診斷、Java 環境偵測

### 🎨 **其他特性**
- 深色 / 淺色主題切換
- 自訂下載源（官方源 / BMCLAPI / 自建鏡像）
- 自訂 JVM 參數、分配記憶體
- 自動更新（基於 electron-updater）
- 下載進度可視化，任務管理清晰明朗
- 啟動日誌實時擷取與匯出

---

## 🛠️ **技術棧**

| 層級 | 技術 |
|------|------|
| **執行環境** | Electron 28+ |
| **主程序** | Node.js + 原生 IPC |
| **前端** | 原生 HTML / CSS / JavaScript |
| **打包** | electron-builder（NSIS / DMG / AppImage） |
| **自動更新** | electron-updater |
| **外部依賴** | axios, adm-zip, fs-extra |
| **連線核心** | EasyTier（外部二進制） |
| **AI 模型** | DeepSeek API（OpenAI 相容） |

---

## 📁 **項目結構**

```
Zenith/
├── src/
│   ├── main/                 # 主程序
│   │   ├── main.js          # 入口 / IPC 路由 / 自動更新
│   │   ├── auth/            # 認證模組
│   │   │   ├── microsoft.js   # Microsoft OAuth
│   │   │   ├── offline.js     # 離線登入
│   │   │   └── authlib.js     # Authlib 第三方
│   │   ├── minecraft/       # 遊戲核心
│   │   │   ├── launcher.js    # 啟動參數建構與程序管理
│   │   │   ├── java.js        # Java 偵測與選擇
│   │   │   ├── version.js     # 版本後設資料解析
│   │   │   └── assets.js      # Assets 下載與驗證
│   │   ├── download/        # 下載模組
│   │   │   ├── manager.js     # 版本檔案下載
│   │   │   ├── sources.js     # 多源切換
│   │   │   ├── modrinth.js    # Modrinth API
│   │   │   ├── curseforge.js  # CurseForge API
│   │   │   ├── addonSearch.js # 聚合搜尋 + 本地化增強
│   │   │   ├── addon.js       # 模組/資源包安裝
│   │   │   └── loader.js      # 載入器自動安裝
│   │   ├── net/             # 網絡模組
│   │   │   ├── taowa.js       # 陶瓦連線 EasyTier 包裝
│   │   │   └── toolbox.js     # 工具箱工具實作
│   │   ├── ai/              # AI 助手
│   │   │   ├── deepseek.js    # DeepSeek 串流對話
│   │   │   └── activation.js  # 啟動碼驗證
│   │   └── config/          # 設定儲存
│   │       └── store.js       # 持久化設定與帳號
│   ├── preload/
│   │   └── index.js           # 預載腳本（contextBridge）
│   └── renderer/             # 渲染程序（前端 UI）
│       ├── index.html
│       ├── css/
│       └── js/
├── resources/                # 打包資源
│   ├── icons/               # 應用程式圖示
│   ├── installer.nsh       # NSIS 安裝指令碼
│   └── license.txt         # 最終使用者授權合約
├── package.json
└── build/                   # electron-builder 設定
```

---

## 📦 **快速開始**

### 環境要求
- **Node.js** ≥ 18
- **npm** / **pnpm** / **yarn** 任一
- Windows 10+ / macOS 11+ / Linux（支援 AppImage）

### 本地開發

```bash
# 1. 複製項目
git clone <your-repo-url>
cd Zenith

# 2. 安裝依賴
npm install

# 3. 啟動開發模式
npm run dev
```

### 建構發布包

```bash
# 建構目前平台
npm run build

# 或者分開建構各平台
npm run build:win      # Windows (NSIS 安裝包)
npm run build:mac      # macOS (.dmg)
npm run build:linux    # Linux (.AppImage)
```

建構產物將會輸出到 `dist-release/` 目錄入面。

---

## 🔒 **安全與私隱**

- 使用者登入憑證（Microsoft Token、Authlib Token）僅儲存於本地
- AI 對話預設透過 DeepSeek API，資料僅保存在使用者裝置
- 陶瓦連線透過 P2P 協定，資料唔會經過中心伺服器儲存
- 冇任何使用者資料上傳（自動更新檢查除外）

---

## 📝 **開發指南**

### 新增一個工具到工具箱

編輯 `src/main/net/toolbox.js`，喺 `tools` 陣列入面加入一個條目：

```js
{
  key: 'my-tool',
  name: '我嘅工具',
  description: '工具說明',
  category: 'system',
  icon: '⚙️',
  async exec() {
    // 工具邏輯
    return { ok: true, message: '執行成功' };
  }
}
```

### 新增模組載入器

喺 `src/main/download/loader.js` 入面擴充 `detectLoaders()` 方法，並喺 `installLoaderVersion()` 入面加入下載與解壓縮邏輯。

### 自訂 API 鏡像

修改 `src/main/download/sources.js` 入面嘅 `sources` 陣列就得。

---

## 📄 **授權條款**

- **啟動器程式碼**：GPL-3.0
- **Minecraft EULA**：Minecraft 係 Mojang Studios 嘅註冊商標。本啟動器 **唔包含 Minecraft 遊戲檔案**，所有遊戲檔案均由 Mojang / Microsoft 官方管道下載。
- **最終使用者協議**：請參閱 `resources/license.txt`
- **使用協議**：請參閱 `使用协议.txt`
- **私隱政策**：請參閱 `隐私政策.txt`

---

## 💖 **贊助與支持**

本項目透過 **爱发电（ifdian.net）** 接受贊助。贊助使用者可以解鎖 AI 助手嘅完整使用額度。多謝每一位支持者！

發電連結：[跳轉連結](https://ifdian.net/a/JasonDeng)

---

## 🌟 **特色亮點總結**

| 功能 | 說明 |
|------|------|
| 🔄 **自動更新** | 啟動時靜默檢查新版本，背景下載、一鍵更新 |
| 🎯 **智能 Java 選擇** | 根據 MC 版本自動匹配合適嘅 Java 環境 |
| 🌍 **多語言** | 全中文/粵語介面，符合香港同廣東用戶習慣 |
| ⚡ **極速下載** | 多源切換，支援 BMCLAPI 國內加速 |
| 🤝 **P2P 連線** | 唔使公網 IP，房間碼一鍵開黑 |
| 🤖 **AI 助手** | 深度集成 DeepSeek，解答 MC 一切問題 |

---

> **Zenith** — 讓 Minecraft 嘅每一天，都係一個新嘅開始。

---

## 📬 **聯絡方式**

- 項目倉庫：[跳轉連結](https://github.com/zenith-minecraft-launcher/zmcl-launcher/)
- 問題回報：提交 Issue
