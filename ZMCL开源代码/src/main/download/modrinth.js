const axios = require('axios');

const API_BASE = 'https://api.modrinth.com/v2';

const DEFAULT_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'ZenithLauncher/1.0 (+https://github.com/zenith-mc-launcher)'
};

/** 统一类型映射：中文/英文 -> Modrinth project_type */
function resolveType(typeKey) {
  if (!typeKey) return 'mod';
  const norm = String(typeKey).toLowerCase().trim();
  const map = {
    mod: 'mod',
    '模组': 'mod',
    modpack: 'modpack',
    '整合包': 'modpack',
    resourcepack: 'resourcepack',
    '资源包': 'resourcepack',
    shader: 'shader',
    '光影': 'shader',
    datapack: 'datapack',
    '数据包': 'datapack',
    world: 'modpack',
    '世界': 'modpack'
  };
  return map[norm] || 'mod';
}

/** 中文关键词 -> 附加英文同义词（大幅扩充，50+ 条目） */
const CN_TO_EN = {
  '小地图': 'minimap',
  '地图': 'map world',
  '物品': 'item',
  '物品栏': 'inventory',
  '背包': 'inventory bag',
  '附魔': 'enchant enchantment',
  '合成': 'crafting recipe',
  '科技': 'tech technology',
  '魔法': 'magic arcane',
  '冒险': 'adventure rpg',
  '光影': 'shader',
  '资源包': 'resource pack texture pack',
  '数据包': 'data pack datapack',
  '世界': 'world',
  '整合包': 'modpack',
  '模组': 'mod',
  '优化': 'optimization',
  '性能': 'performance optimization',
  '建筑': 'building architecture',
  '装饰': 'decoration cosmetic',
  '存储': 'storage inventory',
  '能源': 'energy power',
  '食物': 'food',
  '生物': 'mob creature',
  '维度': 'dimension',
  '传送': 'teleport teleportation waypoint',
  '自动': 'automation auto',
  '联机': 'multiplayer online',
  '机械': 'machine mechanical',
  '工业': 'industry industrial',
  '末影': 'ender end',
  '下界': 'nether',
  '村民': 'villager',
  '药水': 'potion',
  '红石': 'redstone',
  '末地': 'the end',
  '暮色': 'twilight',
  '天堂': 'aether heaven',
  '地狱': 'nether',
  '农场': 'farm',
  '经验': 'experience xp',
  '经验修补': 'mending',
  '精准采集': 'silk touch',
  '时运': 'fortune',
  '耐久': 'durability unbreaking',
  '保护': 'protection',
  '锋利': 'sharpness',
  '效率': 'efficiency',
  '方块': 'block',
  '任务': 'quest',
  '任务书': 'quest book',
  'ftb': 'ftb feed the beast',
  '矿物': 'ore mineral',
  '矿石': 'ore',
  '矿脉': 'ore vein',
  '机械动力': 'create',
  '沉浸工程': 'immersive engineering',
  '通用机械': 'mekanism',
  '应用能源': 'applied energistics ae2',
  '热力': 'thermal',
  '存储网络': 'storage network refined storage',
  '末影接口': 'ender io',
  '工业2': 'ic2 ic industrial craft',
  '林业': 'forestry',
  '铁路': 'railcraft train',
  '飞机': 'airplane plane',
  '车辆': 'vehicle car',
  '汽车': 'car vehicle',
  '船': 'boat ship',
  '枪械': 'gun weapon',
  '战斗': 'combat battle',
  '坦克': 'tank',
  '动画': 'animation',
  '动画玩家': 'animated player',
  '动画成员': 'animated entity',
  '动画物品': 'animated item',
  '动画方块': 'animated block',
  '粒子': 'particle',
  '效果': 'effect',
  '光影包': 'shader pack',
  '着色器': 'shader',
  '皮肤': 'skin',
  '披风': 'cape',
  '头像': 'avatar',
  '世界生成': 'world generation terrain generation',
  '地形生成': 'terrain generation',
  '生物群系': 'biome',
  '洞穴': 'cave',
  '地牢': 'dungeon',
  '结构': 'structure',
  '战利品': 'loot',
  '箱子': 'chest',
  '升级': 'upgrade',
  '等级': 'level',
  '技能': 'skill',
  '职业': 'class',
  '魔法艺术': 'ars nouveau',
  '符文': 'rune',
  '奥术': 'arcane',
  '神秘时代': 'thaumcraft',
  '神秘学': 'occultism',
  '星辉魔法': 'astral sorcery',
  '血魔法': 'blood magic',
  '植物魔法': 'botania',
  '匠魂': 'tinkers construct tinkers',
  '创造': 'creative',
  '工具': 'tool',
  '武器': 'weapon',
  '弓': 'bow',
  '剑': 'sword',
  '防具': 'armor',
  '盔甲': 'armor',
  '食物工艺': 'food craft',
  '潘马斯': 'pams harvestcraft',
  '丰收物语': 'harvest festival',
  '农业': 'agriculture farming',
  '钓鱼': 'fishing',
  '养殖': 'breeding',
  '宠物': 'pet',
  '狼': 'wolf dog',
  '猫': 'cat',
  '马': 'horse',
  '骆驼': 'camel',
  '末影龙': 'ender dragon',
  '凋灵': 'wither',
  'boss': 'boss',
  '精英怪': 'elite mob',
  '稀有': 'rare',
  '怪物': 'monster',
  '优化模组': 'optimization mod performance mod',
  '钠': 'sodium',
  'sodium': 'sodium optimization',
  '锂': 'lithium',
  'lithium': 'lithium',
  '磷': 'phosphor',
  'phosphor': 'phosphor',
  '高性能': 'high performance',
  '性能优化': 'performance optimization',
  '卡顿': 'lag stutter',
  '帧率': 'fps frame rate',
  'fps': 'fps frame rate',
  '加速': 'speed acceleration',
  '跨平台': 'cross platform',
  '服务器插件': 'server plugin',
  'fabric': 'fabric mod fabric',
  'forge': 'forge mod forge',
  'neoforge': 'neoforge mod neoforge',
  'quilt': 'quilt mod quilt'
};

