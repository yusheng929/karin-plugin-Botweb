# AGENTS.md

本文件帮助新会话快速了解本项目，无需重新分析代码库。

## 项目概述

`karin-plugin-Botweb` 是一个 pnpm monorepo，产物是 **Karin（node-karin）机器人框架的 Web 聊天面板插件**：在浏览器里以 Bot 身份查看好友/群会话、收发消息。

- `packages/core` — Karin 插件本体（后端），包名 `karin-plugin-botweb`
- `packages/template` — Web 前端（React 19 + Vite 6 + Tailwind v4 + **HeroUI v3**），包名 `sandbox-template`（历史遗留名）

核心设计：**前端由 vite 直接打包进后端的 `lib/webui/`**。template 构建产物（index.html + assets）输出到 `packages/core/lib/webui`（vite `outDir: '../core/lib/webui'`），core 用 `express.static` 托管在 `/botweb`（SPA 兜底回 index.html）。生产只需部署 core 的 `lib/`。**构建顺序必须 core 先、template 后**（tsdown `clean` 会清空 `lib/`，根目录 build 脚本已显式保证）。**core 产物必须保持 `.js` 扩展名**（karin 的 npm 插件加载器 `filesByExt` 只扫 `.js`，改成 `.mjs` 会导致生产环境插件加载不到，已踩坑论证过）。

## 请求链路

```
浏览器 ──HTTP──> Karin app(:7777) ──GET /botweb──────> express.static(lib/webui) + SPA 兜底 index.html  (不鉴权)
                                 ──/botweb/api/*─────> karin authMiddleware ──> core/src/api 路由  (REST，需鉴权)
浏览器 ──WS upgrade──> Karin 内置 wss ──> karin.on('ws:connection:/botweb/ws')  (服务端只推不收，query 鉴权)
Bot 事件 ──> hooks.message / karin.accept('notice.*') ──> 广播 WS ──> 前端按 selfId 分 bot 入库（消息不落库）
```

**鉴权完全复用 karin 体系**：前端登录页调 karin 的 `/api/v1/login`（sha256(HTTP_AUTH_KEY) 换 JWT），登录态写 karin WebUI 同款 localStorage 键（`userId`/`accessToken`/`refreshToken`，**键名不可改**，与 WebUI 双向共享免登）。REST 走 `Authorization: Bearer <JWT 或明文 key>` + `x-user-id`；WS 由插件在连接回调里校验 query 的 `?token=&user_id=`（`service/auth.ts` 手写 HS256 验 JWT，明文 key 兜底），失败 `close(4401)`。accessToken 过期（401/419）前端自动调 `/api/v1/refresh` 重放一次。

## 目录结构

```
packages/
├── core/                          # Karin 插件（后端）
│   ├── src/
│   │   ├── index.ts / app.ts / dir.ts / types.ts
│   │   ├── apps/web.ts            # ★ 面板挂载点：静态托管 lib/webui + API 挂载 + WS 接管 + 事件广播
│   │   ├── api/                   # express 路由：bot.ts / message.ts / settings.ts
│   │   └── service/               # 业务层：bot / message / dto(★前后端契约映射) / auth / cache / db / settings / profile
│   ├── lib/webui/                 # ★ vite 构建产物（template 直接输出到这里，随 core 发布）
│   ├── resources/faces/           # QQ 小黄脸本地图源（镜像 koishijs/QFace 仓库，/botweb/faces/* 托管；gif/ 目录上游混放少量 .png 静态散件，manifest 按扩展名过滤生成）
│   └── development.env            # dev 环境变量（HTTP_PORT=7777，HTTP_AUTH_KEY=abc123）
└── template/                      # 前端（纯构建包，不再是库，无 dist 导出）
    ├── index.html                 # vite 入口：注入 window.BOTWEB_BASE + 字体 CDN link
    ├── vite.config.ts             # build 时 base='/botweb/'、outDir='../core/lib/webui'；dev 时 base='/'（避开 /botweb 代理）
    └── src/
        ├── core/types.ts          # ★ 前后端共享 DTO 契约（与 core/src/service/dto.ts 同步）
        ├── main.tsx               # 入口：登录门控 + HeroUI Toast.Provider
        └── client/
            ├── auth.ts / sha256.ts / api.ts / utils.ts / faceCache.ts / specialLink.ts / emoji.tsx
            ├── state/             # UiProvider（主题/toast/对话框/右键菜单等 UI 态）+ ChatProvider（数据层）
            └── components/        # NavRail/Sidebar/ChatWindow/GroupPanel/MessageList/MessageItem/MessageImage/
                                   # InputArea/LoginScreen/ContextMenu/Overlays/EmojiPicker/ReactionPicker/Avatar
```

