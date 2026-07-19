# AGENTS.md

本文件帮助新会话快速了解本项目，无需重新分析代码库。

## 项目概述

`karin-plugin-Botweb` 是一个 pnpm monorepo，产物是 **Karin（node-karin）机器人框架的 Web 聊天面板插件**：在浏览器里以 Bot 身份查看好友/群会话、收发消息。

- `packages/core` — Karin 插件本体（后端），包名 `karin-plugin-BotWeb`
- `packages/template` — Web 前端（React 19 + Vite 6 + Tailwind v4），包名 `sandbox-template`（历史遗留名，沙盒功能已删除）

核心设计：**前端被打包成一个 `render()` 函数内联进后端**。template 构建出 JS/CSS 全部内联的单文件 HTML，core 通过 `import { render } from 'sandbox-template'` 引用，core 的 tsdown（`alwaysBundle: ['sandbox-template']`）会把整个页面打包进 `lib/apps/web.js`。生产环境只需部署 core 的 `lib/`，由 Karin 的 express 直接托管页面。

## 请求链路

```
浏览器 ──HTTP──> Karin app(:7777) ──GET /botweb────────> res.send(render('/botweb'))  (单文件 HTML)
                                 ──/botweb/api/*───────> core/src/api 路由            (REST)
浏览器 ──WS upgrade──> Karin 内置 wss ──> karin.on('ws:connection:/botweb/ws')         (服务端只推不收)
Bot 事件 ──> hooks.message / karin.accept('notice.*') ──> 广播给所有 WS 客户端 ──> 前端按 selfId 分 bot 入库
```

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
│   │   │   ├── bot.ts             # GET bots / friends / groups / members，POST poke / kick
│   │   │   └── message.ts         # POST send / recall
│   │   └── service/               # 业务层
│   │       ├── bot.ts             # BotService：list/friends/groups/members/poke/kick
│   │       ├── message.ts         # MessageService：send/recall
│   │       ├── dto.ts             # ★ karin 类型 <-> 前端 DTO 映射（toChatMessage/toSendElements 等）
│   │       ├── response.ts        # ok() / fail()（fail 返回 ApiResult<any>）
│   │       └── types.ts           # 请求体类型
│   ├── tsdown.config.ts           # entry: src/*.ts + src/apps/*.ts → lib/，neverBundle node-karin
│   └── development.env            # dev 环境变量（HTTP_PORT=7777，HTTP_AUTH_KEY=abc123）
└── template/                      # 前端
    ├── index.html                 # vite 入口（dev 用）
    ├── src/
    │   ├── index.ts               # ★ 包入口：导出 render(basePath)，供 core 引用
    │   ├── generated/html.ts      # 构建生成：内联 HTML 字符串（勿手改）
    │   ├── core/types.ts          # ★ 前后端共享 DTO 契约（与 core/src/service/dto.ts 保持一致）
    │   └── client/                # React 应用
    │       ├── api.ts             # REST 封装 + WsClient（自动重连，onMessage/onRecall/onPoke）
    │       ├── ChatContext.tsx    # ★ 全部状态：bots/会话/消息 Map/未读/缓存/右键菜单/回复
    │       ├── utils.ts           # toMillis/resolveMediaSrc/downloadFile/copyImageToClipboard 等
    │       └── components/        # Sidebar/ChatWindow/MessageList/MessageItem/InputArea/
    │                              # ContextMenu/Overlays/ChatDetailsSidebar
    ├── scripts/inline.mjs         # vite 产物 → 单文件 HTML → src/generated/html.ts
    └── tsdown.config.ts           # 打包 src/index.ts → dist/index.js（供 core 引用）
```

## 常用命令（仓库根目录）

```bash
pnpm -r build          # 全量构建（pnpm 拓扑序：先 template 后 core）
pnpm dev               # 启动 Karin 开发服务器（:7777，tsx 运行 packages/core/src）
pnpm dev:web           # 启动 vite 开发服务器（:5173，/botweb 代理到 7777，含 WS）
pnpm exec tsc --noEmit -p packages/core      # core 类型检查（template 需先 build 出 dist）
```

开发流程：先 `pnpm -F sandbox-template build` 一次（core 的类型/运行都依赖 template 的 `dist/`），然后终端 1 跑 `pnpm dev`、终端 2 跑 `pnpm dev:web`，浏览器开 vite 的 :5173。

生产：访问 `http://127.0.0.1:7777/botweb`。

