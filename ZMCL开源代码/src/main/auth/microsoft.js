const axios = require('axios');
const crypto = require('crypto');
const { BrowserWindow } = require('electron');
const configStore = require('../config/store');

const MICROSOFT_CLIENT_ID = '00000000402B5328';
const MICROSOFT_AUTHORIZE_URL = 'https://login.live.com/oauth20_authorize.srf';
const MICROSOFT_TOKEN_URL = 'https://login.live.com/oauth20_token.srf';
const MICROSOFT_REDIRECT_URI = 'https://login.live.com/oauth20_desktop.srf';
const MICROSOFT_SCOPE = 'XboxLive.signin offline_access openid profile email';

const XBL_AUTH_URL = 'https://user.auth.xboxlive.com/user/authenticate';
const XSTS_AUTH_URL = 'https://xsts.auth.xboxlive.com/xsts/authorize';
const MINECRAFT_LOGIN_URL = 'https://api.minecraftservices.com/authentication/login_with_xbox';
const MINECRAFT_PROFILE_URL = 'https://api.minecraftservices.com/minecraft/profile';

function log(msg, obj) {
  if (obj && typeof obj === 'object') {
    console.log('[MSAuth]', msg, JSON.stringify(obj, null, 2));
  } else {
    console.log('[MSAuth]', msg, obj || '');
  }
}

function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

function buildAuthorizeUrl(state) {
  const params = new URLSearchParams();
  params.append('client_id', MICROSOFT_CLIENT_ID);
  params.append('response_type', 'code');
  params.append('redirect_uri', MICROSOFT_REDIRECT_URI);
  params.append('scope', MICROSOFT_SCOPE);
  params.append('state', state);
  params.append('response_mode', 'query');
  return `${MICROSOFT_AUTHORIZE_URL}?${params.toString()}`;
}

async function startOAuthFlow(onProgress) {
  return new Promise((resolve, reject) => {
    try {
      if (onProgress) {
        onProgress({ stage: 'opening_browser', message: '正在打开登录窗口...' });
      }

      const state = generateState();
      const authorizeUrl = buildAuthorizeUrl(state);

      log('Opening OAuth window with URL:', authorizeUrl);

      const authWindow = new BrowserWindow({
        width: 480,
        height: 720,
        minWidth: 420,
        minHeight: 600,
        backgroundColor: '#ffffff',
        title: '微软账号登录',
        autoHideMenuBar: true,
        resizable: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          enableRemoteModule: false,
          sandbox: true
        }
      });

      authWindow.setMenuBarVisibility(false);

      let done = false;

      const finish = (error, code) => {
        if (done) return;
        done = true;
        if (!authWindow.isDestroyed()) {
          authWindow.close();
        }
        if (error) {
          reject(error);
        } else {
          resolve(code);
        }
      };

      authWindow.webContents.on('will-redirect', (event, redirectUrl) => {
        if (done) return;
        try {
          const url = new URL(redirectUrl);
          if (url.origin === 'https://login.live.com' && url.pathname === '/oauth20_desktop.srf') {
            const code = url.searchParams.get('code');
            const error = url.searchParams.get('error');
            const errorDesc = url.searchParams.get('error_description');

            if (code) {
              log('Authorization code captured');
              event.preventDefault();
              finish(null, code);
            } else if (error) {
              log('OAuth error:', error);
              event.preventDefault();
              finish(new Error('授权失败: ' + (errorDesc || error)));
            }
          }
        } catch (e) {
          log('URL parse error:', e.message);
        }
      });

      authWindow.webContents.on('did-navigate', (event, newUrl) => {
        if (done) return;
        try {
          const url = new URL(newUrl);
          if (url.origin === 'https://login.live.com' && url.pathname === '/oauth20_desktop.srf') {
            const code = url.searchParams.get('code');
            const error = url.searchParams.get('error');
            const errorDesc = url.searchParams.get('error_description');

            if (code) {
              log('Authorization code captured (did-navigate)');
              finish(null, code);
            } else if (error) {
              finish(new Error('授权失败: ' + (errorDesc || error)));
            }
          }
        } catch (e) {
          log('did-navigate parse error:', e.message);
        }
      });

      authWindow.on('closed', () => {
        if (!done) {
          finish(new Error('登录窗口已关闭'));
        }
      });

      authWindow.webContents.on('did-fail-load', (event, errorCode, errorDesc) => {
        if (done) return;
        log('Page load failed:', errorDesc);
        if (errorCode < 0 && errorCode !== -3) {
          finish(new Error('页面加载失败: ' + errorDesc));
        }
      });

      authWindow.loadURL(authorizeUrl);
    } catch (error) {
      reject(error);
    }
  });
}

async function exchangeCodeForToken(code) {
  log('Exchanging authorization code for token...');

  const params = new URLSearchParams();
  params.append('client_id', MICROSOFT_CLIENT_ID);
  params.append('code', code);
  params.append('grant_type', 'authorization_code');
  params.append('redirect_uri', MICROSOFT_REDIRECT_URI);
  params.append('scope', MICROSOFT_SCOPE);

  const response = await axios.post(MICROSOFT_TOKEN_URL, params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    timeout: 30000
  });

  log('Token exchange successful');
  return response.data;
}

