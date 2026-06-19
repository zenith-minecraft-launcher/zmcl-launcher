# **禪鋒（Zenith）· Minecraft 啟動之器**

> 現代而完備之 Minecraft 啟動器，以 Electron 構之。

---

## ✨ **器之概覽**

**Zenith** 者，集下載、版本、模組、聯機、智僕（AI）於一體之 **全備 Minecraft 啟動器** 也。界面簡雅，支持官服 / 離線 / Authlib 三種登錄之法；合 Fabric、Forge、NeoForge、OptiFine 諸模組載器；內嵌 EasyTier P2P 聯機之術，並 DeepSeek 智僕（智僕功能需贊助以啟）。

---

## 🚀 **器之諸能**

### 🎮 **啟遊戲、理版本**
- 凡 Minecraft 之諸版咸備：正式版、快照版、遠古版、愚人節版
- 一擊而下，資源之檔（Client / Assets / Libraries）自補無遺
- 多版共存，切換即效
- 智能察 Java，自薦合宜之版，並自動下載之

### 🔐 **多途認證**
- ✅ **Microsoft 官服登錄**：OAuth2 全流程，正版 Xbox 帳號咸宜
- ✅ **離線登錄**：自擇名號，無網絡亦可啟遊
- ✅ **Authlib 第三方登錄**：自設驗證之服，離線伺服適用

### 🧩 **模組與資源包之林**
- **Modrinth**、**CurseForge** 二大平台聚合而搜
- 支持模組 / 資源包 / 光影 / 數據包 / 世界 / 整合包
- 依賴自解，一擊安裝
- 漢名增強（取本地化信息於 MC百科）

### 🔧 **模組載器一擊安裝**
- **Fabric** — 輕盈而兼容
- **Forge** — 經典老牌之選
- **NeoForge** — Forge 之枝，新版所尚
- **OptiFine** — 性能優化、光影之備
- 自動察版本相容性，有衝則告

### 🌐 **陶瓦聯機（EasyTier）**
- **毋須公網 IP**，P2P 打洞 / 中繼自切
- 房碼之制：生邀請碼，友可一擊而入
- 多社區節點，低延遲而高穩
- 內建核心下載與管理，開箱即用

### 🤖 **智僕（DeepSeek）**
- 內置智僕，應 Minecraft 之疑
- 支持 **流式輸出**，逐字即時而答
- 可選 **深度思考** 與 **聯網搜索**
- 支持 **自訂 OpenAI 相容模型**，用之無限
- 由爱发电（ifdian.net）贊助而啟，支持開發者之模式

### 🛠️ **工具箱**
- 開遊戲目錄 / 版本目錄 / 日誌目錄
- 存檔備份與復原
- 清理緩存、舊日誌
- 網絡診斷、Java 環境偵測

### 🎨 **其餘諸能**
- 明暗主題互換
- 自訂下載源（官源 / BMCLAPI / 自建鏡像）
- 自訂 JVM 參數、分配內存
- 自動更新（基於 electron-updater）
- 下載進度可視，任務管理井然
- 啟動日誌實時捕獲與導出

---

## 🛠️ **技之棧**

| 層 | 技 |
|----|----|
| **運行** | Electron 28+ |
| **主進程** | Node.js + 原生 IPC |
| **前端** | 原生 HTML / CSS / JavaScript |
| **打包** | electron-builder（NSIS / DMG / AppImage） |
| **自動更新** | electron-updater |
| **外賴** | axios, adm-zip, fs-extra |
| **聯機核心** | EasyTier（外二進制） |
| **智僕模型** | DeepSeek API（OpenAI 相容） |

---

## 📁 **項目之結構**