/**
 * 混合语言分词：把 "中文English混合" 拆成 ["中文", "English"]
 *   - 先按空白/常见分隔符粗分
 *   - 对每个粗分 token 再按"中文字符块 vs ASCII 字符块"细拆
 *   - 用于提升"小地图mod"、"机械动力create"这类无空格混合输入的命中率
 */
function splitMixedLanguageTokens(query) {
  if (!query) return [];
  const rawTokens = String(query).split(/[\s,，、。.;:!?！？()（）]+/).filter(Boolean);
  const result = [];
  for (const token of rawTokens) {
    // 用正则捕获"连续汉字块"和"连续 ASCII 字母数字块"
    const parts = token.match(/[\u4e00-\u9fa5]+|[a-zA-Z0-9]+/g);
    if (parts) {
      for (const p of parts) result.push(p);
    } else {
      result.push(token);
    }
  }
  return result;
}

/**
 * 中文关键词扩展（增强版，支持混合语言输入）：
 *   a. 对输入做混合语言分词，拆出中文/英文片段
 *   b. 对每个中文 token 查 CN_TO_EN 词典，命中则附加其英文同义词
 *   c. 英文 token 直接保留（用户可能直接输英文，或已经是"机械动力mod"混写）
 *   d. 返回组合查询：原始输入 + 扩展英文词
 *   e. 如果全是"未命中词典的中文"，附加 "minecraft mod" 作为兜底
 */
