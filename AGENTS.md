# AGENTS.md

本文件帮助新会话快速了解本项目，无需重新分析代码库。

## 项目概述

`karin-plugin-Botweb` 是一个 pnpm monorepo，产物是 **Karin（node-karin）机器人框架的 Web 聊天面板插件**：在浏览器里以 Bot 身份查看好友/群会话、收发消息。

- `packages/core` — Karin 插件本体（后端），包名 `karin-plugin-BotWeb`
- `packages/template` — Web 前端（React 19 + Vite 6 + Tailwind v4），包名 `sandbox-template`（历史遗留名，沙盒功能已删除）

核心设计：**前端被打包成一个 `render()` 函数内联进后端**。template 构建出 JS/CSS 全部内联的单文件 HTML，core 通过 `import { render } from 'sandbox-template'` 引用，core 的 tsdown（`alwaysBundle: ['sandbox-template']`）会把整个页面打包进 `lib/apps/web.js`。生产环境只需部署 core 的 `lib/`，由 Karin 的 express 直接托管页面。

## 请求链路

```
浏览器 ──HTTP──> Karin app(:7777) ──GET /botweb────────> res.send(render('/botweb'))  (单文件 HTML，不鉴权)
                                 ──/botweb/api/*───────> karin authMiddleware ──> core/src/api 路由  (REST，需鉴权)
浏览器 ──WS upgrade──> Karin 内置 wss ──> karin.on('ws:connection:/botweb/ws')         (服务端只推不收，query 鉴权)
Bot 事件 ──> hooks.message / karin.accept('notice.*') ──> 写 sqlite messages 表 + 广播给所有 WS 客户端 ──> 前端按 selfId 分 bot 入库
```

**鉴权完全复用 karin 体系**：前端登录页调 karin 的 `/api/v1/login`（sha256(HTTP_AUTH_KEY) 换 JWT），登录态写 karin WebUI 同款 localStorage 键（`userId`/`accessToken`/`refreshToken`），**与 karin WebUI 双向共享，任一边登录两边免登**。REST 走 karin 导出的 `authMiddleware`（`Authorization: Bearer <JWT 或明文 key>` + `x-user-id`）；WS 握手 karin 不鉴权，由插件在连接回调里校验 query 的 `?token=&user_id=`（`service/auth.ts` 手写 HS256 验 JWT，明文 key 兜底），失败 `close(4401)`。accessToken 过期（401/419）前端自动调 `/api/v1/refresh` 重放一次。

## 目录结构

