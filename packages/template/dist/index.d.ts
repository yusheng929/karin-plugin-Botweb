//#region src/index.d.ts
/**
 * BotWeb 前端页面入口（供后端 karin-plugin-BotWeb 引用）。
 * 返回所有资源（JS/CSS）已内联的单文件 HTML，由后端的 express 直接输出。
 *
 * @param basePath 后端挂载路径，客户端用它拼接 REST/WS 地址
 */
declare function render(basePath?: string): string;
//#endregion
export { render };