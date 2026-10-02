# v95 情报角与超越者小窝

右侧今日公会动态已移到公会实景的情报角。大厅来信可以通往情报角；来信、便签、回执分别打开今日奇遇、轻量事项和访客记录。一个可滚动卷宗承载原有操作，不新增奖励规则。已处理见闻留存。

哈比小窝新增五张独立透明小人：哈比、夏露露、利利、弗洛修、雷克特。后两位为剑咬之虎来访伙伴，不加入正式协助者池。小人复用现有唯一移动调度器，逐个移动，减少动态偏好下不移动。点击哈比打开原有伙伴照料，其他伙伴显示原创简短对白（不是原著台词）。本轮仅生成待机图，未声称新增喂食等状态动画。

素材由内置图像生成模式一次生成五人横排表，再依据透明连通区域拆成五个文件，保留耳朵、尾巴和脚。文件为 guild-exceed-{happy,carla,lily,frosch,lector}-idle-v95.png。原表 guild-exceeds-sheet-v95.png 与透明审计 guild-exceeds-v95-audit.json 留在本地。

设定参考：
- https://www.fairytail100yq.com/character/happy.html
- https://www.fairytail100yq.com/character/charles.html
- https://www.tv-tokyo.co.jp/anime/fairytail2015/chara/
- https://fairytail-tv.com/before/news2/detail.php?id=1000228

生成提示：One transparent sheet, exactly five full-body Fairy Tail Exceed pixel sprites in one horizontal row: Happy blue with green scarf; Carla white in pink dress with tail bow, cat form; Panther Lily small charcoal cat with white muzzle, eye scar and pale trousers; Frosch green face in pink frog hoodie; Lector reddish-brown cat in blue vest. Shared pixel density, front three-quarter idle pose, generous alpha-zero padding, whole ears/tails/feet. No background, frames, text, invented accessories, extra characters or overlapping silhouettes. Identity references: existing Happy/Carla/Lily local sprite files. Use crisp 2D JRPG pixel clusters, recognisable at 42–56px.

验证：全部本地 JS 语法检查通过；隔离 Edge 桌面1366和手机390测试无页面异常，外网请求拦截，不读写真实云端数据。检查右侧动态移除、唯一卷宗、三个热点、轻量事项完成不更改任务列表、五图加载、手机无横向溢出、刷新场景保持。两张预览：guild-intel-v95-desktop.png、guild-intel-v95-mobile.png。备份：backup-before-v95-intel-20261003-000900。
