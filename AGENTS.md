# AGENTS.md — 妖精的尾巴 · 每日日程表

> 本文件是给 AI 助手阅读的项目指南。任何 AI 接管本项目时，请先通读此文件。

---

## 一、项目概述

妖精的尾巴公会主题每日日程表，纯前端静态站点（HTML + JS + CSS），无后端框架。
用户通过 GitHub Pages 托管，Supabase 做云端数据同步。

**线上地址**：https://kkkkai-kai.github.io/fairy-tail-guild-schedule/
**GitHub 仓库**：`kkkkai-kai/fairy-tail-guild-schedule`（main 分支）
**本地路径**：`C:\Users\ASUS\Documents\Codex\2026-09-14\wo\outputs\`

---

## 二、文件结构与职责

### v107分类目录（优先于旧路径示例）

根目录仅保留两入口、`guild-sw.js`、`guild-manifest.webmanifest`、本指南和本地启动入口。
八个核心脚本位于 `代码/`，新增 `代码/guild-assets.js` 在它们之前加载；UI样式位于 `样式/`。
图片分为 `素材/人物/{id-中文名}/头像|像素小人|状态图|状态表`、`素材/场景/{房间}`、`素材/界面/边框|功能图标|站点标识|背景剪影`、`素材/道具/`。
工具在 `工具/`，素材审计在 `资料/素材审计/`；代码快照在 `备份/代码/`（最多5代），真实历史在 `备份/云端历史/` 等受保护目录。
完整接入规则见 `资料/文件分类与素材接入.md`。未来新图直接归类后运行 `node 工具/更新素材索引.cjs`，更新目录索引和旧路径兼容表。
旧任务保存的图片名用 `guildAssetPath()` 解析，不改任务ID或历史数据。CSS图片路径相对于样式文件；Service Worker继续保留根目录保证原作用域。
旧表格和示例中单独的核心文件名均指 `代码/` 下同名文件；辅助HTML指 `工具/`，版本样式指 `样式/`。

### 核心页面
| 文件 | 说明 |
|---|---|
| `index.html` | 主入口，与 `每日日程表.html` 内容完全一致（两者同步维护） |
| `每日日程表.html` | 同上，中文名入口。两个 HTML 必须保持完全一致 |

### 核心脚本（按 HTML 中加载顺序）
| 文件 | 说明 |
|---|---|
| `quotes.js` | 名言数据库 |
| `guild-history-recovery-v65.js` | 公会历史恢复功能 |
| `growth.js` | 成长履历系统 |
| `v4.js` | 核心业务逻辑（委托板、钱包、仓库等） |
| `guild-cloud-sync.js` | **云端同步桥**（hook localStorage，Supabase REST API） |
| `schedule.js` | 日程表渲染与交互 |
| `guild-features-v64.js` | 公会功能面板（出勤、声望、羁绊等） |
| `guild-dock-panel.js` | 码头面板（底部停靠栏） |

### 缓存与配置
| 文件 | 说明 |
|---|---|
| `guild-sw.js` | Service Worker，stale-while-revalidate 策略 |
| `guild-manifest.webmanifest` | PWA 清单 |

### 图片资源
| 文件 | 说明 |
|---|---|
| `guild-dock-icon.png` | 右下角码头按钮图标（妖尾公会徽章风格） |
| `guild-icon-192.png` | PWA 图标（192x192） |
| `guild-icon-512.png` | PWA 图标（512x512） |
| `celestial-portrait-*.png` | 星灵肖像图（12 星座） |
| `celestial-sprite-*-pixel-v1.png` | 星灵像素图（12 星座） |

### 辅助工具（不参与线上部署）
| 文件 | 说明 |
|---|---|
| `compare-four-sources.html` | 数据源对比工具页 |
| `migrate-to-supabase.html` | Supabase 迁移工具页 |

---

## 三、云端后端：Supabase

### 凭据配置
位于 `guild-cloud-sync.js` 顶部 `CONFIG` 对象：

```javascript
supabaseUrl: 'https://pjrcbacixmfdytuvgetu.supabase.co',
supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',  // anon key，可安全暴露
supabaseTable: 'guildcloudsync',
```

### 数据库表结构
表名 `guildcloudsync`，字段：
| 列名 | 类型 | 说明 |
|---|---|---|
| `key` | text (PK) | localStorage key |
| `value` | text | JSON 字符串值 |
| `updated_at` | bigint | 本地时间戳 |

### 额度状况
- Supabase 免费层：500MB 存储
- 当前使用：约 2.6MB（0.5%），极其充裕
- API 调用：免费层无限 REST 请求

### 同步机制
- 通过 hook `Storage.prototype.setItem` 拦截本地写入
- 推送：本地变更 → 防抖 0.8s → Supabase REST upsert
- 拉取：5 分钟懒轮询（先 meta 探测 ~1KB，有更新才全量拉取）
- 冲突处理：议会·双卷核对（任务数据按条合并，完成状态保护）

---

## 四、部署流程（关键！）

### 4.1 版本号管理（每次部署必做）

部署前必须更新以下两处版本号（两者独立，可以不同，但各自必须更新）：

1. **`guild-sw.js`** 第 5 行（控制 Service Worker 缓存刷新）：
   ```javascript
   var CACHE_VER = 'guild-v{N}-{描述}-{日期}';
   ```

2. **`index.html` + `每日日程表.html`** 所有 8 个 `<script>` 标签的 `?v=` 参数（控制浏览器缓存失效）：
   ```html
   <script src="quotes.js?v=guild-v{N}-{描述}-{日期}"></script>
   <!-- 以下 7 个 script 标签同理，两个 HTML 必须完全一致 -->
   ```

**说明**：SW 版本和 HTML `?v=` 版本可以不同——`?v=` 让浏览器重新拉取 JS 文件，`CACHE_VER` 让 SW 重建缓存。关键是两个 HTML 的 `?v=` 必须一致，且 SW 版本在需要清除 SW 缓存时更新。

**注意**：两个 HTML 文件必须保持完全一致，每次改动都要同步修改两边。

### 4.2 部署方式一：git push（网络正常时）

```bash
cd "C:\Users\ASUS\Documents\Codex\2026-09-14\wo\outputs"
git add <修改的文件>
git commit -m "v{N}: 描述"
git push origin main
```

GitHub Pages 会自动构建部署。

### 4.3 部署方式二：gh API 推送（git push 失败时的备用方案）

当 `git push` 因网络问题连不上 github.com:443 时，`gh` CLI 的 API 通常仍可访问。
按以下步骤通过 GitHub Git Data API 直接推送：

```bash
GH='/c/Program Files/GitHub CLI/gh.exe'
REPO="kkkkai-kai/fairy-tail-guild-schedule"

