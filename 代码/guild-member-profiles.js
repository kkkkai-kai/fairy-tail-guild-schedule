/* guild-member-profiles.js — 实景小人·角色专属档案（世界观设定来自《妖精的尾巴》） */
/* 称号、性格、魔法、口头禅依据原著设定；礼物偏好映射到仓库道具 ID（见 v4.js ITEMS） */
(function () {
  var P = {
    natsu: {
      title: '火龙 · 火之灭龙魔导士',
      magic: '火之灭龙魔法（可以吃火增强力量）',
      personality: '热血单细胞、直来直去，永远站在伙伴前面；唯一的弱点是交通工具。',
      catchphrase: '我燃烧起来了啊！！',
      likes: ['flameFeather', 'igneelFlame', 'dragonScale'],
      dislikes: ['iceCrystal']
    },
    lucy: {
      title: '星灵魔导士',
      magic: '星灵魔法（星灵钥匙）',
      personality: '善良温柔，梦想是写小说；关键时刻比谁都坚强，最讨厌乱来的火焰笨蛋。',
      catchphrase: '给我适可而止啊！',
      likes: ['celestialKey', 'crystal', 'spiritEmblem'],
      dislikes: ['natsuCharm']
    },
    erza: {
      title: '妖精女王',
      magic: '换装魔法「骑士」（武器与盔甲）',
      personality: '严于律己、可靠到让人安心，偶尔却天然呆；最看重规矩与正义。',
      catchphrase: '这是命令，也是伙伴之间的约定。',
      likes: ['armorShard', 'dragonScale', 'fairyGlitter'],
      dislikes: ['recoveryPotion']
    },
    gray: {
      title: '冰之造型魔导士',
      magic: '冰之造型魔法（ICE MAKE）',
      personality: '外表冷静、内心傲娇，一到放松就会不自觉脱衣服；和纳兹是损友。',
      catchphrase: '……这就是冰之造型魔法。',
      likes: ['iceCrystal', 'crystal'],
      dislikes: ['flameFeather']
    },
    wendy: {
      title: '天空之巫女 · 天空灭龙魔导士',
      magic: '天空灭龙魔法（治愈与辅助）',
      personality: '胆小又善良，总是先想着照顾别人；喜欢热汤和温柔的日常。',
      catchphrase: '大家没事就好……',
      likes: ['happyJuice', 'mavisFeather', 'recoveryPotion'],
      dislikes: ['igneelFlame']
    },
    happy: {
      title: '超越者 · 哈比',
      magic: '翼魔法（长出翅膀飞行）',
      personality: '最爱吃鱼、最爱纳兹，开口就是「爱~」；公会里最阳光的存在。',
      catchphrase: '爱！',
      likes: ['happyJuice', 'recoveryPotion', 'fairyGlitter'],
      dislikes: ['igneelFlame']
    },
    mirajane: {
      title: '公会的微笑接待员',
      magic: '撒旦之魂（接收魔法）',
      personality: '永远带着温柔微笑的前 S 级魔导士，料理与情报都拿手；温柔之下藏着战斗女王。',
      catchphrase: '欢迎回来，今天也要好好加油哦。',
      likes: ['crystal', 'mavisFeather', 'celestialKey'],
      dislikes: ['dragonScale']
    },
    levy: {
      title: '书卷之友',
      magic: '固体文字魔法',
      personality: '爱读书爱写作的学霸少女，遇到不懂的会追着问到底；认真起来格外勇敢。',
      catchphrase: '这一条，我要写进笔记里！',
      likes: ['celestialKey', 'mavisFeather', 'crystal'],
      dislikes: ['igneelFlame']
    },
    gajeel: {
      title: '铁龙 · 铁之灭龙魔导士',
      magic: '铁之灭龙魔法',
      personality: '看起来凶巴巴的硬汉，其实是重情义的大个子；最怕饿肚子。',
      catchphrase: '哼，这点小事还用不着你操心。',
      likes: ['armorShard', 'dragonScale', 'igneelFlame'],
      dislikes: ['happyJuice']
    },
    juvia: {
      title: '雨女 · 水之魔导士',
      magic: '水之魔法',
      personality: '一往情深的雨女，对格雷一心一意；善良、害羞，却愿意为伙伴付出一切。',
      catchphrase: '朱比亚，一直都会在这里……',
      likes: ['iceCrystal', 'crystal', 'fairyGlitter'],
      dislikes: ['flameFeather']
    },
    mavis: {
      title: '初代会长 · 妖精军师',
      magic: '超魔法（妖精的法律等）',
      personality: '天真又聪慧的初代会长，看透人心却仍相信光明；是公会的精神之光。',
      catchphrase: '只要相信伙伴，就没有做不到的事。',
      likes: ['mavisFeather', 'fairyHeart', 'celestialKey'],
      dislikes: ['igneelFlame']
    },
    laxus: {
      title: '雷龙 · 雷之灭龙魔导士',
      magic: '雷之灭龙魔法',
      personality: '骄傲的强者，嘴上逞强、心里始终装着公会；认定的事绝不回头。',
      catchphrase: '别拖后腿。',
      likes: ['dragonScale', 'igneelFlame', 'spiritEmblem'],
      dislikes: ['recoveryPotion']
    },
    carla: {
      title: '夏露露 · 温蒂的搭档',
      magic: '翼魔法 · 预知',
      personality: '冷静优雅的超越者，说话一针见血，其实很关心温蒂。',
      catchphrase: '……你又在做多余的事了。',
      likes: ['mavisFeather', 'crystal'],
      dislikes: ['natsuCharm']
    },
    lily: {
      title: '潘萨利力 · 伽吉鲁的搭档',
      magic: '翼魔法 · 武器变形',
      personality: '说话慢悠悠的武器专家，是伽吉鲁最信得过的搭档。',
      catchphrase: '……交给我吧。',
      likes: ['armorShard', 'dragonScale'],
      dislikes: ['happyJuice']
    }
  };
  window.GUILD_MEMBER_PROFILES = P;
  /* 道具名目录（与 v4.js ITEMS 保持一致，用于显示喜欢/讨厌礼物名称） */
  window.GUILD_GIFT_CATALOG = {
    herb: '魔法药草', crystal: '星灵水晶', armorShard: '铠甲碎片',
    flameFeather: '火焰羽毛', iceCrystal: '冰之结晶', celestialKey: '星灵钥匙',
    dragonScale: '火龙鳞片', fairyGlitter: '妖精光辉', spiritEmblem: '星灵王徽章',
    igneelFlame: '伊格尼尔火焰', mavisFeather: '梅比斯羽毛', fairyHeart: '妖精心脏',
    recoveryPotion: '恢复药水', natsuCharm: '纳兹火焰护符', happyJuice: '哈比的果汁'
  };
})();
