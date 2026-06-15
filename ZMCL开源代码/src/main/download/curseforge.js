const axios = require('axios');

/**
 * CurseForge 搜索层（支持中文关键词扩展 + 分页 + 策略回退）
 *
 * CurseForge 官方 API 需要申请 key，我们使用第三方反代：
 *   - https://api.curse.tools/v1/cf/...
 *   - https://cf.way2muchnoise.eu/  (用于文件直链)
 *
 * 为了避免对第三方服务强依赖，这里做了：
 *   - 严格 try/catch，失败时返回空结果而非抛出异常
 *   - 超时较短，避免用户等待太久
 *   - 多轮策略搜索：全部条件 -> 放宽版本/加载器 -> 仅关键词 -> 空关键词浏览
 */

const API_BASE = 'https://api.curse.tools/v1/cf';

const DEFAULT_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'ZenithLauncher/1.0'
};

/** Modrinth 项目类型 -> CurseForge classId / gameVersionTypeId */
const CLASS_MAP = {
  mod: { classId: 6, slug: 'mc-mods' },
  modpack: { classId: 4471, slug: 'modpacks' },
  resourcepack: { classId: 12, slug: 'texture-packs' },
  shader: { classId: 6552, slug: 'shaders' },
  datapack: { classId: 6552, slug: 'datapacks' },
  world: { classId: 17, slug: 'worlds' }
};

/** 中文 -> 英文同义词（用于 CurseForge 搜索时增强中文命中） */
const CN_TO_EN = {
  '小地图': 'minimap',
  '地图': 'map world',
  '物品': 'item',
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
  '优化': 'optimization performance',
  '性能': 'performance optimization',
  '建筑': 'building architecture',
  '装饰': 'decoration cosmetic',
  '存储': 'storage inventory',
  '能源': 'energy power',
  '食物': 'food',
  '生物': 'mob creature',
  '维度': 'dimension',
  '传送': 'teleport teleportation waypoint',
  '机械': 'machine mechanical',
  '工业': 'industry industrial',
  '末影': 'ender end',
  '下界': 'nether',
  '村民': 'villager',
  '药水': 'potion',
  '红石': 'redstone',
  '暮色': 'twilight',
  '农场': 'farm',
  '经验': 'experience xp',
  '方块': 'block',
  '任务': 'quest',
  '矿物': 'ore mineral',
  '矿石': 'ore',
  '机械动力': 'create',
  '沉浸工程': 'immersive engineering',
  '通用机械': 'mekanism',
  '应用能源': 'applied energistics ae2',
  '热力': 'thermal',
  '末影接口': 'ender io',
  '工业2': 'ic2 industrial craft',
  '林业': 'forestry',
  '枪械': 'gun weapon',
  '战斗': 'combat battle',
  '动画': 'animation',
  '粒子': 'particle',
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
  '符文': 'rune',
  '奥术': 'arcane',
  '神秘时代': 'thaumcraft',
  '匠魂': 'tinkers construct tinkers',
  '工具': 'tool',
  '武器': 'weapon',
  '弓': 'bow',
  '剑': 'sword',
  '防具': 'armor',
  '盔甲': 'armor',
  '农业': 'agriculture farming',
  '钓鱼': 'fishing',
  '宠物': 'pet',
  '狼': 'wolf dog',
  '猫': 'cat',
  '马': 'horse',
  '末影龙': 'ender dragon',
  '凋灵': 'wither',
  '精英怪': 'elite mob',
  '怪物': 'monster',
  '钠': 'sodium optimization',
  '高性能': 'high performance',
  '卡顿': 'lag stutter',
  '帧率': 'fps frame rate',
  '加速': 'speed acceleration',
  'fabric': 'fabric mod',
  'forge': 'forge mod',
  'neoforge': 'neoforge mod',
  'quilt': 'quilt mod'
};

/** 混合语言分词：把 "中文English混合" 拆成 ["中文", "English"] */
function splitMixedLanguageTokens(query) {
  if (!query) return [];
  const rawTokens = String(query).split(/[\s,，、。.;:!?！？()（）]+/).filter(Boolean);
  const result = [];
  for (const token of rawTokens) {
    const parts = token.match(/[\u4e00-\u9fa5]+|[a-zA-Z0-9]+/g);
    if (parts) {
      for (const p of parts) result.push(p);
    } else {
      result.push(token);
    }
  }
  return result;
}

/** 中文关键词扩展（增强版，支持混合语言输入） */
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

function getClass(type) {
  return CLASS_MAP[type] || CLASS_MAP.mod;
}