# 1. 获取远程当前 tree SHA
REMOTE_SHA=$("$GH" api repos/$REPO/git/ref/heads/main --jq '.object.sha')
BASE_TREE=$("$GH" api repos/$REPO/git/commits/$REMOTE_SHA --jq '.tree.sha')

# 2. 为每个修改的文件创建 blob（文本文件用 base64 编码）
B64=$(base64 -w0 <文件路径>)
echo "{\"content\":\"$B64\",\"encoding\":\"base64\"}" > /tmp/blob.json
FILE_SHA=$("$GH" api repos/$REPO/git/blobs" --input /tmp/blob.json --jq '.sha')

# 3. 创建 tree（包含所有修改的文件）
cat > /tmp/tree.json << EOF
{
  "base_tree": "$BASE_TREE",
  "tree": [
    {"path": "文件名", "mode": "100644", "type": "blob", "sha": "$FILE_SHA"},
    ...
  ]
}
EOF
TREE_SHA=$("$GH" api repos/$REPO/git/trees" --input /tmp/tree.json --jq '.sha')

# 4. 创建 commit
cat > /tmp/commit.json << EOF
{
  "message": "v{N}: 描述",
  "tree": "$TREE_SHA",
  "parents": ["$REMOTE_SHA"]
}
EOF
COMMIT_SHA=$("$GH" api repos/$REPO/git/commits" --input /tmp/commit.json --jq '.sha')

# 5. 更新 ref
"$GH" api repos/$REPO/git/refs/heads/main -X PATCH -f sha="$COMMIT_SHA"
```

**注意**：二进制文件（如 PNG）同样 base64 编码后创建 blob，方法一致。
推送后检查构建状态：`"$GH" api repos/$REPO/pages --jq '.status'`

### 4.4 部署后验证

```bash
# 检查 Pages 构建状态
"$GH" api repos/kkkkai-kai/fairy-tail-guild-schedule/pages --jq '.status'
# 期望输出：built

# 确认最新 commit
"$GH" api repos/kkkkai-kai/fairy-tail-guild-schedule/commits/main --jq '.commit.message'
```

---

## 五、部署检查清单

每次部署前，逐项确认：

- [ ] `guild-sw.js` 的 `CACHE_VER` 已更新（如需清除 SW 缓存）
- [ ] `index.html` 的 8 个 `?v=` 已更新
- [ ] `每日日程表.html` 的 8 个 `?v=` 已更新（与 index.html 一致）
- [ ] 所有修改的文件已 `git add`
- [ ] commit message 包含版本号和变更描述
- [ ] 推送后确认 GitHub Pages 状态为 `built`

---

## 六、铁律（绝对不可违反）

1. **禁止出现任何腾讯云 / CloudBase 代码**。用户明确要求彻底清除，代码中不得出现 `cloudbase`、`CloudBase`、`腾讯云`、`cb*` 前缀（已统一为 `supa*`）。
2. **两个 HTML 必须同步修改**。`index.html` 和 `每日日程表.html` 内容始终一致。
3. **版本号两处各自更新**。两个 HTML 的 `?v=` 必须一致；`guild-sw.js` 的 `CACHE_VER` 在需要清除 SW 缓存时更新（两者可以不同）。
4. **不改动 Supabase 凭据**。anon key 已配好，不要替换或移除。
5. **不改动 `schedule.js` 的数据结构**。云同步通过 hook localStorage 实现，不侵入业务代码。
6. **部署前确认额度**。Supabase 免费层 500MB，当前使用 <1%，无需担心。

---

## 七、用户偏好

- 使用中文回复
- 提供选择题而非开放问题（给 2-4 个选项让用户选）
- 部署操作需要用户授权确认（但用户已授权日常部署可自主执行）
- 可以直接接管操作，不需要逐步询问
- 禁止使用腾讯云 / CloudBase 相关任何代码或服务

---

## 八、常见问题

### Q: 修改了某个 JS 文件但线上没生效？
A: 检查版本号是否更新。必须同时更新 `guild-sw.js` 的 `CACHE_VER` 和两个 HTML 的 `?v=` 参数，否则 Service Worker 会返回旧缓存。

### Q: git push 连不上 github.com？
A: 使用 4.3 节的 gh API 备用方案。`gh` CLI 走 api.github.com，通常不受影响。推送后记得在本地执行 `git fetch origin && git reset --soft origin/main` 同步本地状态。

### Q: 新增了一个 JS 文件需要加入部署？
A: 在两个 HTML 中添加 `<script src="新文件.js?v=当前版本号"></script>`，同时更新 `guild-sw.js` 的 `CORE_URLS` 数组（让 SW 缓存新文件），并更新 `CACHE_VER` 触发 SW 重建缓存。

### Q: 如何新增一个需要同步的 localStorage key？
A: 在 `guild-cloud-sync.js` 的 `CONFIG.syncKeys` 数组中添加新 key。所有参与云同步的数据 key 都在这里声明。
