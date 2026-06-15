/**
 * 中文模组信息库
 * 使用本地热门模组中英文映射表（基于 MC百科 标准译名）
 * 覆盖常见的 250+ 热门模组
 *
 * 匹配策略（按优先级）：
 *   1. 精确匹配英文名
 *   2. slug 精确匹配（从搜索结果的 slug 字段匹配）
 *   3. 简化名精确匹配（去除空格/连字符/大小写）
 *   4. 包含匹配：模组名包含映射表中的关键词
 *   5. 反向包含匹配：映射表中的某个词包含模组名
 */

// ============ 中文模组映射表 ============
// 格式: "英文模组名 (可能带版本/平台)" -> { titleZh, descriptionZh }
const MOD_ZH_MAP = {
  // ===== Fabric / 基础 / 性能优化 =====
  'Indium': { titleZh: '铟', descriptionZh: 'Sodium 的渲染扩展，提供 FRAPI 兼容性支持' },
  'Roughly Enough Items': { titleZh: '物品百科', descriptionZh: 'REI，流行的物品与合成查询模组' },
  'Roughly Enough Items (REI)': { titleZh: '物品百科', descriptionZh: 'REI，流行的物品与合成查询模组' },
  'JEI (Forge)': { titleZh: '物品合成查询 (Forge)', descriptionZh: 'Just Enough Items，游戏内物品及合成配方查询工具' },
  'JEI (Fabric)': { titleZh: '物品合成查询 (Fabric)', descriptionZh: 'Just Enough Items，游戏内物品及合成配方查询工具' },
  'Cloth Config': { titleZh: '布料配置', descriptionZh: '模组配置界面库' },
  'Cloth Config (Fabric)': { titleZh: '布料配置', descriptionZh: '模组配置界面库' },
  'Just Another Rope Bridge': { titleZh: '只是一座绳索桥', descriptionZh: '添加可建造的绳索桥' },
  'Just Another Rope Bridge!': { titleZh: '只是一座绳索桥', descriptionZh: '添加可建造的绳索桥' },
  'No Chat Reports (Fabric)': { titleZh: '无聊天报告 (Fabric)', descriptionZh: '禁用聊天报告功能以保护隐私' },
  'No Chat Reports (Forge)': { titleZh: '无聊天报告 (Forge)', descriptionZh: '禁用聊天报告功能以保护隐私' },
  'LazyDFU (Fabric)': { titleZh: '惰性数据固定器 (Fabric)', descriptionZh: '延迟数据固定器初始化以加快启动' },
  'Lazy DFU': { titleZh: '惰性数据固定器', descriptionZh: '延迟数据固定器初始化以加快启动' },
  'Iris & Oculus Flywheel Compat': { titleZh: '鸢尾与 Oculus 飞轮兼容性', descriptionZh: '光影模组兼容性补丁' },
  'Fabric Language Kotlin (1.20.x)': { titleZh: 'Fabric Kotlin 语言 (1.20.x)', descriptionZh: '在 Fabric 上使用 Kotlin 编写模组' },
  'Fabric Language Kotlin (1.21.x)': { titleZh: 'Fabric Kotlin 语言 (1.21.x)', descriptionZh: '在 Fabric 上使用 Kotlin 编写模组' },
  'Sodium': { titleZh: '钠', descriptionZh: '大幅提升渲染性能的高性能优化模组' },
  'Sodium Extra': { titleZh: '钠：扩展', descriptionZh: '为钠添加更多视频设置选项' },
  'Lithium': { titleZh: '锂', descriptionZh: '优化服务端性能，提升服务器运行效率' },
  'Phosphor': { titleZh: '磷', descriptionZh: '优化光照系统性能' },
  'Hydrogen': { titleZh: '氢', descriptionZh: '优化内存使用和数据存储' },
  'Iris Shaders': { titleZh: '鸢尾光影', descriptionZh: '高性能光影包加载器，兼容 OptiFine 光影包' },
  'Iris': { titleZh: '鸢尾光影', descriptionZh: '高性能光影包加载器，兼容 OptiFine 光影包' },
  'Canvas Renderer': { titleZh: '画布渲染器', descriptionZh: '高级渲染系统，支持各种视觉效果' },
  'Starlight (Fabric)': { titleZh: '星光', descriptionZh: '重写光照引擎，提升性能' },
  'FerriteCore': { titleZh: '铁氧体核心', descriptionZh: '内存使用优化模组，显著降低内存占用' },
  'FerriteCore (Fabric)': { titleZh: '铁氧体核心 (Fabric)', descriptionZh: '内存使用优化模组，降低内存占用' },
  'Fabric API': { titleZh: 'Fabric 应用程序接口', descriptionZh: 'Fabric 模组加载器的核心 API 库' },
  'Fabric Loader': { titleZh: 'Fabric 加载器', descriptionZh: '轻量级模块化的 Minecraft 模组加载器' },
  'Quilt Standard Libraries': { titleZh: 'Quilt 标准库', descriptionZh: 'Quilt 加载器的标准库' },
  'Quilted Fabric API': { titleZh: 'Quilt 版 Fabric API', descriptionZh: '适用于 Quilt 加载器的 Fabric API 分支' },
  'Balm': { titleZh: '香膏', descriptionZh: '跨加载器开发工具库' },
  'Architectury API': { titleZh: '架构 API', descriptionZh: '跨加载器开发框架' },
  'MixinExtras': { titleZh: 'Mixin 扩展', descriptionZh: 'Mixin 系统的扩展库' },
  'Connector': { titleZh: '连接器', descriptionZh: '在 Forge 上运行 Fabric 模组' },
  'Sinytra Connector': { titleZh: 'Sinytra 连接器', descriptionZh: '在 Forge 上运行 Fabric 模组' },
  'Fabric Language Kotlin': { titleZh: 'Fabric Kotlin 语言', descriptionZh: '在 Fabric 上使用 Kotlin 编写模组' },

  // ===== Forge / NeoForge 基础 =====
  'Forge': { titleZh: 'Forge 加载器', descriptionZh: '经典的 Minecraft Mod 加载器' },
  'NeoForge': { titleZh: 'NeoForge 加载器', descriptionZh: '由 Forge 社区分支开发的新一代模组加载器' },
  'NeoForge Mod Loader': { titleZh: 'NeoForge 模组加载器', descriptionZh: '新一代 Forge 分支加载器' },

  // ===== 性能/优化 =====
  'Entity Culling': { titleZh: '实体剔除', descriptionZh: '使用异步光线追踪隐藏不可见方块/实体，大幅提升性能' },
  'EntityCulling': { titleZh: '实体剔除', descriptionZh: '使用异步光线追踪隐藏不可见方块/实体' },
  'Not Enough Crashes': { titleZh: '拒绝崩溃', descriptionZh: '优化崩溃处理，崩溃后可保留世界并继续游戏' },
  'Clumps': { titleZh: '经验聚合', descriptionZh: '将散落的经验球合并为一个大的经验球，减少卡顿' },
  'FastFurnace': { titleZh: '快速熔炉', descriptionZh: '优化熔炉的工作效率，减少 TPS 占用' },
  'FastWorkbench': { titleZh: '快速工作台', descriptionZh: '优化工作台性能，减少卡顿' },
  'Performant': { titleZh: '高性能', descriptionZh: '多方面优化游戏性能' },
  'AI Improvements': { titleZh: 'AI 改进', descriptionZh: '优化实体 AI 计算，提升服务器性能' },
  'Better FPS - Render Distance': { titleZh: '更好的帧率 - 渲染距离', descriptionZh: '性能优化模组' },
  'Surge': { titleZh: '涌动', descriptionZh: '多项游戏性能和稳定性优化' },
  'FoamFix': { titleZh: '泡沫修复', descriptionZh: '内存和性能优化' },
  'OptiFine': { titleZh: '光影优化', descriptionZh: '经典优化模组，支持光影、动态光照等' },
  'OptiForge': { titleZh: 'OptiForge', descriptionZh: '让 OptiFine 在 Forge 上运行' },
  'OptiFabric': { titleZh: 'OptiFabric', descriptionZh: '让 OptiFine 在 Fabric 上运行' },
  'ImmediatelyFast': { titleZh: '立即加速', descriptionZh: '立即优化的性能改进模组' },
  'Very Many Players (Fabric)': { titleZh: '极多玩家', descriptionZh: '优化多人游戏服务器性能' },
  'Debugify': { titleZh: '错误修复', descriptionZh: '修复 Minecraft 原版存在的多个 bug' },
  'LazyDFU': { titleZh: '惰性数据固定器', descriptionZh: '延迟数据固定器初始化以加快启动' },
  'Smooth Boot': { titleZh: '平滑启动', descriptionZh: '优化游戏启动过程' },
  'Smooth Boot (Reloaded)': { titleZh: '平滑启动', descriptionZh: '优化游戏启动过程' },
  'Ksyxis': { titleZh: 'Ksyxis', descriptionZh: '快速世界加载优化' },
  'Dynamic Lights': { titleZh: '动态光源', descriptionZh: '为火把等物品添加动态光源' },
  'LambDynamicLights': { titleZh: '动态光源', descriptionZh: '为火把等手持物品添加动态光源' },
  'No Chat Reports': { titleZh: '无聊天报告', descriptionZh: '禁用聊天报告功能以保护隐私' },
  'NoChatReports': { titleZh: '无聊天报告', descriptionZh: '禁用聊天报告功能' },
  'AntiGhost': { titleZh: '反鬼影方块', descriptionZh: '自动检测并重载幽灵方块' },
  '3D Skin Layers': { titleZh: '3D 皮肤层', descriptionZh: '3D 渲染皮肤外层' },
  'Blur': { titleZh: '模糊', descriptionZh: '打开 GUI 时模糊背景' },
  'Blur (Fabric)': { titleZh: '模糊 (Fabric)', descriptionZh: '打开 GUI 时模糊背景' },
  'NoFog': { titleZh: '无雾', descriptionZh: '移除或调整雾气效果' },
  'Clear Skies': { titleZh: '晴空', descriptionZh: '优化天空渲染' },
  'BetterF3': { titleZh: '更好的 F3', descriptionZh: '美化和增强 F3 调试界面' },
  'Appleskin': { titleZh: '苹果皮', descriptionZh: '显示食物的饱食度恢复值' },
  'AppleSkin': { titleZh: '苹果皮', descriptionZh: '显示食物的饱食度恢复值' },
  'AppleSkin (Forge)': { titleZh: '苹果皮', descriptionZh: '显示食物的饱食度恢复值' },
  'AppleSkin (Fabric)': { titleZh: '苹果皮 (Fabric)', descriptionZh: '显示食物的饱食度恢复值' },
  'Bedspreads': { titleZh: '床单', descriptionZh: '为床添加图案' },
  'Do a Barrel Roll!': { titleZh: '来个翻滚！', descriptionZh: '允许使用鞘翅做桶滚' },
  'Elytra Trims': { titleZh: '鞘翅纹饰', descriptionZh: '为鞘翅添加纹饰系统' },
  'Wavey Capes': { titleZh: '飘逸披风', descriptionZh: '动态披风物理效果' },
  'WaveyCapes': { titleZh: '飘逸披风', descriptionZh: '动态披风物理效果' },
  'Custom Portal Loader': { titleZh: '自定义传送门加载器', descriptionZh: '自定义传送门逻辑' },
  'FancyMenu': { titleZh: '精美菜单', descriptionZh: '自定义主菜单和 GUI 界面' },

  // ===== 物品查询/管理 =====
  'JEI': { titleZh: '物品合成查询', descriptionZh: 'Just Enough Items，游戏内物品及合成配方查询工具' },
  'Just Enough Items': { titleZh: '物品合成查询', descriptionZh: '游戏内物品及合成配方查询工具' },
  'REI': { titleZh: '物品百科', descriptionZh: 'Rough Enough Items，另一个流行的物品与合成查询模组' },
  'Rough Enough Items': { titleZh: '物品百科', descriptionZh: '另一个流行的物品与合成查询模组' },
  'EMI': { titleZh: '物品与配方浏览器', descriptionZh: 'Efficiently Moderated Items，现代化的物品浏览工具' },

  // ===== 机械动力系列 =====
  'Create': { titleZh: '机械动力', descriptionZh: '基于旋转动力的自动化工业模组，提供机械装置、传送带等大量新内容' },
  'Create: Steam \'n Rails': { titleZh: '机械动力：蒸汽与轨道', descriptionZh: '机械动力的扩展模组，添加蒸汽动力和火车系统' },
  'Create: New Age': { titleZh: '机械动力：新时代', descriptionZh: '机械动力扩展，添加电力系统和电子装置' },
  'Create Crafts & Additions': { titleZh: '机械动力：工艺与加成', descriptionZh: '扩展机械动力，新增更多部件和机器' },
  'Create: Above and Beyond': { titleZh: '机械动力：超越极限', descriptionZh: '机械动力的整合包扩展内容' },
  'Create: Big Cannons': { titleZh: '机械动力：大口径火炮', descriptionZh: '为机械动力添加火炮武器系统' },
  'Create: Crystal Clear': { titleZh: '机械动力：晶体工艺', descriptionZh: '机械动力扩展，添加晶体加工' },
  'Create: Slice & Dice': { titleZh: '机械动力：斩与切', descriptionZh: '机械动力扩展，添加更多刀具' },
  'Create: Sifting': { titleZh: '机械动力：筛选', descriptionZh: '机械动力扩展，添加筛选器' },
  'Create Ore Excavation': { titleZh: '机械动力：矿石采掘', descriptionZh: '机械动力扩展，添加采矿系统' },
  'Flywheel': { titleZh: '飞轮', descriptionZh: '高性能渲染库，为机械动力等提供支持' },
  'Ponder': { titleZh: '沉思', descriptionZh: '机械动力的教程与动画引擎' },

  // ===== 通用技术 / 自动化 =====
  'IndustrialCraft 2': { titleZh: '工业2', descriptionZh: '经典的工业模组，包含能源、工具、机器等' },
  'IC2': { titleZh: '工业2', descriptionZh: '经典的工业模组' },
  'Applied Energistics 2': { titleZh: '应用能源2', descriptionZh: '基于网络的物品存储与自动化系统' },
  'AE2': { titleZh: '应用能源2', descriptionZh: '基于网络的物品存储与自动化系统' },
  'Applied Energistics 2: Additions': { titleZh: '应用能源2：扩展', descriptionZh: '应用能源2的扩展模组' },
  'Mekanism': { titleZh: '通用机械', descriptionZh: '提供多样化的自动化与能源处理系统' },
  'Mekanism Generators': { titleZh: '通用机械：发电机', descriptionZh: '通用机械扩展，添加多种发电机' },
  'Mekanism Tools': { titleZh: '通用机械：工具', descriptionZh: '通用机械扩展，添加工具与武器' },
  'Thermal Expansion': { titleZh: '热力膨胀', descriptionZh: '热力系列核心模组，提供机器和能源系统' },
  'Thermal Foundation': { titleZh: '热力基础', descriptionZh: '热力系列基础模组' },
  'Thermal Dynamics': { titleZh: '热力动力学', descriptionZh: '热力系列传输模组' },
  'Immersive Engineering': { titleZh: '沉浸工程', descriptionZh: '基于多层方块结构的工业模组，提供真实感的大型机械' },
  'Immersive Petroleum': { titleZh: '沉浸石油', descriptionZh: '沉浸工程扩展，添加石油开采和化工系统' },
  'BuildCraft': { titleZh: '建筑工艺', descriptionZh: '经典的自动化与管道模组' },
  'Railcraft': { titleZh: '铁路工艺', descriptionZh: '扩展铁路系统，添加更多矿车和轨道' },
  'PneumaticCraft: Repressurized': { titleZh: '气动工艺：重装', descriptionZh: '基于气压的自动化技术模组' },
  'Refined Storage': { titleZh: '精致存储', descriptionZh: '网络化存储系统，物品与液体自动化管理' },
  'Refined Storage Addons': { titleZh: '精致存储扩展', descriptionZh: '精致存储的扩展模组' },
  'Simple Storage Network': { titleZh: '简易存储网络', descriptionZh: '简易的网络化存储系统' },
  'Storage Drawers': { titleZh: '储物抽屉', descriptionZh: '简洁高效的抽屉式物品存储系统' },
  'Iron Chests': { titleZh: '铁箱子', descriptionZh: '更多种类的箱子（铜、铁、金、钻石等）' },
  'Iron Shulker Boxes': { titleZh: '铁潜影盒', descriptionZh: '更多材质的潜影盒' },
  'Tinkers Construct': { titleZh: '匠魂', descriptionZh: '可自由组合和升级的工具与武器系统' },
  'Tinkers\' Construct': { titleZh: '匠魂', descriptionZh: '可自由组合和升级的工具与武器系统' },
  'Mantle': { titleZh: '地幔', descriptionZh: '匠魂等模组的前置库' },
  'Construct\'s Armory': { titleZh: '匠魂装甲', descriptionZh: '匠魂扩展，添加可定制盔甲' },
  'Constructs Armory': { titleZh: '匠魂装甲', descriptionZh: '匠魂扩展，添加可定制盔甲' },

  // ===== 魔法 / 法术 =====
  'Botania': { titleZh: '植物魔法', descriptionZh: '基于花朵和自然力量的魔法技术模组' },
  'Ars Nouveau': { titleZh: '魔法艺术', descriptionZh: '可编程的魔法系统，自定义法术和仪式' },
  'Ars Elemental': { titleZh: '元素艺术', descriptionZh: '魔法艺术的扩展' },
  'Ars Creo': { titleZh: '创造艺术', descriptionZh: '魔法艺术扩展' },
  'Astral Sorcery': { titleZh: '星辉魔法', descriptionZh: '基于星空与星座的魔法系统' },
  'Blood Magic': { titleZh: '血魔法', descriptionZh: '使用生命精华的黑暗魔法系统' },
  'Thaumcraft': { titleZh: '神秘时代', descriptionZh: '经典的魔法研究与元素魔力系统' },
  'Occultism': { titleZh: '神秘学', descriptionZh: '召唤恶魔和精灵执行自动化任务的魔法模组' },
  'Embers': { titleZh: '余烬', descriptionZh: '基于古代灰烬能源的魔法科技模组' },
  'Roots': { titleZh: '根源魔法', descriptionZh: '自然德鲁伊风格的魔法系统' },
  'Nature\'s Aura': { titleZh: '自然光环', descriptionZh: '基于自然能量的魔法与自动化模组' },
  'Malum': { titleZh: '恶性', descriptionZh: '基于灵魂魔法的冒险模组' },
  'Forbidden and Arcanus': { titleZh: '禁忌与奥秘', descriptionZh: '魔法武器与装备' },
  'Apothic Attributes': { titleZh: '属性神化', descriptionZh: '扩展物品属性系统' },
  'Apotheosis': { titleZh: '登峰造极', descriptionZh: '扩展附魔、BOSS 和装备系统' },
  'Apothic Enchanting': { titleZh: '神化附魔', descriptionZh: '扩展附魔系统' },
  'Patchouli': { titleZh: '手册', descriptionZh: '为其他模组提供游戏内手册/引导书' },
  'Enchantment Descriptions': { titleZh: '附魔描述', descriptionZh: '为附魔添加详细描述' },

  // ===== 冒险 / 地牢 / 维度 =====
  'Better Dungeons': { titleZh: '更好的地牢', descriptionZh: '添加更多类型的地牢结构' },
  'Chocolate Quest Repoured': { titleZh: '巧克力冒险', descriptionZh: '丰富的地牢和冒险内容' },
  'Dungeons Plus': { titleZh: '地牢+', descriptionZh: '新增多种地牢结构' },
  'YUNG\'s Better Caves': { titleZh: 'YUNG 的更好洞穴', descriptionZh: '重写地下洞穴生成系统' },
  'YUNG\'s Better Mineshafts': { titleZh: 'YUNG 的更好废弃矿井', descriptionZh: '重写废弃矿井生成' },
  'YUNG\'s Better Dungeons': { titleZh: 'YUNG 的更好地牢', descriptionZh: '重写地牢生成' },
  'YUNG\'s Better Strongholds': { titleZh: 'YUNG 的更好要塞', descriptionZh: '重写要塞生成' },
  'YUNG\'s Bridges': { titleZh: 'YUNG 的桥梁', descriptionZh: '生成自然的桥梁结构' },
  'Repurposed Structures': { titleZh: '结构改造', descriptionZh: '改造原版结构，增加变体与新内容' },
  'Mo\' Structures': { titleZh: '更多结构', descriptionZh: '添加大量世界生成结构' },
  'Dungeon Crawl': { titleZh: '地牢爬行', descriptionZh: '生成庞大的 Roguelike 地牢' },
  'The Twilight Forest': { titleZh: '暮色森林', descriptionZh: '神秘的森林维度，包含多个独特 Boss' },
  'Twilight Forest': { titleZh: '暮色森林', descriptionZh: '神秘的森林维度，包含多个独特 Boss' },
  'The Aether': { titleZh: '天堂', descriptionZh: '浮空的天界维度，充满神秘的敌人与生物' },
  'Aether': { titleZh: '天堂', descriptionZh: '浮空的天界维度' },
  'Atum 2': { titleZh: '阿图姆2：流沙之归', descriptionZh: '古老的沙漠维度' },
  'The Betweenlands': { titleZh: '交界之地', descriptionZh: '沼泽与神秘生物的黑暗维度' },
  'Betweenlands': { titleZh: '交界之地', descriptionZh: '沼泽与神秘生物的黑暗维度' },
  'The Erebus': { titleZh: '幽冥之地', descriptionZh: '地下昆虫维度' },
  'Deep Dark+': { titleZh: '深暗之境+', descriptionZh: '扩展深暗之境的内容' },
  'The Backrooms': { titleZh: '后室', descriptionZh: '神秘的无尽走廊维度' },
  'Blue Skies': { titleZh: '湛蓝苍穹', descriptionZh: '两个全新的天界维度' },
  'The Undergarden': { titleZh: '幽深洞穴', descriptionZh: '地下维度，充满奇特生物' },
  'Undergarden': { titleZh: '幽深洞穴', descriptionZh: '地下维度' },
  'Wyrmroost': { titleZh: '巨龙栖息', descriptionZh: '奇幻的龙与生物模组' },
  'The Midnight': { titleZh: '午夜', descriptionZh: '黑暗的异世界维度' },
  'Midnight': { titleZh: '午夜', descriptionZh: '黑暗的异世界维度' },
  'Ultra Amplified Dimension': { titleZh: '超级放大维度', descriptionZh: '极端地形的维度' },
  'Mystcraft': { titleZh: '神秘时代之书', descriptionZh: '书写自己的维度' },
  'RF Tools Dimensions': { titleZh: 'RF 工具：维度', descriptionZh: '创建自定义维度' },
  'RFTools Dimensions': { titleZh: 'RF 工具：维度', descriptionZh: '创建自定义维度' },
  'RFTools': { titleZh: 'RF 工具', descriptionZh: '基于 RF 能源的工具和机器集' },
  'Just Another Dimension': { titleZh: '另一个维度', descriptionZh: '新的维度内容' },
  'Dimensional Edibles': { titleZh: '维度美食', descriptionZh: '通过食用特殊食物前往维度' },
  'Utility Worlds': { titleZh: '实用维度', descriptionZh: '创建功能型的迷你维度' },
  'Sky Villages': { titleZh: '天空村庄', descriptionZh: '生成漂浮的天空村庄' },
  'Better Villages': { titleZh: '更好的村庄', descriptionZh: '改进村庄生成' },
  'Better End': { titleZh: '更好的末地', descriptionZh: '扩展末地内容' },
  'BetterNether': { titleZh: '更好的下界', descriptionZh: '扩展下界内容' },
  'NetherEx': { titleZh: '下界扩展', descriptionZh: '扩展下界生物群系' },
  'End Remastered': { titleZh: '末地重制', descriptionZh: '重做末地内容' },
  'Amplified Nether': { titleZh: '放大下界', descriptionZh: '放大的下界地形' },
  'Nullscape': { titleZh: '虚无之境', descriptionZh: '重做末地地形' },
  'Regions Unexplored': { titleZh: '未探索之地', descriptionZh: '添加新的生物群系' },
  'Dungeons Enhanced': { titleZh: '地牢增强', descriptionZh: '增强地牢内容' },

  // ===== 生物 / 怪物 =====
  'Alex\'s Mobs': { titleZh: '亚历克斯的生物', descriptionZh: '添加大量真实且独特的新生物' },
  'Alex Mobs': { titleZh: '亚历克斯的生物', descriptionZh: '添加大量真实且独特的新生物' },
  'Better Animals Plus': { titleZh: '更好的动物增强版', descriptionZh: '添加多种真实和幻想生物' },
  'Better Animals+': { titleZh: '更好的动物+', descriptionZh: '添加多种真实和幻想生物' },
  'Quark': { titleZh: '夸克', descriptionZh: 'Vazkii 出品，模块化功能合集' },
  'Pam\'s HarvestCraft 2': { titleZh: '潘马斯丰收工艺2', descriptionZh: '添加大量农作物、食物和果树' },
  'Pam\'s HarvestCraft': { titleZh: '潘马斯丰收工艺', descriptionZh: '添加大量农作物、食物和果树' },
  'Farmer\'s Delight': { titleZh: '农夫乐事', descriptionZh: '扩展烹饪和农业内容' },
  'Farmer\'s Delight (Fabric)': { titleZh: '农夫乐事 (Fabric)', descriptionZh: '扩展烹饪和农业内容' },
  'Aquaculture 2': { titleZh: '水产养殖2', descriptionZh: '扩展钓鱼和海洋内容' },
  'Mowzie\'s Mobs': { titleZh: '莫齐的怪物', descriptionZh: '添加独特的 Boss 级怪物' },
  'Mutant Beasts': { titleZh: '突变生物', descriptionZh: '原版生物的突变版本' },
  'Mutant More': { titleZh: '更多突变体', descriptionZh: '更多突变生物' },
  'Scape and Run: Parasites': { titleZh: '逃亡：寄生虫', descriptionZh: '硬核恐怖风格的寄生虫模组' },
  'Lycanites Mobs': { titleZh: '莱卡尼特的怪物', descriptionZh: '添加大量新怪物和 Boss' },
  'Ice and Fire: Dragons': { titleZh: '冰火：龙族', descriptionZh: '添加龙与神话生物' },
  'Ice and Fire': { titleZh: '冰火：龙族', descriptionZh: '添加龙与神话生物' },
  'Goblin Traders': { titleZh: '哥布林商人', descriptionZh: '添加可交易的哥布林' },
  'Guard Villagers': { titleZh: '守卫村民', descriptionZh: '保护村庄的战斗村民' },
  'Illager Invasion': { titleZh: '灾厄村民入侵', descriptionZh: '添加更多灾厄村民内容' },
  'Pillager Expansion': { titleZh: '掠夺者扩展', descriptionZh: '扩展掠夺者内容' },
  'Golems Galore!': { titleZh: '傀儡成群', descriptionZh: '添加多种新傀儡' },
  'Friends&Foes': { titleZh: '友与敌', descriptionZh: '添加被取消的生物和创意' },
  'Friends and Foes': { titleZh: '友与敌', descriptionZh: '添加被取消的生物和创意' },
  'The Graveyard': { titleZh: '墓地', descriptionZh: '添加墓地结构与亡灵生物' },
  'Graveyard': { titleZh: '墓地', descriptionZh: '添加墓地结构与亡灵生物' },
  'The Cursed': { titleZh: '诅咒', descriptionZh: '恐怖内容' },
  'Enderscape': { titleZh: '末地景致', descriptionZh: '扩展末地内容' },
  'Kobold': { titleZh: '狗头人', descriptionZh: '新生物' },
  'Cave Dweller': { titleZh: '洞穴居民', descriptionZh: '恐怖的新生物' },
  'The Descent': { titleZh: '深渊降临', descriptionZh: '扩展洞穴内容' },
  'From The Shadows': { titleZh: '阴影之中', descriptionZh: '添加隐形敌人生物' },

  // ===== 建筑 / 装饰 =====
  'Chisel': { titleZh: '凿子', descriptionZh: '用雕刻工具制作各种装饰方块' },
  'Chisels & Bits': { titleZh: '雕凿与方块', descriptionZh: '将方块分割成更小的装饰单元' },
  'LittleTiles': { titleZh: '小方块', descriptionZh: '微方块建模与装饰' },
  'Carpenter\'s Blocks': { titleZh: '木匠方块', descriptionZh: '可自定义外观的装饰方块' },
  'BiblioCraft': { titleZh: '书架工艺', descriptionZh: '装饰性家具和展示方块' },
  'Decorative Blocks': { titleZh: '装饰方块', descriptionZh: '添加多种装饰方块' },
  'Macaw\'s Roofs': { titleZh: '鹦鹉的屋顶', descriptionZh: '多种屋顶建筑方块' },
  'Macaw\'s Windows': { titleZh: '鹦鹉的窗户', descriptionZh: '多种窗户建筑方块' },
  'Macaw\'s Doors': { titleZh: '鹦鹉的门', descriptionZh: '多种门建筑方块' },
  'Macaw\'s Bridges': { titleZh: '鹦鹉的桥梁', descriptionZh: '多种桥梁建筑方块' },
  'FramedBlocks': { titleZh: '框架方块', descriptionZh: '可自定义外观的装饰方块' },
  'Framed Blocks': { titleZh: '框架方块', descriptionZh: '可自定义外观的装饰方块' },
  'Structurize': { titleZh: '结构之书', descriptionZh: '保存和加载建筑结构的工具' },
  'Litematica': { titleZh: '原理图', descriptionZh: '在游戏中显示 3D 蓝图辅助建筑' },
  'Litematica (Forge)': { titleZh: '原理图 (Forge)', descriptionZh: '在游戏中显示 3D 蓝图辅助建筑' },
  'Schematica': { titleZh: '示意图', descriptionZh: '保存和加载建筑蓝图' },
  'Effortless Building': { titleZh: '轻松建筑', descriptionZh: '简化大型建筑的放置操作' },

  // ===== 地图 / 小地图 =====
  'Xaero\'s Minimap': { titleZh: 'Xaero 的小地图', descriptionZh: '流行的小地图模组' },
  'Xaeros Minimap': { titleZh: 'Xaero 的小地图', descriptionZh: '流行的小地图模组' },
  'Xaero\'s World Map': { titleZh: 'Xaero 的世界地图', descriptionZh: '游戏内世界地图' },
  'Xaeros World Map': { titleZh: 'Xaero 的世界地图', descriptionZh: '游戏内世界地图' },
  'JourneyMap': { titleZh: '旅行地图', descriptionZh: '实时地图和路径追踪' },
  'VoxelMap': { titleZh: '体素地图', descriptionZh: '小地图与路径点系统' },
  'Antique Atlas': { titleZh: '古朴地图集', descriptionZh: '手绘风格的地图系统' },

  // ===== 背包 / 物品栏 =====
  'Iron Backpacks': { titleZh: '铁背包', descriptionZh: '可升级的大容量背包' },
  'Simply Backpacks': { titleZh: '简约背包', descriptionZh: '简单实用的背包系统' },
  'Sophisticated Backpacks': { titleZh: '精致背包', descriptionZh: '功能丰富的升级式背包' },
  'Sophisticated Storage': { titleZh: '精致存储', descriptionZh: '功能丰富的存储系统' },
  'ShulkerboxTooltip': { titleZh: '潜影盒提示', descriptionZh: '在物品栏显示潜影盒内容' },
  'Shulker Box Tooltip': { titleZh: '潜影盒提示', descriptionZh: '在物品栏显示潜影盒内容' },
  'Inventory Profiles Next': { titleZh: '背包配置 Next', descriptionZh: '自动物品排序和配置' },
  'Inventory Profiles': { titleZh: '背包配置', descriptionZh: '自动物品排序和配置' },
  'ItemZoom': { titleZh: '物品放大', descriptionZh: '悬停物品时显示放大预览' },
  'Mouse Tweaks': { titleZh: '鼠标调整', descriptionZh: '用鼠标快捷移动物品' },

  // ===== 世界生成 / 生物群系 =====
  'Biomes O\' Plenty': { titleZh: '超多生物群系', descriptionZh: '添加超过 50 种新生物群系' },
  'Biomes O Plenty': { titleZh: '超多生物群系', descriptionZh: '添加超过 50 种新生物群系' },
  'Oh The Biomes You\'ll Go': { titleZh: '你将前往的生物群系', descriptionZh: 'Fabric 版的生物群系扩展模组' },
  'Oh The Biomes Youll Go': { titleZh: '你将前往的生物群系', descriptionZh: 'Fabric 版的生物群系扩展模组' },
  'BYG': { titleZh: '你将前往的生物群系', descriptionZh: 'Fabric 版的生物群系扩展模组' },
  'Terrestria': { titleZh: '陆地', descriptionZh: 'Fabric 版生物群系扩展' },
  'Traverse: Legacy Continued': { titleZh: '穿越：遗产延续', descriptionZh: '经典生物群系扩展' },
  'Traverse': { titleZh: '穿越', descriptionZh: '生物群系扩展模组' },
  'Caves & Cliffs Expansion Pack': { titleZh: '洞穴与山崖扩展包', descriptionZh: '扩展原版洞穴与山崖内容' },
  'Caves and Cliffs': { titleZh: '洞穴与山崖', descriptionZh: '扩展原版洞穴与山崖内容' },
  'Distant Horizons': { titleZh: '遥远地平线', descriptionZh: '无限渲染距离的 LOD 系统' },
  'DistantHorizons': { titleZh: '遥远地平线', descriptionZh: '无限渲染距离的 LOD 系统' },
  'Bobby': { titleZh: 'Bobby', descriptionZh: '允许使用真实的区块视野距离' },

  // ===== 其他热门内容 =====
  'ProjectE': { titleZh: '等价交换 ProjectE', descriptionZh: '经典的等价交换能量系统' },
  'Equivalent Exchange': { titleZh: '等价交换', descriptionZh: '经典的能量交换系统' },
  'Project EX': { titleZh: '等价交换扩展', descriptionZh: 'ProjectE 的扩展' },
  'Easy Villagers': { titleZh: '简单村民', descriptionZh: '简化村民交易和繁殖' },
  'Easy Anvils': { titleZh: '简单铁砧', descriptionZh: '简化铁砧使用' },
  'Easy Magic': { titleZh: '简单魔法', descriptionZh: '简化附魔界面' },
  'Trash Cans': { titleZh: '垃圾桶', descriptionZh: '各种类型的垃圾桶' },
  'TrashSlot': { titleZh: '垃圾桶槽位', descriptionZh: '在物品栏添加垃圾槽' },
  'Trash Slot': { titleZh: '垃圾桶槽位', descriptionZh: '在物品栏添加垃圾槽' },
  'Comforts': { titleZh: '舒适', descriptionZh: '添加睡袋和吊床' },
  'Waystones': { titleZh: '路石', descriptionZh: '可传送的路标方块' },
  'Waystone': { titleZh: '路石', descriptionZh: '可传送的路标方块' },
  'Traveler\'s Titles': { titleZh: '旅行者的标题', descriptionZh: '进入新区域时显示标题' },
  'Immersive Portals': { titleZh: '沉浸传送门', descriptionZh: '无缝的沉浸式传送门渲染' },
  'ImmersivePortal': { titleZh: '沉浸传送门', descriptionZh: '无缝的沉浸式传送门渲染' },
  'OpenBlocks Elevator': { titleZh: '开放式方块：电梯', descriptionZh: '简单易用的电梯方块' },
  'OpenBlocks Elevators': { titleZh: '电梯', descriptionZh: '简单易用的电梯方块' },
  'Mineshafts & Monsters': { titleZh: '矿井与怪物', descriptionZh: '冒险向整合包' },
  'FTB Quests': { titleZh: 'FTB 任务系统', descriptionZh: '整合包任务系统' },
  'FTB Teams': { titleZh: 'FTB 团队', descriptionZh: '玩家组队与管理' },
  'FTB Chunks': { titleZh: 'FTB 区块', descriptionZh: '区块加载与保护' },
  'FTB Library': { titleZh: 'FTB 库', descriptionZh: 'FTB 系列的前置库' },
  'FTB Ultimine': { titleZh: 'FTB 极速挖掘', descriptionZh: '连锁挖矿工具' },
  'FTB Money': { titleZh: 'FTB 货币', descriptionZh: '服务器货币系统' },
  'JEI Professions': { titleZh: 'JEI 职业', descriptionZh: '村民职业展示' },
  'Reap': { titleZh: '收割', descriptionZh: '一键收割作物' },
  'Reaping': { titleZh: '收割', descriptionZh: '一键收割作物' },
  'Scannable': { titleZh: '可扫描', descriptionZh: '扫描附近的矿物和实体' },
  'The One Probe': { titleZh: '探测器', descriptionZh: '显示所指方块的详细信息' },
  'TOP': { titleZh: '探测器', descriptionZh: '显示所指方块的详细信息' },
  'Hwyla': { titleZh: 'Here\'s What You\'re Looking At', descriptionZh: '显示所指方块信息' },
  'Waila': { titleZh: 'What Am I Looking At', descriptionZh: '显示所指方块信息' },
  'Jade': { titleZh: '玉', descriptionZh: '显示所指方块和实体信息' },
  'Jade 🔍': { titleZh: '玉 🔍', descriptionZh: '显示所指方块和实体信息' },

  // ===== 宝可梦 / 整合包相关 =====
  'Pixelmon': { titleZh: '宝可梦', descriptionZh: '在 Minecraft 中收集和训练宝可梦' },
  'Pixelmon Reforged': { titleZh: '宝可梦重铸', descriptionZh: '重制的宝可梦模组' },
  'Cobblemon': { titleZh: '鹅卵石梦', descriptionZh: 'Fabric 版类宝可梦模组' },
  'MineColonies': { titleZh: '我的殖民地', descriptionZh: '建立和管理自己的 NPC 殖民地' },
  'Mine Colonies': { titleZh: '我的殖民地', descriptionZh: '建立和管理自己的 NPC 殖民地' },

  // ===== 工具 / 矿物 =====
  'Ore Excavation': { titleZh: '矿石采掘', descriptionZh: '一键挖掘整座矿脉' },
  'Vein Miner': { titleZh: '矿脉挖掘者', descriptionZh: '一键挖掘整座矿脉' },
  'Ore Variants': { titleZh: '矿石变种', descriptionZh: '添加多种新矿石' },
  'Silent\'s Mechanisms': { titleZh: '沉默机制', descriptionZh: '热力与机械系统' },
  'Geolosys': { titleZh: '地质学', descriptionZh: '改变矿物生成，增加勘探的乐趣' },

  // ===== 能量 / 传输 =====
  'Energy Converters': { titleZh: '能源转换器', descriptionZh: '在不同能量系统之间转换' },
  'Flux Networks': { titleZh: '通量网络', descriptionZh: '无线网络化能量传输' },
  'Wireless Networks': { titleZh: '无线网络', descriptionZh: '无线物品和能量传输' },
  'Cyclic': { titleZh: '循环', descriptionZh: '大量实用工具、机器和附魔' },
  'ExtraCells 2': { titleZh: '额外存储单元2', descriptionZh: '应用能源2的扩展' },
  'Industrial Foregoing': { titleZh: '工业先驱', descriptionZh: '基于塑料的自动化工业模组' },
  'Actually Additions': { titleZh: '实际添加', descriptionZh: '实用的工具、机器和装饰' },
  'Extra Utilities 2': { titleZh: '额外实用工具2', descriptionZh: '大量实用工具和机器' },
  'Extra Utilities': { titleZh: '额外实用工具', descriptionZh: '大量实用工具和机器' },
  'Draconic Evolution': { titleZh: '龙之进化', descriptionZh: '基于龙能量的强大装备和工具' },
  'Integrated Dynamics': { titleZh: '集成动力学', descriptionZh: '基于逻辑网络的自动化系统' },
  'Integrated Terminals': { titleZh: '集成终端', descriptionZh: '集成动力学的终端扩展' },
  'Ranged Pumps': { titleZh: '远程泵', descriptionZh: '高效的流体抽取泵' },
  'PneumaticCraft': { titleZh: '气动工艺', descriptionZh: '基于气压的自动化技术模组' },

  // ===== 编程 / 计算机 =====
  'CCTweaked': { titleZh: '电脑改造', descriptionZh: '可编写 Lua 脚本的计算机系统' },
  'ComputerCraft': { titleZh: '电脑工艺', descriptionZh: '原版计算机模组' },
  'OpenComputers': { titleZh: '开放式计算机', descriptionZh: '可编程的计算机与自动化系统' },

  // ===== 服务器 / 管理 =====
  'LuckPerms': { titleZh: '幸运权限', descriptionZh: '强大的服务器权限管理插件/模组' },
  'WorldEdit': { titleZh: '世界编辑', descriptionZh: '强大的地图编辑工具' },
  'FastAsyncWorldEdit': { titleZh: '快速异步世界编辑', descriptionZh: 'WorldEdit 的高性能异步版本' },
  'FAWE': { titleZh: '快速异步世界编辑', descriptionZh: 'WorldEdit 的高性能异步版本' },
  'CoreProtect': { titleZh: '核心保护', descriptionZh: '方块破坏记录与回滚工具' },
  'ProtocolLib': { titleZh: '协议库', descriptionZh: '拦截和修改 Minecraft 网络包' },
  'EssentialsX': { titleZh: '核心扩展 X', descriptionZh: '基础服务器命令集' },
  'Vault': { titleZh: '金库', descriptionZh: '服务器经济与权限通用接口' },
  'Towny': { titleZh: '城镇', descriptionZh: '服务器城镇管理系统' },
  'Factions': { titleZh: '派系', descriptionZh: '玩家派系与领地系统' },

  // ===== 社交 / 语音 =====
  'Simple Voice Chat': { titleZh: '简易语音聊天', descriptionZh: '游戏内置的近距离语音聊天系统' },
  'Voice Chat': { titleZh: '语音聊天', descriptionZh: '游戏内置语音聊天' },
  'Plasmo Voice': { titleZh: '等离子语音', descriptionZh: '优质的近距离语音聊天模组' },
  'Chat Heads': { titleZh: '聊天头像', descriptionZh: '聊天信息显示玩家头像' },
  'Chat Patches': { titleZh: '聊天补丁', descriptionZh: '改进聊天界面与体验' },
  'Better Chat': { titleZh: '更好的聊天', descriptionZh: '改进聊天界面' },

  // ===== 材质 / 粒子 =====
  'Entity Texture Features': { titleZh: '实体纹理特性', descriptionZh: '添加实体的随机纹理和表情' },
  'ETF': { titleZh: '实体纹理特性', descriptionZh: '添加实体的随机纹理和表情' },
  'Particle Rain': { titleZh: '粒子雨', descriptionZh: '更漂亮的天气效果' },
  'Effective': { titleZh: '有效', descriptionZh: '添加更多自然粒子效果' },
  'Not Enough Animations': { titleZh: '动画不足补完', descriptionZh: '添加缺失的动画效果' },
  'Better Animations Collection': { titleZh: '更好的动画集合', descriptionZh: '改进原版动画' },
  'Player Animator': { titleZh: '玩家动画师', descriptionZh: '为玩家添加流畅的动画' },
  'GeckoLib': { titleZh: 'Gecko 库', descriptionZh: '3D 动画与模型库' },
  'AzureLib': { titleZh: '蔚蓝库', descriptionZh: '通用模型与动画库' },

  // ===== 常用小工具 =====
  'Mod Menu': { titleZh: '模组菜单', descriptionZh: '游戏内模组列表和配置界面' },
  'ModMenu': { titleZh: '模组菜单', descriptionZh: '游戏内模组列表和配置界面' },
  'Configured': { titleZh: '配置工具', descriptionZh: '游戏内配置界面' },
  'Catalogue': { titleZh: '模组目录', descriptionZh: '模组展示与管理界面' },
  'Controlling': { titleZh: '控制大师', descriptionZh: '按键冲突检测与排序' },
  'ReAuth': { titleZh: '重新验证', descriptionZh: '游戏内重新登录 Microsoft 账号' },
  'Just A Rope Bridge!': { titleZh: '只是一座绳索桥！', descriptionZh: '添加可建造的绳索桥' },
  'Just A Rope Bridge': { titleZh: '只是一座绳索桥', descriptionZh: '添加可建造的绳索桥' },
  'Shrink': { titleZh: '缩小', descriptionZh: '可以变得非常小' },

  // ===== 整合包 =====
  'Better Minecraft': { titleZh: '更好的 Minecraft', descriptionZh: '受欢迎的大型整合包' },
  'Better MC': { titleZh: '更好的 MC', descriptionZh: '大型整合包' },
  'Better MC [FABRIC]': { titleZh: '更好的 MC (Fabric)', descriptionZh: 'Fabric 版整合包' },
  'Better MC [FORGE]': { titleZh: '更好的 MC (Forge)', descriptionZh: 'Forge 版整合包' },
  'All The Mods': { titleZh: '所有模组', descriptionZh: '大型模组整合包系列' },
  'ATM': { titleZh: 'ATM 整合包', descriptionZh: 'All The Mods 系列整合包' },
  'ATM9': { titleZh: 'ATM9', descriptionZh: 'All The Mods 9 整合包' },
  'ATM8': { titleZh: 'ATM8', descriptionZh: 'All The Mods 8 整合包' },
  'ATM7': { titleZh: 'ATM7', descriptionZh: 'All The Mods 7 整合包' },
  'ATM6': { titleZh: 'ATM6', descriptionZh: 'All The Mods 6 整合包' },
  'Enigmatica': { titleZh: '谜之工程', descriptionZh: '经典的大型科技整合包系列' },
  'Enigmatica 6': { titleZh: '谜之工程6', descriptionZh: '大型科技整合包' },
  'Enigmatica 9': { titleZh: '谜之工程9', descriptionZh: '大型科技整合包' },
  'Stoneblock': { titleZh: '石方块', descriptionZh: '在石头世界中生存的整合包' },
  'SkyFactory': { titleZh: '天空工厂', descriptionZh: '经典空岛整合包系列' },
  'Sky Factory 4': { titleZh: '天空工厂4', descriptionZh: '经典空岛整合包' },
  'SkyFactory One': { titleZh: '天空工厂 One', descriptionZh: '空岛整合包' },
  'Omnifactory': { titleZh: '全能工厂', descriptionZh: '自动化挑战整合包' },
  'Nomifactory': { titleZh: '诺米工厂', descriptionZh: '自动化挑战整合包' },
  'GregTech Community Edition': { titleZh: '格雷科技社区版', descriptionZh: '复杂工业系统模组' },
  'GregTech CE': { titleZh: '格雷科技社区版', descriptionZh: '复杂工业系统模组' },
  'GregTech': { titleZh: '格雷科技', descriptionZh: '经典工业模组' },
  'GTCEu': { titleZh: '格雷科技社区版：非官方', descriptionZh: '格雷科技社区版的非官方分支' },
  'MC Dungeons Weapons': { titleZh: 'MC 地下城武器', descriptionZh: '添加来自 MC 地下城的武器' },
  'MC Dungeons Armors': { titleZh: 'MC 地下城盔甲', descriptionZh: '添加来自 MC 地下城的盔甲' },
  'MC Dungeons Enchantments': { titleZh: 'MC 地下城附魔', descriptionZh: '添加来自 MC 地下城的附魔' },
  'Go Fish!': { titleZh: '去钓鱼！', descriptionZh: '扩展钓鱼内容' },

  // ===== 跨平台 =====
  'Floodgate': { titleZh: '泛洪之门', descriptionZh: '让基岩版玩家加入 Java 版服务器' },
  'Geyser': { titleZh: '间歇泉', descriptionZh: '允许基岩版客户端连接 Java 版服务器' },
  'GeyserMC': { titleZh: '间歇泉', descriptionZh: '允许基岩版客户端连接 Java 版服务器' },
  'ViaVersion': { titleZh: '版本穿越', descriptionZh: '让不同版本的客户端同时加入同一服务器' },
  'Via Backwards': { titleZh: '版本回溯', descriptionZh: '让旧版本客户端加入新版服务器' }
};