function expandChineseKeywords(query) {
  if (!query) return '';
  const trimmed = String(query).trim();
  if (!trimmed) return '';

  const tokens = splitMixedLanguageTokens(trimmed);
  const hasChinese = /[\u4e00-\u9fa5]/.test(trimmed);

  const englishTerms = new Set();
  let expandedCount = 0;
  let chineseTokenCount = 0;

  for (const token of tokens) {
    if (/[\u4e00-\u9fa5]/.test(token)) {
      chineseTokenCount++;
      const lower = token.toLowerCase();
      if (CN_TO_EN[lower]) {
        const terms = CN_TO_EN[lower].split(/\s+/);
        for (const t of terms) {
          if (t) englishTerms.add(t);
        }
        expandedCount++;
      }
    } else {
      // 纯英文 token 直接保留（已在原 query 中包含，无需重复）
      englishTerms.add(token);
    }
  }

  const enString = Array.from(englishTerms).join(' ');

  // 全是中文且没有任何词典命中 -> 附加通用兜底
  if (hasChinese && chineseTokenCount > 0 && expandedCount === 0 && englishTerms.size === 0) {
    return `${trimmed} minecraft mod`;
  }

  // 有命中词典的中文词 -> 组合原 query + 同义词扩展
  if (englishTerms.size > 0) {
    return `${trimmed} ${enString}`;
  }

  return trimmed;
}

/**
 * 构造 Modrinth facet 数组
 * 注意：顶层数组各元素之间是 AND 关系，子数组内部是 OR
 */
function buildFacets({ type, gameVersion, loader }) {
  const facets = [];
  if (type) facets.push([`project_type:${type}`]);
  if (gameVersion) facets.push([`versions:${gameVersion}`]);
  if (loader) facets.push([`loaders:${loader}`]);
  return facets;
}

/** 将 hits 规范化为统一字段 */
function normalizeHits(hits = [], type) {
  return hits.map(h => ({
    source: 'modrinth',
    projectId: h.project_id || h.slug,
    slug: h.slug,
    title: h.title,
    description: h.description,
    categories: h.categories || [],
    displayCategories: h.display_categories || h.categories || [],
    versions: h.versions || [],
    gameVersions: h.game_versions || [],
    loaders: h.loaders || [],
    downloads: h.downloads || 0,
    followers: h.follows || 0,
    author: h.author,
    iconUrl: h.icon_url,
    projectUrl: `https://modrinth.com/${h.project_type || type || 'mod'}/${h.slug}`,
    dateCreated: h.date_created,
    dateModified: h.date_modified,
    latestVersion: h.latest_version,
    projectType: h.project_type || type,
    // 卡片层可能没有 dependencies（只有 version 才会有），这里留空
    dependencies: []
  }));
}

/**
 * 规范化依赖数据：将 Modrinth API 返回的 dependencies 数组统一成通用结构
 * 每个元素: { projectId, versionId, dependencyType }
 * dependencyType: 'required' | 'optional' | 'incompatible' | 'embedded' | 'unknown'
 */
function normalizeDependencies(rawDeps = []) {
  return rawDeps
    .filter(Boolean)
    .map((d) => {
      const type = String(d.dependency_type || d.dependencyType || 'unknown').toLowerCase();
      return {
        projectId: d.project_id || d.projectId || null,
        versionId: d.version_id || d.versionId || null,
        dependencyType: type
      };
    })
    .filter((d) => d.projectId);
}

/**
 * 执行一次搜索请求
 * @param {Object} params - 查询参数
 * @param {string} params.query - 关键词
 * @param {string} params.type - mod / resourcepack / shader / datapack / modpack
 * @param {string} params.gameVersion - 游戏版本
 * @param {string} params.loader - 加载器
 * @param {number} params.limit
 * @param {number} params.offset
 * @param {'relevance'|'downloads'|'updated'} params.index
 * @param {string[]} [params.projectTypes - 可选的项目类型数组，用于放宽类型限制
 */
