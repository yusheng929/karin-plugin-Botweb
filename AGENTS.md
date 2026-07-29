# AGENTS.md

本文件帮助新会话快速了解本项目，无需重新分析代码库。

## 项目概述

`karin-plugin-Botweb` 是一个 pnpm monorepo，产物是 **Karin（node-karin）机器人框架的 Web 聊天面板插件**：在浏览器里以 Bot 身份查看好友/群会话、收发消息。

- `packages/core` — Karin 插件本体（后端），包名 `karin-plugin-botweb`
- `packages/template` — Web 前端（React 19 + Vite 6 + Tailwind v4 + **HeroUI v3**），包名 `sandbox-template`（历史遗留名）

核心设计：**前端被打包成一个 `render()` 函数内联进后端**。template 构建出 JS/CSS 全部内联的单文件 HTML，core 通过 `import { render } from 'sandbox-template'` 引用，core 的 tsdown（`alwaysBundle: ['sandbox-template']`）把整个页面打包进 `lib/apps/web.js`。生产只需部署 core 的 `lib/`。

## 请求链路

```
浏览器 ──HTTP──> Karin app(:7777) ──GET /botweb──────> res.send(render('/botweb'))  (单文件 HTML，不鉴权)
                                 ──/botweb/api/*─────> karin authMiddleware ──> core/src/api 路由  (REST，需鉴权)
浏览器 ──WS upgrade──> Karin 内置 wss ──> karin.on('ws:connection:/botweb/ws')  (服务端只推不收，query 鉴权)
Bot 事件 ──> hooks.message / karin.accept('notice.*') ──> 写 sqlite messages 表 + 广播 WS ──> 前端按 selfId 分 bot 入库
```

**鉴权完全复用 karin 体系**：前端登录页调 karin 的 `/api/v1/login`（sha256(HTTP_AUTH_KEY) 换 JWT），登录态写 karin WebUI 同款 localStorage 键（`userId`/`accessToken`/`refreshToken`，**键名不可改**，与 WebUI 双向共享免登）。REST 走 `Authorization: Bearer <JWT 或明文 key>` + `x-user-id`；WS 由插件在连接回调里校验 query 的 `?token=&user_id=`（`service/auth.ts` 手写 HS256 验 JWT，明文 key 兜底），失败 `close(4401)`。accessToken 过期（401/419）前端自动调 `/api/v1/refresh` 重放一次。

## 目录结构

```
packages/
├── core/                          # Karin 插件（后端）
│   ├── src/
│   │   ├── index.ts / app.ts / dir.ts / types.ts
│   │   ├── apps/web.ts            # ★ 面板挂载点：页面路由 + API 挂载 + WS 接管 + 事件广播
│   │   ├── api/                   # express 路由：bot.ts / message.ts / settings.ts
│   │   └── service/               # 业务层：bot / message / dto(★前后端契约映射) / auth / cache / db / settings / profile
│   ├── resources/faces/           # QQ 小黄脸本地图源（scripts/download-faces.mjs 下载，/botweb/faces/* 托管）
│   └── development.env            # dev 环境变量（HTTP_PORT=7777，HTTP_AUTH_KEY=abc123）
└── template/                      # 前端
    ├── src/
    │   ├── index.ts               # 包入口：导出 render(basePath)，供 core 引用
    │   ├── generated/html.ts      # 构建生成：内联 HTML 字符串（勿手改）
    │   ├── core/types.ts          # ★ 前后端共享 DTO 契约（与 core/src/service/dto.ts 同步）
    │   ├── main.tsx               # 入口：登录门控 + HeroUI Toast.Provider
    │   └── client/
    │       ├── auth.ts / sha256.ts / api.ts / utils.ts / faceCache.ts / specialLink.ts
    │       ├── state/             # UiProvider（主题/toast/对话框/右键菜单等 UI 态）+ ChatProvider（数据层）
    │       └── components/        # NavRail/Sidebar/ChatWindow/GroupPanel/MessageList/MessageItem/
    │                              # InputArea/LoginScreen/ContextMenu/Overlays/EmojiPicker/ReactionPicker/Avatar
    └── scripts/inline.mjs         # vite 产物 → 单文件 HTML → src/generated/html.ts
```

## 常用命令（仓库根目录）

