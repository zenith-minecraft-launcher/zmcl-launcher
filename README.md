# **Zenith · Minecraft 启动器**

> 一款现代化、功能完备的 Minecraft 启动器，基于 Electron 构建，支持多平台（Windows / macOS / Linux）。

---

## ✨ **项目简介**

**Zenith** 是一个集游戏下载、版本管理、模组集成、联机对战、AI 助手于一体的 **全功能 Minecraft 启动器**。它提供了简洁优雅的用户界面，支持官方 / 离线 / Authlib 多种登录方式，集成了 Fabric、Forge、NeoForge、OptiFine 等主流模组加载器，并内置了基于 EasyTier 的 P2P 联机功能和基于 DeepSeek 的 AI 助手。

---

## 🚀 **核心功能**

### 🎮 **游戏启动与版本管理**
- 支持所有 Minecraft 版本：正式版、快照版、远古版、愚人节版
- 一键下载、自动补全资源文件（Client / Assets / Libraries）
- 多版本共存，版本切换即时生效
- 智能 Java 检测与自动推荐，自动下载对应 Java 版本

### 🔐 **多种认证方式**
- ✅ **Microsoft 官方登录**：完整 OAuth2 流程，支持正版 Xbox 账户
- ✅ **离线登录**：自定义用户名，无需网络即可启动游戏
- ✅ **Authlib 第三方登录**：支持自定义验证服务器，适用于离线服务器

### 🧩 **模组与资源包生态**
- 聚合搜索 **Modrinth** 与 **CurseForge** 两大平台
- 支持 Mod / 资源包 / 光影 / 数据包 / 世界 / 整合包
- 自动解析依赖关系，一键下载安装
- 中文名称增强（从 MC百科获取汉化信息）

### 🔧 **模组加载器一键安装**
- **Fabric** — 轻量级、高兼容性
- **Forge** — 经典老牌加载器
- **NeoForge** — Forge 分支，新版本首选
- **OptiFine** — 性能优化与光影支持
- 自动检测版本兼容性，提示冲突

### 🌐 **陶瓦联机（EasyTier）**
- **无需公网 IP**，P2P 打洞 / 中继自动切换
- 房间码机制：生成邀请码，好友一键加入
- 多社区节点，低延迟、高稳定性
- 内置核心下载与管理，开箱即用

### 🤖 **AI 助手（DeepSeek）**
- 内置 AI 助手，解答 Minecraft 相关问题
- 支持 **流式输出**，逐字实时回复
- 可选 **深度思考模式** 与 **联网搜索**
- 支持 **自定义 OpenAI 兼容模型**，无使用限制
- 通过爱发电赞助激活，支持开发者模式

### 🛠️ **工具箱**
- 打开游戏目录 / 版本目录 / 日志目录
- 存档备份与还原
- 缓存清理、旧日志清理
- 网络诊断、Java 环境检测

### 🎨 **其他特性**
- 深色 / 浅色主题切换
- 自定义下载源（官方源 / BMCLAPI / 自建镜像）
- 自定义 JVM 参数、分配内存
- 自动更新（基于 electron-updater）
- 下载进度可视化，任务管理清晰明了
- 启动日志实时捕获与导出

---

## 🛠️ **技术栈**

| 层次 | 技术 |
|------|------|
| **运行时** | Electron 28+ |
| **主进程** | Node.js + 原生 IPC |
| **前端** | 原生 HTML / CSS / JavaScript |
| **包管理** | electron-builder（NSIS / DMG / AppImage） |
| **自动更新** | electron-updater |
| **外部依赖** | axios, adm-zip, fs-extra |
| **联机核心** | EasyTier（外部二进制） |
| **AI 模型** | DeepSeek API（OpenAI 兼容） |

---

## 📁 **项目结构**