```
Zenith/
├── src/
│   ├── main/                 # 主進程
│   │   ├── main.js          # 入口 / IPC 路由 / 自動更新
│   │   ├── auth/            # 認證模塊
│   │   │   ├── microsoft.js   # Microsoft OAuth
│   │   │   ├── offline.js     # 離線登錄
│   │   │   └── authlib.js     # Authlib 第三方
│   │   ├── minecraft/       # 遊戲核心
│   │   │   ├── launcher.js    # 啟動參數構建與進程管理
│   │   │   ├── java.js        # Java 偵測與選擇
│   │   │   ├── version.js     # 版本元數據解析
│   │   │   └── assets.js      # Assets 下載與校驗
│   │   ├── download/        # 下載模塊
│   │   │   ├── manager.js     # 版本文件下載
│   │   │   ├── sources.js     # 多源切換
│   │   │   ├── modrinth.js    # Modrinth API
│   │   │   ├── curseforge.js  # CurseForge API
│   │   │   ├── addonSearch.js # 聚合搜索 + 漢化增強
│   │   │   ├── addon.js       # 模組/資源包安裝
│   │   │   └── loader.js      # 載器自動安裝
│   │   ├── net/             # 網絡模塊
│   │   │   ├── taowa.js       # 陶瓦聯機 EasyTier 封裝
│   │   │   └── toolbox.js     # 工具箱工具實現
│   │   ├── ai/              # 智僕
│   │   │   ├── deepseek.js    # DeepSeek 流式對話
│   │   │   └── activation.js  # 激活碼校驗
│   │   └── config/          # 配置存儲
│   │       └── store.js       # 持久化配置與帳號
│   ├── preload/
│   │   └── index.js           # 預載腳本（contextBridge）
│   └── renderer/             # 渲染進程（前端 UI）
│       ├── index.html
│       ├── css/
│       └── js/
├── resources/                # 打包資源
│   ├── icons/               # 應用圖標
│   ├── installer.nsh       # NSIS 安裝腳本
│   └── license.txt         # 最終用戶許可協議
├── package.json
└── build/                   # electron-builder 配置
```

---

## 📦 **速始**

### 環境之需
- **Node.js** ≥ 18
- **npm** / **pnpm** / **yarn** 任一
- Windows 10+ / macOS 11+ / Linux（AppImage 可）

### 本地開發

```bash
# 一、克隆項目
git clone <your-repo-url>
cd Zenith

# 二、安裝依賴
npm install

# 三、啟開發之模式
npm run dev
```

### 建構發布之包

```bash
# 建構當前平台
npm run build

# 或各平台分別建構
npm run build:win      # Windows（NSIS 安裝包）
npm run build:mac      # macOS（.dmg）
npm run build:linux    # Linux（.AppImage）
```

建構之產物，出於 `dist-release/` 之目錄。

---

## 🔒 **安全與私隱**

- 用戶登錄之憑（Microsoft Token、Authlib Token），唯存於本地
- 智僕對話，默用 DeepSeek API，數據唯存用戶之器
- 陶瓦聯機，以 P2P 之協，數據不存中心之服
- 不上傳用戶任何數據（自動更新之檢查除外）

---

## 📝 **開發之指南**

### 添新器於工具箱

修 `src/main/net/toolbox.js`，於 `tools` 之列加一條目：

```js
{
  key: 'my-tool',
  name: '吾之器',
  description: '器之說',
  category: 'system',
  icon: '⚙️',
  async exec() {
    // 器之邏輯
    return { ok: true, message: '執行成功' };
  }
}
```

### 添新模組載器

於 `src/main/download/loader.js` 擴 `detectLoaders()` 之法，並於 `installLoaderVersion()` 加下載與解壓之邏輯。

### 自訂 API 鏡像

改 `src/main/download/sources.js` 之 `sources` 列可也。

---

## 📄 **授權之約**

- **啟動器之代碼**：GPL-3.0
- **Minecraft EULA**：Minecraft 乃 Mojang Studios 之註冊商標。本啟動器 **不含 Minecraft 遊戲之檔**，所有遊戲檔咸自 Mojang / Microsoft 官方管道下載。
- **最終用戶協議**：見 `resources/license.txt`
- **使用協議**：見 `使用协议.txt`
- **私隱之策**：見 `隐私政策.txt`

---

## 💖 **贊助與支持**

本項目由 **爱发电（ifdian.net）** 受贊。贊助者得解鎖智僕之全額度。感諸君之支持！

發電之鏈：[往鏈](https://ifdian.net/a/JasonDeng)

---

## 🌟 **器之亮點總覽**

| 能 | 說 |
|----|----|
| 🔄 **自動更新** | 啟時默檢新本，後台下載，一擊而更 |
| 🎯 **智能擇 Java** | 依 MC 之版自匹合宜之 Java 環境 |
| 🌍 **多語** | 全漢文界面，合國人用習 |
| ⚡ **疾下** | 多源切換，支持 BMCLAPI 國內加速 |
| 🤝 **P2P 聯機** | 毋須公網 IP，房碼一擊開黑 |
| 🤖 **智僕** | DeepSeek 深度集成，答 MC 之一切疑 |

---

> **Zenith** — 使 Minecraft 之每日，咸為新始。

---

## 📬 **聯絡之道**

- 項目之庫：[往鏈](https://github.com/zenith-minecraft-launcher/zmcl-launcher/)
- 問題反饋：提 Issue