```bash
pnpm -r build          # 全量构建（拓扑序：先 template 后 core）
pnpm dev               # Karin 开发服务器（:7777，tsx 运行 packages/core/src）
pnpm dev:web           # vite 开发服务器（:5173，/botweb 与 /api/v1 代理到 7777，含 WS）
pnpm exec tsc --noEmit -p packages/core      # core 类型检查（需 template 先 build 出 dist）
```

开发流程：先 `pnpm -F sandbox-template build` 一次（core 的类型/运行都依赖 template 的 `dist/`），然后终端 1 跑 `pnpm dev`、终端 2 跑 `pnpm dev:web`。生产访问 `http://127.0.0.1:7777/botweb`。

## REST API（前缀 `/botweb/api`，响应均为 `ApiResult<T> = { code, message, data }`）

**所有接口需鉴权**（karin `authMiddleware`，失败返回 karin 格式 401/419，非 `ApiResult<T>`；非 GET/POST 方法直接 405）。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/bots` | Bot 列表 |
| GET | `/bots/:selfId/conversations` | 会话摘要（每会话最后一条本地消息，列表预览/排序用） |
| GET | `/bots/:selfId/history?scene=&peer=&before=&limit=` | 协议端历史分页（**懒加载主数据源**：首页先试 seq 0 拉最新——NapCat 群聊原生支持、milky 由适配器映射为「拉最新」，不支持的协议端吞错后用本地最新消息 id 做锚点；叠加本地撤回标记并补洞；协议端不支持时前端降级 `/messages`） |
| GET | `/bots/:selfId/messages?...` | 本地 sqlite 历史分页（**兜底数据源**，如 qqbot 无 getHistoryMsg 时） |
| GET | `/bots/:selfId/friends` `/groups` `/groups/:groupId/members` | 列表（空/报错回退 db 资料缓存；members 含 `title` 专属头衔） |
| GET | `/bots/:selfId/avatars?ids=a,b,c` | 批量用户头像（上限 50 个） |
| GET | `/bots/:selfId/forward?resId=` | 合并转发内容（点击 forward 卡片按需拉取） |
| GET/POST | `/settings` | 插件设置读写（`BotWebSettings`：profileCacheMode / messageStore / messageStoreBots） |
| POST | `/bots/:selfId/groups/:groupId/poke` `/friends/:userId/poke` `/groups/:groupId/kick` | 戳一戳 / 踢出 |
| POST | `/message/send` `/message/recall` `/message/reaction` | 发消息 / 撤回 / 表情回应（reaction 仅 NapCat/Lagrange 等 OneBot 实现） |

消息持久化在**后端 sqlite messages 表**（`service/db.ts`，`@karinjs/sqlite3`）：角色为 ①实时消息防撤回镜像 ②协议端历史页同步写入 ③撤回标记支撑历史页叠加/补洞 ④协议端不可用时的兜底数据源。**入库受设置门控**（全局 `messageStore` + 按 bot 的 `messageStoreBots`，默认都不存）。前端消息只存内存：启动拉会话摘要，打开会话走 `/history` 协议端分页（双游标 historyMap），上翻逐页加载。

## WS 推送协议（`/botweb/ws`，服务端只推不收）

连接带 query 凭据 `?token=<JWT 或明文 key>&user_id=<userId>`，失败以 4401 断开。推送类型：

- `message`（全量广播，前端按 selfId 分 bot）、`recall`（气泡打 recalled 红框标记）、`poke`
- `reaction` — QQ 表情回应（仅群聊）。count 从插件启用后的事件增量累积，无初始状态；NapCat 取消事件无标志位，旧版 karin 靠后端内存表翻转推断。前端 reducer 按 faceId 聚合增减，后端同步写 messages 表 `reactions` 列。面板主动贴表情走 `POST /message/reaction`，本地乐观聚合 + `pendingReactionRef` 队列跳过自己的 WS 回显防重复；「我贴过的」表（`botweb:myreactions` localStorage）决定点胶囊是贴还是取消
- `profiles` — 会话资料增量（头像/名称 fire-and-forget 补全），friends/groups upsert，users 进 avatarMap

**元素契约**：`ChatMessage`/`MessageElement`/`WsPush` 定义在 `template/src/core/types.ts`，core 侧镜像在 `core/src/service/dto.ts`，**改动契约两边必须同步**。core 的 `convertElements` 把 OneBot 未知段的 JSON 文本还原为 forward/markdown/buttons 元素，mface 转 image，dice/rps 转占位文本，并按「原文 + 纯文本近似 + 剔除提及变体」去掉协议端重复下发的 markdown 副本。发送侧 forward/markdown/buttons 降级为文本占位。

**markdown 渲染**（`MessageMarkdown.tsx`）：react-markdown + GFM + rehype-raw，按协议族预处理方言（TG/DC/QQ）；防 XSS 靠预处理转义用户内容的 `<`；特殊协议链接（`mqqapi://aio/inlinecmd` 内联指令）走 `specialLink.ts` 注册表，点击经 `pendingInlineCmd` 由 InputArea 消费。

