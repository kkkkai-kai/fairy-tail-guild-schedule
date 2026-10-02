# 公会实景 v96：到访、通路、四时与发光情报

## 增量实施提示词

在 v95 上增量升级，不重写项目、不改任务、奖励、人物分配、存储结构或云同步。哈比常驻；其他四猫采用北京时间每日稳定随机，40% 无访客，其余四猫各15%，刷新不重抽。同一天、跨终端使用相同日期种子。当天完成某猫实际承担的正式委托后，该猫额外到访；按保存的 assigneeId 判定，不能按标题猜身份。完成触发的到访可超过随机访客上限；次日重新判断，不把历史完成永久解锁。正式成员与剑咬之虎来访身份保持区分。小窝猫咪不重复渲染到普通房间。

触碰猫咪产生角色对白，不发奖励、不直接打开照料弹窗。原有照料改由小窝内的发光补给篮打开。对白为基于性格的原创短句，不宣称原著台词。

大厅为公会枢纽，内部路线为：大厅—告示厅—情报角—大厅；大厅—卷宗架—研读角；大厅—吧台—哈比小窝。每个实景内部显示通往相邻区域的入口，沿实际连接关系生成切换文案。情报角新背景的左门可见同一公会大厅。这里是系统主题功能分区，不宣称这些房间结构在原著中逐一得到证实。

情报角实景通过来信、便签、卷宗三种发光物件承载信息，点击打开同一卷宗。待处理发光，处理后光芒减弱，保留历史记录及必要完成按钮。删除场景外的情报状态按钮与小窝下方照料按钮；保留场景地图、内部通路、键盘与触屏操作。

全部7个常规房间使用北京时间四时：05–10清晨，10–17白昼，17–20黄昏，20–05夜晚；定时检查和返回页面时刷新，不强制回到大厅。沿用原有闵行天气逻辑。已有20张四时房间图和小窝白昼图不重复生成，本轮仅新增7张：

- guild-intel-{dawn,day,sunset,night}-v96.png
- guild-happy-nook-{dawn,sunset,night}-v96.png

## 内置生成模式与提示词

使用内置图像生成工具，不安装依赖、不使用额外API密钥。情报角以现有公会大厅及卷宗架图片作风格参考。新图为主题同人素材，而非动画截图或原作逐帧复原。

情报角白昼生成提示：Create one NEW 4:3 Fairy Tail guild intelligence corner, matching supplied existing hall and archive pixel JRPG references. Modest wooden nook adjoining mission board; left doorway shows the same wooden hall. Diamond-lattice windows, parchment board, brass lanterns, familiar red Fairy Tail banners, letter tray, writing desk and dossier shelf. Warm ochre wood, cream plaster, clear central floor. No people, cats, labels, UI, computers, invented magic machines or new emblem. Whole canvas, no border. Faithful fan utility nook, not a claim of exact canonical room.

六张时段编辑提示：Use case lighting-weather. Edit the supplied same room into dawn / sunset / night. Dawn: pale peach-blue sky, low morning light. Sunset: warm orange-pink sky and angled golden light. Night: deep blue sky, indoor brass lanterns and hearth remain warmly readable. Preserve exact framing, perspective, geometry, doorway, window, furniture, cushion, basket, shelves, banners and floor. Change only illumination, sky and shadows. No characters, new objects, writing, border, gray/white haze or excessively dark interior.

## 验证

隔离Edge测试，拦截外网，不读写真实用户云数据。1000个日期随机样本：无人396、夏露露144、利利150、弗罗修157、雷克特153；全部日期稳定，随机到访至多一位。猫咪真实委托完成额外到访通过；全7场景28张时段图存在、各房间四张独立图片；所有场景路径有效；物件完成后光芒减弱；移除下方按钮；触碰对白与补给照料、相邻切换、390宽度无横向溢出、清晨跨白昼自动更新通过。详见 guild-scenes-v96-test.json。

保留修改前备份 backup-before-v96-scenes-20261003-013612。不清除 localStorage，不重新结算历史。
