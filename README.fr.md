# **Zenith · Lanceur Minecraft**

> Un lanceur Minecraft moderne et complet, construit sur Electron.

---

## ✨ **Présentation du projet**

**Zenith** est un **lanceur Minecraft tout-en-un** qui intègre le téléchargement du jeu, la gestion des versions, le support des mods, le jeu en réseau et un assistant IA. Il offre une interface utilisateur propre et élégante, prend en charge les méthodes de connexion officielles / hors ligne / Authlib, intègre les chargeurs de mods populaires tels que Fabric, Forge, NeoForge et OptiFine, et propose des fonctionnalités de jeu en réseau P2P basées sur EasyTier ainsi qu'un assistant IA basé sur DeepSeek (les fonctions IA nécessitent un parrainage).

---

## 🚀 **Fonctionnalités principales**

### 🎮 **Lancement du jeu et gestion des versions**
- Prend en charge toutes les versions de Minecraft : versions stables, snapshots, anciennes versions, versions du 1er avril
- Téléchargement en un clic avec complétion automatique des fichiers de ressources (Client / Assets / Libraries)
- Coexistence de plusieurs versions ; le changement de version prend effet immédiatement
- Détection intelligente de Java avec recommandations automatiques et téléchargement automatique de la version Java correspondante

### 🔐 **Plusieurs méthodes d'authentification**
- ✅ **Connexion officielle Microsoft** : flux OAuth2 complet, prend en charge les comptes Xbox authentiques
- ✅ **Connexion hors ligne** : nom d'utilisateur personnalisé, lance le jeu sans connexion Internet
- ✅ **Connexion tierce Authlib** : prend en charge les serveurs d'authentification personnalisés, adapté aux serveurs hors ligne

### 🧩 **Écosystème des mods et des packs de ressources**
- Recherche agrégée sur les deux plateformes **Modrinth** et **CurseForge**
- Prend en charge les mods / packs de ressources / shaders / data packs / mondes / modpacks
- Résolution automatique des dépendances, téléchargement et installation en un clic
- Noms localisés améliorés (récupère les informations de localisation depuis MC百科)

### 🔧 **Installation des chargeurs de mods en un clic**
- **Fabric** — léger, hautement compatible
- **Forge** — le chargeur classique et éprouvé
- **NeoForge** — fork de Forge, recommandé pour les nouvelles versions
- **OptiFine** — optimisation des performances et support des shaders
- Détection automatique de la compatibilité des versions avec alertes de conflit

### 🌐 **Multijoueur Taowa (EasyTier)**
- **Aucune adresse IP publique requise**, commutation automatique P2P hole-punching / relais
- Mécanisme de code de salle : générez des codes d'invitation pour que vos amis rejoignent en un clic
- Plusieurs nœuds communautaires, faible latence, haute stabilité
- Téléchargement et gestion du cœur intégrés, prêt à l'emploi

### 🤖 **Assistant IA (DeepSeek)**
- Assistant IA intégré qui répond aux questions relatives à Minecraft
- Prend en charge la **sortie en flux** pour des réponses en temps réel, caractère par caractère
- **Mode de réflexion profonde** et **recherche Web** facultatifs
- Prend en charge les **modèles personnalisés compatibles OpenAI** sans limite d'utilisation
- Activé via le parrainage sur 爱发电 (ifdian.net) ; prend en charge le mode développeur

### 🛠️ **Boîte à outils**
- Ouvrir le répertoire du jeu / le répertoire de la version / le répertoire des journaux
- Sauvegarde et restauration des sauvegardes de jeu
- Nettoyage du cache, nettoyage des anciens journaux
- Diagnostic réseau, détection de l'environnement Java

### 🎨 **Autres fonctionnalités**
- Commutation de thème sombre / clair
- Sources de téléchargement personnalisées (officielle / BMCLAPI / miroir auto-hébergé)
- Arguments JVM personnalisés, allocation de mémoire
- Mise à jour automatique (basée sur electron-updater)
- Visualisation de la progression du téléchargement avec une gestion claire des tâches
- Capture en temps réel et export des journaux de lancement

---

## 🛠️ **Stack technologique**

| Couche | Technologie |
|--------|-------------|
| **Exécution** | Electron 28+ |
| **Processus principal** | Node.js + IPC natif |
| **Frontend** | HTML / CSS / JavaScript natifs |
| **Empaquetage** | electron-builder (NSIS / DMG / AppImage) |
| **Mise à jour automatique** | electron-updater |
| **Dépendances externes** | axios, adm-zip, fs-extra |
| **Cœur multijoueur** | EasyTier (binaire externe) |
| **Modèle IA** | API DeepSeek (compatible OpenAI) |

---

## 📁 **Structure du projet**

