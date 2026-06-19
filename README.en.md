# **Zenith · Minecraft Launcher**

> A modern, fully-featured Minecraft launcher built with Electron.

---

## ✨ **Project Introduction**

**Zenith** is an **all-in-one Minecraft launcher** that integrates game downloading, version management, mod support, multiplayer gaming, and an AI assistant. It offers a clean and elegant user interface, supports official / offline / Authlib login methods, integrates with popular mod loaders such as Fabric, Forge, NeoForge, and OptiFine, and features built-in P2P multiplayer powered by EasyTier as well as an AI assistant powered by DeepSeek (AI features require sponsorship).

---

## 🚀 **Core Features**

### 🎮 **Game Launch & Version Management**
- Supports all Minecraft versions: Release, Snapshot, Old, and April Fools' versions
- One-click download with automatic resource file completion (Client / Assets / Libraries)
- Multiple versions coexist; version switching takes effect instantly
- Smart Java detection with automatic recommendations and auto-download of matching Java versions

### 🔐 **Multiple Authentication Methods**
- ✅ **Microsoft Official Login**: Full OAuth2 flow, supports genuine Xbox accounts
- ✅ **Offline Login**: Custom username, launches the game without internet
- ✅ **Authlib Third-Party Login**: Supports custom authentication servers, suitable for offline servers

### 🧩 **Mod & Resource Pack Ecosystem**
- Aggregated search across **Modrinth** and **CurseForge**
- Supports Mods / Resource Packs / Shader Packs / Data Packs / Worlds / Modpacks
- Automatic dependency resolution, one-click download and installation
- Enhanced Chinese naming (fetches localized info from MC百科)

### 🔧 **One-Click Mod Loader Installation**
- **Fabric** — Lightweight, highly compatible
- **Forge** — The classic, long-established loader
- **NeoForge** — Fork of Forge, recommended for newer versions
- **OptiFine** — Performance optimization and shader support
- Automatic version compatibility detection with conflict warnings

### 🌐 **Taowa Multiplayer (EasyTier)**
- **No public IP required**, automatic P2P hole-punching / relay switching
- Room-code mechanism: generate invitation codes so friends can join with one click
- Multi-community nodes, low latency, high stability
- Built-in core download and management, ready to use out of the box

### 🤖 **AI Assistant (DeepSeek)**
- Built-in AI assistant that answers Minecraft-related questions
- Supports **streaming output** for real-time, character-by-character replies
- Optional **deep thinking mode** and **web search**
- Supports **custom OpenAI-compatible models** with no usage limits
- Activated via 爱发电 (ifdian.net) sponsorship; supports developer mode

### 🛠️ **Toolbox**
- Open game directory / version directory / log directory
- Save backup and restore
- Cache cleaning, old log cleanup
- Network diagnostics, Java environment detection

### 🎨 **Other Features**
- Dark / light theme switching
- Custom download sources (official / BMCLAPI / self-hosted mirror)
- Custom JVM arguments, memory allocation
- Auto-update (powered by electron-updater)
- Visual download progress with clear task management
- Real-time capture and export of launch logs

---

## 🛠️ **Tech Stack**

| Layer | Technology |
|-------|------------|
| **Runtime** | Electron 28+ |
| **Main Process** | Node.js + native IPC |
| **Frontend** | Native HTML / CSS / JavaScript |
| **Packaging** | electron-builder (NSIS / DMG / AppImage) |
| **Auto-Update** | electron-updater |
| **External Dependencies** | axios, adm-zip, fs-extra |
| **Multiplayer Core** | EasyTier (external binary) |
| **AI Model** | DeepSeek API (OpenAI compatible) |

---

## 📁 **Project Structure**