```
packages/
├── core/                          # Karin 插件（后端）
│   ├── src/
│   │   ├── index.ts               # 插件主入口（仅初始化日志，不写业务）
│   │   ├── app.ts                 # dev 启动入口（import 'node-karin/start'）
│   │   ├── dir.ts                 # 插件目录/pkg 元信息
│   │   ├── types.ts               # ApiResult<T> = { code, message, data }
│   │   ├── apps/
│   │   │   └── web.ts             # ★ 面板挂载点：页面路由 + API 挂载 + WS 接管 + 事件广播
│   │   ├── api/                   # express 路由（node-karin/express 的 Router）
│   │   │   ├── index.ts           # 聚合 router：json(50mb) + 子路由 + JSON 错误处理
│   │   │   ├── bot.ts             # GET bots / messages / friends / groups / members，POST poke / kick
│   │   │   ├── message.ts         # POST send / recall
│   │   │   └── settings.ts        # GET/POST settings（插件设置读写）
│   │   └── service/               # 业务层
│   │       ├── bot.ts             # BotService：list/friends/groups/members/poke/kick（friends/groups/members 空或报错回退 ProfileCache）
│   │       ├── message.ts         # MessageService：send/recall（成功后写 messages 表：send insert、recall 标记已撤回）
│   │       ├── dto.ts             # ★ karin 类型 <-> 前端 DTO 映射（toChatMessage/toSendElements 等）
│   │       ├── response.ts        # ok() / fail()（fail 返回 ApiResult<any>）
│   │       ├── auth.ts            # WS 鉴权：verifyWsToken（karin JWT HS256 校验 + 明文 key 兜底）
│   │       ├── cache.ts           # ProfileCache：好友/群资料 + 用户头像 + 群成员缓存（ProfileRow/MemberRow <-> DTO 映射）
│   │       ├── db.ts              # profileDb + memberDb + messageDb：插件私有 sqlite（@karinjs/sqlite3，profiles/members/messages 三表，懒初始化）
│   │       ├── settings.ts        # ★ SettingsService：插件设置（data/settings.json）+ 统计/消息存储门控判定
│   │       ├── profile.ts         # ProfileService：收消息异步补全会话资料（头像/名称）+ 群成员统计，返回 profiles 推送增量
│   │       └── types.ts           # 请求体类型
│   ├── tsdown.config.ts           # entry: src/*.ts + src/apps/*.ts → lib/，neverBundle node-karin
│   ├── scripts/download-faces.mjs # QFace 表情本地化下载（→ resources/faces，含 manifest.json）
│   ├── resources/faces/           # QQ 小黄脸本地图源（gif/static，由 /botweb/faces/* 托管）
│   └── development.env            # dev 环境变量（HTTP_PORT=7777，HTTP_AUTH_KEY=abc123）
└── template/                      # 前端
    ├── index.html                 # vite 入口（dev 用）
    ├── src/
    │   ├── index.ts               # ★ 包入口：导出 render(basePath)，供 core 引用
    │   ├── generated/html.ts      # 构建生成：内联 HTML 字符串（勿手改）
    │   ├── core/types.ts          # ★ 前后端共享 DTO 契约（与 core/src/service/dto.ts 保持一致）
    │   └── client/                # React 应用
    │       ├── auth.ts            # ★ 登录态：karin /api/v1/login|refresh，localStorage 键与 karin WebUI 同名
    │       ├── sha256.ts          # sha256（crypto.subtle 优先，http 局域网降级纯 JS 实现）
    │       ├── api.ts             # REST 封装（带鉴权头 + 401/419 刷新重放）+ WsClient（自动重连）
    │       ├── utils.ts           # cn/toMillis/resolveMediaSrc/downloadFile/copyImageToClipboard 等
    │       ├── state/             # ★ 状态层（UiProvider 外层、ChatProvider 内层，chat 通过 useUi 取 setToast）
    │       │   ├── chat.tsx       # 数据层：bots/会话/messageMap/未读/WS/发送撤回（messageMap/unread 走 useReducer；消息启动时从后端全量拉取只存内存）
    │       │   └── ui.tsx         # UI 状态：主题（同步根元素 .dark class）/toast/对话框/右键菜单/回复/pendingMention/groupPanelOpen（群资料面板开关）
    │       └── components/        # NavRail（红绿灯 + 消息/联系人 + 底部汉堡菜单：主题/设置/退出登录）/Sidebar（第二栏：顶部 bot 资料卡
    │                              # 点击弹账号切换 + 搜索/刷新行 + 聊天/联系人/设置三视图随 navView 切换）/ChatWindow/GroupPanel（docked 群资料
    │                              # 右栏：群公告占位 + 群聊成员）/MessageList/MessageItem/InputArea/LoginScreen/ContextMenu/Overlays/EmojiPicker
    ├── scripts/inline.mjs         # vite 产物 → 单文件 HTML → src/generated/html.ts
    └── tsdown.config.ts           # 打包 src/index.ts → dist/index.js（供 core 引用）
```

## 常用命令（仓库根目录）

```bash
pnpm -r build          # 全量构建（pnpm 拓扑序：先 template 后 core）
pnpm dev               # 启动 Karin 开发服务器（:7777，tsx 运行 packages/core/src）
pnpm dev:web           # 启动 vite 开发服务器（:5173，/botweb 与 /api/v1 代理到 7777，含 WS）
pnpm exec tsc --noEmit -p packages/core      # core 类型检查（template 需先 build 出 dist）
```

开发流程：先 `pnpm -F sandbox-template build` 一次（core 的类型/运行都依赖 template 的 `dist/`），然后终端 1 跑 `pnpm dev`、终端 2 跑 `pnpm dev:web`，浏览器开 vite 的 :5173。

生产：访问 `http://127.0.0.1:7777/botweb`。

## REST API（前缀 `/botweb/api`，响应均为 `ApiResult<T>`）

