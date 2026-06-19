# **Zenith · Minecraft-Launcher**

> Ein moderner, voll ausgestatteter Minecraft-Launcher, auf Basis von Electron.

---

## ✨ **Projektbeschreibung**

**Zenith** ist ein **All-in-One-Minecraft-Launcher**, der den Download des Spiels, die Versionsverwaltung, Mod-Unterstützung, das Mehrspielerspiel und einen KI-Assistenten vereint. Er bietet eine saubere und elegante Benutzeroberfläche, unterstützt die Login-Methoden Offiziell / Offline / Authlib, integriert beliebte Mod-Loader wie Fabric, Forge, NeoForge und OptiFine und verfügt über integrierte P2P-Mehrspielerfunktionen auf Basis von EasyTier sowie einen KI-Assistenten auf Basis von DeepSeek (KI-Funktionen erfordern Sponsor-Unterstützung).

---

## 🚀 **Hauptfunktionen**

### 🎮 **Spielstart und Versionsverwaltung**
- Unterstützt alle Minecraft-Versionen: Release, Snapshots, alte Versionen, Aprilscherz-Versionen
- Ein-Klick-Download mit automatischer Vervollständigung von Ressourcendateien (Client / Assets / Libraries)
- Mehrere Versionen koexistieren; der Versionswechsel wird sofort wirksam
- Intelligente Java-Erkennung mit automatischen Empfehlungen und automatischem Download der passenden Java-Version

### 🔐 **Mehrere Authentifizierungsmethoden**
- ✅ **Offizieller Microsoft-Login**: Vollständiger OAuth2-Ablauf, unterstützt echte Xbox-Konten
- ✅ **Offline-Login**: Benutzerdefinierter Benutzername, startet das Spiel ohne Internet
- ✅ **Authlib-Drittanbieter-Login**: Unterstützt benutzerdefinierte Authentifizierungsserver, geeignet für Offline-Server

### 🧩 **Mod- und Ressourcenpaket-Ökosystem**
- Aggregierte Suche auf den Plattformen **Modrinth** und **CurseForge**
- Unterstützt Mods / Ressourcenpakete / Shader-Pakete / Datenpakete / Welten / Modpacks
- Automatische Auflösung von Abhängigkeiten, Ein-Klick-Download und -Installation
- Verbesserte lokale Namen (holt Lokalisierungsinformationen aus MC百科)

### 🔧 **Ein-Klick-Installation von Mod-Ladern**
- **Fabric** — leichtgewichtig, hochkompatibel
- **Forge** — der klassische, bewährte Loader
- **NeoForge** — Fork von Forge, empfohlen für neuere Versionen
- **OptiFine** — Leistungsoptimierung und Shader-Unterstützung
- Automatische Erkennung der Versionskompatibilität mit Konfliktwarnungen

### 🌐 **Taowa-Mehrspieler (EasyTier)**
- **Keine öffentliche IP-Adresse erforderlich**, automatisches P2P-Hole-Punching / Relay-Umschaltung
- Raumcode-Mechanismus: Generieren Sie Einladungscodes, Freunde treten mit einem Klick bei
- Mehrere Community-Knoten, niedrige Latenz, hohe Stabilität
- Integrierter Download und Verwaltung des Kernels, sofort einsatzbereit

### 🤖 **KI-Assistent (DeepSeek)**
- Integrierter KI-Assistent, der Minecraft-bezogene Fragen beantwortet
- Unterstützt **Streaming-Ausgabe** für Echtzeit-Antworten Zeichen für Zeichen
- Optionaler **Tiefdenkmodus** und **Websuche**
- Unterstützt **benutzerdefinierte OpenAI-kompatible Modelle** ohne Nutzungsbeschränkungen
- Aktiviert über Sponsor-Unterstützung auf 爱发电 (ifdian.net); unterstützt den Entwicklermodus

### 🛠️ **Toolbox**
- Öffnen des Spielverzeichnisses / Versionsverzeichnisses / Protokollverzeichnisses
- Sicherung und Wiederherstellung von Spielständen
- Cache-Bereinigung, alte Protokolle entfernen
- Netzwerkdiagnose, Java-Umgebungserkennung