## 常用命令（仓库根目录）

```bash
pnpm build             # 全量构建（显式顺序：先 core 后 template——tsdown clean 清 lib/，template 产物进 lib/webui）
pnpm dev               # Karin 开发服务器（:7777，tsx 运行 packages/core/src；页面访问需 template 已 build 出 lib/webui）
pnpm dev:web           # vite 开发服务器（:5173，页面在 / 下由 vite 直供，/botweb 与 /api/v1 代理到 7777，含 WS）
pnpm exec tsc --noEmit -p packages/core      # core 类型检查（与 template 无依赖，互不阻塞）
```

开发流程：先 `pnpm build` 一次（7777 的页面托管直接读 `lib/webui`），然后终端 1 跑 `pnpm dev`、终端 2 跑 `pnpm dev:web`（前端改动用 5173 热更新调试，7777 页面仍是构建产物）。生产访问 `http://127.0.0.1:7777/botweb`。

## REST API（前缀 `/botweb/api`，响应均为 `ApiResult<T> = { code, message, data }`）

**所有接口需鉴权**（karin `authMiddleware`，失败返回 karin 格式 401/419，非 `ApiResult<T>`；非 GET/POST 方法直接 405）。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/bots` | Bot 列表 |
| GET | `/bots/:selfId/history?scene=&peer=&before=&limit=` | 协议端历史分页（**唯一历史数据源**：首页先试 seq 0 拉最新——NapCat 原生支持、milky 由适配器映射为「拉最新」；不支持的协议端（qqbot/milky 好友等）返回 fail，前端 toast 提示；分页切片先按时间排序再保留最新 limit 条） |
| GET | `/bots/:selfId/friends` `/groups` `/groups/:groupId/members` | 列表（空/报错回退 db 资料缓存；members 含 `title` 专属头衔） |
| GET | `/bots/:selfId/avatars?ids=a,b,c` | 批量用户头像（上限 50 个） |
| GET | `/bots/:selfId/message?scene=&peer=&messageId=` | 按 msgid 拉协议端原始消息（karin `getMsg`，**不经 DTO 转换**，前端「原始事件」浮层数据源） |
| GET/POST | `/settings` | 插件设置读写（`BotWebSettings`：仅 profileCacheMode） |
| POST | `/bots/:selfId/groups/:groupId/poke` `/friends/:userId/poke` `/groups/:groupId/kick` | 戳一戳 / 踢出 |
| POST | `/message/send` `/message/recall` `/message/reaction` | 发消息 / 撤回 / 表情回应（reaction 仅 NapCat/Lagrange 等 OneBot 实现） |

**消息不落库**：历史一律走协议端 `getHistoryMsg`（无本地镜像/撤回叠加/锚点回退，撤回与表情回应只有实时态）。前端消息只存内存：会话列表 = friends/groups，启动并发受限（4 路）为每个会话懒拉 `limit=1` 最新一条做预览/排序；打开会话走 `/history` 分页（单游标 historyMap），上翻逐页加载。sqlite 只保留 profiles/members 两张**资料缓存**表（`service/db.ts`）。

## WS 推送协议（`/botweb/ws`，服务端只推不收）

连接带 query 凭据 `?token=<JWT 或明文 key>&user_id=<userId>`，失败以 4401 断开。推送类型：

- `message`（全量广播，前端按 selfId 分 bot）、`recall`（气泡打 recalled 红框标记，仅实时态）、`poke`
- `reaction` — QQ 表情回应（仅群聊）。count 从插件启用后的事件增量累积，无初始状态不落库；NapCat 取消事件无标志位，旧版 karin 靠后端内存表翻转推断。前端 reducer 按 faceId 聚合增减。面板主动贴表情走 `POST /message/reaction`，本地乐观聚合 + `pendingReactionRef` 队列跳过自己的 WS 回显防重复；「我贴过的」表（`botweb:myreactions` localStorage）决定点胶囊是贴还是取消
- `profiles` — 会话资料增量（头像/名称 fire-and-forget 补全），friends/groups upsert，users 进 avatarMap

**元素契约（底线：原始数据零修改）**：`ChatMessage`/`MessageElement`/`WsPush` 定义在 `template/src/core/types.ts`，core 侧镜像在 `core/src/service/dto.ts`，**改动契约两边必须同步**。core 的 `convertElements` **只做类型打标、内容字段原样透传，不增删改任何数据**——不做文本嗅探（手发同样 JSON 会被误判）、不做副本去重、不裁剪按钮字段、不生成任何占位文本；未知元素原样 `JSON.stringify` 进 `other`。渲染智能全部在前端基于原始数据完成（JSON 卡片按 QQ structmsg `meta[view]` 渲染成 QQ 式卡片——标题/描述/右侧缩略图/底部应用行 + jumpUrl 跳转，结构不识别回退美化 JSON 文本，见 `MessageItem.tsx` 的 `MessageJson`；纯卡片消息像纯媒体一样去气泡背景，卡片只能单独发送；markdown/按钮样式同理）。**「原始事件」不信任面板内消息对象**：右键菜单触发后经 `GET /bots/:selfId/message` 按 msgid 现场拉协议端 `getMsg` 原始返回展示。发送侧：json 原样回发 `segment.json`、buttons 原样回发 `segment.keyboard`（ButtonItem 与 KarinButton 字段一致）、markdown 降级为原文文本（内容即原始数据）、未知元素 text 缺省时序列化回发。

**markdown 渲染**（`MessageMarkdown.tsx`）：react-markdown + GFM + rehype-raw，按协议族预处理方言（TG/DC/QQ；QQ 方言补「# 后无空格也按标题」的客户端宽容语法，见 `preprocessQQ`）；防 XSS 靠预处理转义用户内容的 `<`；特殊协议链接（`mqqapi://aio/inlinecmd` 内联指令）走 `specialLink.ts` 注册表，点击经 `pendingInlineCmd` 由 InputArea 消费。**NC 的 markdown 消息会额外携带一段紧跟其后的纯文本兜底**（markdown 的明文形态，如 `[markdown:#你好, text:你好]`），core 原样透传，前端渲染/摘要/复制统一经 `utils.visibleElements` 过滤「紧跟 markdown 的 text 元素」防双重显示（仅展示层过滤，原始数据不动，「原始事件」仍可见完整元素）。

