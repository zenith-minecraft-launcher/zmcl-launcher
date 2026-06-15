const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const url = require('url');

const DEFAULT_API_KEY = 'YOUR_DEEPSEEK_API_KEY_HERE';
// 默认模型使用官方 deepseek-chat（非深度思考版），避免 reasoning_effort 在 chat 模型上被拒绝
const DEFAULT_MODEL = 'deepseek-chat';
// 启用深度思考时切换为 reasoner 模型（DeepSeek 官方模型）
const DEFAULT_REASONER_MODEL = 'deepseek-reasoner';
// 注意：baseUrl 应该指向 /v1（不含 chat/completions 后缀），避免重复拼接
const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_DAILY_LIMIT = 40;
const MAX_MESSAGE_LENGTH = 2000;

const QUOTA_DIR = path.join(os.homedir(), '.zenith-launcher', 'ai');
const QUOTA_FILE = path.join(QUOTA_DIR, 'usage.json');

function getTodayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function ensureQuotaDir() {
    try {
        if (!fs.existsSync(QUOTA_DIR)) {
            fs.mkdirSync(QUOTA_DIR, { recursive: true });
        }
    } catch (e) {
        console.error('[AI] Failed to create quota dir:', e.message);
    }
}

function readQuota() {
    ensureQuotaDir();
    try {
        if (fs.existsSync(QUOTA_FILE)) {
            const data = JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf8'));
            if (data && typeof data.count === 'number') {
                return data;
            }
        }
    } catch (e) {
        console.error('[AI] Failed to read quota file:', e.message);
    }
    return { date: getTodayKey(), count: 0 };
}

function writeQuota(data) {
    ensureQuotaDir();
    try {
        fs.writeFileSync(QUOTA_FILE, JSON.stringify(data || {}, 'utf8'));
    } catch (e) {
        console.error('[AI] Failed to write quota file:', e.message);
    }
}

function incrementQuota() {
    const today = getTodayKey();
    const q = readQuota();
    if (q.date === today) {
        q.count = (q.count || 0) + 1;
    } else {
        q.date = today;
        q.count = 1;
    }
    writeQuota(q);
}

function getQuotaInfo() {
    const q = readQuota();
    return {
        date: q.date,
        count: q.count || 0,
        dailyLimit: DEFAULT_DAILY_LIMIT,
        remaining: Math.max(0, DEFAULT_DAILY_LIMIT - (q.count || 0))
    };
}

/* ============================================================
 * 联网搜索：依次尝试多个源，失败不影响聊天
 * 返回：{ ok, engine, results, error? }，结果为 {title, snippet, url}
 * ============================================================ */

const WEB_SEARCH_MAX_RESULTS = 8;
const WEB_SEARCH_MAX_SNIPPET = 500;
const WEB_SEARCH_CANDIDATES = 20; // 每个引擎先抓取的候选数（之后去重+排序）

// 通用 HTTP GET：跟随 302/301 重定向、超时保护、自动选择 http/https
function httpGet(targetUrl, opts, redirectsLeft) {
    return new Promise((resolve, reject) => {
        const redirects = typeof redirectsLeft === 'number' ? redirectsLeft : 5;
        try {
            const parsed = new URL(targetUrl);
            const lib = parsed.protocol === 'https:' ? https : http;
            const headers = Object.assign({
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.6',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }, (opts && opts.headers) || {});
            const req = lib.get({
                hostname: parsed.hostname,
                port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
                path: parsed.pathname + parsed.search,
                headers
            }, (res) => {
        const status = res.statusCode || 0;
        if ((status === 301 || status === 302 || status === 303 || status === 307 || status === 308) && res.headers && res.headers.location) {
            res.resume && res.resume();
            if (redirects <= 0) return reject(new Error('too many redirects'));
            const next = new URL(res.headers.location, parsed.href).href;
            return httpGet(next, opts, redirects - 1).then(resolve, reject);
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { data += c; if (data.length > 2500000) res.destroy(new Error('body too large')); });
        res.on('end', () => resolve({ status, body: data, finalUrl: parsed.href }));
    });
            req.on('error', (e) => reject(e));
            req.setTimeout((opts && opts.timeout) || 10000, () => {
                req.destroy(new Error('timeout'));
            });
        } catch (e) {
            reject(e);
        }
    });
}

function decodeHtmlEntities(str) {
    if (typeof str !== 'string') return str;
    // 命名字符实体
    const named = {
        '&amp;': '&', '&lt;': '<', '&gt;': '>',
        '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
        '&ensp;': ' ', '&emsp;': ' ',
        '&copy;': '©', '&reg;': '®', '&trade;': '™'
    };
    return str
        .replace(/&#(\d+);/g, (_, n) => {
            const code = parseInt(n, 10);
            return (code >= 32 && code <= 0x10FFFF) ? String.fromCharCode(code) : ' ';
        })
        .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => {
            const code = parseInt(n, 16);
            return (code >= 32 && code <= 0x10FFFF) ? String.fromCharCode(code) : ' ';
        })
        .replace(/&[a-zA-Z]+;/g, (m) => (named[m] ? named[m] : ' '));
}

