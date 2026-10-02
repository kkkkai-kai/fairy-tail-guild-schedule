# v94 哈比小窝与委托紧凑排版

- 新背景：`guild-happy-nook-v94.png`。内置图像工具生成一次；现有吧台背景作风格参考，不含人物。小窝是系统原创伙伴角，不是宣称原著出现的地点。
- 原著依据：https://www.fairytail100yq.com/character/happy.html 。官方明确哈比是纳兹的蓝色超越者伙伴、喜欢鱼。
- 入口：左侧公会实景地图的“哈比小窝”；右侧今日动态伙伴角也有同名入口。与吧台相连，复用唯一场景舞台。
- 常驻哈比不计为新归队成员，小窝容量为零，不接收普通成员的随机分房。不影响完成委托后才归队的规则。
- 状态：直接读取现有 happyStatus 和 happy-pet-states-v2.png；饱足≤20显示很饿，≤45想吃鱼，心情≤25无聊，≤50想玩。既有喂养、玩具、摸头、睡眠短时状态优先，到期恢复。没有新增状态奖励。
- 互动：点击场景中的哈比打开伙伴角；小窝摸头调用原 touchHappy，陪伴复用已有互动按钮。既有库存、确认与每日上限保持不变。
- 一张背景搭配清晨、白昼、黄昏、夜晚CSS光线，复用既有闵行天气数据和效果。滤镜不是四张独立绘制背景，也不保证模拟真实室内光照。
- 紧凑排版：测试1366px下单次委托94.67→82.67px，远征阶段58→50.13px。全部按钮保留；手机允许自然换行，不追求固定高度。
- 测试使用隔离浏览器与本地模拟数据，所有外部同步请求拦截，没有访问或改写生产数据库、用户浏览器数据。

## 最终生成提示词（内置工具）

Use case: stylized-concept. Project asset: single background for Happy's nook inside an existing Fairy Tail guild task website. Reference image is STYLE AND ARCHITECTURAL CONTINUITY reference, not exact edit. Make ONE cohesive warm 2D pixel-art JRPG interior, landscape 4:3, matching the reference timber beams, cream plaster, red guild pennants, brass lamps and stone floor. This is a modest original partner corner adjacent to the guild tavern, NOT a claimed canonical location. A low hand-made wicker nest with a blue soft cushion at center-left, a small wooden fish basket and plate nearby, a simple fish-shaped cloth toy, a green knotted bundle on a shelf. Open window at upper right overlooking muted rooftops, warm daylight and lantern, small fireplace edge. Reserve clear floor and cushion area in central lower half for a separately overlaid tiny character. Clean distinct pixel blocks, no blur, readable at 360px wide. NO characters, NO cats, NO Happy embedded, no human, no UI, no border/frame, no lettering or watermark, no modern pet towers/plastic, no extra magic devices. Economical one background used with CSS time-of-day lighting; avoid dramatic night lighting.
