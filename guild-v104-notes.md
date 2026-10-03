# v104 各模块边框、协调配色与人物互动

16 张新边框使用内置图像生成工具制作；原始 PNG 与网页 WebP 均保存在本目录（guild-frame-{模块}-v104）。加上 v102 档案、大厅、登记三款，共19个主模块各有独立边框。
配色统一为胡桃木、旧铜、羊皮纸、小面积公会深红。这些是同人 UI 装饰，不冒称原著官方道具。
人物以脚底坐标定位，按实际节点尺寸限制范围，场景变更尺寸后重新校验。悬停和聚焦有短对白，点击保留送礼互动。对白为原创，不是原著引用。相遇在移动结束后检查实际距离。
未改任务ID、人物身份、等级称谓、奖励或历史；未清理文件或数据。
样式入口为 guild-ui-v104.css。缓存强制重新取核心文件，不忽略不匹配的版本号。上轮尚未发布的v103缓存修正包含在本次。

## 主模块与边框

- html .growth-card → guild-frame-archive-v102.webp
- html #guildHallScene → guild-frame-hall-v102.webp
- html .card:has(#newTask) → guild-frame-quest-v102.webp
- html .priority-board → guild-frame-priority-v104.webp
- html #guildCompendium → guild-frame-compendium-v104.webp
- html .card:has(#backlogList) → guild-frame-backlog-v104.webp
- html .card:has(#weeklyReview) → guild-frame-review-v104.webp
- html main>header,html .guild-content>header → guild-frame-header-v104.webp
- html .card:has(#upcomingList) → guild-frame-seven-v104.webp
- html .card:has(#projects) → guild-frame-expedition-v104.webp
- html #onceTasks → guild-frame-once-v104.webp
- html #cards>[data-module=learn] → guild-frame-learn-v104.webp
- html #cards>[data-module=experiment] → guild-frame-experiment-v104.webp
- html #cards>[data-module=life] → guild-frame-life-v104.webp
- html #cards>[data-module=extra] → guild-frame-extra-v104.webp
- html .treasury → guild-frame-treasury-v104.webp
- html #cards>[data-module=focus] → guild-frame-focus-v104.webp
- html #cards>[data-module=closing] → guild-frame-closing-v104.webp
- html #guildWeeklyChronicle → guild-frame-chronicle-v104.webp

## 实际生成提示词

### priority

Use case: stylized-concept. Asset type: one transparent nine-slice website game UI border. Image1 is a STYLE reference only. Design a DISTINCT border for priority quest notice: stout walnut rails, tiny brass arrowhead clasps and folded blank corner tabs. Match reference's Fairy Tail guild furnishing aesthetic, warm dark walnut, muted old brass, ivory parchment and SMALL burgundy accents; same warm color family, no unrelated blue/purple/neon. One square flat front-view straight rectangular border, outer rails9% width, corners within18%, strong visible contour. Keep central82% genuinely transparent and outside transparent. Detailed corners but plain stretchable mid-rails. No center illustration, text, numbers, people, magic circles, watermark or invented official artifacts.

### compendium

Use case: stylized-concept. Asset type: one transparent nine-slice website game UI border. Image1 is a STYLE reference only. Design a DISTINCT border for guild member compendium: leather book binding rails, small brass portrait medallion outlines at corners. Match reference's Fairy Tail guild furnishing aesthetic, warm dark walnut, muted old brass, ivory parchment and SMALL burgundy accents; same warm color family, no unrelated blue/purple/neon. One square flat front-view straight rectangular border, outer rails9% width, corners within18%, strong visible contour. Keep central82% genuinely transparent and outside transparent. Detailed corners but plain stretchable mid-rails. No center illustration, text, numbers, people, magic circles, watermark or invented official artifacts.

### backlog

Use case: stylized-concept. Asset type: one transparent nine-slice website game UI border. Image1 is a STYLE reference only. Design a DISTINCT border for pending quest dossier: bundled parchment edge rails with simple tied-cord knots at corners. Match reference's Fairy Tail guild furnishing aesthetic, warm dark walnut, muted old brass, ivory parchment and SMALL burgundy accents; same warm color family, no unrelated blue/purple/neon. One square flat front-view straight rectangular border, outer rails9% width, corners within18%, strong visible contour. Keep central82% genuinely transparent and outside transparent. Detailed corners but plain stretchable mid-rails. No center illustration, text, numbers, people, magic circles, watermark or invented official artifacts.

### review

Use case: stylized-concept. Asset type: one transparent nine-slice website game UI border. Image1 is a STYLE reference only. Design a DISTINCT border for guild weekly register: ruled blank ledger binding rails, brass date-wheel corner accents without numbers. Match reference's Fairy Tail guild furnishing aesthetic, warm dark walnut, muted old brass, ivory parchment and SMALL burgundy accents; same warm color family, no unrelated blue/purple/neon. One square flat front-view straight rectangular border, outer rails9% width, corners within18%, strong visible contour. Keep central82% genuinely transparent and outside transparent. Detailed corners but plain stretchable mid-rails. No center illustration, text, numbers, people, magic circles, watermark or invented official artifacts.

### header

Use case: stylized-concept. Asset type: one transparent nine-slice website game UI border. Image1 is a STYLE reference only. Design a DISTINCT border for guild daily briefing: banner cloth edging within walnut rails, brass pennant clasps at corners. Match reference's Fairy Tail guild furnishing aesthetic, warm dark walnut, muted old brass, ivory parchment and SMALL burgundy accents; same warm color family, no unrelated blue/purple/neon. One square flat front-view straight rectangular border, outer rails9% width, corners within18%, strong visible contour. Keep central82% genuinely transparent and outside transparent. Detailed corners but plain stretchable mid-rails. No center illustration, text, numbers, people, magic circles, watermark or invented official artifacts.

### seven

Use case: stylized-concept. Asset type: one transparent nine-slice website game UI border. Image1 is a STYLE reference only. Design a DISTINCT border for seven-day quest board: weathered notice-board rails, brass nail heads and red seal tabs at corners. Match reference's Fairy Tail guild furnishing aesthetic, warm dark walnut, muted old brass, ivory parchment and SMALL burgundy accents; same warm color family, no unrelated blue/purple/neon. One square flat front-view straight rectangular border, outer rails9% width, corners within18%, strong visible contour. Keep central82% genuinely transparent and outside transparent. Detailed corners but plain stretchable mid-rails. No center illustration, text, numbers, people, magic circles, watermark or invented official artifacts.

### expedition

Use case: stylized-concept. Asset type: one transparent nine-slice website game UI border. Image1 is a STYLE reference only. Design a DISTINCT border for long expedition: map-case leather rails, small brass compass needles at corners, no map inside. Match reference's Fairy Tail guild furnishing aesthetic, warm dark walnut, muted old brass, ivory parchment and SMALL burgundy accents; same warm color family, no unrelated blue/purple/neon. One square flat front-view straight rectangular border, outer rails9% width, corners within18%, strong visible contour. Keep central82% genuinely transparent and outside transparent. Detailed corners but plain stretchable mid-rails. No center illustration, text, numbers, people, magic circles, watermark or invented official artifacts.

### once

Use case: stylized-concept. Asset type: one transparent nine-slice website game UI border. Image1 is a STYLE reference only. Design a DISTINCT border for single commission: parchment envelope edging, distinct folded corners with small wax seal tabs. Match reference's Fairy Tail guild furnishing aesthetic, warm dark walnut, muted old brass, ivory parchment and SMALL burgundy accents; same warm color family, no unrelated blue/purple/neon. One square flat front-view straight rectangular border, outer rails9% width, corners within18%, strong visible contour. Keep central82% genuinely transparent and outside transparent. Detailed corners but plain stretchable mid-rails. No center illustration, text, numbers, people, magic circles, watermark or invented official artifacts.

### learn

Use case: stylized-concept. Asset type: one transparent nine-slice website game UI border. Image1 is a STYLE reference only. Design a DISTINCT border for learning daily commissions: bookshelf walnut rails, small blank book and quill details at corners. Match reference's Fairy Tail guild furnishing aesthetic, warm dark walnut, muted old brass, ivory parchment and SMALL burgundy accents; same warm color family, no unrelated blue/purple/neon. One square flat front-view straight rectangular border, outer rails9% width, corners within18%, strong visible contour. Keep central82% genuinely transparent and outside transparent. Detailed corners but plain stretchable mid-rails. No center illustration, text, numbers, people, magic circles, watermark or invented official artifacts.

### experiment

Use case: stylized-concept. Asset type: one transparent nine-slice website game UI border. Image1 is a STYLE reference only. Design a DISTINCT border for research daily commissions: walnut workbench rails, small glass vial and measuring-tool details within corners. Match reference's Fairy Tail guild furnishing aesthetic, warm dark walnut, muted old brass, ivory parchment and SMALL burgundy accents; same warm color family, no unrelated blue/purple/neon. One square flat front-view straight rectangular border, outer rails9% width, corners within18%, strong visible contour. Keep central82% genuinely transparent and outside transparent. Detailed corners but plain stretchable mid-rails. No center illustration, text, numbers, people, magic circles, watermark or invented official artifacts.

### life

Use case: stylized-concept. Asset type: one transparent nine-slice website game UI border. Image1 is a STYLE reference only. Design a DISTINCT border for life and recovery daily commissions: walnut hearth edging, subtle leaf and cup corner ornaments. Match reference's Fairy Tail guild furnishing aesthetic, warm dark walnut, muted old brass, ivory parchment and SMALL burgundy accents; same warm color family, no unrelated blue/purple/neon. One square flat front-view straight rectangular border, outer rails9% width, corners within18%, strong visible contour. Keep central82% genuinely transparent and outside transparent. Detailed corners but plain stretchable mid-rails. No center illustration, text, numbers, people, magic circles, watermark or invented official artifacts.

### extra

Use case: stylized-concept. Asset type: one transparent nine-slice website game UI border. Image1 is a STYLE reference only. Design a DISTINCT border for additional commissions: bound loose-leaf parchment rails, tiny brass paper clips at corners. Match reference's Fairy Tail guild furnishing aesthetic, warm dark walnut, muted old brass, ivory parchment and SMALL burgundy accents; same warm color family, no unrelated blue/purple/neon. One square flat front-view straight rectangular border, outer rails9% width, corners within18%, strong visible contour. Keep central82% genuinely transparent and outside transparent. Detailed corners but plain stretchable mid-rails. No center illustration, text, numbers, people, magic circles, watermark or invented official artifacts.

### treasury

Use case: stylized-concept. Asset type: one transparent nine-slice website game UI border. Image1 is a STYLE reference only. Design a DISTINCT border for guild treasury: solid walnut chest rails with brass lock plates and coin-edge corner protectors. Match reference's Fairy Tail guild furnishing aesthetic, warm dark walnut, muted old brass, ivory parchment and SMALL burgundy accents; same warm color family, no unrelated blue/purple/neon. One square flat front-view straight rectangular border, outer rails9% width, corners within18%, strong visible contour. Keep central82% genuinely transparent and outside transparent. Detailed corners but plain stretchable mid-rails. No center illustration, text, numbers, people, magic circles, watermark or invented official artifacts.


### focus

Use case: stylized-concept. Asset type: one transparent nine-slice website game UI border. Image1 is a STYLE reference only. Design a DISTINCT border for today's action priorities: walnut rails, small brass flame-outline corner ornaments and narrow burgundy inset. Match reference's Fairy Tail guild furnishing aesthetic, warm dark walnut, muted old brass, ivory parchment and SMALL burgundy accents; same warm color family, no unrelated blue/purple/neon. One square flat front-view straight rectangular border, outer rails9% width, corners within18%, strong visible contour. Keep central82% genuinely transparent and outside transparent. Detailed corners but plain stretchable mid-rails. No center illustration, text, numbers, people, magic circles, watermark or invented official artifacts. 

### closing

Use case: stylized-concept. Asset type: one transparent nine-slice website game UI border. Image1 is a STYLE reference only. Design a DISTINCT border for end-of-day guild closeout: walnut rails, small lantern and closed register corner ornaments. Match reference's Fairy Tail guild furnishing aesthetic, warm dark walnut, muted old brass, ivory parchment and SMALL burgundy accents; same warm color family, no unrelated blue/purple/neon. One square flat front-view straight rectangular border, outer rails9% width, corners within18%, strong visible contour. Keep central82% genuinely transparent and outside transparent. Detailed corners but plain stretchable mid-rails. No center illustration, text, numbers, people, magic circles, watermark or invented official artifacts.

### chronicle

Use case: stylized-concept. One transparent nine-slice rectangular website UI border for a Fairy Tail inspired guild weekly chronicle. STYLE reference only: dark walnut, aged brass, ivory parchment, tiny burgundy accents, consistent warm materials. DISTINCT blank rolled manuscript scroll rails with small brass quill corner clasps, no letters. Square front view, straight plain stretchable mid rails occupying outer9%, detailed corners inside18%, central82% truly transparent, outside transparent. Strong visible border contour, no people, no illustration inside, no magic circles, no text, watermark, invented official artifact.

## 验证

独立 Edge 浏览器测试：19个大型模块使用19款不同边框；7个场景依次切换，有人的6个场景悬停对白与点击互动通过（哈比保留专属互动窗口）；5个普通场景强制移动测试通过；边界强制测试无越界；同场景相遇对白通过；二次刷新图片请求0次；390px视口无横向溢出；无脚本运行错误。测试使用隔离数据并阻断云端写入，不修改真实历史。
内置浏览器连接超时，未声称检查了用户正在使用的浏览器。
