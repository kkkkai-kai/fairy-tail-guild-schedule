# v105 边框层级与清理交付

使用 $fairy-tail-guild 约定维护；imagegen 内置工具仅生成两款透明边框，skill-creator 用于补充清理规则。未修改任务数据、奖励、人物分配、等级称谓和同步业务。

## 已接入

- 纳兹的行动力：guild-frame-natsu-v105.webp（28,706 bytes）。
- 露西的星灵笔记：guild-frame-lucy-v105.webp（31,982 bytes）。
- 主模块边框预留8–20px、角饰18–40px；档案20px、实景10px、辅助8–14px，子卡1–3px。不再所有大框17px。
- 远征子卡、档案分区、魔法卡与弹出面板补细边；不改变按钮、事件与人物。
- 活跃样式 guild-ui-v105.css，核心缓存 guild-v105-frames-cleanup-20261004。

## 参考与设计边界

主题灵感核对[露西官方介绍](https://fairytail100yq.com/character/lucy-heartfilia.html)（星灵钥匙、小说家）及[纳兹官方介绍](https://www.fairytail100yq.com/character/nastu-dragneel.html)（火之灭龙魔法）。边框是兼容原作元素的同人UI，不是原著官方道具。

## 最终生成提示词（内置工具）

### 露西

Use case: stylized-concept. Asset type: transparent raster UI nine-slice border for a Fairy Tail guild task webpage. Input image: style/reference only, not edit target. New square frame matching warm parchment, walnut and antique brass craft texture of reference, but character-specific. Absolutely transparent center and exterior (alpha=0). Only outer 10% rails, corner ornaments within 18% square. Straight thin repeatable middle rails for nine-slice scaling. No text, no labels, no portraits, no people, no scene, no background panel, no magic circles, no watermarks. Refined readable miniature ornaments, understated not gaudy. Lucy Heartfilia theme inspired by her canonical Celestial Spirit gate keys and novelist identity. Slim antique golden key at upper-left corner, blue silk detail, small ink quill and book-clasp at lower-right. Elegant fine gold and warm blue inset rails, parchment edges. Contrasting subtle blue and gold corner silhouette. Keep the interior 80% fully transparent.

### 纳兹

Use case: stylized-concept. Asset type: transparent raster UI nine-slice border for a Fairy Tail guild task webpage. Input image: style/reference only, not edit target. New square frame matching warm parchment, walnut and antique brass craft texture of reference, but character-specific. Absolutely transparent center and exterior (alpha=0). Only outer 10% rails, corner ornaments within 18% square. Straight thin repeatable middle rails for nine-slice scaling. No text, no labels, no portraits, no people, no scene, no background panel, no magic circles, no watermarks. Refined readable miniature ornaments, understated not gaudy. Natsu Dragneel theme inspired by canonical Fire Dragon Slayer magic and white segmented scarf. Dark warm walnut and reddish bronze rails with flame relief at upper-left/lower-right corners; tiny white grid-pattern scarf wraps only the other corners. Stronger angular fiery corners but quiet thin connecting rails, orange-red accent not neon. Keep interior 80% fully transparent.

## 清理结果

- 源目录：重复PNG 27张、旧测试截图 10张、旧报告/提示词 32项、早期纯代码备份 26组。归档 4053186 bytes；净减少 40756322 bytes。
- D盘镜像：重复PNG 27张、旧测试截图 6张、旧报告/提示词 26项、早期纯代码备份 8组。归档 1549093 bytes；净减少 34266638 bytes。

两目录各保留 guild-history-archive-v105.zip；旧代码和提示词先压缩并逐项SHA-256验证，再移除散文件。重复PNG的完整原图保存在 C:/Users/ASUS/.codex/generated_images/01a0b8aa-8598-7bb2-b513-e7ccef1f98cf，网页WebP仍在源与D盘。测试截图永久删除。独有数据快照、云历史备份、旧存档可引用素材、Git仓库、D盘分享版/密钥/历史素材归档未动。源保留v103/v104/本轮v105回退，D盘保留v102/v104/本轮v105回退及含独有素材的v89备份。

清理规则已写入 C:/Users/ASUS/.codex/skills/fairy-tail-guild/references/cleanup.md。普通维护只审计，不自动删除；明确清理请求才执行。

## 验证

隔离Edge阻断生产API：7场景图片解码通过、13档案分区有边框、1920/1366/390无横向溢出，阶段操作组未越出卡片，测试任务身份和完成状态刷新保持，无JavaScript异常。静态入口、引用、8脚本及SW语法通过；两HTML相同。该验证不代表操作了用户真实存档或验证了云数据合并。

技能原始Python验证器缺少yaml依赖，未安装新依赖；已替代检查frontmatter、引用文件与未完成占位项。