**所有接口需鉴权**（karin `authMiddleware`）：请求头 `Authorization: Bearer <karin JWT 或明文 HTTP_AUTH_KEY>`（JWT 还需 `x-user-id` 头；GET 也可用 `?token=` 明文 key）。鉴权失败返回 karin 格式的 401/419，非 `ApiResult<T>`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/bots` | Bot 列表 `BotInfo[]` |
| GET | `/bots/:selfId/messages` | 该 bot 的全部本地存储消息 `ChatMessage[]`（sqlite messages 表，时间升序，含 `recalled` 标记；前端启动时全量拉取后只存内存） |
| GET | `/bots/:selfId/friends` | 好友列表 `FriendItem[]`（含头像，失败降级空串；协议端返回空/报错时回退 db 资料缓存） |
| GET | `/bots/:selfId/groups` | 群列表 `GroupItem[]`（空/报错回退 db 资料缓存） |
| GET | `/bots/:selfId/groups/:groupId/members` | 群成员 `GroupMemberItem[]`（空/报错回退 db 成员缓存） |
| GET | `/bots/:selfId/avatars?ids=a,b,c` | 批量用户头像 `Record<userId,url>`（协议端 getAvatarUrl + db 缓存，单次上限 50 个） |
| GET | `/bots/:selfId/forward?resId=xxx` | 合并转发内容 `ForwardMessageItem[]`（协议端 getForwardMsg，前端点击 forward 卡片时按需拉取） |
| GET | `/settings` | 获取插件设置 `BotWebSettings` |
| POST | `/settings` | 更新插件设置（部分字段归并，非法值忽略，返回完整设置） |
| POST | `/bots/:selfId/groups/:groupId/poke` | 戳一戳群成员 `{ targetId }` |
| POST | `/bots/:selfId/friends/:userId/poke` | 戳一戳好友（无 body） |
| POST | `/bots/:selfId/groups/:groupId/kick` | 踢出成员 `{ targetId }` |
| POST | `/message/send` | 发消息 `{ selfId, scene, peer, elements }` |
| POST | `/message/recall` | 撤回 `{ selfId, scene, peer, messageId }` |
| POST | `/message/reaction` | 表情回应（贴表情）`{ selfId, scene, peer, messageId, faceId, isSet? }`，走 karin `bot.setMsgReaction`（仅 NapCat/Lagrange 等 OneBot 实现支持，其余协议端抛错） |

消息持久化在**后端 sqlite messages 表**（`service/db.ts` 的 `messageDb`）：收消息（hooks.message）与自己发送（MessageService.send）时 `INSERT OR IGNORE` 入库；撤回（notice 回显与面板主动撤回）时 `recalled = 1`。**入库受设置门控**（`SettingsService.shouldStoreMessage`：全局开关 `messageStore` 关闭时全不存；开启时也仅存 `messageStoreBots` 里单独开启的 bot，默认空=都不存）。前端启动时按 bot 全量拉取（`GET /bots/:selfId/messages`）只存内存，刷新后重新拉取——不走协议端 `getHistoryMsg`（各协议端差异大），插件启用前的历史消息不可见；关闭存储只影响新消息，已入库的历史仍可拉取。

## WS 推送协议（`/botweb/ws`，服务端只推不收）

连接需带 query 凭据：`/botweb/ws?token=<karin JWT 或明文 key>&user_id=<userId>`（JWT 必须带匹配的 user_id），校验失败以 code 4401 断开。

- `{ type: 'message', data: ChatMessage }` — 全量广播所有 bot 的消息，前端按 `selfId` 分 bot 入库
- `{ type: 'recall', data: { selfId, messageId, scene, peer, operatorId, targetId } }` — 后端同时把 db 里的消息标记 `recalled = 1`；前端给原气泡打 `recalled` 标记，渲染红框 + 气泡下方「消息已撤回」（不再替换成系统灰条）
- `{ type: 'poke', data: { selfId, scene, peer, operatorId, targetId, action, suffix } }`
- `{ type: 'reaction', data: { selfId, scene, peer, messageId, operatorId, faceId, count, isSet } }` — QQ 表情回应（贴表情，`notice.groupMessageReaction`，仅群聊；NapCat `group_msg_emoji_like`、Lagrange `reaction`）。**NapCat 的取消事件没有标志位**（负载与添加同构）：新版 karin（本仓库 D:\GitHub\Karin 已修，`create/notice.ts` 收到 `group_msg_emoji_like` 后回查 `get_msg` 的 `emoji_likes_list` 判定）能给出真实 isSet；旧版 karin 硬编码 isSet=true，插件保留后端翻转推断兜底（`apps/web.ts` 的 `reactionState` 内存表：同一 operatorId 对同一消息同一表情再次「添加」实为取消，上限 1 万条淘汰最旧）——新版 karin 下该推断是幂等透传（表状态与真实事件一致），重启后状态丢失、首个事件按添加处理。前端 reducer 按 faceId 聚合增减（count 缺省按 1，减到 0 移除，逻辑与 core `db.ts` 的 `applyReactionDelta` 一致），气泡下方渲染 QFace 小胶囊 + 次数；后端同步写 messages 表 `reactions` 列（JSON，老库 ALTER TABLE 迁移），刷新后保留。注意反应计数是**从插件启用后的事件增量累积**，没有初始状态，与 QQ 客户端的真实总数可能有偏差。**面板主动贴表情**：消息右键「贴表情」（QQ 协议才显示）弹 `ReactionPicker` QFace 网格，或点击已有反应胶囊；走 `POST /message/reaction`，成功后本地乐观聚合 + db 直接写，WS 回显自己的 reaction 时按 `pendingReactionRef`（10 秒窗口、按 isSet 匹配的**队列**——贴→取消快速连续操作时单值计数会被覆盖 isSet 导致迟到回显错配重复入账）跳过防重复 +1/-1；`myReactionsRef` 必须**渲染期同步**（放 useEffect 会慢一拍，hasReacted 驱动的胶囊高亮首次不亮）。**贴/取消语义**（QQ：同一用户对同一表情只贴一次）：前端用「我贴过的表情」表（`botweb:myreactions` localStorage，`${selfId}:${scene}:${peer}:${messageId}` -> faceId[]）跟踪——点胶囊时已贴过则调 `isSet=false` 取消（胶囊蓝色高亮标识已贴），`ReactionPicker` 里选已贴过的表情只提示不重复调接口；该表只知面板内的操作，bot 在 QQ 客户端里贴的表情不在其中
- `{ type: 'profiles', data: { selfId, friends: FriendItem[], groups: GroupItem[], users: UserAvatarItem[] } }` — 会话资料增量（收消息时后端异步补全）：friends/groups 前端 upsert 进当前 bot 状态（只填空缺字段），临时会话随即显示真实名称/头像；`users` 为群消息发送者头像增量，进前端 `avatarMap`（气泡头像用，不进好友列表）

`ChatMessage` / `MessageElement` / `WsPush` 等契约定义在 `packages/template/src/core/types.ts`，core 侧镜像在 `packages/core/src/service/dto.ts`，**改动契约时两边必须同步**。`system: true` 的消息按系统小灰条渲染（戳一戳提示）。

**合并转发（forward 元素）**：`{ type: 'forward', id }`，id 为 resId。karin 的 OneBot 适配器对未知消息段（含合并转发、markdown）会序列化成 `{"type":"forward","data":{"id":"..."}}` / `{"type":"markdown","data":{"content":"..."}}` 的**文本**元素，core 的 `convertElements` 负责还原：forward JSON 与 karin 标准 `longMsg` 元素映射为 forward 元素；markdown JSON 与 karin 标准 `markdown` 元素映射为 `{ type: 'markdown', content }` 保留原文；karin 标准 `button`/`keyboard` 元素映射为 `{ type: 'buttons', rows: ButtonItem[][] }`；`mface`（QQ 商城表情/动态贴纸，NapCat/LLOneBot 在 `data.url` 直接给 gif 地址）映射为 image 元素（无 url 的协议端降级为摘要文本），`dice`/`rps` 魔法表情降级为 `[骰子]`/`[猜拳]` 占位文本。另：**部分协议端（NapCat/milky 等）会在同一条消息里同时下发 markdown 段和它的文本副本**，副本可能是 markdown 原文、也可能是去掉语法后的纯文本（如 `# 你好` → `你好`），`convertElements` 按「原文 + 纯文本近似（`markdownToPlain` 剥离常见语法）」两种形态识别并去掉重复文本段（比较前折叠所有空白）防止前端渲染两遍。前端列表渲染 forward 为白色卡片（`MessageItem.tsx` 的 `MessageForward`，纯转发消息气泡像纯媒体一样去背景），点击后经 `GET /bots/:selfId/forward` 按需拉取（`bot.getForwardMsg`），毛玻璃浮层逐条展示（嵌套转发显示占位）。发送侧 forward 降级为文本 `[合并转发]`、markdown 降级为原文文本、buttons 降级为 `[按钮]`。