async function searchOne(params) {
  const {
    query = '', type, gameVersion = '', loader = '', limit = 20, offset = 0, index = 'relevance', projectTypes
  } = params || {};

  const facets = [];
  if (Array.isArray(projectTypes) && projectTypes.length > 0) {
    facets.push(projectTypes.map(t => `project_type:${t}`));
  } else if (type) {
    facets.push([`project_type:${type}`]);
  }
  if (gameVersion) facets.push([`versions:${gameVersion}`]);
  if (loader) facets.push([`loaders:${loader}`]);

  const queryParams = new URLSearchParams();
  if (query) queryParams.set('query', String(query));
  queryParams.set('limit', String(limit));
  queryParams.set('offset', String(offset));
  if (facets.length) queryParams.set('facets', JSON.stringify(facets));
  queryParams.set('index', index);

  const url = `${API_BASE}/search?${queryParams.toString()}`;

  const response = await axios.get(url, {
    timeout: 25000,
    headers: DEFAULT_HEADERS,
    paramsSerializer: (p) => p && Object.keys(p).length ? new URLSearchParams(p).toString() : ''
  });

  const hits = (response.data && response.data.hits) || [];
  const total = (response.data && response.data.total_hits) || 0;
  return { hits, total, totalHits: total, items: normalizeHits(hits, type) };
}

/**
 * 搜索 Modrinth 项目 - 带智能回退 & 中文增强
 * 策略：
 *   1) 使用用户提供的全部条件搜索
 *   2) 如果结果 < 5 且有 loader 限制，放宽 loader
 *   3) 如果仍 < 5 且有 gameVersion 限制，放宽 gameVersion
 *   4) 如果结果为空，尝试中文增强词 + 完全放宽过滤
 */
async function searchProjects(options = {}) {
  const type = resolveType(options.type || 'mod');
  const rawQuery = (options.query || '').trim();
  const gameVersion = options.gameVersion || '';
  const loader = options.loader || '';
  const limit = Math.min(Number(options.limit) || 30, 100);
  const offset = Number(options.offset) || 0;

  const expandedQuery = expandChineseKeywords(rawQuery);
  const hasChinese = /[\u4e00-\u9fa5]/.test(rawQuery);

  // 如果查询包含中文，优先使用扩展后的查询（中文+英文同义词）
  const strategies = hasChinese
    ? [
        { query: expandedQuery, type, gameVersion, loader, desc: 'expanded-full' },
        { query: expandedQuery, type, gameVersion, loader: '', desc: 'expanded-no-loader' },
        { query: expandedQuery, type, gameVersion: '', loader: '', desc: 'expanded-type-only' },
        {
          query: expandedQuery, projectTypes: ['mod', 'modpack', 'resourcepack', 'shader', 'datapack'], desc: 'expanded-all-types'
        },
        { query: expandedQuery, type: '', gameVersion: '', loader: '', desc: 'expanded-any' },
        { query: rawQuery, type, gameVersion, loader, desc: 'raw-full' },
        { query: rawQuery, type: '', gameVersion: '', loader: '', desc: 'raw-bare' }
      ]
    : [
        { query: rawQuery, type, gameVersion, loader, desc: 'full' },
        { query: rawQuery, type, gameVersion, loader: '', desc: 'no-loader' },
        { query: rawQuery, type, gameVersion: '', loader: '', desc: 'type-only' },
        {
          query: expandedQuery, projectTypes: ['mod', 'modpack', 'resourcepack', 'shader', 'datapack'], desc: 'expanded-all-types'
        },
        { query: expandedQuery, type: '', gameVersion: '', loader: '', desc: 'expanded-any' },
        { query: rawQuery, type: '', gameVersion: '', loader: '', desc: 'bare-keyword' }
      ];

  let lastError = null;
  for (const strat of strategies) {
    try {
      const callParams = {
        query: strat.query,
        gameVersion: strat.gameVersion,
        loader: strat.loader,
        limit,
        offset
      };
      if (strat.projectTypes) {
        callParams.projectTypes = strat.projectTypes;
      } else {
        callParams.type = strat.type;
      }
      const result = await searchOne(callParams);
      if (result.items && result.items.length > 0) {
        return {
          source: 'modrinth',
          strategy: strat.desc,
          items: result.items,
          total: result.totalHits,
          totalHits: result.totalHits,
          limit,
          offset
        };
      }
    } catch (err) {
      lastError = err;
      if (err && err.response && err.response.status >= 400 && err.response.status < 500) {
        break;
      }
    }
  }

  if (lastError) {
    return {
      source: 'modrinth',
      strategy: 'failed',
      items: [],
      total: 0,
      totalHits: 0,
      limit,
      offset,
      error: lastError.message || 'search failed'
    };
  }

  return {
    source: 'modrinth',
    strategy: 'empty',
    items: [],
    total: 0,
    totalHits: 0,
    limit,
    offset
  };
}