async function completeAuthentication(msTokenData, onProgress) {
  if (onProgress) {
    onProgress({ stage: 'authenticating_xbl', message: '正在验证 Xbox Live...' });
  }

  const xblResponse = await axios.post(XBL_AUTH_URL, {
    Properties: {
      AuthMethod: 'RPS',
      SiteName: 'user.auth.xboxlive.com',
      RpsTicket: 'd=' + msTokenData.access_token
    },
    RelyingParty: 'http://auth.xboxlive.com',
    TokenType: 'JWT'
  }, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-xbl-contract-version': '1'
    },
    timeout: 30000
  });

  const xblToken = xblResponse.data.Token;
  const xblUserHash = xblResponse.data.DisplayClaims.xui[0].uhs;
  log('XBL authenticated');

  if (onProgress) {
    onProgress({ stage: 'authenticating_xsts', message: '正在获取 XSTS 令牌...' });
  }

  const xstsResponse = await axios.post(XSTS_AUTH_URL, {
    Properties: {
      SandboxId: 'RETAIL',
      UserTokens: [xblToken]
    },
    RelyingParty: 'rp://api.minecraftservices.com/',
    TokenType: 'JWT'
  }, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-xbl-contract-version': '1'
    },
    timeout: 30000
  });

  const xstsToken = xstsResponse.data.Token;
  const xstsUserHash = xstsResponse.data.DisplayClaims.xui[0].uhs;
  log('XSTS authenticated');

  if (onProgress) {
    onProgress({ stage: 'authenticating_minecraft', message: '正在登录 Minecraft...' });
  }

  const mcLoginResponse = await axios.post(MINECRAFT_LOGIN_URL, {
    identityToken: 'XBL3.0 x=' + xstsUserHash + ';' + xstsToken
  }, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    timeout: 30000
  });

  const mcAccessToken = mcLoginResponse.data.access_token;
  const mcExpiresIn = mcLoginResponse.data.expires_in;
  log('Minecraft authenticated');

  if (onProgress) {
    onProgress({ stage: 'fetching_profile', message: '正在获取玩家资料...' });
  }

  const profileResponse = await axios.get(MINECRAFT_PROFILE_URL, {
    headers: { 'Authorization': 'Bearer ' + mcAccessToken },
    timeout: 30000
  });

  const profile = profileResponse.data;

  const account = {
    type: 'microsoft',
    uuid: profile.id,
    userName: profile.name,
    accessToken: mcAccessToken,
    refreshToken: msTokenData.refresh_token,
    expiresAt: Date.now() + (mcExpiresIn * 1000),
    userHash: xblUserHash,
    skins: profile.skins || [],
    capes: profile.capes || [],
    createdAt: Date.now()
  };

  const accounts = configStore.getAccountsStore();
  const existingIndex = accounts.microsoft.findIndex(a => a.uuid === account.uuid);
  if (existingIndex >= 0) {
    accounts.microsoft[existingIndex] = account;
  } else {
    accounts.microsoft.push(account);
  }
  accounts.lastSelected = { type: 'microsoft', uuid: account.uuid };
  configStore.setAccountsStore(accounts);

  if (onProgress) {
    onProgress({ stage: 'complete', message: '登录成功！', account: account });
  }

  return account;
}

async function startOAuth(onProgress) {
  try {
    const code = await startOAuthFlow(onProgress);
    const msTokenData = await exchangeCodeForToken(code);
    return await completeAuthentication(msTokenData, onProgress);
  } catch (error) {
    log('OAuth flow failed:', error.message);
    if (onProgress) {
      onProgress({ stage: 'error', message: error.message, error: true });
    }
    throw error;
  }
}

async function refreshToken(refreshToken) {
  try {
    log('Refreshing Microsoft token...');
    const tokenResponse = await axios.post(MICROSOFT_TOKEN_URL, new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: MICROSOFT_CLIENT_ID,
      refresh_token: refreshToken,
      redirect_uri: MICROSOFT_REDIRECT_URI,
      scope: MICROSOFT_SCOPE
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30000
    });

    return await completeAuthentication(tokenResponse.data, null);
  } catch (error) {
    throw new Error('刷新令牌失败: ' + error.message);
  }
}

function getAccounts() {
  const accounts = configStore.getAccountsStore();
  return accounts.microsoft.map(acc => ({
    uuid: acc.uuid,
    userName: acc.userName,
    expiresAt: acc.expiresAt,
    skins: acc.skins,
    type: 'microsoft'
  }));
}

function removeAccount(uuid) {
  const accounts = configStore.getAccountsStore();
  accounts.microsoft = accounts.microsoft.filter(a => a.uuid !== uuid);
  if (accounts.lastSelected && accounts.lastSelected.type === 'microsoft' && accounts.lastSelected.uuid === uuid) {
    accounts.lastSelected = null;
  }
  configStore.setAccountsStore(accounts);
  return true;
}

function selectAccount(uuid) {
  const accounts = configStore.getAccountsStore();
  const account = accounts.microsoft.find(a => a.uuid === uuid);
  if (!account) {
    throw new Error('账号不存在');
  }

  if (account.expiresAt && account.expiresAt < Date.now()) {
    return refreshToken(account.refreshToken);
  }

  accounts.lastSelected = { type: 'microsoft', uuid: uuid };
  configStore.setAccountsStore(accounts);
  return account;
}

function getSelectedAccount() {
  const accounts = configStore.getAccountsStore();
  if (!accounts.lastSelected || accounts.lastSelected.type !== 'microsoft') {
    return null;
  }
  return accounts.microsoft.find(a => a.uuid === accounts.lastSelected.uuid) || null;
}

module.exports = {
  startOAuth,
  refreshToken,
  getAccounts,
  removeAccount,
  selectAccount,
  getSelectedAccount
};