function normalizeMod(mod) {
  const logo = (mod.logo && mod.links.websiteUrl) || (mod.links && mod.links.websiteUrl) || '';
  const authors = (mod.authors || []).map(a => a.name).join(', ');
  const categorySlugs = (mod.categories || []).map(c => c.name || c.slug);
  const gameVersions = (mod.latestFilesIndexes || [])
    .map(f => f.gameVersion)
    .filter(Boolean);
  const loaders = (mod.latestFilesIndexes || [])
    .map(f => f.modLoader)
    .filter(Boolean);
  return {
    source: 'curseforge',
    projectId: mod.id,
    slug: mod.slug,
    title: mod.name,
    description: mod.summary || '',
    categories: categorySlugs,
    displayCategories: categorySlugs,
    versions: [],
    gameVersions: [...new Set(gameVersions)].slice(0, 5),
    loaders: [...new Set(loaders)].slice(0, 5),
    downloads: mod.downloadCount || 0,
    followers: 0,
    author: authors,
    iconUrl: logo,
    projectUrl: mod.links && mod.links.websiteUrl ? mod.links.websiteUrl : `https://www.curseforge.com/minecraft/mc-mods/${mod.slug}`,
    dateCreated: mod.dateCreated,
    dateModified: mod.dateModified,
    latestVersion: '',
    projectType: 'mod',
    dependencies: normalizeDependencies(mod.dependencies)
  };
}

/**
 * CurseForge dependencies -> 通用格式
 * relationType 参考 CurseForge API 文档:
 *   1 = EmbeddedLibrary, 2 = OptionalDependency, 3 = RequiredDependency,
 *   4 = Tool, 5 = Incompatible, 6 = Include
 */
function normalizeDependencies(rawDeps = []) {
  if (!Array.isArray(rawDeps) || rawDeps.length === 0) return [];
  const RTYPE_MAP = {
    1: 'embedded',
    2: 'optional',
    3: 'required',
    4: 'tool',
    5: 'incompatible',
    6: 'include'
  };
  return rawDeps
    .filter(Boolean)
    .map((d) => ({
      projectId: d.modId != null ? String(d.modId) : null,
      versionId: d.fileId != null ? String(d.fileId) : null,
      dependencyType: RTYPE_MAP[d.relationType] || 'unknown'
    }))
    .filter((d) => d.projectId);
}

/** 内部单轮搜索（不做策略回退） */
async function searchOne(params) {
  const {
    query = '', type, gameVersion = '', loader = '', limit = 30, offset = 0, sortField = 6
  } = params || {};

  const { classId } = getClass(type || 'mod');

  const apiParams = {
    gameId: 432, // Minecraft
    classId,
    pageSize: limit,
    index: offset, // CurseForge API: index = 从 0 开始的偏移量
    sortOrder: 'desc',
    sortField // 6 = Popularity, 2 = Downloads, 4 = Updated
  };
  if (query) apiParams.searchFilter = String(query);
  if (gameVersion) apiParams.gameVersion = gameVersion;
  if (loader) {
    const ml = mapLoader(loader);
    if (ml != null) apiParams.modLoaderType = ml;
  }

  try {
    const response = await axios.get(`${API_BASE}/mods/search`, {
      params: apiParams,
      timeout: 15000,
      headers: DEFAULT_HEADERS
    });
    const mods = (response.data && response.data.data) || [];
    const pagination = (response.data && response.data.pagination) || {};
    const total = Number(pagination.totalCount != null ? pagination.totalCount : (mods.length >= limit ? mods.length * 5 : mods.length));
    const items = mods.map(normalizeMod);
    return { items, total, totalHits: total, limit, offset };
  } catch (err) {
    return { items: [], total: 0, totalHits: 0, limit, offset, error: err.message || 'search failed' };
  }
}

/**
 * 搜索 CurseForge 项目（带中文关键词扩展 + 策略回退 + 分页）
 */
