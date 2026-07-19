/**
 * 构建后处理：将 vite 产物（dist/index.html + assets）内联为单文件 HTML，
 * 并生成 src/generated/html.ts 供包入口 render() 使用。
 * 用法：vite build && node scripts/inline.mjs && tsdown
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(root, 'dist')
const htmlPath = join(distDir, 'index.html')

if (!existsSync(htmlPath)) {
  console.error('[inline] 未找到 dist/index.html，请先执行 vite build')
  process.exit(1)
}

let html = readFileSync(htmlPath, 'utf8')

// 内联 <script ... src="..."></script>
html = html.replace(/<script([^>]*?)\ssrc="([^"]+)"([^>]*)><\/script>/g, (match, before, src, after) => {
  const file = join(distDir, src)
  if (!existsSync(file)) {
    console.warn(`[inline] 跳过缺失的脚本: ${src}`)
    return ''
  }
  // 防止 JS 字符串中的 </script> 提前闭合标签
  const code = readFileSync(file, 'utf8').replaceAll('</script', '<\\/script')
  const attrs = `${before}${after}`.replace(/\s*crossorigin/g, '').trim()
  return `<script${attrs ? ' ' + attrs : ''}>${code}</script>`
})

// 内联 <link rel="stylesheet" href="...">
html = html.replace(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (match, href) => {
  const file = join(distDir, href)
  if (!existsSync(file)) {
    console.warn(`[inline] 跳过缺失的样式: ${href}`)
    return ''
  }
  return `<style>${readFileSync(file, 'utf8')}</style>`
})

// 移除其余指向本地资源的外部引用（如 favicon），避免 404
html = html.replace(/<link[^>]*href="\/[^"]*"[^>]*>/g, '')

// 注入后端挂载路径占位符，render(basePath) 时会替换它
html = html.replace(
  '<head>',
  '<head>\n<script>window.BOTWEB_BASE="__BOTWEB_BASE__"</script>'
)

const outDir = join(root, 'src', 'generated')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'html.ts'), `export const html = ${JSON.stringify(html)}\n`)
console.log(`[inline] 已生成 src/generated/html.ts（${(html.length / 1024).toFixed(1)} KiB）`)
