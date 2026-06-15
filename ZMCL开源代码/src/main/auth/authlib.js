const axios = require('axios');
const crypto = require('crypto');
const configStore = require('../config/store');

const PRESET_SERVERS = [
  {
    id: 'littleskin',
    name: 'LittleSkin',
    baseUrl: 'https://mcskin.littleservice.cn/api/yggdrasil',
    registerUrl: 'https://mcskin.littleservice.cn/auth/register',
    description: 'LittleSkin 皮肤站'
  },
  {
    id: 'nide8',
    name: '统一通行证 (Nide8)',
    baseUrl: 'https://auth.mc-user.com:233/{serverId}/authserver',
    needServerId: true,
    registerUrl: 'https://login.mc-user.com:233/{serverId}/register',
    description: '统一通行证，需要服务器 ID'
  },
  {
    id: 'custom',
    name: '自定义服务器',
    baseUrl: '',
    editable: true,
    description: '用户自定义 Authlib-injector 服务器'
  }
];

function getPresetServers() {
  return PRESET_SERVERS;
}

function normalizeServerUrl(url) {
  if (!url) return '';
  let result = url.trim();
  if (result.endsWith('/')) {
    result = result.slice(0, -1);
  }
  if (!result.match(/^https?:\/\//)) {
    result = 'https://' + result;
  }
  return result;
}

async function login(serverUrl, email, password) {
  const baseUrl = normalizeServerUrl(serverUrl);
  if (!baseUrl) {
    throw new Error('请输入服务器地址');
  }
  if (!email || !password) {
    throw new Error('请输入账号和密码');
  }

  const clientToken = crypto.randomBytes(16).toString('hex');

  try {
    const response = await axios.post(`${baseUrl}/authenticate`, {
      agent: {
        name: 'Minecraft',
        version: 1
      },
      username: email,
      password: password,
      clientToken: clientToken,
      requestUser: true
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    });

    const data = response.data;
    const profile = data.selectedProfile || (data.availableProfiles && data.availableProfiles[0]);

    if (!profile) {
      throw new Error('账号没有可用的玩家档案');
    }

    const account = {
      type: 'authlib',
      uuid: profile.id,
      userName: profile.name,
      accessToken: data.accessToken,
      clientToken: data.clientToken || clientToken,
      serverUrl: baseUrl,
      userProperties: data.user ? data.user.properties : {},
      createdAt: Date.now()
    };

    const accounts = configStore.getAccountsStore();
    const existingIndex = accounts.authlib.findIndex(a => a.uuid === account.uuid && a.serverUrl === baseUrl);
    if (existingIndex >= 0) {
      accounts.authlib[existingIndex] = account;
    } else {
      accounts.authlib.push(account);
    }
    accounts.lastSelected = { type: 'authlib', uuid: account.uuid };
    configStore.setAccountsStore(accounts);

    return account;
  } catch (error) {
    if (error.response && error.response.data) {
      const msg = error.response.data.errorMessage || error.response.data.error || error.message;
      throw new Error('登录失败: ' + msg);
    }
    throw new Error('登录失败: ' + error.message);
  }
}

async function refresh(serverUrl, accessToken, clientToken) {
  const baseUrl = normalizeServerUrl(serverUrl);
  try {
    const response = await axios.post(`${baseUrl}/refresh`, {
      accessToken: accessToken,
      clientToken: clientToken,
      requestUser: true
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    });

    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      const msg = error.response.data.errorMessage || error.response.data.error || error.message;
      throw new Error('刷新失败: ' + msg);
    }
    throw new Error('刷新失败: ' + error.message);
  }
}

async function validate(serverUrl, accessToken, clientToken) {
  const baseUrl = normalizeServerUrl(serverUrl);
  try {
    const response = await axios.post(`${baseUrl}/validate`, {
      accessToken: accessToken,
      clientToken: clientToken
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    return response.status === 204 || response.status === 200;
  } catch (error) {
    return false;
  }
}

function getAccounts() {
  const accounts = configStore.getAccountsStore();
  return accounts.authlib.map(acc => ({
    uuid: acc.uuid,
    userName: acc.userName,
    serverUrl: acc.serverUrl,
    type: 'authlib'
  }));
}

function removeAccount(uuid) {
  const accounts = configStore.getAccountsStore();
  accounts.authlib = accounts.authlib.filter(a => a.uuid !== uuid);
  if (accounts.lastSelected && accounts.lastSelected.type === 'authlib' && accounts.lastSelected.uuid === uuid) {
    accounts.lastSelected = null;
  }
  configStore.setAccountsStore(accounts);
  return true;
}

function selectAccount(uuid) {
  const accounts = configStore.getAccountsStore();
  const account = accounts.authlib.find(a => a.uuid === uuid);
  if (!account) {
    throw new Error('账号不存在');
  }
  accounts.lastSelected = { type: 'authlib', uuid: uuid };
  configStore.setAccountsStore(accounts);
  return account;
}

function getSelectedAccount() {
  const accounts = configStore.getAccountsStore();
  if (!accounts.lastSelected || accounts.lastSelected.type !== 'authlib') {
    return null;
  }
  return accounts.authlib.find(a => a.uuid === accounts.lastSelected.uuid) || null;
}

module.exports = {
  getPresetServers,
  login,
  refresh,
  validate,
  getAccounts,
  removeAccount,
  selectAccount,
  getSelectedAccount
};
