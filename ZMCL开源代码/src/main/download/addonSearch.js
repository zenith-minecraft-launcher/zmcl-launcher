const modrinth = require('./modrinth');
const curseforge = require('./curseforge');
const mcmod = require('./mcmod');

/**
 * 可用的内容源
 *   - modrinth : Modrinth (免费 API，推荐默认)
 *   - curseforge : CurseForge (通过反代，搜索结果不如 Modrinth 好)
 *   - all : 同时搜索多个源，并按下载量合并
 */
const AVAILABLE_SOURCES = [
  { key: 'modrinth', name: 'Modrinth', description: '开源 Minecraft 内容社区（推荐）' },
  { key: 'curseforge', name: 'CurseForge', description: '老牌 Minecraft 内容社区' },
  { key: 'all', name: '全部源', description: '同时搜索所有源并合并结果' }
];

function getAvailableSources() {
  return AVAILABLE_SOURCES.slice();
}

/**
 * 将中文信息注入到 items 数组（给 title/description 增加 zh 版本）
 * items 会被原地改写，新增 titleZh / descriptionZh 字段（仅在获取到中文时）
 */
function attachChineseInfoToItems(items, chineseInfo) {
  if (!Array.isArray(items) || !chineseInfo) return items;
  for (const it of items) {
    if (!it) continue;
    const id = (it.projectId || '') + '|' + (it.slug || '');
    const info = chineseInfo[id] || chineseInfo[it.title];
    if (!info) continue;
    if (info.titleZh) it.titleZh = info.titleZh;
    if (info.descriptionZh) it.descriptionZh = info.descriptionZh;
  }
  return items;
}

/**
 * 搜索并获取中文信息（使用 MC百科）
 * 不阻塞主搜索流程，中文信息异步获取
 */
async function searchWithChineseInfo(options = {}) {
  const result = await search(options);
  if (!result.items || result.items.length === 0) {
    return { ...result, chineseInfo: {} };
  }

  // 准备需要查询中文信息的列表
  const toQuery = result.items
    .filter(it => it.title && !isChineseText(it.title))
    .map(it => ({
      id: (it.projectId || '') + '|' + (it.slug || ''),
      title: it.title,
      slug: it.slug,
      description: it.description
    }));

  // 获取中文信息（限制数量，避免请求过多）
  const limitedQuery = toQuery.slice(0, 15);
  const chineseInfo = await mcmod.getChineseInfoBatch(limitedQuery);

  attachChineseInfoToItems(result.items, chineseInfo);

  return { ...result, chineseInfo };
}

/**
 * 判断文本是否主要是中文
 */
function isChineseText(text) {
  if (!text) return false;
  const chineseCount = (String(text).match(/[\u4e00-\u9fa5]/g) || []).length;
  const totalChars = String(text).replace(/\s/g, '').length;
  if (totalChars === 0) return false;
  return chineseCount / totalChars > 0.3;
}

/**
 * 统一搜索
 * @param {Object} options
 * @param {string} options.source  - 'modrinth' | 'curseforge' | 'all'
 * @param {string} options.type    - mod / resourcepack / shader / datapack / modpack
 * @param {string} options.query   - 关键词（支持中文）
 * @param {string} options.gameVersion
 * @param {string} options.loader
 * @param {number} options.limit
 * @param {number} options.offset
 */
async function search(options = {}) {
  const source = (options.source || 'modrinth').toLowerCase();
  const limit = Math.min(Number(options.limit) || 30, 100);
  const offset = Number(options.offset) || 0;

  const opts = {
    type: options.type,
    query: options.query,
    gameVersion: options.gameVersion,
    loader: options.loader,
    limit,
    offset
  };

  if (source === 'curseforge') {
    const r = await curseforge.searchProjects(opts);
    const totalHits = Number(r.totalHits != null ? r.totalHits : (r.total != null ? r.total : r.items.length));
    return {
      sources: ['curseforge'],
      items: r.items,
      total: r.items.length,
      totalHits,
      strategies: { curseforge: r.strategy }
    };
  }

  if (source === 'modrinth') {
    const r = await modrinth.searchProjects(opts);
    const totalHits = Number(r.totalHits != null ? r.totalHits : (r.total != null ? r.total : r.items.length));
    return {
      sources: ['modrinth'],
      items: r.items,
      total: r.items.length,
      totalHits,
      strategies: { modrinth: r.strategy }
    };
  }

  // all - 同时搜索（并发），然后合并去重
  const [modrinthResult, curseforgeResult] = await Promise.allSettled([
    modrinth.searchProjects(opts),
    curseforge.searchProjects(opts)
  ]);

  const mItems = modrinthResult.status === 'fulfilled' ? (modrinthResult.value.items || []) : [];
  const cItems = curseforgeResult.status === 'fulfilled' ? (curseforgeResult.value.items || []) : [];

  const mTotal = modrinthResult.status === 'fulfilled'
    ? (modrinthResult.value.totalHits != null ? modrinthResult.value.totalHits : (modrinthResult.value.total || 0))
    : 0;
  const cTotal = curseforgeResult.status === 'fulfilled'
    ? (curseforgeResult.value.totalHits != null ? curseforgeResult.value.totalHits : (curseforgeResult.value.total || 0))
    : 0;
  const totalHits = mTotal + cTotal;

  // 去重：按 title 小写合并，Modrinth 优先
  const seen = new Set();
  const items = [];
  for (const it of mItems) {
    if (!it.title) continue;
    const key = String(it.title).toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      items.push(it);
    }
  }
  for (const it of cItems) {
    if (!it.title) continue;
    const key = String(it.title).toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      items.push(it);
    }
  }

  // 按下载量排序
  items.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));

  return {
    sources: ['modrinth', 'curseforge'],
    items: items.slice(0, limit),
    total: items.length,
    totalHits,
    strategies: {
      modrinth: modrinthResult.status === 'fulfilled' ? modrinthResult.value.strategy : 'failed',
      curseforge: curseforgeResult.status === 'fulfilled' ? curseforgeResult.value.strategy : 'failed'
    }
  };
}