### 🎨 **Weitere Funktionen**
- Umschaltung zwischen dunklem / hellem Thema
- Benutzerdefinierte Download-Quellen (Offiziell / BMCLAPI / selbst gehosteter Mirror)
- Benutzerdefinierte JVM-Argumente, Speicherzuweisung
- Automatische Aktualisierung (basierend auf electron-updater)
- Visualisierung des Download-Fortschritts mit übersichtlicher Aufgabenverwaltung
- Echtzeit-Erfassung und Export von Startprotokollen

---

## 🛠️ **Technologie-Stack**

| Ebene | Technologie |
|-------|-------------|
| **Laufzeit** | Electron 28+ |
| **Hauptprozess** | Node.js + natives IPC |
| **Frontend** | Natives HTML / CSS / JavaScript |
| **Paketierung** | electron-builder (NSIS / DMG / AppImage) |
| **Automatische Aktualisierung** | electron-updater |
| **Externe Abhängigkeiten** | axios, adm-zip, fs-extra |
| **Mehrspieler-Kernel** | EasyTier (externe Binärdatei) |
| **KI-Modell** | DeepSeek API (OpenAI-kompatibel) |

---

## 📁 **Projektstruktur**

```
Zenith/
├── src/
│   ├── main/                 # Hauptprozess
│   │   ├── main.js          # Einstiegspunkt / IPC-Routing / automatische Aktualisierung
│   │   ├── auth/            # Authentifizierungsmodul
│   │   │   ├── microsoft.js   # Microsoft OAuth
│   │   │   ├── offline.js     # Offline-Login
│   │   │   └── authlib.js     # Authlib Drittanbieter
│   │   ├── minecraft/       # Spielkern
│   │   │   ├── launcher.js    # Aufbau der Startargumente und Prozessverwaltung
│   │   │   ├── java.js        # Java-Erkennung und -Auswahl
│   │   │   ├── version.js     # Parsen von Versions-Metadaten
│   │   │   └── assets.js      # Download und Prüfung von Assets
│   │   ├── download/        # Download-Modul
│   │   │   ├── manager.js     # Download von Versionsdateien
│   │   │   ├── sources.js     # Mehrquellen-Umschaltung
│   │   │   ├── modrinth.js    # Modrinth API
│   │   │   ├── curseforge.js  # CurseForge API
│   │   │   ├── addonSearch.js # Aggregierte Suche + Lokalisierungsverbesserung
│   │   │   ├── addon.js       # Installation von Mods/Ressourcenpaketen
│   │   │   └── loader.js      # Auto-Installation von Ladern
│   │   ├── net/             # Netzwerkmodul
│   │   │   ├── taowa.js       # Taowa-Mehrspieler EasyTier-Wrapper
│   │   │   └── toolbox.js     # Implementierung der Toolbox-Werkzeuge
│   │   ├── ai/              # KI-Assistent
│   │   │   ├── deepseek.js    # DeepSeek Streaming-Chat
│   │   │   └── activation.js  # Aktivierungscode-Prüfung
│   │   └── config/          # Konfigurationsspeicher
│   │       └── store.js       # Persistente Konfiguration und Konten
│   ├── preload/
│   │   └── index.js           # Preload-Skript (contextBridge)
│   └── renderer/             # Renderer-Prozess (Frontend-UI)
│       ├── index.html
│       ├── css/
│       └── js/
├── resources/                # Paketierungsressourcen
│   ├── icons/               # App-Icons
│   ├── installer.nsh       # NSIS-Installer-Skript
│   └── license.txt         # Endbenutzer-Lizenzvereinbarung
├── package.json
└── build/                   # electron-builder-Konfiguration
```

---

## 📦 **Schnellstart**

### Voraussetzungen
- **Node.js** ≥ 18
- Beliebiger Paketmanager: **npm** / **pnpm** / **yarn**
- Windows 10+ / macOS 11+ / Linux (AppImage unterstützt)

### Lokale Entwicklung

```bash
# 1. Projekt klonen
git clone <your-repo-url>
cd Zenith

# 2. Abhängigkeiten installieren
npm install

# 3. Entwicklungsmodus starten
npm run dev
```

