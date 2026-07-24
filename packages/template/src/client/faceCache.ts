import { useEffect, useState } from 'react'
import { BASE } from './api'

/**
 * QFace 资源前端持久缓存：
 * - IndexedDB 存 blob，命中后返回 object URL，全程不再请求后端
 * - 内存 Map 缓存 object URL，避免重复 createObjectURL
 * - 回源并发受限，防止首次打开面板时几百个请求把后端打满
 */

const DB_NAME = 'botweb-faces'
const STORE = 'faces'
const DB_VERSION = 1
/** 回源最大并发 */
const MAX_CONCURRENT = 6

let dbPromise: Promise<IDBDatabase> | null = null

const openDb = (): Promise<IDBDatabase> => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

const idbGet = async (key: string): Promise<Blob | null> => {
  try {
    const db = await openDb()
    return await new Promise((resolve) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      req.onsuccess = () => resolve((req.result as Blob) || null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

const idbPut = async (key: string, blob: Blob): Promise<void> => {
  try {
    const db = await openDb()
    db.transaction(STORE, 'readwrite').objectStore(STORE).put(blob, key)
  } catch { /* ignore */ }
}

// ---------- 并发闸 ----------
let active = 0
const waiters: Array<() => void> = []

const acquire = (): Promise<void> => new Promise((resolve) => {
  if (active < MAX_CONCURRENT) {
    active++
    resolve()
  } else {
    waiters.push(resolve)
  }
})

const release = () => {
  active--
  waiters.shift()?.()
}

// ---------- object URL 缓存 ----------
const objectUrls = new Map<string, string>()
const inflight = new Map<string, Promise<string>>()

const makeObjectUrl = (key: string, blob: Blob): string => {
  const existing = objectUrls.get(key)
  if (existing) return existing
  const url = URL.createObjectURL(blob)
  objectUrls.set(key, url)
  return url
}

/**
 * 取资源地址：内存 object URL → IndexedDB → 回源网络（写入 IndexedDB）。
 * 全部失败时回退原始 url（交给浏览器自身 HTTP 缓存兜底）。
 */
export const getCachedFaceSrc = (url: string): Promise<string> => {
  const hit = objectUrls.get(url)
  if (hit) return Promise.resolve(hit)
  let p = inflight.get(url)
  if (!p) {
    p = (async () => {
      const cached = await idbGet(url)
      if (cached) return makeObjectUrl(url, cached)
      await acquire()
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        void idbPut(url, blob)
        return makeObjectUrl(url, blob)
      } catch {
        return url
      } finally {
        release()
        inflight.delete(url)
      }
    })()
    inflight.set(url, p)
  }
  return p
}

/** React hook：`<img>` 使用，缓存未就绪时返回空串（调用方渲染占位） */
export const useCachedSrc = (url: string): string => {
  const [src, setSrc] = useState(() => objectUrls.get(url) || '')
  useEffect(() => {
    let alive = true
    const hit = objectUrls.get(url)
    if (hit) {
      setSrc(hit)
      return
    }
    getCachedFaceSrc(url).then((s) => {
      if (alive) setSrc(s)
    })
    return () => { alive = false }
  }, [url])
  return src
}

// ---------- 表情清单（内存缓存，面板反复打开不重复请求） ----------

export interface FaceManifest { gif: number[], static: number[] }

let manifestPromise: Promise<FaceManifest | null> | null = null

/** 拉取本地表情清单（内存缓存一次，失败返回 null 由调用方兜底） */
export const getFaceManifest = (): Promise<FaceManifest | null> => {
  if (!manifestPromise) {
    manifestPromise = fetch(`${BASE}/faces/manifest.json`)
      .then(res => (res.ok ? res.json() : null))
      .catch(() => null)
  }
  return manifestPromise
}

/** 后台预热一批表情进缓存（逐个经 getCachedFaceSrc，天然带去重与并发限制） */
export const warmFaceCache = (urls: string[]) => {
  for (const url of urls) void getCachedFaceSrc(url)
}