/**
 * 获取项目详情（自动路由到对应的源）
 */
async function getProject(projectId, source) {
  const src = (source || 'modrinth').toLowerCase();
  if (src === 'curseforge') return curseforge.getProject(projectId);
  return modrinth.getProject(projectId);
}

/**
 * 获取项目版本列表
 */
async function getProjectVersions(projectId, source, filters = {}) {
  const src = (source || 'modrinth').toLowerCase();
  if (src === 'curseforge') return curseforge.getProjectVersions(projectId, filters);
  return modrinth.getProjectVersions(projectId, filters);
}

/**
 * 批量解析依赖详情（用于在下载前展示"前置模组"）
 * 输入: dependencies = [{ projectId, versionId, dependencyType, source }]
 * 输出: 同名数组，每个元素补充字段 { title, projectUrl, iconUrl, installed, enabled }
 *
 * 工作流程:
 *   1. 按源分组，分别调用 project 详情接口
 *   2. 读取本机对应目录的文件列表，按文件名 / 前缀匹配判断安装状态
 */
async function getDependencyDetails(dependencies, opts = {}) {
  if (!Array.isArray(dependencies) || dependencies.length === 0) return [];
  const type = opts.type || 'mod';

  // 先读取一次本地已安装的文件，做一次字符串匹配（用于 installed / enabled 判定）
  let installedFiles = [];
  try {
    const addonDownload = require('./addon');
    installedFiles = addonDownload.listInstalled(type) || [];
  } catch (e) {
    installedFiles = [];
  }

  // 规范化: 按 projectId 去重
  const seen = new Set();
  const uniqDeps = [];
  for (const d of dependencies) {
    if (!d || !d.projectId) continue;
    const key = String(d.projectId);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqDeps.push(d);
  }

  // 并发获取各依赖项目详情
  const results = await Promise.allSettled(
    uniqDeps.map(async (dep) => {
      const src = (dep.source || 'modrinth').toLowerCase();
      try {
        const project = src === 'curseforge'
          ? await curseforge.getProject(dep.projectId)
          : await modrinth.getProject(dep.projectId);
        const displayName = project && project.title ? String(project.title).toLowerCase() : '';
        // 匹配本地文件：判断文件名（不含 .disabled）是否包含项目 title 关键词
        // 更稳妥做法：精确匹配 slug / projectId（若用户之前通过本启动器下载）
        const matched = installedFiles.find((f) => {
          if (!f || !f.name) return false;
          const name = f.name.toLowerCase();
          // 命中条件: 文件名中包含项目 title 的前 4 个字符以上
          if (displayName && displayName.length >= 4 && name.includes(displayName)) return true;
          // 或按 slug 匹配
          if (project && project.slug && name.includes(String(project.slug).toLowerCase())) return true;
          return false;
        });
        return {
          projectId: dep.projectId,
          versionId: dep.versionId || null,
          dependencyType: dep.dependencyType || 'unknown',
          source: src,
          title: (project && project.title) || dep.projectId,
          projectUrl: (project && project.projectUrl) || null,
          iconUrl: (project && project.iconUrl) || null,
          slug: (project && project.slug) || null,
          installed: !!matched,
          enabled: matched ? !!matched.enabled : false,
          fileName: matched ? matched.name : null
        };
      } catch (e) {
        return {
          projectId: dep.projectId,
          versionId: dep.versionId || null,
          dependencyType: dep.dependencyType || 'unknown',
          source: src,
          title: dep.projectId,
          projectUrl: null,
          iconUrl: null,
          slug: null,
          installed: false,
          enabled: false,
          fileName: null,
          error: e.message
        };
      }
    })
  );

  return results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value);
}

module.exports = {
  search,
  getProject,
  getProjectVersions,
  getDependencyDetails,
  searchWithChineseInfo,
  getAvailableSources
};