function cleanHtmlTags(s) {
    return decodeHtmlEntities(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** 宽松解析：从一个完整搜索结果页面提取若干 {title, url, snippet}。
 *  策略：
 *   - 先尝试匹配每个"大容器块"（li class=b_algo / div class=result / ol 中每一个 li / 带 class='result' 的结构）
 *   - 在每个块中：
 *      1. 找第一个 <a href="http(s)://..."> 作为标题与 URL
 *      2. 找该容器中 <p>...</p> 作为摘要；若没有则取容器文本中 300~400 字片段
 */
function parseSearchPageHtml(html) {
    const results = [];
    if (!html) return results;

    // 策略 1：Bing 风格 — <li class="b_algo"> ... <h2><a href="...">标题</a></h2> ... <p class="b_lineclamp2">摘要</p>
    const bingLi = /<li[^>]+class\s*=\s*["'][^"']*?\bb_algo\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
    let m;
    while ((m = bingLi.exec(html)) !== null && results.length < WEB_SEARCH_CANDIDATES) {
        const block = m[1];
        const res = extractFromBingBlock(block);
        if (res && res.title) results.push(res);
    }
    if (results.length > 0) return finalize(results);

    // 策略 2：DuckDuckGo / 通用 — <h2> 内的 <a> 配合紧接着的 <p> 摘要
    const h2Regex = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
    const pairs = [];
    let hm;
    while ((hm = h2Regex.exec(html)) !== null && pairs.length < WEB_SEARCH_CANDIDATES) {
        const h2Html = hm[1];
        const hrefMatch = h2Html.match(/<a\s+[^>]*?href\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
        if (!hrefMatch) continue;
        const title = cleanHtmlTags(hrefMatch[2]);
        if (!title || title.length < 3) continue;
        const url = hrefMatch[1];
        // 在这个 h2 之后 2000 字内找第一个 <p>
        const afterPos = html.indexOf(hm[0], hm.index) + hm[0].length;
        const nextChunk = html.slice(afterPos, afterPos + 2000);
        const pm = nextChunk.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
        const snippet = pm ? cleanHtmlTags(pm[1]) : '';
        pairs.push({ title, url, snippet });
    }
    if (pairs.length > 0) return finalize(pairs);

    // 策略 3：宽松兜底 — 收集所有 <a href=http(s)://...> 及其后 360 字
    const anchorRegex = /<a\s+[^>]*?href\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const fallbacks = [];
    while ((m = anchorRegex.exec(html)) !== null && fallbacks.length < WEB_SEARCH_CANDIDATES) {
        const title = cleanHtmlTags(m[2]);
        if (!title || title.length < 4) continue;
        if (/^(?:搜索|必应|bing|duckduckgo|百度|google|youtube|登录|注册)/i.test(title)) continue;
        const start = html.indexOf(m[0], m.index) + m[0].length;
        const slice = html.slice(start, start + 600);
        fallbacks.push({ title, url: m[1], snippet: cleanHtmlTags(slice).slice(0, WEB_SEARCH_MAX_SNIPPET) });
    }
    return finalize(fallbacks);
}

function extractFromBingBlock(block) {
    // 1) 优先 <h2><a href="...">title</a></h2> 形式
    const h2Match = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    let hrefMatch = null;
    if (h2Match) {
        hrefMatch = h2Match[1].match(/<a\s+[^>]*?href\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    }
    // 2) 没有 h2 就尝试在整段里找第一个 <a href="http(s)://...">...</a> 作为标题
    if (!hrefMatch) {
        const am = block.match(/<a\s+[^>]*?href\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
        if (am) hrefMatch = am;
    }
    if (!hrefMatch) return null;
    const title = cleanHtmlTags(hrefMatch[2]);
    if (!title) return null;
    const url = hrefMatch[1];

    // 摘要 — 优先匹配 b_lineclamp / b_snippet；否则找第一个 <p>
    const snippetRe = /<(p|div|span)\s+[^>]*?class\s*=\s*["'][^"']*?(?:b_lineclamp\d*|b_snippet|b_algoSlug|b_caption|c_abstract|c-line-clamp|cos-line-clamp)[^"']*?["'][^>]*>([\s\S]*?)<\/\1>/i;
    let snippet = '';
    const sm = block.match(snippetRe);
    if (sm) snippet = cleanHtmlTags(sm[2]);
    if (!snippet) {
        const pm = block.match(/<(p|div)[^>]*>([\s\S]*?)<\/\1>/i);
        if (pm) snippet = cleanHtmlTags(pm[2]);
    }
    return { title, url, snippet };
}

function finalize(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const r of list) {
        if (!r || !r.url || !r.title) continue;
        if (seen.has(r.url)) continue;
        seen.add(r.url);
        if (/(?:ad|clk|promoted|推广|aclk)/i.test(r.url)) continue;
        // 过滤"X（汉语汉字）_百度百科"这种字典条目 —— 当 title 主体只有 1~3 个汉字时
        const titleOnly = String(r.title).replace(/[_—\-].*$/, '').trim();
        const cleanTitle = titleOnly.replace(/[（(][^)）]*[）)]/g, '').trim();
        if (/[\u4e00-\u9fa5]/.test(cleanTitle) && cleanTitle.length <= 3 && /(?:汉语汉字|汉字|汉语词语|词语|百度百科|百科)/.test(r.title)) continue;
        out.push(normalizeResult(r));
        if (out.length >= WEB_SEARCH_CANDIDATES) break;
    }
    return out;
}

function normalizeResult(r) {
    let snippet = cleanHtmlTags(String((r && r.snippet) || '')).replace(/\s+/g, ' ').trim();
    if (snippet.length > WEB_SEARCH_MAX_SNIPPET) snippet = snippet.slice(0, WEB_SEARCH_MAX_SNIPPET) + '…';
    const title = cleanHtmlTags(String((r && r.title) || '')).replace(/\s+/g, ' ').trim();
    return {
        title: title.slice(0, 140),
        snippet,
        url: String((r && r.url) || '').slice(0, 400)
    };
}

// -------------------- 各个搜索引擎实现 --------------------

// DuckDuckGo Instant Answer（JSON）
async function searchDuckDuckGoAPI(query) {
    try {
        const res = await httpGet('https://api.duckduckgo.com/?q=' + encodeURIComponent(query) + '&format=json&no_html=1&skip_disambig=1&kl=zh_CN', { timeout: 9000 });
        if (!res || res.status !== 200) return [];
        const data = JSON.parse(res.body || '{}');
        const results = [];
        if (data.Heading && data.AbstractText) {
            results.push({ title: String(data.Heading), snippet: String(data.AbstractText).slice(0, WEB_SEARCH_MAX_SNIPPET), url: data.AbstractURL || '' });
        }
        if (Array.isArray(data.RelatedTopics)) {
            for (const t of data.RelatedTopics) {
                if (!t || typeof t !== 'object') continue;
                if (Array.isArray(t.Topics)) {
                    for (const tt of t.Topics) {
                        if (tt && tt.FirstURL && tt.Text) {
                            results.push({ title: String(tt.Text).slice(0, 120), snippet: String(tt.Text).slice(0, WEB_SEARCH_MAX_SNIPPET), url: tt.FirstURL });
                        }
                        if (results.length >= WEB_SEARCH_CANDIDATES) break;
                    }
                } else if (t.FirstURL && t.Text) {
                    results.push({ title: String(t.Text).slice(0, 120), snippet: String(t.Text).slice(0, WEB_SEARCH_MAX_SNIPPET), url: t.FirstURL });
                }
                if (results.length >= WEB_SEARCH_CANDIDATES) break;
            }
        }
        return results;
    } catch (e) {
        console.warn('[AI][webSearch] DDG API err:', e.message);
        return [];
    }
}

// DuckDuckGo HTML
async function searchDuckDuckGoHtml(query) {
    try {
        const res = await httpGet('https://duckduckgo.com/html/?q=' + encodeURIComponent(query) + '&kl=zh_CN', { timeout: 9000 });
        if (!res || res.status !== 200) return [];
        return parseSearchPageHtml(res.body);
    } catch (e) {
        console.warn('[AI][webSearch] DDG HTML err:', e.message);
        return [];
    }
}

// Bing HTML（国内访问相对稳定）：优先 cn.bing.com，其次 www.bing.com
async function searchBingHtml(query) {
    const urls = [
        'https://cn.bing.com/search?q=' + encodeURIComponent(query) + '&cc=cn&setlang=zh-CN&mkt=zh-CN&count=30',
        'https://www.bing.com/search?q=' + encodeURIComponent(query) + '&cc=cn&setlang=zh-CN&mkt=zh-CN&count=30',
        'https://www4.bing.com/search?q=' + encodeURIComponent(query) + '&cc=cn&setlang=zh-CN&mkt=zh-CN&count=30'
    ];
    for (const u of urls) {
        try {
            const res = await httpGet(u, { timeout: 9000 });
            if (res && res.status === 200 && res.body && res.body.length > 2000) {
                const r = parseSearchPageHtml(res.body);
                if (r.length > 0) return r;
            }
        } catch (e) {
            console.warn('[AI][webSearch] Bing err on', u, ':', e.message);
        }
    }
    return [];
}

// 百度 mobile / PC 页（国内首选）
async function searchBaiduMobile(query) {
    const urls = [
        'https://m.baidu.com/s?word=' + encodeURIComponent(query) + '&sa=tb&from=1025717a',
        'https://www.baidu.com/s?wd=' + encodeURIComponent(query) + '&sa=tb&rn=10'
    ];
    for (const u of urls) {
        try {
            const res = await httpGet(u, { timeout: 10000 });
            if (res && res.status === 200 && res.body) {
                const r = parseBaiduMobileHtml(res.body);
                if (r.length > 0) return r;
            }
        } catch (e) {
            console.warn('[AI][webSearch] Baidu err:', e.message);
        }
    }
    return [];
}

// 百度 mobile 的结果结构大致是：
// <div class="result ..." ...> 或 <article data-log="..." ...> 内的 <a>（标题）+ 紧接的 <div class="c-abstract"> / <div class="c-author">/ <p> 摘要
function parseBaiduMobileHtml(html) {
    const results = [];
    if (!html) return results;
    const candidates = [];

    // 1) 先扫描带特定摘要 class 的容器，再在其前面 2500 字内查找标题与 URL
    //    匹配的 class：c-abstract / c-span-abstract / abstract / c-line-clamp / cos-line-clamp / b_lineclamp / b_snippet / b_caption
    const snippetClassRe = /<(?:div|p|span)[^>]*?class\s*=\s*["'][^"']*?(?:c-abstract|c-span-abstract|abstract|c-line-clamp|cos-line-clamp|b_lineclamp|b_snippet|b_caption|c-author|result-item_)[^"']*?["'][^>]*?>([\s\S]*?)<\/\1>/gi;
    let sm;
    while ((sm = snippetClassRe.exec(html)) !== null && candidates.length < 15) {
        const snippetHtml = sm[1];
        const blockStart = Math.max(0, sm.index - 2500);
        const beforeBlock = html.slice(blockStart, sm.index);
        const titleMatch = beforeBlock.match(/<(?:h2|h3|h4)\b[^>]*>([\s\S]*?)<\/\1>/i);
        const urlMatch = beforeBlock.match(/<a\s+[^>]*?href\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>/i);
        let title = titleMatch ? cleanHtmlTags(titleMatch[1]) : '';
        let url = urlMatch ? urlMatch[1] : '';
        if (!title) {
            const altTitle = beforeBlock.match(/<a\s+[^>]*?href\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);
            if (altTitle) {
                for (let i = altTitle.length - 1; i >= 0; i--) {
                    const tm = altTitle[i].match(/<a\s+[^>]*?href\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
                    if (tm) {
                        const t = cleanHtmlTags(tm[2]);
                        if (t && t.length >= 4 && /[\u4e00-\u9fa5a-zA-Z]/.test(t)) { title = t; url = tm[1]; break; }
                    }
                }
            }
        }
        const snippet = cleanHtmlTags(snippetHtml);
        if (title && url && snippet.length >= 4) {
            candidates.push({ title, url, snippet });
        }
    }

    // 2) 备份：遍览所有 <a href="https://...">...</a> 抓标题并向后找摘要
    if (candidates.length === 0) {
        const aRegex = /<a\s+[^>]*?href\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let am;
        while ((am = aRegex.exec(html)) !== null && candidates.length < 30) {
            const url = am[1];
            const title = cleanHtmlTags(am[2]);
            if (!title || title.length < 4 || title.length > 120) continue;
            if (!/[\u4e00-\u9fa5a-zA-Z]/.test(title)) continue;
            if (/(?:ad|clk|promoted|推广|aclk|sponsor|\/sp)/i.test(url)) continue;
            if (/^https?:\/\/(?:m|www|image|tieba|zhidao|wenku|news|map|video)\.baidu\.com\/s\?word=/i.test(url)) continue;
            const t = title.trim();
            if (/^(?:点击.*?体验|广告|推广|AI搜索|体验ai|点击此处|立即下载|免费下载|下载安装|百度|必应|bing|duckduckgo|搜索|登录|注册|意见反馈|贴吧|知道|文库|网页|资讯|视频|图片|地图|新闻|百科|抗击肺炎|更多产品|个人中心|账号设置)/i.test(t)) continue;

            const endPos = html.indexOf('</a>', am.index + am[0].indexOf(am[1]));
            const start = endPos !== -1 ? endPos + 4 : am.index + am[0].length;
            const slice = html.slice(start, start + 1800);
            let snippet = '';
            const pm = slice.match(/<(?:div|p|span)[^>]*>([\s\S]*?)<\/\1>/gi);
            if (pm) {
                for (const p of pm) {
                    const inner = p.replace(/^<[^>]+>/, '').replace(/<\/[^>]+>$/, '');
                    const txt = cleanHtmlTags(inner);
                    if (txt && txt.length >= 8 && /[\u4e00-\u9fa5a-zA-Z]/.test(txt)) { snippet = txt; break; }
                }
            }
            if (!snippet) snippet = cleanHtmlTags(slice).slice(0, WEB_SEARCH_MAX_SNIPPET);
            if (snippet.length >= 4) candidates.push({ title, url, snippet });
        }
    }

    const seen = new Set();
    for (const r of candidates) {
        if (!r || !r.url || !r.title) continue;
        if (seen.has(r.url)) continue;
        seen.add(r.url);
        if (/(?:ad|clk|promoted|推广|aclk|sponsor|\/sp|voice\.baidu|passport\.baidu|baidu\.com\/more|baidu\.com\/my\/)/i.test(r.url)) continue;
        const tt = String(r.title).replace(/\s+/g, ' ').trim();
        if (tt.length < 4 || tt.length > 140) continue;
        if (!/[\u4e00-\u9fa5a-zA-Z]/.test(tt)) continue;
        results.push(normalizeResult(r));
        if (results.length >= WEB_SEARCH_CANDIDATES) break;
    }
    return results;
}

function tokenizeQuery(q) {
    const out = [];
    const add = (s) => {
        s = String(s || '').trim();
        if (!s || s.length < 1) return;
        if (/^[\u4e00-\u9fa5]+$/.test(s)) {
            for (let i = 0; i < s.length; i++) out.push(s[i]);
        } else {
            out.push(s.toLowerCase());
        }
    };
    // 1) 空格/标点切开 —— 这是用户显式分割的"词"
    const parts = q.split(/[\s,，。、.;:：；·~!！?？()（）\[【\]】\-\/\\|"'`]+/).filter(Boolean);
    const wholePhrases = [];
    for (const p of parts) {
        if (/[\u4e00-\u9fa5]/.test(p)) wholePhrases.push(p.toLowerCase());
        add(p);
    }
    // 2) 把中文整词再拆成字
    for (const p of wholePhrases) {
        for (let i = 0; i < p.length; i++) out.push(p[i]);
    }
    return { tokens: out, wholePhrases };
}

function scoreResult(r, tokens, wholePhrases) {
    let score = 0;
    const title = (r.title || '').toLowerCase();
    const snippet = (r.snippet || '').toLowerCase();
    const combined = title + ' ' + snippet;

    // 1. 中文整词命中（高权重）
    const phrases = Array.isArray(wholePhrases) ? wholePhrases : [];
    let phraseHits = 0;
    for (const ph of phrases) {
        if (!ph) continue;
        if (title.includes(ph)) { score += 30; phraseHits++; }
        else if (snippet.includes(ph)) { score += 15; phraseHits++; }
    }
    // 2. 英文/数字词命中（中等权重）
    for (const tok of tokens) {
        if (!tok) continue;
        if (/^[\u4e00-\u9fa5]$/.test(tok)) continue; // 跳过单字中文
        if (title.includes(tok)) score += 8;
        else if (snippet.includes(tok)) score += 3;
    }
    // 3. 单字中文命中（低权重，仅在整词有命中时叠加）
    if (phraseHits > 0) {
        for (const tok of tokens) {
            if (!tok || !/^[\u4e00-\u9fa5]$/.test(tok)) continue;
            if (title.includes(tok)) score += 1;
        }
    }
    // 4. 惩罚：摘要过短或空
    if (!snippet || snippet.length < 10) score -= 6;
    // 5. 惩罚：明显的字典/汉字解释页（当 query 含整词且 title 仅匹配单个汉字时）
    if (phrases.length > 0 && /(?:汉字|汉语|字典|词典|拼音|部首|笔顺|甲骨|周朝)/.test(title)) {
        // 如果整词都没命中，给一个显著惩罚
        if (phraseHits === 0) score -= 15;
    }
    return score;
}

// 对外统一入口：并发请求，按"与查询相关性"排序，取 TOP N
async function webSearch(query, language) {
    const q = String(query || '').trim();
    if (!q) return { ok: false, error: '关键词为空', results: [] };
    const { tokens, wholePhrases } = tokenizeQuery(q);

    const engines = [
        { name: 'baidu-mobile', fn: () => searchBaiduMobile(q) },
        { name: 'bing-cn',      fn: () => searchBingHtml(q) },
        { name: 'duckduckgo-html', fn: () => searchDuckDuckGoHtml(q) },
        { name: 'duckduckgo-api',  fn: () => searchDuckDuckGoAPI(q) }
    ];

    const results = await Promise.all(engines.map((e) =>
        e.fn()
            .then((arr) => ({ ok: true, engine: e.name, list: Array.isArray(arr) ? arr : [] }))
            .catch((err) => {
                console.warn('[AI][webSearch]', e.name, 'err:', err.message);
                return { ok: false, engine: e.name, list: [] };
            })
    ));

    // 合并并标注来源引擎
    const merged = [];
    const seenUrl = new Set();
    for (const { engine, list } of results) {
        for (const raw of list) {
            const r = normalizeResult(raw);
            if (!r || !r.url || !r.title) continue;
            if (seenUrl.has(r.url)) continue;
            seenUrl.add(r.url);
            merged.push(Object.assign({}, r, { _engine: engine, _score: scoreResult(r, tokens, wholePhrases) }));
        }
    }

    // 按分数降序；分数相同时保留原顺序（稳定排序）
    merged.sort((a, b) => b._score - a._score);
    // 只保留"正分"或"无中文整词但有合理内容"的结果 —— 主要目的是在结果质量差时给更少但更干净的内容
    let filtered = merged.filter((r) => r._score > 0 || (r.snippet && r.snippet.length > 20 && !/(?:汉字|汉语|字典|词典|拼音|部首|笔顺|甲骨|周朝)/.test(r.title)));
    if (filtered.length === 0) filtered = merged; // 退而求其次
    const top = filtered.slice(0, WEB_SEARCH_MAX_RESULTS);
    const primaryEngine = (top[0] && top[0]._engine) || 'multi';
    console.log('[AI][webSearch] merged=' + merged.length + ' primary=' + primaryEngine);
    if (top.length === 0) return { ok: false, error: '所有搜索引擎均未返回结果', results: [] };
    return { ok: true, engine: primaryEngine, results: top.map((r) => ({ title: r.title, url: r.url, snippet: r.snippet })) };
}

/**
 * 把搜索结果拼接到用户消息之前，让模型基于最新信息回答。
 * 返回 { injected, userMessage, status, engine? }
 */
async function buildPromptWithWebSearch(options) {
    const enabled = !!options.webSearch;
    const originalMessage = String(options.userMessage || '');
    if (!enabled) return { injected: false, userMessage: originalMessage, status: 'disabled' };

    const trimmed = originalMessage.trim();
    if (trimmed.length < 3) {
        return { injected: false, userMessage: originalMessage, status: 'skipped' };
    }

    let searchRes;
    try {
        searchRes = await webSearch(trimmed, 'zh_CN');
    } catch (err) {
        console.warn('[AI][webSearch] 异常：', err.message);
        searchRes = { ok: false, error: err.message, results: [] };
    }

    if (!searchRes.ok || !searchRes.results || searchRes.results.length === 0) {
        return { injected: false, userMessage: originalMessage, status: 'failed', engine: searchRes && searchRes.engine };
    }

    const lines = [];
    lines.push('【联网搜索结果】以下为搜索引擎返回的摘要，仅供回答参考：');
    searchRes.results.forEach((r, idx) => {
        lines.push(`[${idx + 1}] ${r.title}`);
        if (r.snippet && r.snippet !== r.title) lines.push(`    摘要：${r.snippet}`);
        if (r.url) lines.push(`    链接：${r.url}`);
    });
    lines.push('【请基于上述搜索结果回答用户问题；若搜索结果不足以回答，请告知用户当前信息较旧，并基于自身知识回答。】');
    return {
        injected: true,
        userMessage: lines.join('\n') + '\n\n用户问题：' + originalMessage,
        status: 'ok',
        engine: searchRes.engine
    };
}

/* ==================================================================
 * AI 聊天：调用 DeepSeek（或兼容 OpenAI Chat 协议）模型
 * ================================================================== */

async function chatCompletion(options, onStream) {
    const injected = await buildPromptWithWebSearch(options);
    const rawUserMessage = injected.userMessage;
    const trimmedUserMessage = rawUserMessage.trim();

    if (!trimmedUserMessage) {
        return { ok: false, error: '消息内容不能为空' };
    }

    const customMode = !!options.customMode;
    const devMode = !!options.devMode;
    const userMessage = trimmedUserMessage;
    const rawApiKey = customMode ? (options.apiKey || '').trim() : DEFAULT_API_KEY;
    const rawModel = customMode ? (options.model || '').trim() : '';
    const rawBaseUrl = customMode ? ((options.baseUrl || '').trim()) : '';
    const enableReasoning = !!options.deepThinking;

    // 为内置 API Key 选择合适模型
    let finalModel = rawModel || DEFAULT_MODEL;
    if (!customMode && enableReasoning) {
        // 深度思考时使用官方 reasoner 模型
        finalModel = DEFAULT_REASONER_MODEL;
    }

    if (customMode && !rawApiKey) {
        return { ok: false, error: '自定义模式下请先填写 API Key' };
    }
    if (customMode && !rawModel) {
        return { ok: false, error: '自定义模式下请先填写模型名称' };
    }
    if (customMode && !rawBaseUrl) {
        return { ok: false, error: '自定义模式下请先填写 Base URL' };
    }

    // 内置额度检查（仅非自定义、非开发者模式）
    if (!customMode && !devMode) {
        const info = getQuotaInfo();
        if (!rawApiKey || rawApiKey === DEFAULT_API_KEY) {
            if (!info.remaining || info.remaining <= 0) {
                return { ok: false, error: `今日额度已用完（${info.dailyLimit} 条/日），请明日再来，或在设置中填写自定义模型与 API Key` };
            }
        }
    }

    // 单条消息字符长度限制（开发模式、自定义模式、搜索注入模式跳过）
    const isSearchInjected = injected && injected.injected === true;
    if (!customMode && !devMode && !isSearchInjected && userMessage.length > MAX_MESSAGE_LENGTH) {
        return { ok: false, error: `单条消息不能超过 ${MAX_MESSAGE_LENGTH} 字符，当前 ${userMessage.length} 字符` };
    }

    const history = Array.isArray(options.history) ? options.history.slice(-30) : [];
    const messages = [
        { role: 'system', content: '你是 Zenith 启动器中的 AI 助手，擅长回答与 Minecraft 相关的问题，也可以提供一般技术支持。回答请简洁准确，使用中文。' }
    ];
    for (const h of history) {
        if (h && typeof h.role === 'string' && typeof h.content === 'string') {
            messages.push({ role: h.role, content: h.content });
        }
    }
    messages.push({ role: 'user', content: userMessage });

    const apiKey = rawApiKey;
    const baseUrl = (customMode ? rawBaseUrl : DEFAULT_BASE_URL)
        .replace(/\/v1\/*$/, '/v1')
        .replace(/\/+$/, '');

    const finalUrl = baseUrl + '/chat/completions';

    // 构建请求体：当启用深度思考时将 reasoning_effort 一并加入
    const requestBody = {
        model: finalModel,
        messages
    };
    if (enableReasoning) {
        requestBody.reasoning_effort = typeof options.reasoningEffort === 'string' && options.reasoningEffort ? options.reasoningEffort : 'medium';
    }
    // 流式/非流式
    const isStreaming = typeof onStream === 'function';
    requestBody.stream = isStreaming;

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Accept': 'text/event-stream'
    };

    try {
        if (isStreaming) {
            // 使用原生 https 请求实现流式读取，避免 axios 的事件流不兼容
            const parsed = new URL(finalUrl);
            const bodyStr = JSON.stringify(requestBody);
            const res = await new Promise((resolve, reject) => {
                const req = https.request({
                    hostname: parsed.hostname,
                    port: parsed.port || 443,
                    path: parsed.pathname + parsed.search,
                    method: 'POST',
                    headers: Object.assign({}, headers, { 'Content-Length': Buffer.byteLength(bodyStr) })
                }, (r) => {
                    if ((r.statusCode || 0) >= 200 && (r.statusCode || 0) < 300) resolve(r);
                    else {
                        let errBody = '';
                        r.setEncoding('utf8');
                        r.on('data', (c) => errBody += c);
                        r.on('end', () => reject(new Error('HTTP ' + r.statusCode + ' ' + errBody.slice(0, 200))));
                    }
                });
                req.on('error', reject);
                req.setTimeout(120000, () => reject(new Error('AI chat timeout')));
                req.write(bodyStr);
                req.end();
            });
            res.setEncoding('utf8');
            let buf = '';
            let fullContent = '';
            let fullReasoning = '';
            for await (const chunk of readStreamLines(res)) {
                buf += chunk;
                const lines = buf.split('\n');
                buf = lines.pop() || '';
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].replace(/\r$/, '').trim();
                    if (!line) continue;
                    if (line.indexOf('data:') !== 0) continue;
                    const data = line.slice(5).trim();
                    if (!data || data === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(data);
                        const delta = parsed && parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
                        if (delta) {
                            if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
                                fullReasoning += delta.reasoning_content;
                                onStream({ type: 'reasoning', content: delta.reasoning_content, fullContent, fullReasoning });
                            } else if (typeof delta.content === 'string' && delta.content) {
                                fullContent += delta.content;
                                onStream({ type: 'content', content: delta.content, fullContent, fullReasoning });
                            }
                        }
                    } catch (_) {
                        // 忽略格式异常的 data 片段
                    }
                }
            }

            if (!customMode && !devMode) incrementQuota();

            return {
                ok: true,
                content: fullContent,
                reasoning: fullReasoning || undefined,
                usage: null,
                webSearch: { status: injected.status, engine: injected.engine }
            };
        } else {
            // 非流式：用原生 https 以避免依赖 axios，但兼容用户代码中可能使用的 axios 也可；此处继续用原生请求
            const parsed = new URL(finalUrl);
            const bodyStr = JSON.stringify(requestBody);
            const res = await new Promise((resolve, reject) => {
                const req = https.request({
                    hostname: parsed.hostname,
                    port: parsed.port || 443,
                    path: parsed.pathname + parsed.search,
                    method: 'POST',
                    headers: Object.assign({}, headers, { 'Content-Length': Buffer.byteLength(bodyStr) })
                }, (r) => {
                    let body = '';
                    r.setEncoding('utf8');
                    r.on('data', (c) => body += c);
                    r.on('end', () => {
                        try {
                            const data = JSON.parse(body);
                            resolve({ status: r.statusCode, data });
                        } catch (e) {
                            reject(new Error('JSON parse failed, first 200 chars: ' + String(body).slice(0, 200)));
                        }
                    });
                });
                req.on('error', reject);
                req.setTimeout(120000, () => reject(new Error('AI chat timeout')));
                req.write(bodyStr);
                req.end();
            });

            if (res.status < 200 || res.status >= 300) {
                return { ok: false, error: '请求失败（HTTP ' + res.status + '）' };
            }

            const body = res.data;
            const msg = body && body.choices && body.choices[0] && body.choices[0].message;
            const content = msg && typeof msg.content === 'string' ? msg.content : '';
            const reasoning = msg && typeof msg.reasoning_content === 'string' ? msg.reasoning_content : '';

            if (!customMode && !devMode) incrementQuota();

            return {
                ok: true,
                content,
                reasoning: reasoning || undefined,
                usage: body.usage || null,
                webSearch: { status: injected.status, engine: injected.engine }
            };
        }
    } catch (err) {
        console.error('[AI] chatCompletion failed:', err.message);
        let userMsg = '请求失败：' + (err.message || '未知错误');
        if (err && err.message && /^HTTP \d+/.test(err.message)) {
            const status = parseInt(err.message.replace(/^HTTP\s*/, ''), 10);
            if (status === 401) userMsg = 'API Key 无效，请检查设置';
            else if (status === 404) userMsg = '模型或接口地址不存在（404）';
            else if (status === 429) userMsg = '请求过于频繁，请稍后再试（429）';
        }
        return { ok: false, error: userMsg };
    }
}

// 从 Readable 读取按行切分的异步迭代器（纯 Node 14+ 可用）
async function* readStreamLines(stream) {
    let pending = [];
    let done = false;
    let resolve = null;
    stream.on('data', (chunk) => {
        pending.push(chunk);
        if (resolve) {
            const r = resolve; resolve = null;
            r(pending); pending = [];
        }
    });
    stream.on('end', () => { done = true; if (resolve) { const r = resolve; resolve = null; r([]); } });
    stream.on('error', (e) => { done = true; if (resolve) { const r = resolve; resolve = null; r([]); } });
    while (true) {
        if (pending.length) {
            const arr = pending; pending = [];
            for (const s of arr) yield s;
        } else if (done) {
            return;
        } else {
            const arr = await new Promise((r) => { resolve = r; });
            for (const s of arr) yield s;
        }
    }
}

module.exports = {
    chatCompletion,
    getQuotaInfo,
    webSearch,
    buildPromptWithWebSearch,
    parseSearchPageHtml,
    parseBaiduMobileHtml,
    searchBingHtml,
    searchBaiduMobile,
    tokenizeQuery,
    scoreResult,
    normalizeResult,
    cleanHtmlTags,
    MAX_MESSAGE_LENGTH,
    DEFAULT_DAILY_LIMIT,
    DEFAULT_MODEL,
    DEFAULT_API_KEY
};