## REST API（前缀 `/botweb/api`，响应均为 `ApiResult<T>`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/bots` | Bot 列表 `BotInfo[]` |
| GET | `/bots/:selfId/friends` | 好友列表 `FriendItem[]`（含头像，失败降级空串） |
| GET | `/bots/:selfId/groups` | 群列表 `GroupItem[]` |
| GET | `/bots/:selfId/groups/:groupId/members` | 群成员 `GroupMemberItem[]` |
| POST | `/bots/:selfId/groups/:groupId/poke` | 戳一戳 `{ targetId }` |
| POST | `/bots/:selfId/groups/:groupId/kick` | 踢出成员 `{ targetId }` |
| POST | `/message/send` | 发消息 `{ selfId, scene, peer, elements }` |
| POST | `/message/recall` | 撤回 `{ selfId, scene, peer, messageId }` |

历史消息接口**刻意不实现**（各协议端 `getHistoryMsg` 差异大，注释见 `service/message.ts` 末尾）；消息持久化由前端 localStorage 缓存承担。

## WS 推送协议（`/botweb/ws`，服务端只推不收）

- `{ type: 'message', data: ChatMessage }` — 全量广播所有 bot 的消息，前端按 `selfId` 分 bot 入库
- `{ type: 'recall', data: { selfId, messageId, scene, peer, operatorId, targetId } }`
- `{ type: 'poke', data: { selfId, scene, peer, operatorId, targetId, action, suffix } }`

`ChatMessage` / `MessageElement` / `WsPush` 等契约定义在 `packages/template/src/core/types.ts`，core 侧镜像在 `packages/core/src/service/dto.ts`，**改动契约时两边必须同步**。`system: true` 的消息按系统小灰条渲染（戳一戳/撤回提示）。

## 关键约束（踩过的坑，改动时务必遵守）

- **`hooks.message` 回调必须调用 `next()`**，否则该消息对所有下游插件被吞掉。
- **WS 必须复用 karin 内置 wss**：用 `karin.on('ws:connection:<path>', (socket, req, call) => { call(); ... })` 接管，**3 秒内不调 `call()` karin 自动断连**；禁止自建 `new WebSocketServer({ server })`（会冲突）。
- `karin.accept` 挂在 karin 对象上（不是根导出）；撤回事件 key 是 `notice.privateRecall` / `notice.groupRecall`，戳一戳是 `notice.privatePoke` / `notice.groupPoke`。
- `/botweb` 路由**没有鉴权**（karin 的 authMiddleware 只覆盖 `/api/v1`），仅限内网/本地使用。
- express v5 通配符写法是 `/botweb/*splat`；API 路由必须注册在 SPA 兜底之前。
- `express.json({ limit: '50mb' })` 不能删——图片/文件以 base64 随 JSON 发送，默认 100kb 会被拒且 express 返回 HTML 错误页。
- 时间戳单位混乱：karin 事件是**秒**，但部分接口返回**毫秒**——前端一律经 `toMillis()` 归一（>1e12 视为毫秒）。
- QQ 图床按 referer 防盗链：所有 `<img>` 必须带 `referrerPolicy="no-referrer"`；karin 的 `base64://` 前缀需转成 data URL（`resolveMediaSrc`）。
- 前端 localStorage 缓存按 `botweb:msgs:{selfId}` 分 bot，每会话上限 100 条；`data:` 开头的媒体写缓存前降级为占位文本（防撑爆 5MB 配额）。
- tsdown 的 core 构建要求 template 已构建（`dist/index.js` + `index.d.ts` 存在），否则类型检查和打包都会失败。
- ESLint 目前跑不起来（`eslint.config.js` 依赖未安装的 `globals` 包），为既有问题。

## 代码风格

- TypeScript，ESM；2 空格缩进、**无分号**（neostandard 风格）
- core 路径别名 `@/*` → `packages/core/src/*`；template `@/*` → `packages/template/src/*`
- 注释用中文；新代码跟随周边文件风格
- 不加新依赖（确有需要在会话中提出）

## 已知限制 / 未做事项

- 无鉴权、无历史消息拉取（见上）
- 撤回/戳一戳的昵称解析基于当前 bot 的好友/群成员数据，非当前 bot 会话里的操作者可能显示为 ID
- 右键菜单未做视口边缘翻转
- `packages/core/package.json` 的 `karin.web`/`ts-web`（Karin WebUI 配置面板 schema）与本面板无关，未实现
- 发送文件前端限制 ~20MB（base64 内联）
