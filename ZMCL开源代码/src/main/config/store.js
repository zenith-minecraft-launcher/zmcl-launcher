const fs = require('fs');
const path = require('path');
const os = require('os');

const APP_NAME = 'ZenithLauncher';

let configDir = null;
let configFile = null;
let config = {};
let accountsFile = null;
let accounts = null;

function getDefaultConfigDir() {
  // 使用用户主目录下的固定路径，确保可写且跨 session 一致
  return path.join(os.homedir(), '.zenith-launcher', 'config');
}

function getDefaultMinecraftDir() {
  // 使用用户主目录下的 .zenith-minecraft 作为默认目录
  return path.join(os.homedir(), '.zenith-launcher', '.minecraft');
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

function init() {
  configDir = ensureDir(getDefaultConfigDir());
  configFile = path.join(configDir, 'config.json');
  accountsFile = path.join(configDir, 'accounts.json');

  if (fs.existsSync(configFile)) {
    try {
      config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    } catch (e) {
      console.error('[Config] Failed to parse config file, using defaults:', e.message);
      config = {};
    }
  }

  const defaults = {
    minecraftDir: getDefaultMinecraftDir(),
    downloadSource: 'bmclapi',
    theme: 'dark',
    language: 'zh-CN',
    memoryMin: 512,
    memoryMax: 4096,
    javaPath: '',
    autoSelectJava: true,
    selectedLoginType: '',
    selectedVersion: '',
    windowSize: { width: 1200, height: 800 },
    fullscreen: false,
    width: 854,
    height: 480,
    serverIp: '',
    extraJvmArgs: '',
    extraGameArgs: '',
    // AI 相关
    aiCustomMode: false,
    aiApiKey: '',
    aiModel: 'deepseek-chat',
    aiBaseUrl: 'https://api.deepseek.com/v1',
    aiDeepThinking: false,
    aiHistory: [],
    // 爱发电激活凭据（作者侧配置，用于校验用户订单号）
    aiIfdianUserId: 'YOUR_AFDIAN_USER_ID',
    aiIfdianToken: 'YOUR_AFDIAN_API_TOKEN',
    // 只有以下方案的订单才能激活 AI 功能（爱发电方案 id / scheme id）
    // 留空 [] 表示"任何方案的订单都能激活"
    aiIfdianPlanIds: ['YOUR_AFDIAN_PLAN_ID']
  };

  for (const [key, value] of Object.entries(defaults)) {
    if (config[key] === undefined) {
      config[key] = value;
    }
  }

  if (fs.existsSync(accountsFile)) {
    try {
      accounts = JSON.parse(fs.readFileSync(accountsFile, 'utf-8'));
    } catch (e) {
      console.error('[Config] Failed to parse accounts file:', e.message);
      accounts = null;
    }
  }

  if (!accounts) {
    accounts = {
      microsoft: [],
      offline: [],
      authlib: [],
      lastSelected: null
    };
  }

  saveConfig();
  saveAccounts();

  console.log('[Config] Initialized with config dir:', configDir);
  console.log('[Config] Minecraft dir:', config.minecraftDir);
  return true;
}

function saveConfig() {
  if (!fs.existsSync(configDir)) {
    ensureDir(configDir);
  }
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8');
}

function saveAccounts() {
  if (!fs.existsSync(configDir)) {
    ensureDir(configDir);
  }
  fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2), 'utf-8');
}

function get(key, defaultValue) {
  if (config[key] === undefined) {
    return defaultValue;
  }
  return config[key];
}

function set(key, value) {
  config[key] = value;
  saveConfig();
  return value;
}

function getAll() {
  return { ...config };
}

function getAccountsStore() {
  return accounts;
}

function setAccountsStore(newAccounts) {
  accounts = newAccounts;
  saveAccounts();
}

function getLastSelectedAccount() {
  if (!accounts || !accounts.lastSelected) return null;
  const { type, uuid, userName } = accounts.lastSelected;
  const list = accounts[type] || [];
  let found = null;
  if (type === 'offline' && userName) {
    found = list.find(a => a.userName === userName) || list.find(a => a.uuid === uuid);
  } else {
    found = list.find(a => a.uuid === uuid);
  }
  return found ? { type, ...found } : null;
}

function getConfigDir() {
  return configDir;
}

module.exports = {
  init,
  get,
  set,
  getAll,
  getAccountsStore,
  setAccountsStore,
  getLastSelectedAccount,
  getConfigDir,
  ensureDir
};
