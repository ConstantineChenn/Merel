# 背景音乐素材存档

当前网页已停用背景音乐，不导入播放器，也不请求音频文件。以下保留素材与先前播放器的处理说明。

**柴可夫斯基：b 小调第六交响曲《悲怆》，作品 74**。采用 [Musopen 公开录音集](https://archive.org/details/MusopenCollectionAsFlac) 中的四乐章录音；来源标注 [Public Domain Mark 1.0](https://creativecommons.org/publicdomain/mark/1.0/)。

每个乐章节选 180 秒，按一至四乐章循环，总计 12 分钟。节选区间按本项目所用源文件计时：

| 乐章 | 源文件区间 | 网页文件 | 体积 |
| --- | --- | --- | --- |
| I · Adagio – Allegro non troppo | 03:23–06:23 | `pathetique-01-180s.aac-64.m4a` | 1,479,425 字节 |
| II · Allegro con grazia | 00:24–03:24 | `pathetique-02-180s.aac-64.m4a` | 1,479,144 字节 |
| III · Allegro molto vivace | 01:14–04:14 | `pathetique-03-180s.aac-64.m4a` | 1,479,596 字节 |
| IV · Finale: Adagio lamentoso | 00:41–03:41 | `pathetique-04-180s.aac-64.m4a` | 1,479,809 字节 |

编码为 AAC-LC、64 kbps 目标码率、44.1 kHz 立体声，四段共约 5.92 MB。双遍响度归一化目标为 −16 LUFS、真峰值 −1.5 dBTP，开头 25 ms 淡入、末尾 350 ms 淡出；MP4 索引前置，支持边缓冲边播放。每段全程解码通过，第一秒均有清晰音频信号。原始完整录音保留在维护者本地。

下载顺序：封面高清 → 当前点击可切换的高清立绘 → 第一段音乐缓冲并开始播放 → 第二、三、四段依次预下载。后续乐章复用已下载数据；预下载之间会再次等待当前优先立绘。播放器没有暂停、静音或音量控件。若浏览器禁止有声自动播放，在后续点击、触摸或输入时重试；页面内切换视图不会重建播放器，音乐失败不会阻塞对话。

修改播放逻辑见 `../background-music.js`。替换音频时应更新文件名和引用，避免访问者继续使用已缓存的旧音乐。