/** 获取项目详情 */
async function getProject(projectId) {
  const response = await axios.get(`${API_BASE}/project/${projectId}`, {
    timeout: 20000,
    headers: DEFAULT_HEADERS
  });
  const d = response.data;
  return {
    source: 'modrinth',
    projectId: d.id,
    slug: d.slug,
    title: d.title,
    description: d.description,
    body: d.body,
    categories: d.categories || [],
    gameVersions: d.game_versions || [],
    loaders: d.loaders || [],
    downloads: d.downloads || 0,
    followers: d.follows || 0,
    team: d.team,
    iconUrl: d.icon_url,
    projectUrl: `https://modrinth.com/${d.project_type}/${d.slug}`,
    dateCreated: d.published,
    dateModified: d.updated,
    projectType: d.project_type
  };
}

/** 获取项目的可用版本列表 */
async function getProjectVersions(projectId, filters = {}) {
  const { gameVersion, loader } = filters || {};
  const params = {};
  if (gameVersion) params.game_versions = JSON.stringify([gameVersion]);
  if (loader) params.loaders = JSON.stringify([loader]);

  const response = await axios.get(`${API_BASE}/project/${projectId}/version`, {
    params,
    timeout: 20000,
    headers: DEFAULT_HEADERS
  });

  return (response.data || []).map(v => {
    const file = (v.files && v.files[0]) || null;
    return {
      source: 'modrinth',
      versionId: v.id,
      projectId: v.project_id,
      name: v.name,
      versionNumber: v.version_number,
      changelog: v.changelog,
      datePublished: v.date_published,
      downloads: v.downloads,
      gameVersions: v.game_versions || [],
      loaders: v.loaders || [],
      type: v.version_type,
      files: v.files || [],
      primaryFile: file ? {
        url: file.url,
        fileName: file.filename,
        size: file.size,
        hash: (file.hashes && (file.hashes.sha1 || file.hashes.sha512)) || null,
        sha1: file.hashes ? file.hashes.sha1 : null
      } : null,
      dependencies: normalizeDependencies(v.dependencies)
    };
  });
}

/** 获取单个版本详情 */
async function getVersion(versionId) {
  const response = await axios.get(`${API_BASE}/version/${versionId}`, {
    timeout: 20000,
    headers: DEFAULT_HEADERS
  });
  const v = response.data;
  const file = (v.files && v.files[0]) || null;
  return {
    source: 'modrinth',
    versionId: v.id,
    projectId: v.project_id,
    name: v.name,
    versionNumber: v.version_number,
    changelog: v.changelog,
    datePublished: v.date_published,
    downloads: v.downloads,
    gameVersions: v.game_versions || [],
    loaders: v.loaders || [],
    type: v.version_type,
    files: v.files || [],
    primaryFile: file ? {
      url: file.url,
      fileName: file.filename,
      size: file.size,
      hash: (file.hashes && (file.hashes.sha1 || file.hashes.sha512)) || null,
      sha1: file.hashes ? file.hashes.sha1 : null
    } : null,
    dependencies: normalizeDependencies(v.dependencies)
  };
}

module.exports = {
  searchProjects,
  getProject,
  getProjectVersions,
  getVersion,
  resolveType,
  expandChineseKeywords
};
