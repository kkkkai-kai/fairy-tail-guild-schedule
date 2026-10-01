# v87 人物素材接入记录

## 本轮范围与真实结果

- 唯一人物注册表共 57 项：正式成员 35、历史成员 2、来访盟友 9、独立星灵 11；洛基同时是正式成员与狮子座，未重复计数。
- 每项均接入归队、休整、庆祝三种独立透明全身图，以及三张独立头像。171 张全身图中复用 v86 的 12 张，其余 159 张为本轮新图；171 张头像为本轮裁切图。新增 PNG 合计 330 张。
- 所有最终图片的四边与至少 8px 透明留白检测通过；逐图结果在 `guild-visual-v87-manifest.json`。去除生成器的极低 Alpha 噪声和与主体断开的微小装饰，再保留透明边距，不使用混合模式伪装透明。
- 不是新增 57 位正式成员，也不是六状态全套。多数角色现在有三种独立姿态，部分复用旧十状态头像表。阶段数超过可用独立素材数时仍会循环；没有把重复图片算作新状态。
- 这些是按原作特征制作的同人像素素材，不是官方原图，也不宣称与漫画逐像素一致。不同批次的细节密度仍有差别；页面采用 pixelated 与统一体型尺寸显示。

## 身份修正

旧图出现格雷对应白发女性、温蒂对应棕发女性、拉克萨斯对应白猫、斯汀对应粉发女性、天蝎座对应红发女性等错配。本轮注册表改用对应人物的新图，旧文件保留且不再作为错误身份的备用图。

重点核对：梅比斯金发、翼形头饰与浅色服装；阿兹玛棕色发辫而非绿发；双子座是蓝色双胞胎星灵；射手座马头装束下的人脸；天秤座原版棕色卷发、面纱、秤；双鱼座黑白双鱼。天秤座与双鱼座的主人标识改为雪乃。历史任务 assigneeId 不改写，访客不混入正式成员分配池。

原作参考入口：[东京电视台动画角色资料](https://www.tv-tokyo.co.jp/anime/fairytail2015/chara/)、[百年任务官方角色页](https://www.fairytail100yq.com/character/)。次要角色与星灵的细部使用 [Azuma](https://fairytail.fandom.com/wiki/Azuma)、[Libra](https://fairytail.fandom.com/wiki/Libra)、[Sagittarius](https://fairytail.fandom.com/wiki/Sagittarius)、[Pisces](https://fairytail.fandom.com/wiki/Pisces) 等原作资料交叉核对，不使用 Fanon 角色条目。

## 实际接入与触发

- `guildMemberRegistry` 是唯一人物资源入口，包含独立全身图、三张头像与状态资源。移除旧二次覆盖资源的初始化，避免正确映射被旧错图覆盖。
- 公会实景仍只接纳当天整项完成的角色。完成后 90 秒内使用归队图，之后使用休整图；手动启动一次性 A/S 归队庆典时，所有当场成员使用各自的庆祝图。
- 保留已有四张 v86 庆典背景及彩带、举杯、聚拢与欢呼活动，不叠加第二张背景。
- 普通任务头像以任务 ID、人物 ID、完成状态稳定选择；刷新不会换人物。用户保存的状态选择继续优先。
- 阶段头像先按实际图片文件或精灵格去重，再按固定顺序选择。完成阶段不会重新抽头像。旧十状态表仅用于头像，不用于场景全身小人。
- 人物显示尺寸调整为普通 38px、大体型 42px、小体型 30px、Exceed 26px；无人物按钮底板或边框。
- 没有修改阶段完成、已完成锁定、任务结算、等级、云同步桥、仓库或历史数据结构。

## 生成方式与节省额度

使用内置 imagegen，按 4 人 × 3 姿态生成透明表后裁切；只重做身份或裁切不合格的格组。正确的 v86 图保留复用。原始生成文件保留在 Codex generated_images，项目只引用裁切后的独立 PNG。

最终提示词模板：

> Create a canonical Fairy Tail transparent JRPG pixel sprite atlas, exactly [columns] columns by 3 rows. Columns in this exact order: [canonical character names]. Rows: welcoming mission return, relaxed rest, joyful guild celebration. Preserve each character's verified original hairstyle, hair color, costume silhouette, palette, age, body type and signature accessories. Full head, hands and feet; consistent pixel density; every body occupies only 60% of its cell; generous transparent margins and gutters. True alpha=0 outside body and held props. No invented characters, swapped identity, floor, shadow plate, glow, text, logo, watermark, overlap or clipped limbs. Assets will be cropped into individual sprites and portraits, not displayed as a CSS atlas.

定向返修追加约束：

- Azuma: brown dreadlocks, dark green armor, light green sleeves, orange-green trousers.
- Sagittarius: HUMAN face visible below the horse-head costume hood, green vest, striped trousers, bow.
- Libra: original dark-tanned skin, brown curly high hair, lower-face veil, striped frilled top, patterned loincloth, gold scales; no green-haired Eclipse version.
- Gemini: two blue humanoid twins in one cell, not jesters.
- Pisces: original black-and-white fish pair, not generic fish mascots.
- Padding repair: re-render each subject at half scale within its cell, preserving identity and pose, fully separated from neighboring rows and canvas edges.

## 验证与边界

`guild-visual-v87-browser.json` 记录隔离 Edge 桌面与手机宽度测试。测试阻断所有外部服务，使用新浏览器上下文与临时任务，不读取或清空用户浏览器 localStorage，不向真实云数据库写测试数据。

该测试不能代替用户真实存档的人工核对，也不声称完成所有旧历史 ID 的身份恢复。无原作依据的人物不会被随意映射为另一个角色。