```
Zenith/
├── src/
│   ├── main/                 # 主进程
│   │   ├── main.js          # 入口 / IPC 路由 / 自动更新
│   │   ├── auth/            # 认证模块
│   │   │   ├── microsoft.js   # Microsoft OAuth
│   │   │   ├── offline.js     # 离线登录
│   │   │   └── authlib.js     # Authlib 第三方
│   │   ├── minecraft/       # 游戏核心
│   │   │   ├── launcher.js    # 启动参数构建与进程管理
│   │   │   ├── java.js        # Java 检测与选择
│   │   │   ├── version.js     # 版本元数据解析
│   │   │   └── assets.js      # Assets 下载与校验
│   │   ├── download/        # 下载模块
│   │   │   ├── manager.js     # 版本文件下载
│   │   │   ├── sources.js     # 多源切换
│   │   │   ├── modrinth.js    # Modrinth API
│   │   │   ├── curseforge.js  # CurseForge API
│   │   │   ├── addonSearch.js # 聚合搜索 + 中文增强
│   │   │   ├── addon.js       # 模组/资源包安装
│   │   │   └── loader.js      # 加载器自动安装
│   │   ├── net/             # 网络模块
│   │   │   ├── taowa.js       # 陶瓦联机 EasyTier 封装
│   │   │   └── toolbox.js     # 工具箱工具实现
│   │   ├── ai/              # AI 助手
│   │   │   ├── deepseek.js    # DeepSeek 流式对话
│   │   │   └── activation.js  # 激活码校验
│   │   └── config/          # 配置存储
│   │       └── store.js       # 持久化配置与账户
│   ├── preload/
│   │   └── index.js           # 预加载脚本（contextBridge）
│   └── renderer/             # 渲染进程（前端 UI）
│       ├── index.html
│       ├── css/
│       └── js/
├── resources/                # 打包资源
│   ├── icons/               # 应用图标
│   ├── installer.nsh       # NSIS 安装脚本
│   └── license.txt         # 最终用户许可协议
├── package.json
└── build/                   # electron-builder 配置
```

---

## 📦 **快速开始**

### 环境要求
- **Node.js** ≥ 18
- **npm** / **pnpm** / **yarn** 任一
- Windows 10+ / macOS 11+ / Linux（支持 AppImage）

### 本地开发

```bash
# 1. 克隆项目
git clone <your-repo-url>
cd Zenith

# 2. 安装依赖
npm install

# 3. 启动开发模式
npm run dev
```

### 构建发布包

```bash
# 构建当前平台
npm run build

# 或分别构建各平台
npm run build:win      # Windows (NSIS 安装包)
npm run build:mac      # macOS (.dmg)
npm run build:linux    # Linux (.AppImage)
```

构建产物将输出到 `dist-release/` 目录。

---

## 🔒 **安全与隐私**

- 用户登录凭证（Microsoft Token、Authlib Token）仅存储在本地
- AI 对话默认通过 DeepSeek API，数据仅保存在用户设备
- 陶瓦联机通过 P2P 协议，数据不经过中心服务器存储
- 无任何用户数据上传（除自动更新检查外）

---

## 📝 **开发指南**

### 添加一个新工具到工具箱

编辑 `src/main/net/toolbox.js`，在 `tools` 数组中添加一个条目：

```js
{
  key: 'my-tool',
  name: '我的工具',
  description: '工具说明',
  category: 'system',
  icon: '⚙️',
  async exec() {
    // 工具逻辑
    return { ok: true, message: '执行成功' };
  }
}
```

### 添加新的模组加载器

在 `src/main/download/loader.js` 中扩展 `detectLoaders()` 方法，并在 `installLoaderVersion()` 中添加下载与解压逻辑。

### 自定义 API 镜像

修改 `src/main/download/sources.js` 中的 `sources` 数组即可。

---

## 📄 **许可证**

- **启动器代码**：GPL-3.0
- **Minecraft EULA**：Minecraft 是 Mojang Studios 的注册商标。本启动器 **不包含 Minecraft 游戏文件**，所有游戏文件均从 Mojang / Microsoft 官方渠道下载。
- **最终用户协议**：请参阅 `resources/license.txt`
- **使用协议**：请参阅 `使用协议.txt`
- **隐私政策**：请参阅 `隐私政策.txt`

---

## 💖 **赞助与支持**

本项目通过 **爱发电（ifdian.net）** 接受赞助。赞助用户可解锁 AI 助手的完整使用额度。感谢每一位支持者！

发电链接：[跳转链接](https://ifdian.net/a/JasonDeng)

---

## 🌟 **特色亮点总结**

| 功能 | 说明 |
|------|------|
| 🔄 **自动更新** | 启动时静默检查新版本，后台下载、一键更新 |
| 🎯 **智能 Java 选择** | 根据 MC 版本自动匹配合适的 Java 环境 |
| 🌍 **多语言** | 全中文界面，符合国内用户习惯 |
| ⚡ **极速下载** | 多源切换，支持 BMCLAPI 国内加速 |
| 🤝 **P2P 联机** | 无需公网 IP，房间码一键开黑 |
| 🤖 **AI 助手** | 深度集成 DeepSeek，解答 MC 一切问题 |

---

> **Zenith** — 让 Minecraft 的每一天，都是崭新的起点。

---

## 📬 **联系方式**

- 项目仓库：[跳转链接](https://github.com/zenith-minecraft-launcher/zmcl-launcher/)
- 问题反馈：提交 Issue