```
Zenith/
├── src/
│   ├── main/                 # Main process
│   │   ├── main.js          # Entry / IPC routing / auto-update
│   │   ├── auth/            # Auth module
│   │   │   ├── microsoft.js   # Microsoft OAuth
│   │   │   ├── offline.js     # Offline login
│   │   │   └── authlib.js     # Authlib third-party
│   │   ├── minecraft/       # Game core
│   │   │   ├── launcher.js    # Launch argument building & process management
│   │   │   ├── java.js        # Java detection & selection
│   │   │   ├── version.js     # Version metadata parsing
│   │   │   └── assets.js      # Assets download & verification
│   │   ├── download/        # Download module
│   │   │   ├── manager.js     # Version file downloads
│   │   │   ├── sources.js     # Multi-source switching
│   │   │   ├── modrinth.js    # Modrinth API
│   │   │   ├── curseforge.js  # CurseForge API
│   │   │   ├── addonSearch.js # Aggregated search + Chinese enhancement
│   │   │   ├── addon.js       # Mod/resource pack installation
│   │   │   └── loader.js      # Auto-install loaders
│   │   ├── net/             # Network module
│   │   │   ├── taowa.js       # Taowa multiplayer EasyTier wrapper
│   │   │   └── toolbox.js     # Toolbox tool implementations
│   │   ├── ai/              # AI assistant
│   │   │   ├── deepseek.js    # DeepSeek streaming chat
│   │   │   └── activation.js  # Activation code verification
│   │   └── config/          # Config storage
│   │       └── store.js       # Persistent config & accounts
│   ├── preload/
│   │   └── index.js           # Preload script (contextBridge)
│   └── renderer/             # Renderer process (frontend UI)
│       ├── index.html
│       ├── css/
│       └── js/
├── resources/                # Packaging resources
│   ├── icons/               # App icons
│   ├── installer.nsh       # NSIS installer script
│   └── license.txt         # End user license agreement
├── package.json
└── build/                   # electron-builder config
```

---

## 📦 **Quick Start**

### Requirements
- **Node.js** ≥ 18
- Any of **npm** / **pnpm** / **yarn**
- Windows 10+ / macOS 11+ / Linux (AppImage supported)

### Local Development

```bash
# 1. Clone the project
git clone <your-repo-url>
cd Zenith

# 2. Install dependencies
npm install

# 3. Start dev mode
npm run dev
```

### Building Release Packages

```bash
# Build for the current platform
npm run build

# Or build per platform
npm run build:win      # Windows (NSIS installer)
npm run build:mac      # macOS (.dmg)
npm run build:linux    # Linux (.AppImage)
```

Build artifacts will be output to the `dist-release/` directory.

---

## 🔒 **Security & Privacy**

- User login credentials (Microsoft Token, Authlib Token) are stored locally only
- AI chat defaults to the DeepSeek API; data is kept only on the user's device
- Taowa multiplayer uses the P2P protocol; data is not stored on central servers
- No user data is uploaded (except for auto-update checks)

---

## 📝 **Development Guide**

### Adding a New Tool to the Toolbox

Edit `src/main/net/toolbox.js` and add an entry to the `tools` array:

```js
{
  key: 'my-tool',
  name: 'My Tool',
  description: 'Tool description',
  category: 'system',
  icon: '⚙️',
  async exec() {
    // Tool logic
    return { ok: true, message: 'Execution successful' };
  }
}
```

### Adding a New Mod Loader

Extend the `detectLoaders()` method in `src/main/download/loader.js`, and add download & extraction logic in `installLoaderVersion()`.

### Custom API Mirrors

Modify the `sources` array in `src/main/download/sources.js`.

---

## 📄 **License**

- **Launcher Code**: GPL-3.0
- **Minecraft EULA**: Minecraft is a registered trademark of Mojang Studios. This launcher **does not include Minecraft game files**; all game files are downloaded from official Mojang / Microsoft channels.
- **End User License Agreement**: See `resources/license.txt`
- **Terms of Use**: See `使用协议.txt`
- **Privacy Policy**: See `隐私政策.txt`

---

## 💖 **Sponsorship & Support**

This project accepts sponsorship via **爱发电 (ifdian.net)**. Sponsors unlock the full usage quota of the AI assistant. Thank you to every supporter!

Sponsorship link: [Jump to link](https://ifdian.net/a/JasonDeng)

---

## 🌟 **Feature Highlights Summary**

| Feature | Description |
|---------|-------------|
| 🔄 **Auto-Update** | Silently checks for new versions on launch, downloads in the background, one-click update |
| 🎯 **Smart Java Selection** | Automatically matches a suitable Java environment based on the MC version |
| 🌍 **Multi-Language** | Fully Chinese interface, tailored to Chinese users |
| ⚡ **Blazing Fast Downloads** | Multi-source switching, supports BMCLAPI domestic acceleration |
| 🤝 **P2P Multiplayer** | No public IP required, one-click game room via room code |
| 🤖 **AI Assistant** | Deeply integrated DeepSeek, answers all your MC questions |

---

> **Zenith** — May every day of Minecraft be a brand new beginning.

---

## 📬 **Contact**

- Project repository: [Jump to link](https://github.com/zenith-minecraft-launcher/zmcl-launcher/)
- Feedback: Submit an Issue