## 关键约束（踩过的坑，改动时务必遵守）

- **`hooks.message` 回调必须调用 `next()`**，且禁止 await 慢操作（db/协议端调用）——资料补全与写库都是 fire-and-forget。
- **WS 必须复用 karin 内置 wss**：`karin.on('ws:connection:<path>', (socket, req, call) => { call(); ... })`，**3 秒内不调 `call()` 自动断连**；禁止自建 WebSocketServer。
- **`karin.accept()` 必须具名导出才会被注册**（default 导出被跳过）。群事件 key 是 `notice.groupRecall`/`notice.groupPoke`；**私聊事件声明 key 与运行时 subEvent 不一致，必须按运行时 key 注册**（见 `apps/web.ts` 顶部 `PRIVATE_RECALL_EVENT`/`PRIVATE_POKE_EVENT`）。
- **好友/群/群成员 sqlite 缓存**（`service/db.ts`+`cache.ts`）：插件私有 sqlite（`@karinjs/sqlite3`，**不要用 `node:sqlite`**，它要求 node>=22.5），db 在运行时目录 `data/botweb.db`。upsert 空字符串不覆盖已有值。写入受 `profileCacheMode` 门控（`all`/`non-qq`/`off`，QQ 协议列表与前端 `utils.ts` 的 QQ_FACE_PROTOCOLS 一致）。**群消息发送者不进好友缓存**（只进 avatar + members 行）。列表接口空数组/抛错时回退缓存。
- **`@karinjs/sqlite3` 是 core 唯一运行时依赖**（native .node 不能进 bundle，tsdown `neverBundle` 已加）；其余依赖走 devDependencies + 全部打包进 `lib/`。
- **前端禁止直拼 qlogo 头像地址**：用户头像统一走后端 `getAvatarUrl`（profiles 推送 + `/avatars` 补拉 + `avatarMap`），渲染统一用 `components/Avatar.tsx` 兜底字母占位。
- **UI 组件一律用 HeroUI v3**（`@heroui/react` + `@heroui/styles`，已在 `index.css` 的 `@import "tailwindcss"` 之后引入；v3 无 Provider（Toast 除外）、用复合组件、`onPress` 代替 `onClick`）。**坑①：React Aria 的 Button 不会触发表单原生提交**，登录按钮用 `onPress` 直接调 submit（回车走 form onSubmit 正常）。**坑②：`Badge` 默认 `placement='top-right'` 是绝对定位**，角标必须配 `Badge.Anchor` 使用（NavRail 导航图标）；**行内未读数用 `Chip color='danger' variant='primary' size='sm'`**（Sidebar 会话行/账号切换），不能裸用 Badge。toast 走 `ui.tsx` 的 `setToast`（内部调 HeroUI `toast()`，success/error/info 映射 success/danger/accent）；确认/告警对话框用受控 `Modal.Backdrop`（Overlays.tsx）；菜单弹层用 `Dropdown`（NavRail 汉堡菜单的主题单选走 `Dropdown.Section selectionMode='single'`，Sidebar 账号切换走 `Dropdown.Menu onAction`）；设置单选用 `RadioGroup`；`components/Avatar.tsx` 内部即 HeroUI `Avatar`（url 传 `Avatar.Image`，字母占位传 `Avatar.Fallback`，加载失败自动回退）。保留自绘的仅限 HeroUI 无对应的桌面形态：右键菜单、InputArea 工具条/发送按钮、消息气泡、EmojiPicker/ReactionPicker。项目装有 heroui-react skill，查组件用法先读它。
- 页面配色集中在 `index.css` 的 `qq-*` CSS 变量（`:root` 亮色 / `.dark` 深色），经 `@theme inline` 映射为 tailwind 工具类；暗色由 `state/ui.tsx` 给根元素挂 `.dark` class 驱动（**禁止用 `dark:` 变体**）。**颜色一律走 qq 变量，禁止写死 hex**（Avatar 占位色板除外）；红色系统一 `bg-qq-badge`/`text-qq-badge`。`--qq-active` 是选中会话行的灰色，不是蓝色。
- 发送侧媒体（image/file/video/record）的 `data:` URL 由协议端自行处理：milky 已在适配器侧（`karin-plugin-adapter-milky` 的 `event/convert.ts` `normalizeUri`）统一转 `base64://`，插件不做 scheme 归一化。**注意 npm 1.3.0 尚未包含适配器侧的三处修复**（data: 支持、getHistoryMsg 循环拉取/seq0 映射、getGroupList 群头像），需发布新版后 bump devDependency；本地联调可临时用 `file:../../../karin-plugin-adapter-milky` 指源码（peer 去重无双实例问题，adapter 改动后需其仓库 `pnpm build` + 本仓库 `pnpm install` 同步）。
- express v5 通配符写法是 `/botweb/*splat`；API 路由必须注册在 SPA 兜底之前。`express.json({ limit: '50mb' })` 不能删（base64 图片随 JSON 发送）。
- 时间戳单位混乱：karin 事件是**秒**，部分接口返回**毫秒**——前端一律经 `toMillis()` 归一（>1e12 视为毫秒）。
- QQ 图床防盗链：所有 `<img>` 必须带 `referrerPolicy="no-referrer"`；`base64://` 前缀转 data URL（`resolveMediaSrc`）。复制文本统一走 `copyTextToClipboard`（http 下 Clipboard API 不可用，有降级）。
- QQ 小黄脸图源已本地化（`core/resources/faces/`，`/botweb/faces/*` 托管、不鉴权、长缓存）：**`res.sendFile` 必须带 `{ dotfiles: 'allow' }`**（pnpm 部署路径含 `.pnpm` 段，否则生产 404）。前端表情走 IndexedDB 缓存（`faceCache.ts` 的 `useCachedSrc()`，禁止直接用远程 url）。
- **输入框是 contenteditable 富文本**（`.rich-input`，非受控）：QQ 表情（`<img data-face-id>`）与待发送图片内联混排，发送时 `parseEditor()` 按 DOM 顺序解析元素序列；文件选择器 `onChange` 必须先 `Array.from` 拷贝再清空 `input.value`。
- **消息列表性能**：`MessageList` 窗口化渲染（首屏尾部 100 条，滚动/按钮按页扩窗，scrollHeight 锚点防跳动）；`MessageItem` 为 `React.memo`，数据**不直接订阅 useChat/useUi**，走 `components/messageView.ts` 的 `MessageViewContext`。
- tsdown 的 core 构建要求 template 已构建（`dist/index.js` + `index.d.ts` 存在）。ESLint 目前跑不起来（缺 `globals` 包），为既有问题。

## 代码风格

- TypeScript，ESM；2 空格缩进、**无分号**（neostandard 风格）；注释用中文
- core 路径别名 `@/*` → `packages/core/src/*`；template `@/*` → `packages/template/src/*`
- **块注释里禁止出现 `*/` 序列**（会提前闭合注释，已踩过两次）
- 不加新依赖（确有需要在会话中提出）

## 已知限制 / 未做事项

- 历史主走协议端 `getHistoryMsg`（NapCat 完整；milky 群聊完整——适配器按 30 一批循环拉取、seq=0 映射为拉最新，**好友场景 milky 服务端不支持**；Lagrange 不支持 seq 拉最新；qqbot 不支持降级本地库）；好友场景首页通常必须存在本地锚点消息
- 撤回/戳一戳的昵称解析基于当前 bot 数据，非当前 bot 会话里的操作者可能显示为 ID
- `packages/core/package.json` 的 `karin.web`/`ts-web`（WebUI 配置面板 schema）未实现
- 发送文件前端限制 ~20MB（base64 内联）