### Release-Pakete bauen

```bash
# Für die aktuelle Plattform bauen
npm run build

# Oder separat pro Plattform bauen
npm run build:win      # Windows (NSIS-Installer)
npm run build:mac      # macOS (.dmg)
npm run build:linux    # Linux (.AppImage)
```

Die Build-Artefakte werden im Verzeichnis `dist-release/` ausgegeben.

---

## 🔒 **Sicherheit und Datenschutz**

- Benutzer-Login-Anmeldeinformationen (Microsoft Token, Authlib Token) werden nur lokal gespeichert
- KI-Chat nutzt standardmäßig die DeepSeek API; Daten werden nur auf dem Gerät des Benutzers gespeichert
- Taowa-Mehrspieler nutzt das P2P-Protokoll; Daten werden nicht auf zentralen Servern gespeichert
- Keine Benutzerdaten werden hochgeladen (außer automatischen Aktualisierungsprüfungen)

---

## 📝 **Entwicklerleitfaden**

### Ein neues Werkzeug zur Toolbox hinzufügen

Bearbeiten Sie `src/main/net/toolbox.js` und fügen Sie einen Eintrag zum Array `tools` hinzu:

```js
{
  key: 'my-tool',
  name: 'Mein Werkzeug',
  description: 'Werkzeug-Beschreibung',
  category: 'system',
  icon: '⚙️',
  async exec() {
    // Werkzeug-Logik
    return { ok: true, message: 'Ausführung erfolgreich' };
  }
}
```

### Einen neuen Mod-Loader hinzufügen

Erweitern Sie die Methode `detectLoaders()` in `src/main/download/loader.js` und fügen Sie Download- und Entpackungslogik in `installLoaderVersion()` hinzu.

### Benutzerdefinierte API-Mirror

Ändern Sie das Array `sources` in `src/main/download/sources.js`.

---

## 📄 **Lizenz**

- **Launcher-Code**: GPL-3.0
- **Minecraft EULA**: Minecraft ist ein eingetragenes Warenzeichen von Mojang Studios. Dieser Launcher **enthält keine Minecraft-Spieldateien**; alle Spieldateien werden von offiziellen Mojang / Microsoft-Kanälen heruntergeladen.
- **Endbenutzer-Lizenzvereinbarung**: siehe `resources/license.txt`
- **Nutzungsbedingungen**: siehe `使用协议.txt`
- **Datenschutzbestimmungen**: siehe `隐私政策.txt`

---

## 💖 **Sponsoring und Unterstützung**

Dieses Projekt nimmt Sponsoring über **爱发电 (ifdian.net)** an. Sponsoren schalten das volle Nutzungskontingent des KI-Assistenten frei. Vielen Dank an alle Unterstützer!

Sponsoring-Link: [Zum Link](https://ifdian.net/a/JasonDeng)

---

## 🌟 **Zusammenfassung der Highlights**

| Funktion | Beschreibung |
|----------|--------------|
| 🔄 **Automatische Aktualisierung** | Prüft beim Start im Hintergrund auf neue Versionen, lädt im Hintergrund herunter, Ein-Klick-Aktualisierung |
| 🎯 **Intelligente Java-Auswahl** | Passt automatisch eine passende Java-Umgebung je nach MC-Version an |
| 🌍 **Mehrsprachig** | Vollständige chinesische Oberfläche, auf die Gewohnheiten chinesischer Benutzer abgestimmt |
| ⚡ **Blitzschnelle Downloads** | Mehrquellen-Umschaltung, unterstützt BMCLAPI-Beschleunigung für China |
| 🤝 **P2P-Mehrspieler** | Keine öffentliche IP erforderlich, Ein-Klick-Spielraum per Raumcode |
| 🤖 **KI-Assistent** | Tief integriertes DeepSeek, beantwortet alle Ihre MC-Fragen |

---

> **Zenith** — Möge jeder Tag in Minecraft ein neuer Anfang sein.

---

## 📬 **Kontakt**

- Projekt-Repository: [Zum Link](https://github.com/zenith-minecraft-launcher/zmcl-launcher/)
- Feedback: Issue einreichen