// ============ 快速索引系统 ============

// 精确匹配索引：小写名 -> 原始名
const EXACT_INDEX = new Map();
// slug 索引：连续字母数字名 -> 原始名
const SLUG_INDEX = new Map();

(function buildIndices() {
  for (const name of Object.keys(MOD_ZH_MAP)) {
    const lower = name.toLowerCase();
    if (!EXACT_INDEX.has(lower)) {
      EXACT_INDEX.set(lower, name);
    }

    const slugged = lower.replace(/[^a-z0-9]/g, '');
    if (!SLUG_INDEX.has(slugged)) {
      SLUG_INDEX.set(slugged, name);
    }
  }
})();

/**
 * 简化名称用于匹配：
 * - 转小写
 * - 移除非字母数字字符
 */
function simplifyName(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/[\s\-_\[\]\(\)\:：·'']/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '')
    .trim();
}

/**
 * 根据英文名称获取中文信息
 * @param {string} englishName - 英文模组名
 * @param {string} [slug] - 可选的 slug（搜索结果中的 slug，用于更精确匹配）
 * @returns {{titleZh: string, descriptionZh: string}|null}
 */
function getChineseInfo(englishName, slug) {
  if (!englishName || typeof englishName !== 'string') {
    return null;
  }

  const trimmed = englishName.trim();
  if (!trimmed) return null;

  // 1. 精确匹配（忽略大小写）
  const exactKey = trimmed.toLowerCase();
  if (EXACT_INDEX.has(exactKey)) {
    return MOD_ZH_MAP[EXACT_INDEX.get(exactKey)];
  }

  // 2. 如果有 slug，先用 slug 匹配（slug 更标准）
  if (slug && typeof slug === 'string') {
    const slugClean = simplifyName(slug);
    if (slugClean && SLUG_INDEX.has(slugClean)) {
      return MOD_ZH_MAP[SLUG_INDEX.get(slugClean)];
    }
    // slug 精确部分匹配：slug 名中的整个部分
    const lowerSlug = slug.toLowerCase();
    // 找包含完整 slug 的映射键，或反过来
    const slugCandidates = Object.keys(MOD_ZH_MAP)
      .filter(key => {
        const lowerKey = key.toLowerCase();
        // 至少要有 6 个字符的重叠才认为是匹配
        return (lowerKey.length >= 6 && lowerSlug.includes(lowerKey)) ||
               (lowerSlug.length >= 6 && lowerKey.includes(lowerSlug));
      })
      .sort((a, b) => b.length - a.length);
    if (slugCandidates.length > 0) {
      return MOD_ZH_MAP[slugCandidates[0]];
    }
  }

  // 3. 简化名精确匹配
  const simplified = simplifyName(trimmed);
  if (simplified && SLUG_INDEX.has(simplified)) {
    return MOD_ZH_MAP[SLUG_INDEX.get(simplified)];
  }

  const lowerName = trimmed.toLowerCase();
  const allKeys = Object.keys(MOD_ZH_MAP);
  // 较长的键优先匹配（更具体）
  const sortedKeys = allKeys.slice().sort((a, b) => b.length - a.length);

  // 4. 模组名完全包含映射表中的某个键（且长度 >= 6，避免短词误匹配）
  for (const key of sortedKeys) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.length < 6) continue;
    // 检查：模组名中出现完整的映射键
    if (lowerName.includes(lowerKey)) {
      // 额外检查：确保是单词边界匹配
      const idx = lowerName.indexOf(lowerKey);
      const before = idx === 0 ? ' ' : lowerName[idx - 1];
      const after = idx + lowerKey.length >= lowerName.length ? ' ' : lowerName[idx + lowerKey.length];
      // 检查前后字符不是字母数字（确保是完整单词的一部分）
      if (!/[a-z0-9]/.test(before) || !/[a-z0-9]/.test(after)) {
        return MOD_ZH_MAP[key];
      }
    }
  }

  // 5. 映射表键包含模组名（用于较短的输入）
  for (const key of sortedKeys) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.length < 6 || lowerName.length < 6) continue;
    if (lowerKey.includes(lowerName)) {
      // 检查是否是合理的包含匹配
      const idx = lowerKey.indexOf(lowerName);
      const before = idx === 0 ? ' ' : lowerKey[idx - 1];
      const after = idx + lowerName.length >= lowerKey.length ? ' ' : lowerKey[idx + lowerName.length];
      if (!/[a-z0-9]/.test(before) || !/[a-z0-9]/.test(after)) {
        return MOD_ZH_MAP[key];
      }
    }
  }

  // 6. 简化名的部分匹配（用于解决空格/标点的差异）
  for (const key of sortedKeys) {
    const simplifiedKey = simplifyName(key);
    if (!simplifiedKey || simplifiedKey.length < 8) continue;
    if (simplified.includes(simplifiedKey) || simplifiedKey.includes(simplified)) {
      return MOD_ZH_MAP[key];
    }
  }

  return null;
}

/**
 * 批量获取中文信息
 * @param {Array<{id: string, title: string, slug?: string, description?: string}>} items
 * @returns {Object<string, {titleZh: string, descriptionZh: string}>}
 */
function getChineseInfoBatch(items) {
  const results = {};
  if (!Array.isArray(items) || items.length === 0) {
    return results;
  }

  for (const item of items) {
    if (!item || !item.title) continue;

    const info = getChineseInfo(item.title, item.slug);
    if (info) {
      const id = item.id || item.title;
      results[id] = info;
    }
  }

  return results;
}

module.exports = {
  getChineseInfo,
  getChineseInfoBatch,
  MOD_ZH_MAP
};
