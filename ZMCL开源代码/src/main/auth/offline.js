const crypto = require('crypto');
const configStore = require('../config/store');

function generateUUIDFromName(name) {
  const hash = crypto.createHash('md5').update(name).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

function validateUsername(username) {
  if (!username || username.trim() === '') {
    return '玩家名不能为空';
  }
  if (username.includes('"')) {
    return '玩家名不能包含引号';
  }
  if (!/^[0-9A-Za-z_]+$/.test(username)) {
    return '玩家名只能包含字母、数字和下划线';
  }
  if (username.length > 16) {
    return '玩家名最多 16 个字符';
  }
  return null;
}

function login(username) {
  const trimmedName = username.trim();
  const validationError = validateUsername(trimmedName);
  if (validationError) {
    throw new Error(validationError);
  }

  const uuid = generateUUIDFromName(trimmedName);
  const accessToken = crypto.randomBytes(16).toString('hex');

  const account = {
    type: 'offline',
    uuid: uuid,
    userName: trimmedName,
    accessToken: accessToken,
    userType: 'legacy',
    createdAt: Date.now()
  };

  const accounts = configStore.getAccountsStore();
  const existingIndex = accounts.offline.findIndex(a => a.userName === trimmedName);
  if (existingIndex >= 0) {
    accounts.offline[existingIndex] = account;
  } else {
    accounts.offline.push(account);
  }
  accounts.lastSelected = { type: 'offline', uuid: uuid, userName: trimmedName };
  configStore.setAccountsStore(accounts);

  return account;
}

function getAccounts() {
  const accounts = configStore.getAccountsStore();
  return accounts.offline.map(acc => ({
    uuid: acc.uuid,
    userName: acc.userName,
    type: 'offline'
  }));
}

function removeAccount(userName) {
  const accounts = configStore.getAccountsStore();
  accounts.offline = accounts.offline.filter(a => a.userName !== userName);
  if (accounts.lastSelected && accounts.lastSelected.type === 'offline' && accounts.lastSelected.userName === userName) {
    accounts.lastSelected = null;
  }
  configStore.setAccountsStore(accounts);
  return true;
}

function selectAccount(userName) {
  const accounts = configStore.getAccountsStore();
  const account = accounts.offline.find(a => a.userName === userName);
  if (!account) {
    throw new Error('账号不存在');
  }
  accounts.lastSelected = { type: 'offline', uuid: account.uuid, userName: userName };
  configStore.setAccountsStore(accounts);
  return account;
}

function getSelectedAccount() {
  const accounts = configStore.getAccountsStore();
  if (!accounts.lastSelected || accounts.lastSelected.type !== 'offline') {
    return null;
  }
  return accounts.offline.find(a => a.uuid === accounts.lastSelected.uuid) || null;
}

module.exports = {
  login,
  getAccounts,
  removeAccount,
  selectAccount,
  getSelectedAccount,
  validateUsername
};