## 关键约束（踩过的坑，改动时务必遵守）

- **`hooks.message` 回调必须调用 `next()`**，且禁止 await 慢操作（db/协议端调用）——资料补全是 fire-and-forget 的。
- **WS 必须复用 karin 内置 wss**：`karin.on('ws:connection:<path>', (socket, req, call) => { call(); ... })`，**3 秒内不调 `call()` 自动断连**；禁止自建 WebSocketServer。
- **`karin.accept()` 必须具名导出才会被注册**（default 导出被跳过）。群事件 key 是 `notice.groupRecall`/`notice.groupPoke`；**私聊事件声明 key 与运行时 subEvent 不一致，必须按运行时 key 注册**（见 `apps/web.ts` 顶部 `PRIVATE_RECALL_EVENT`/`PRIVATE_POKE_EVENT`）。
- **好友/群/群成员 sqlite 缓存**（`service/db.ts`+`cache.ts`）：插件私有 sqlite（`@karinjs/sqlite3`，**不要用 `node:sqlite`**，它要求 node>=22.5），db 在运行时目录 `data/botweb.db`。upsert 空字符串不覆盖已有值。写入受 `profileCacheMode` 门控（`all`/`non-qq`/`off`，QQ 判定走后端 `settings.ts` 自己的协议名列表）。**群消息发送者不进好友缓存**（只进 avatar + members 行）。列表接口空数组/抛错时回退缓存。
- **QQ NT 特性判定（QFace 面板/贴表情/表情回应）**：前端 `utils.isQQProtocol(bot)` 按 `platform === 'qq' && protocol !== 'qqbot'` 判定（**不是协议名白名单**——milky 的 protocol 是实现名如 Yogurt 无法枚举；platform 缺失的旧后端回退白名单）。`BotInfo` 契约含 `platform` 字段（两边同步）。官方 qqbot 同为 qq 平台但必须排除（不支持经典小黄脸/表情回应）。
- **`@karinjs/sqlite3` 是 core 唯一运行时依赖**（native .node 不能进 bundle，tsdown `neverBundle` 已加）；其余依赖走 devDependencies + 全部打包进 `lib/`。
- **前端禁止直拼 qlogo 头像地址**：用户头像统一走后端 `getAvatarUrl`（profiles 推送 + `/avatars` 补拉 + `avatarMap`），渲染统一用 `components/Avatar.tsx` 兜底字母占位。
- **UI 组件一律用 HeroUI v3**（`@heroui/react` + `@heroui/styles`，已在 `index.css` 的 `@import "tailwindcss"` 之后引入；v3 无 Provider（Toast 除外）、用复合组件、`onPress` 代替 `onClick`）。**坑①：React Aria 的 Button 不会触发表单原生提交**，登录按钮用 `onPress` 直接调 submit（回车走 form onSubmit 正常）。**坑②：`Badge` 默认 `placement='top-right'` 是绝对定位**，角标必须配 `Badge.Anchor` 使用（NavRail 导航图标）；**行内未读数用 `Chip color='danger' variant='primary' size='sm'`**（Sidebar 会话行/账号切换），不能裸用 Badge。toast 走 `ui.tsx` 的 `setToast`（内部调 HeroUI `toast()`，success/error/info 映射 success/danger/accent）；确认/告警对话框用受控 `Modal.Backdrop`（Overlays.tsx）；菜单弹层用 `Dropdown`（NavRail 汉堡菜单的主题单选走 `Dropdown.Section selectionMode='single'`，Sidebar 账号切换走 `Dropdown.Menu onAction`）；设置单选用 `RadioGroup`；`components/Avatar.tsx` 内部即 HeroUI `Avatar`（url 传 `Avatar.Image`，字母占位传 `Avatar.Fallback`，加载失败自动回退）。保留自绘的仅限 HeroUI 无对应的桌面形态：右键菜单、InputArea 工具条/发送按钮、消息气泡、EmojiPicker/ReactionPicker。项目装有 heroui-react skill，查组件用法先读它。
- 页面配色集中在 `index.css` 的 `qq-*` CSS 变量（`:root` 亮色 / `.dark` 深色），经 `@theme inline` 映射为 tailwind 工具类；暗色由 `state/ui.tsx` 给根元素挂 `.dark` class 驱动（**禁止用 `dark:` 变体**）。**颜色一律走 qq 变量，禁止写死 hex**（Avatar 占位色板除外）；红色系统一 `bg-qq-badge`/`text-qq-badge`。`--qq-active` 是选中会话行的灰色，不是蓝色。全局字体是华为 HarmonyOS Sans SC（`index.html` 引入 jsdelivr `harmonyos-sans-sc-webfont-splitted` 四档字重，unicode-range 按需加载，离线自动回退系统中文字体）；**emoji 用 Apple 图片方案**（`client/emoji.tsx`：文本/markdown 里的 emoji 字符替换为 `emoji-datasource-apple` 64px PNG——Apple 字体有再分发限制、无官方 webfont，图片是 Web 端唯一可行方案；文件名按 fully-qualified 码位序列规则生成 + 候选降级链，加载失败回退原字符系统字体；markdown 里走 `rehypeAppleEmoji` 插件）。
- 发送侧媒体（image/file/video/record）的 `data:` URL 由协议端自行处理：milky 已在适配器侧（`karin-plugin-adapter-milky` 的 `event/convert.ts` `normalizeUri`）统一转 `base64://`，插件不做 scheme 归一化。**注意 npm 1.3.x 尚未包含适配器侧的修复**（data: 支持、getHistoryMsg 循环拉取/seq0 映射、getGroupList 群头像、markdown 段映射——milky 服务端已下发 `{type:'markdown',data:{content}}` 但 milky-types@1.2.2 未定义，`AdapterConvertKarin` 进 switch 前手动映射为 `segment.markdown()`），需发布新版后 bump devDependency；本地联调可临时用 `file:../../../karin-plugin-adapter-milky` 指源码（peer 去重无双实例问题，adapter 改动后需其仓库 `pnpm build` + 本仓库 `pnpm install` 同步——file: 是安装期拷贝，只 rebuild 不同步）。
- **node-karin 的 OneBot `getHistoryMsg` 曾把每条历史消息的 `time` 打成 `Date.now()`**（请求时刻）：假时间戳与本地真实时间混排会把最新消息排到列表最前（窗口化渲染下直接看不见）。已在本地 Karin 仓库修复为 `time: v.time`，并把 seq 数字路径补上好友场景（原来一律调群接口，好友历史失效）（≥1.16.5，npm 1.16.4 仍有问题）；core 的 node-karin devDependency 现以 `file:../../../../Karin/packages/core` 指本地构建（Karin 改动后需其仓库 `pnpm build:main` + 本仓库 `pnpm install`——file: 是安装期拷贝，只 rebuild 不同步），发布新版后可改回版本号。本地 Karin 另带有 OneBot 扩展 markdown 段（NapCat `{type:'markdown',data:{content}}`，非 ob11 标准）的入站转换修复（`adapter/onebot/core/convert.ts` 的 `convertOneBotMessageToKarin` handlers 加 `markdown` 映射，此前被兜底 `JSON.stringify` 成文本），同样未发布。另外插件 `/history` 分页切片是**先按时间排序再保留最新 limit 条**（slice(-limit)），升序协议端（milky）不会再丢首页最新一条。
- express v5 通配符写法是 `/botweb/*splat`；API 路由必须注册在 SPA 兜底之前。`express.json({ limit: '50mb' })` 不能删（base64 图片随 JSON 发送）。
- 时间戳单位混乱：karin 事件是**秒**，部分接口返回**毫秒**——前端一律经 `toMillis()` 归一（>1e12 视为毫秒）。
- QQ 图床防盗链：所有 `<img>` 必须带 `referrerPolicy="no-referrer"`；`base64://` 前缀转 data URL（`resolveMediaSrc`）。复制文本统一走 `copyTextToClipboard`（http 下 Clipboard API 不可用，有降级）。
- QQ 小黄脸图源已本地化（`core/resources/faces/`，镜像 koishijs/QFace 仓库，`/botweb/faces/*` 托管、不鉴权、长缓存）：**`res.sendFile` 必须带 `{ dotfiles: 'allow' }`**（pnpm 部署路径含 `.pnpm` 段，否则生产 404）。前端表情走 IndexedDB 缓存（`faceCache.ts` 的 `useCachedSrc()`，禁止直接用远程 url）。注意上游 gif/ 目录混放 8 个 .png 静态散件（s306/307/333-336/347/348，无动图的表情），`manifest.json` 的 gif/static 列表按扩展名过滤生成；s161-166、461、478 等上游本就没有的 id 走降级链（动图→静态图→文本）。
- **输入框是 contenteditable 富文本**（`.rich-input`，非受控）：QQ 表情（`<img data-face-id>`）与待发送图片内联混排，发送时 `parseEditor()` 按 DOM 顺序解析元素序列；文件选择器 `onChange` 必须先 `Array.from` 拷贝再清空 `input.value`。
- **消息列表性能**：`MessageList` 窗口化渲染（首屏尾部 100 条，滚动/按钮按页扩窗，scrollHeight 锚点防跳动）；`MessageItem` 为 `React.memo`，数据**不直接订阅 useChat/useUi**，走 `components/messageView.ts` 的 `MessageViewContext`。**消息按发送者分组渲染（`MessageList` 的 `MessageGroup`）**：列表先归并成渲染单元（时间胶囊/系统消息/消息组），分组规则同原 groupStart/groupEnd 判定（时间胶囊强制开组）；头像在组容器侧列里 `sticky top-2 bottom-2 mt-auto`（TG 式吸附——自然停在组尾最后一条处，上翻历史、长组延伸到可视区下方时钉在可视区底部即输入框上方，继续上翻被上一组头像下移替换；top 约束处理回滚向新消息时的对称离场），`MessageItem` 自身不再渲染头像列（头像右键菜单经 `onAvatarMenu` 上抛）。
- core 与 template 构建已无依赖（core 不再 import 前端包），但**全量构建必须 core 先、template 后**（tsdown `clean: true` 清空 `lib/`，根目录 `pnpm build` 脚本已写死顺序）；`express.static` 与 SPA 兜底都带 `dotfiles:'allow'`（同 faces 的 .pnpm 坑）。ESLint 目前跑不起来（缺 `globals` 包），为既有问题。

## 代码风格

- TypeScript，ESM；2 空格缩进、**无分号**（neostandard 风格）；注释用中文
- core 路径别名 `@/*` → `packages/core/src/*`；template `@/*` → `packages/template/src/*`
- **块注释里禁止出现 `*/` 序列**（会提前闭合注释，已踩过两次）
- 不加新依赖（确有需要在会话中提出）

## 已知限制 / 未做事项

- 历史主走协议端 `getHistoryMsg`（NapCat 群聊完整、好友需 karin ≥1.16.5 的 seq 数字路径修复且 NapCat 对 seq=0 支持有限——**好友首页当前拉不到**；milky 群聊完整——适配器按 30 一批循环拉取、seq=0 映射为拉最新，**好友场景 milky 服务端不支持**；Lagrange 不支持 seq 拉最新；qqbot 不支持则返回 fail 前端 toast）；撤回/表情回应只有实时态，历史页不保留
- 撤回/戳一戳的昵称解析基于当前 bot 数据，非当前 bot 会话里的操作者可能显示为 ID
- `packages/core/package.json` 的 `karin.web`/`ts-web`（WebUI 配置面板 schema）未实现
- 发送文件前端限制 ~20MB（base64 内联）
