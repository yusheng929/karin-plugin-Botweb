/**
 * QQ 小黄脸（QFace）本地化下载脚本：
 * 把 koishijs/QFace 的表情图（gif 动图 + static 静态图）下载到
 * packages/core/resources/faces/{gif,static}/，并生成 manifest.json（可用表情 id 清单）。
 *
 * 用法：node scripts/download-faces.mjs
 * （生产环境由 core 的 /botweb/faces/* 路由托管，见 apps/web.ts）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = 'https://cdn.jsdelivr.net/gh/koishijs/QFace@master/public'
/** 探测的表情 id 范围（QFace 的 id 不连续，404 跳过；清单接口 data.jsdelivr.com 部分网络不可达，直接探测 CDN） */
const MAX_ID = 399
const OUT_DIR = path.join(fileURLToPath(new URL('../', import.meta.url)), 'resources', 'faces')
const CONCURRENCY = 12

/** 带重试的下载（失败重试 2 次） */
const download = async (url, dest) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) return false
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
      return true
    } catch {
      if (attempt === 2) return false
    }
  }
  return false
}

/** 简单并发池 */
const runPool = async (tasks, worker) => {
  let index = 0
  let done = 0
  const run = async () => {
    while (index < tasks.length) {
      const task = tasks[index++]
      await worker(task)
      done++
      if (done % 50 === 0) console.log(`进度 ${done}/${tasks.length}`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, run))
}

const main = async () => {
  for (const dir of ['gif', 'static']) {
    fs.mkdirSync(path.join(OUT_DIR, dir), { recursive: true })
  }

  /** 探测范围内的全部候选（已存在的跳过） */
  const candidates = []
  for (let id = 0; id <= MAX_ID; id++) {
    candidates.push({ id, url: `${REPO}/gif/s${id}.gif`, file: path.join(OUT_DIR, 'gif', `s${id}.gif`) })
    candidates.push({ id, url: `${REPO}/static/s${id}.png`, file: path.join(OUT_DIR, 'static', `s${id}.png`) })
  }
  const tasks = candidates.filter(x => !fs.existsSync(x.file))
  console.log(`探测 id 0..${MAX_ID}，需请求 ${tasks.length} 个（已存在 ${candidates.length - tasks.length} 个，跳过）`)

  let failed = 0
  await runPool(tasks, async (task) => {
    if (!await download(task.url, task.file)) {
      failed++
    }
  })

  const listIds = (dir, ext) => fs.readdirSync(path.join(OUT_DIR, dir))
    .map(n => Number(n.match(/^s(\d+)\./)?.[1]))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)

  const manifest = { gif: listIds('gif', '.gif'), static: listIds('static', '.png') }
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest))
  console.log(`完成：gif ${manifest.gif.length} 个，static ${manifest.static.length} 个，无效/失败 ${failed} 个`)
  console.log(`输出目录: ${OUT_DIR}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
