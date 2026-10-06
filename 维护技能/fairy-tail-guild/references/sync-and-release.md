# 存档、同步、性能与交付

## 基线（接手需重新核验）

源C:/Users/ASUS/Documents/Codex/2026-09-14/wo/outputs；镜像D:/开开的读研记录本。
index.html与每日日程表.html字节一致。
线上https://kkkkai-kai.github.io/fairy-tail-guild-schedule/，仓库kkkkai-kai/fairy-tail-guild-schedule，main。
后端Supabase，桥guild-cloud-sync.js；不恢复旧Netlify/Tencent/CloudBase命令、密钥或先删后加。
主要脚本quotes.js、guild-history-recovery-v65.js、growth.js、v4.js、guild-cloud-sync.js、schedule.js、guild-features-v64.js、guild-dock-panel.js；以HTML真实引用为准。
v107起上述脚本在代码/；guild-assets.js先加载，UI在样式/，图片在素材/，备份在备份/代码与备份/云端历史。完整归类规则读[file-organization.md](file-organization.md)。SW与manifest仍在根目录，不能迁走而改变作用域。
截至2026-10-04基线v104，后续读版本，不回写这个数字。

## 数据保护与跨端

- 静态部署不等于存档迁移。file://、线上域名、电脑、手机的localStorage分别独立，只有同一空间和正常同步桥/权限才互通。
- “同步一下”先区分程序和个人数据，文件SHA一致不是任务一致。
- 丢历史先只读比真实本地、云值、备份与版本；任务ID、完成、阶段、J/EXP账本、库存、删除标记分别比，不只总数。
- 防启动空值覆盖云、旧云覆盖未上报新任务、整JSON时间戳最后写入吞掉另一端；按条目/事件版本正确合并。
- 完成、主动撤销、取消删除和库存各有语义；完成保护不屏蔽有记录的主动撤销，旧任务重放不复活已删除。
- 幂等流水，不重新算金额填历史，不先删云再增；HTTP成功还要核验可读回业务值。
- 私有JSON、访问令牌、浏览器配置不公开。备份导入有恢复路径，冲突不盲覆。
- 额度报告须当前核验；历史“2.6MB/额度充足”不是实况。API、媒体流量、生成额度分开。

## 性能、缓存

- 测首屏请求/大小/解码/重复下载，不一概归网速。
- 原图至少保留一份可访问副本，轻量WebP适配实际尺寸，保Alpha/身份/状态且确实接入；重复副本清理按cleanup.md。
- 优先当前场景/必要头像，其他按需，仅预载当前时段适量房间，不全量四时天气。
- 查真实CSS层叠、动态style与最终src，注册表不是页面证据。
- 核心按版本，版本化图片独立缓存；安装取成功的最新网络响应，不用ignoreSearch把新?v命中旧核心。
- 更新两HTML核心脚本和活跃CSS?v、SW CACHE_VER/CORE_URLS及注册URL；读当前策略，不盲替SW。
- 不清localStorage修缓存，不强刷丢草稿；程序缓存与存档分开。

## 验证、发布、清理

- 修改前保护源/镜像较新文件，备份不覆盖。
- scripts/audit-guild.ps1只读检查入口、直接引用、语法和版本，不证明互动、人物身份、云合并。
- 在已有PowerShell 7运行脚本；默认检查源目录，-ProjectRoot可指定隔离目录，-CompareMirror启用D盘核心文件SHA比较。JSON passed只代表列出的静态检查；失败退出1，不修改或自动修复任何文件。
- 交互用隔离浏览器并阻断生产API写入；失败如实报告，不把测试截图当用户页面验证。
- 验自然比例/透明/加载、长标题/收起/完成/滚动、代表手机尺寸；验刷新持久、幂等和旧记录不变。
- 发布需当前授权。只暂存相关文件，不git add .推私有JSON/备份/测试脚本。
- Git优先；Git Data API备用需读最新树、核对相关文件冲突、基于远程parent提交；更新前复查head，force:false。分叉不授权强推/reset或丢用户更改。
- 源→D盘及线上分别SHA核验，等Pages构建，验实际线上程序与素材；API提交成功不等于网页更新。
- 有限重试，报告未完成，不不断发新版掩盖问题。
- 用户明确要求清理时读[cleanup.md](cleanup.md)，按引用、重复哈希、备份恢复与净释放量判断；无法确定用途的文件保留，不按年龄/通配符删除存档。
- 最终实际根因/改动、素材接入触发、各类验证、同步哈希、未验证项、地址。