**按钮渲染**（`MessageItem.tsx` 的 `MessageButtons`）：QQ NT 式线框小按钮按行排列，`link` 按钮可点击新窗口打开，回调/指令按钮无法在面板触发（协议端回调机制）仅展示；`style: 3` 红字（`text-qq-badge`），其余蓝色线框。

**「原始事件」调试浮层**：消息右键菜单（`Overlays.tsx` 的 `buildMenuItems`）有「原始事件」项，把该消息的 `ChatMessage` 对象 pretty-print 成 JSON 展示在毛玻璃浮层（状态在 `ui.tsx` 的 `rawMessage`），可一键复制，用于排查元素类型渲染问题。

**markdown 渲染**（`components/MessageMarkdown.tsx`）：基于 `react-markdown` + `remark-gfm` + `rehype-raw`，按 bot 协议族（`mdFamily`：telegram/discord/qq，未知协议走 GFM 通用）预处理方言语法——Telegram：`||剧透||` `__下划线__` `~删除线~`、单星 `*粗体*` 转双星；Discord：`||剧透||`、行首 `-#` 小字；QQ 方言基本兼容 GFM 直渲。**防 XSS：预处理先把用户内容的 `<` 全部转义（不转 `>` 以保留引用块语法），rehype-raw 只放行预处理注入的 `<u>`/`<span class="md-spoiler">` 等标签**；链接强制 `target=_blank rel=noreferrer`，图片走 `resolveMediaSrc` + `referrerPolicy=no-referrer`。**特殊协议链接**（`client/specialLink.ts` 注册表，scheme → 解析器，方便扩展）：命中注册的协议（目前 `mqqapi://aio/inlinecmd`，QQ markdown 内联指令）时 `urlTransform` 放行原始 href 并拦截点击为面板内动作——经 `ui.tsx` 的 `pendingInlineCmd` 由 InputArea 消费：群聊填入 `@消息发送者 + command`，`enter=true` 立即发送、`reply=true` 携带对原消息的回复；MessageMarkdown 需传入 `message` 上下文（转发浮层无上下文时特殊链接不响应）。注意 `handleSend` 的空态守卫是同步判定编辑器内容（不依赖 isEmpty state），内联指令 enter=true 插入后才能立即发送。样式集中在 `index.css` 的 `.md-body` 段（`.md-me` 适配自己蓝气泡白字，`.md-spoiler` 默认遮盖悬停显示，`.md-subtext` 为 DC 小字）。

