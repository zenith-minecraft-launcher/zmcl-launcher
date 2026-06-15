# ZMCL 开源代码清理报告

生成时间: 2026/6/15 14:22:22

## 清理统计

- 复制文件总数: 62
- 检测到敏感信息的文件数: 4

## 清理详情

### `src\main\ai\deepseek.js`
- DeepSeek API Key × 1

### `src\main\config\store.js`
- 爱发电 User ID × 1
- 爱发电 API Token × 1
- 爱发电 Plan ID × 1

### `src\main\main.js`
- 爱发电 User ID × 1
- 爱发电 API Token × 1

### `src\renderer\js\app.js`
- 本地绝对路径 (正斜杠) × 2

## 开源前请再次核对

1. 搜索整个目录是否还有 `sk-` 开头的字符串（可能是新增的 API Key）
2. 搜索是否还有 `74739`（本地用户名）
3. 搜索是否还有包含 `ifdian` / `deepseek` 的硬编码凭据
4. 确认 `package.json` 中的 `author` / `repository` 字段符合你的公开身份
5. 检查 `src/main/config/store.js` 的 `aiIfdian*` 字段已被替换为占位符
6. 检查 `src/main/ai/deepseek.js` 的 `DEFAULT_API_KEY` 已被替换为占位符

## 二次扫描 - 潜在漏网敏感信息

### `CLEANING_REPORT.md`
- 类型: 本地用户名片段
- 疑似值: 74739