```
Zenith/
├── src/
│   ├── main/                 # Processus principal
│   │   ├── main.js          # Point d'entrée / routage IPC / mise à jour automatique
│   │   ├── auth/            # Module d'authentification
│   │   │   ├── microsoft.js   # OAuth Microsoft
│   │   │   ├── offline.js     # Connexion hors ligne
│   │   │   └── authlib.js     # Authlib tiers
│   │   ├── minecraft/       # Cœur du jeu
│   │   │   ├── launcher.js    # Construction des arguments de lancement et gestion des processus
│   │   │   ├── java.js        # Détection et sélection de Java
│   │   │   ├── version.js     # Analyse des métadonnées de version
│   │   │   └── assets.js      # Téléchargement et vérification des Assets
│   │   ├── download/        # Module de téléchargement
│   │   │   ├── manager.js     # Téléchargement des fichiers de version
│   │   │   ├── sources.js     # Commutation multi-sources
│   │   │   ├── modrinth.js    # API Modrinth
│   │   │   ├── curseforge.js  # API CurseForge
│   │   │   ├── addonSearch.js # Recherche agrégée + amélioration locale
│   │   │   ├── addon.js       # Installation des mods/packs de ressources
│   │   │   └── loader.js      # Auto-installation des chargeurs
│   │   ├── net/             # Module réseau
│   │   │   ├── taowa.js       # Wrapper EasyTier pour le multijoueur Taowa
│   │   │   └── toolbox.js     # Implémentation des outils de la boîte à outils
│   │   ├── ai/              # Assistant IA
│   │   │   ├── deepseek.js    # Chat en flux DeepSeek
│   │   │   └── activation.js  # Vérification du code d'activation
│   │   └── config/          # Stockage de la configuration
│   │       └── store.js       # Configuration et comptes persistants
│   ├── preload/
│   │   └── index.js           # Script de préchargement (contextBridge)
│   └── renderer/             # Processus de rendu (UI frontend)
│       ├── index.html
│       ├── css/
│       └── js/
├── resources/                # Ressources d'empaquetage
│   ├── icons/               # Icônes de l'application
│   ├── installer.nsh       # Script d'installation NSIS
│   └── license.txt         # Contrat de licence utilisateur final
├── package.json
└── build/                   # Configuration electron-builder
```

---

## 📦 **Démarrage rapide**

### Prérequis
- **Node.js** ≥ 18
- L'un des gestionnaires suivants : **npm** / **pnpm** / **yarn**
- Windows 10+ / macOS 11+ / Linux (AppImage pris en charge)

### Développement local

```bash
# 1. Cloner le projet
git clone <your-repo-url>
cd Zenith

# 2. Installer les dépendances
npm install

# 3. Démarrer en mode développement
npm run dev
```

### Génération des packages de distribution

```bash
# Générer pour la plateforme actuelle
npm run build

# Ou générer par plateforme
npm run build:win      # Windows (installateur NSIS)
npm run build:mac      # macOS (.dmg)
npm run build:linux    # Linux (.AppImage)
```

Les artefacts de construction seront générés dans le répertoire `dist-release/`.

---

## 🔒 **Sécurité et confidentialité**

- Les informations d'identification de connexion (Microsoft Token, Authlib Token) sont stockées uniquement en local
- Le chat IA utilise par défaut l'API DeepSeek ; les données sont conservées uniquement sur l'appareil de l'utilisateur
- Le multijoueur Taowa utilise le protocole P2P ; les données ne sont pas stockées sur des serveurs centraux
- Aucune donnée utilisateur n'est téléchargée (sauf les vérifications de mise à jour automatique)

---

## 📝 **Guide de développement**

### Ajouter un nouvel outil à la boîte à outils

Modifiez `src/main/net/toolbox.js` et ajoutez une entrée au tableau `tools` :

```js
{
  key: 'my-tool',
  name: 'Mon outil',
  description: 'Description de l\'outil',
  category: 'system',
  icon: '⚙️',
  async exec() {
    // Logique de l'outil
    return { ok: true, message: 'Exécution réussie' };
  }
}
```

### Ajouter un nouveau chargeur de mods

Étendez la méthode `detectLoaders()` dans `src/main/download/loader.js`, puis ajoutez la logique de téléchargement et d'extraction dans `installLoaderVersion()`.

### Miroirs API personnalisés

Modifiez le tableau `sources` dans `src/main/download/sources.js`.

---

## 📄 **Licence**

- **Code du lanceur** : GPL-3.0
- **Minecraft EULA** : Minecraft est une marque déposée de Mojang Studios. Ce lanceur **ne contient aucun fichier du jeu Minecraft** ; tous les fichiers du jeu sont téléchargés depuis les canaux officiels de Mojang / Microsoft.
- **Contrat de licence utilisateur final** : voir `resources/license.txt`
- **Conditions d'utilisation** : voir `使用协议.txt`
- **Politique de confidentialité** : voir `隐私政策.txt`

---

## 💖 **Parrainage et soutien**

Ce projet accepte les parrainages via **爱发电 (ifdian.net)**. Les parrains débloquent le quota d'utilisation complet de l'assistant IA. Merci à tous les supporters !

Lien de parrainage : [Accéder au lien](https://ifdian.net/a/JasonDeng)

---

## 🌟 **Résumé des points forts**

| Fonctionnalité | Description |
|-----------------|-------------|
| 🔄 **Mise à jour automatique** | Vérifie silencieusement les nouvelles versions au lancement, télécharge en arrière-plan, mise à jour en un clic |
| 🎯 **Sélection intelligente de Java** | Fait correspondre automatiquement un environnement Java adapté en fonction de la version MC |
| 🌍 **Multilingue** | Interface entièrement en chinois, adaptée aux habitudes des utilisateurs chinois |
| ⚡ **Téléchargements ultra-rapides** | Commutation multi-sources, prend en charge l'accélération via BMCLAPI en Chine |
| 🤝 **Multijoueur P2P** | Aucune IP publique requise, salle de jeu en un clic via code de salle |
| 🤖 **Assistant IA** | DeepSeek profondément intégré, répond à toutes vos questions sur MC |

---

> **Zenith** — Que chaque jour de Minecraft soit un nouveau commencement.

---

## 📬 **Contact**

- Dépôt du projet : [Accéder au lien](https://github.com/zenith-minecraft-launcher/zmcl-launcher/)
- Retours d'information : soumettre une Issue