## 关键约束（踩过的坑，改动时务必遵守）

- **`hooks.message` 回调必须调用 `next()`**，否则该消息对所有下游插件被吞掉；且禁止在钩子里 await 慢操作（db/协议端调用）——会话资料补全（`ProfileService.syncMessage`）是 fire-and-forget 的，防止拖慢所有下游插件。
- **好友/群/群成员 sqlite 缓存**（`service/db.ts` + `service/cache.ts`）：用插件私有 sqlite（`@karinjs/sqlite3`，karin 同款 napi 预编译，支持 node>=18；**不要用 `node:sqlite`**，它要求 node>=22.5 而 node-karin 只要求 >=18），db 文件在 karin 运行时目录 `@karinjs/karin-plugin-botweb/data/botweb.db`（`dir.dataDir`，不在仓库内）。`profiles` 表：主键 `(self_id, kind, target_id)`，`kind ∈ friend/group/avatar`，upsert 时空字符串字段不覆盖已有值（`CASE WHEN excluded.x != ''`）。`members` 表：主键 `(self_id, group_id, user_id)`，同样的非空不覆盖 upsert（role 始终覆盖）。**写入受设置门控**（`SettingsService.shouldCacheProfiles`，配置项 `profileCacheMode`：`all` 全部统计 / `non-qq` 默认仅非 QQ 协议 / `off` 关闭；QQ 协议列表与前端 `utils.ts` 的 QQ_FACE_PROTOCOLS 保持一致）。三条写入路径：列表接口拿到真实列表时全量刷新（friends/groups/members）；`ProfileService.syncMessage` 缓存未命中时调协议端补单条（`pending` Set 防并发打爆接口）；群消息发送者累积进 members 表（qqbot 等无成员列表接口的协议端靠它攒名册）。统计关闭的 bot 仍实时补全并推送 profiles 增量（进程内 `synced` Set 去重，不落库）。`friends`/`groups`/`members` 接口在协议端**返回空数组（qqbot 不抛错）或抛错**时回退缓存。注意**群消息发送者不进好友缓存**（只进 avatar 行 + members 行），否则前端会把每个群成员当成好友会话。
- **插件设置**（`service/settings.ts`）：JSON 存 `dir.dataDir/settings.json`（区别于运行时数据的 sqlite——设置是低频读写、便于手改）；字段 `profileCacheMode` / `messageStore` / `messageStoreBots`，契约 `BotWebSettings` 两边（`service/dto.ts` 与 `template/src/core/types.ts`）同步；读写走 `GET/POST /botweb/api/settings`，前端在设置视图（`Sidebar.tsx` 的 `SettingsView`）乐观更新 + 失败回滚。
- **`@karinjs/sqlite3` 是唯一的运行时依赖**（`dependencies` 字段）：native .node 不能进 bundle，tsdown `neverBundle` 已加；其余依赖仍走 devDependencies + tsdown 全部打包进 `lib/` 的模式。
- **前端禁止直拼 qlogo 头像地址**（qlogo 只对 QQ 数字账号有效，其他协议必裂图）：用户头像统一走后端协议端 `getAvatarUrl`——实时消息靠 profiles 推送的 `users` 增量，历史/成员头像靠 `GET /avatars` 补拉（`chat.tsx` 的 `avatarMap` + `resolveAvatar`，字母占位兜底）；会话头像走 friends/groups 的 `avatar` 字段。渲染统一用 `components/Avatar.tsx`（有 url 显示图，无 url 名称首字符圆形占位）。
- **WS 必须复用 karin 内置 wss**：用 `karin.on('ws:connection:<path>', (socket, req, call) => { call(); ... })` 接管，**3 秒内不调 `call()` karin 自动断连**；禁止自建 `new WebSocketServer({ server })`（会冲突）。
- **`karin.accept()` 只创建插件对象，必须具名导出才会被注册**：karin 加载 apps 模块后扫描其具名导出（数组会展开，`default` 导出被跳过）完成 accept/command 等插件注册，不导出就是死代码（见 `apps/web.ts` 的 `noticeHandlers`）。
- `karin.accept` 挂在 karin 对象上（不是根导出）；群事件 key 是 `notice.groupRecall` / `notice.groupPoke`。**私聊事件的声明 key（`notice.privateRecall` / `notice.privatePoke`）与运行时 subEvent（`friendRecall` / `friendPoke`）不一致，accept 按 `${event}.${subEvent}` 匹配，必须按运行时 key 注册**（见 `apps/web.ts` 顶部的 `PRIVATE_RECALL_EVENT` / `PRIVATE_POKE_EVENT` 常量及注释）。
- `/botweb/api` 与 `/botweb/ws` 已接入 karin 鉴权（见「请求链路」）；页面路由 `GET /botweb` 本身不鉴权（静态外壳，数据全走 API/WS）。注意 karin 的 `authMiddleware` 对**非 GET/POST 方法直接 405**，且失败响应不是 `ApiResult<T>` 格式。
- 登录态 localStorage 三键（`userId`/`accessToken`/`refreshToken`）**键名不可改**，与 karin WebUI 互通全靠同名；vite dev 已把 `/api/v1` 代理到 7777（登录/刷新走 karin 官方接口）。
- express v5 通配符写法是 `/botweb/*splat`；API 路由必须注册在 SPA 兜底之前。
- `express.json({ limit: '50mb' })` 不能删——图片/文件以 base64 随 JSON 发送，默认 100kb 会被拒且 express 返回 HTML 错误页。
- 时间戳单位混乱：karin 事件是**秒**，但部分接口返回**毫秒**——前端一律经 `toMillis()` 归一（>1e12 视为毫秒）。
- 前端整体视觉为 **Mac 版 QQ（QQ NT macOS）风格**（按设计稿还原）：四栏布局——`NavRail` 窄功能栏（红绿灯 + 消息/联系人 + 底部汉堡菜单：主题/设置/退出登录）+ `Sidebar` 第二栏（顶部 bot 资料卡点按弹账号切换、搜索 + 刷新行、三视图随 `ui.tsx` 的 `navView` 切换）+ `ChatWindow` 主区域 + `GroupPanel` docked 群资料右栏（仅群聊，`ui.tsx` 的 `groupPanelOpen` 开关，群公告为占位「暂无公告」）。配色集中在 `index.css` 的 `qq-*` CSS 变量（`:root` 亮色：rail `#ededed`/sidebar `#f7f7f7`/chat `#f2f2f2`/品牌蓝 `#0099ff`/白气泡；`.dark` 深色按设计稿取色：rail `#1a1a1a`/sidebar `#1f1f1f`/chat `#262626`/对方气泡 `#333333`/自己气泡 `#0a84ff`），经 `@theme inline` 映射为 tailwind 的 `bg-qq-*`/`text-qq-*` 等工具类；暗色由 `state/ui.tsx` 给根元素挂 `.dark` class 驱动（变量自动切换，**禁止用 `dark:` 变体**）。**颜色一律走 qq 变量，禁止写死 hex**（仅 Avatar 占位色板为例外）——红色系（错误/危险/撤回/未读）统一 `bg-qq-badge`/`text-qq-badge`（两主题均 `#ff3b30`）。注意 **`--qq-active` 是选中会话行的灰色**（亮 `#e3e3e3`/暗 `#363636`），不是蓝色；选中行灰底圆角。组件级类：`.glass` 毛玻璃浮层、`.bubble` 12px 圆角**无尾巴**、`.time-pill` 消息区居中时间胶囊、`.role-badge`（`-owner` 橙/`-admin` 蓝）群成员角色徽章、`.unread-pill`（`-muted` 灰）未读数胶囊。`index.css` 用 `@source not "./generated/html.ts"` 排除构建产物，防止旧类名被 Tailwind 内容扫描自我延续。
- QQ 图床按 referer 防盗链：所有 `<img>` 必须带 `referrerPolicy="no-referrer"`；karin 的 `base64://` 前缀需转成 data URL（`resolveMediaSrc`）。
- QQ 小黄脸（face 元素）：图源已**本地化**——`core/scripts/download-faces.mjs` 把 koishijs/QFace 的动图/静态图下载到 `core/resources/faces/{gif,static}/` 并生成 `manifest.json`（清单接口 data.jsdelivr.com 部分网络 403，脚本改为直接探测 CDN id 0..399，已存在文件会跳过），由 core 的 `GET /botweb/faces/manifest.json` 与 `/botweb/faces/:type/:name` 路由托管（不鉴权、长缓存，注册在 SPA 兜底之前）。`MessageFace` 按 本地动图→本地静态图→`[表情:id]` 文本 三级降级（url 工具在 template `utils.ts` 的 `qqFaceGif/qqFacePng`）。
- **表情资源前端持久缓存**（`template/src/client/faceCache.ts`）：blob 存 IndexedDB（`botweb-faces/faces`），命中后 `<img>` 直接用 object URL、零网络请求；回源并发限 6；manifest 内存缓存一次；打开 QFace 页签时后台预热全部静态图。改表情相关代码时 `<img>` 的 src 必须走 `useCachedSrc()`，不要直接用远程/路由 url。
- **QQ 平台适配**：`BotInfo.protocol` 携带 `bot.adapter.protocol`（契约两边已同步）；`utils.isQQProtocol` 判定 QQ 协议实现（`icqq/gocq-http/napcat/oicq/llonebot/lagrange`，**qqbot 官方 API 不支持经典小黄脸，不计入**）。QQ bot 的表情面板有「QFace」横向分类，点选后表情以**内联图片**插入输入框光标处（见下条），与文本混排，发送时按出现顺序解析为 text/face 元素序列；非 QQ bot 无此分类、不能发 face。
- **输入框是 contenteditable 富文本**（`.rich-input`，非受控组件）：QQ 表情（`<img data-face-id>`）与待发送图片（`<img data-image-id class="rich-image">`，dataURL 存 `pendingImagesRef` 不塞 DOM 属性）内联混排，发送时 `parseEditor()` 遍历 DOM 按出现顺序解析为 text/face/image 元素序列再拆 @；粘贴只取纯文本、粘贴图片内联进编辑器、粘贴其他文件走 handleFiles 直发；空态由 `syncEmpty()` 手动同步（驱动发送按钮禁用）；placeholder 靠 CSS `.rich-input:empty::before`。选择表情/插入 @ 后必须 `editor.focus()`，否则回车会触发聚焦的按钮而不是发送。
- **附件按钮是输入区工具栏的独立图标按钮**（InputArea 工具栏：表情/图片/文件三个线性图标按钮）：「图片」打开 `accept='image/*'` 选择器，选中的图片内联进输入框与文本混排；「文件」打开 `*/*` 选择器，选中后走 `handleFiles` **直接发送**（video/audio/image/file 按类型映射元素，不再有 stagedImages 待发送区）。**拖拽/粘贴的图片也内联进输入框**（拖拽经 ui.tsx 的 `pendingImages` 由 InputArea 消费，与 pendingMention 同模式），其他文件直发。注意文件选择器 `onChange` 必须**先 `Array.from` 拷贝再清空 `input.value`**——`input.files` 的 FileList 是活动的，清空后已捕获的 FileList 会变空。
- **消息 sqlite 持久化**（`service/db.ts` 的 `messageDb`，同库 `messages` 表）：主键 `(self_id, scene, peer, message_id)`，`time` 存**毫秒**（入库时 >1e12 判定归一），`elements` 存 JSON。写入用 `INSERT OR IGNORE`（自己发的消息会被 send 接口与协议端回显各写一次，后到者忽略）；入库前把 `data:` 开头的 base64 媒体降级为占位文本（防撑爆 db）。**写入受设置门控**（全局 `messageStore` 开关 + `messageStoreBots` 按 bot 单独开关，见上条设置约束）。`hooks.message` 里写库与 ProfileService 一样是 **fire-and-forget，禁止 await**。撤回走 `markRecalled` 置 `recalled = 1`，前端刷新后仍保持撤回红框态。表情回应用 `reactions` 列（TEXT，JSON `ReactionItem[]`，老库经 `PRAGMA table_info` + `ALTER TABLE` 迁移）+ `applyReaction` 增量聚合。
- 前端消息**只存内存**（messageMap），启动时按 bot 调 `GET /bots/:selfId/messages` 全量拉取；reducer 的 `merge` 按 key 合并 + messageId 去重 + 时间排序，不覆盖拉取完成前到达的 WS 实时消息。localStorage 只剩未读数（`botweb:unread:{selfId}`）与登录态。
- tsdown 的 core 构建要求 template 已构建（`dist/index.js` + `index.d.ts` 存在），否则类型检查和打包都会失败。
- ESLint 目前跑不起来（`eslint.config.js` 依赖未安装的 `globals` 包），为既有问题。

## 代码风格

- TypeScript，ESM；2 空格缩进、**无分号**（neostandard 风格）
- core 路径别名 `@/*` → `packages/core/src/*`；template `@/*` → `packages/template/src/*`
- 注释用中文；新代码跟随周边文件风格
- 不加新依赖（确有需要在会话中提出）

## 已知限制 / 未做事项

- 插件启用前的历史消息不可见（不走协议端 `getHistoryMsg`）；karin 登录页无法用 URL 参数指定登录后回跳地址（react-router 内存态），所以面板用自己的登录页而不是跳转 `/web/login`
- 撤回/戳一戳的昵称解析基于当前 bot 的好友/群成员数据，非当前 bot 会话里的操作者可能显示为 ID
- `packages/core/package.json` 的 `karin.web`/`ts-web`（Karin WebUI 配置面板 schema）与本面板无关，未实现
- 发送文件前端限制 ~20MB（base64 内联）