async function searchProjects(options = {}) {
  const type = resolveType(options.type || 'mod');
  const rawQuery = (options.query || '').trim();
  const gameVersion = options.gameVersion || '';
  const loader = options.loader || '';
  const limit = Math.min(Number(options.limit) || 30, 50);
  const offset = Number(options.offset) || 0;

  const expandedQuery = expandChineseKeywords(rawQuery);
  const hasChinese = /[\u4e00-\u9fa5]/.test(rawQuery);

  // 多轮策略：严格 -> 宽松
  // 如果查询包含中文，优先使用扩展后的查询（中文+英文同义词）
  const strategies = hasChinese
    ? [
        { query: expandedQuery, type, gameVersion, loader, desc: 'expanded-full' },
        { query: expandedQuery, type, gameVersion, loader: '', desc: 'expanded-no-loader' },
        { query: expandedQuery, type, gameVersion: '', loader: '', desc: 'expanded-type-only' },
        { query: expandedQuery, type, gameVersion: '', loader: '', desc: 'expanded' },
        { query: expandedQuery, type: '', gameVersion: '', loader: '', desc: 'expanded-no-type' },
        { query: rawQuery, type, gameVersion, loader, desc: 'raw-full' },
        { query: rawQuery, type: '', gameVersion: '', loader: '', desc: 'raw-bare' }
      ]
    : [
        { query: rawQuery, type, gameVersion, loader, desc: 'full' },
        { query: rawQuery, type, gameVersion, loader: '', desc: 'no-loader' },
        { query: rawQuery, type, gameVersion: '', loader: '', desc: 'type-only' },
        { query: expandedQuery, type, gameVersion: '', loader: '', desc: 'expanded' },
        { query: expandedQuery, type: '', gameVersion: '', loader: '', desc: 'expanded-no-type' },
        { query: rawQuery, type: '', gameVersion: '', loader: '', desc: 'bare-keyword' }
      ];

  // 无关键词时只跑浏览策略（按热度排序）
  const effectiveStrategies = rawQuery ? strategies : [
    { query: '', type, gameVersion, loader, desc: 'browse' },
    { query: '', type, gameVersion: '', loader: '', desc: 'browse-no-filter' }
  ];

  for (const strat of effectiveStrategies) {
    const result = await searchOne({
      query: strat.query,
      type: strat.type || type,
      gameVersion: strat.gameVersion,
      loader: strat.loader,
      limit,
      offset
    });
    if (result.items && result.items.length > 0) {
      return {
        source: 'curseforge',
        strategy: strat.desc,
        items: result.items,
        total: result.total,
        totalHits: result.totalHits,
        limit,
        offset
      };
    }
  }

  return {
    source: 'curseforge',
    strategy: 'empty',
    items: [],
    total: 0,
    totalHits: 0,
    limit,
    offset
  };
}

function mapLoader(loader) {
  // CurseForge modLoaderType 枚举：1=Forge 2=Cauldron 3=LiteLoader 4=Fabric 5=Quilt 6=NeoForge 7=Rift
  const norm = (loader || '').toLowerCase().trim();
  if (!norm) return undefined;
  const map = {
    forge: 1,
    fabric: 4,
    quilt: 5,
    neoforge: 6,
    rift: 7,
    'cauldron': 2,
    'liteloader': 3
  };
  return map[norm];
}

/**
 * 获取 CurseForge 项目详情（不做文件下载，只用于查看基本信息）
 */
async function getProject(projectId) {
  try {
    const response = await axios.get(`${API_BASE}/mods/${projectId}`, {
      timeout: 15000,
      headers: DEFAULT_HEADERS
    });
    const mod = response.data && response.data.data;
    if (!mod) throw new Error('project not found');
    return normalizeMod(mod);
  } catch (err) {
    throw new Error(`CurseForge project ${projectId} load failed: ${err.message}`);
  }
}

/**
 * 获取项目版本/文件列表（用于下载）
 */
async function getProjectVersions(projectId, filters = {}) {
  try {
    const { gameVersion, loader } = filters || {};
    const params = {};
    if (gameVersion) params.gameVersion = gameVersion;
    if (loader) params.modLoaderType = mapLoader(loader);

    const response = await axios.get(`${API_BASE}/mods/${projectId}/files`, {
      params,
      timeout: 15000,
      headers: DEFAULT_HEADERS
    });
    const files = (response.data && response.data.data) || [];
    return files.slice(0, 20).map(f => {
      const dl = f.downloadUrl || (f.id ? `https://www.curseforge.com/api/v1/mods/${projectId}/files/${f.id}/download` : null);
      return {
        source: 'curseforge',
        versionId: f.id,
        projectId,
        name: f.displayName || f.fileName || '',
        versionNumber: f.displayName || '',
        changelog: '',
        datePublished: f.fileDate,
        downloads: 0,
        gameVersions: f.gameVersions || [],
        loaders: [],
        type: f.releaseType === 1 ? 'release' : f.releaseType === 2 ? 'beta' : 'alpha',
        files: [{ url: dl, fileName: f.fileName, size: f.fileLength }],
        primaryFile: {
          url: dl,
          fileName: f.fileName,
          size: f.fileLength,
          hash: null,
          sha1: null
        },
        dependencies: normalizeDependencies(f.dependencies)
  };
    });
  } catch (err) {
    return [];
  }
}

module.exports = {
  searchProjects,
  getProject,
  getProjectVersions,
  resolveType
};
