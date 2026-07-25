/**
 * 插件私有 sqlite 存储（@karinjs/sqlite3：karin 同款 napi 预编译 sqlite3，支持 node>=18）。
 * db 文件位于 karin 运行时插件目录 @karinjs/karin-plugin-botweb/data/botweb.db（不在仓库/插件包内）。
 * 两张表：profiles（好友/群/头像资料缓存）、messages（聊天消息持久化，前端启动时全量拉取）。
 */
import path from 'node:path'
import fs from 'node:fs'
import sqlite3 from '@karinjs/sqlite3'
import { logger } from 'node-karin'
import { dir } from '@/dir'
import type { ChatMessage, MessageElement } from './dto'

/** 资料行（profiles 表，kind 区分数据语义） */
export interface ProfileRow {
  /** 所属 bot */
  self_id: string
  /** friend=好友资料 / group=群资料 / avatar=仅头像（群发言者等非好友用户） */
  kind: 'friend' | 'group' | 'avatar'
  /** userId / groupId */
  target_id: string
  /** 昵称 / 群名 */
  name: string
  /** 好友备注（仅 friend 使用） */
  remark: string
  /** 头像 url */
  avatar: string
  /** 群成员数（仅 group 使用） */
  member_count: number | null
  /** 最后更新时间（毫秒时间戳） */
  updated_at: number
}

type SqliteDatabase = InstanceType<typeof sqlite3.Database>

interface Sqlite {
  run: (sql: string, params?: unknown[]) => Promise<void>
  get: <T>(sql: string, params?: unknown[]) => Promise<T | undefined>
  all: <T>(sql: string, params?: unknown[]) => Promise<T[]>
}

let initPromise: Promise<Sqlite> | null = null

/** 懒初始化（并发安全，失败后可重试）：建目录、开库、建表 */
const init = (): Promise<Sqlite> => {
  if (initPromise) return initPromise
  initPromise = (async () => {
    try {
      fs.mkdirSync(dir.dataDir, { recursive: true })
      const file = path.join(dir.dataDir, 'botweb.db')
      const raw = await new Promise<SqliteDatabase>((resolve, reject) => {
        const database = new sqlite3.Database(file, err => (err ? reject(err) : resolve(database)))
      })
      const db: Sqlite = {
        run: (sql, params = []) => new Promise<void>((resolve, reject) => {
          raw.run(sql, params, err => (err ? reject(err) : resolve()))
        }),
        get: <T>(sql: string, params: unknown[] = []) => new Promise<T | undefined>((resolve, reject) => {
          raw.get<T>(sql, params, (err, row) => (err ? reject(err) : resolve(row)))
        }),
        all: <T>(sql: string, params: unknown[] = []) => new Promise<T[]>((resolve, reject) => {
          raw.all<T>(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
        })
      }
      await db.run('PRAGMA journal_mode = WAL')
      await db.run(`CREATE TABLE IF NOT EXISTS profiles (
        self_id      TEXT NOT NULL,
        kind         TEXT NOT NULL CHECK (kind IN ('friend', 'group', 'avatar')),
        target_id    TEXT NOT NULL,
        name         TEXT NOT NULL DEFAULT '',
        remark       TEXT NOT NULL DEFAULT '',
        avatar       TEXT NOT NULL DEFAULT '',
        member_count INTEGER,
        updated_at   INTEGER NOT NULL,
        PRIMARY KEY (self_id, kind, target_id)
      )`)
      await db.run(`CREATE TABLE IF NOT EXISTS messages (
        self_id     TEXT NOT NULL,
        scene       TEXT NOT NULL CHECK (scene IN ('friend', 'group')),
        peer        TEXT NOT NULL,
        message_id  TEXT NOT NULL,
        seq         INTEGER NOT NULL DEFAULT 0,
        sender_id   TEXT NOT NULL,
        sender_name TEXT NOT NULL DEFAULT '',
        time        INTEGER NOT NULL,
        elements    TEXT NOT NULL,
        recalled    INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (self_id, scene, peer, message_id)
      )`)
      logger.info(`[BotWeb] 资料缓存 db 已就绪：${file}`)
      return db
    } catch (err) {
      // 允许下次调用重试
      initPromise = null
      logger.error(`[BotWeb] 初始化资料缓存 db 失败: ${err instanceof Error ? err.message : err}`)
      throw err
    }
  })()
  return initPromise
}

export const profileDb = {
  /** 按主键取单行（未命中返回 null） */
  async get (kind: ProfileRow['kind'], selfId: string, targetId: string): Promise<ProfileRow | null> {
    const db = await init()
    const row = await db.get<ProfileRow>(
      'SELECT * FROM profiles WHERE self_id = ? AND kind = ? AND target_id = ?',
      [selfId, kind, targetId]
    )
    return row ?? null
  },

  /**
   * upsert 单行：空字符串字段不覆盖已有值
   * （消息到达时的增量补全可能只拿到部分字段，避免把好数据写坏）
   */
  async upsert (row: Omit<ProfileRow, 'updated_at'>): Promise<void> {
    const db = await init()
    await db.run(
      `INSERT INTO profiles (self_id, kind, target_id, name, remark, avatar, member_count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (self_id, kind, target_id) DO UPDATE SET
         name         = CASE WHEN excluded.name != '' THEN excluded.name ELSE profiles.name END,
         remark       = CASE WHEN excluded.remark != '' THEN excluded.remark ELSE profiles.remark END,
         avatar       = CASE WHEN excluded.avatar != '' THEN excluded.avatar ELSE profiles.avatar END,
         member_count = COALESCE(excluded.member_count, profiles.member_count),
         updated_at   = excluded.updated_at`,
      [row.self_id, row.kind, row.target_id, row.name, row.remark, row.avatar, row.member_count, Date.now()]
    )
  },

  /** 按 bot + kind 取全部行 */
  async list (kind: ProfileRow['kind'], selfId: string): Promise<ProfileRow[]> {
    const db = await init()
    return db.all<ProfileRow>('SELECT * FROM profiles WHERE self_id = ? AND kind = ?', [selfId, kind])
  }
}

/** 消息行（messages 表） */
interface MessageRow {
  self_id: string
  scene: 'friend' | 'group'
  peer: string
  message_id: string
  seq: number
  sender_id: string
  sender_name: string
  /** 毫秒时间戳 */
  time: number
  /** MessageElement[] 的 JSON */
  elements: string
  recalled: number
}

const MEDIA_PLACEHOLDER: Record<string, string> = {
  image: '[图片]',
  file: '[文件]',
  video: '[视频]',
  record: '[语音]'
}

/**
 * 入库前瘦身：本地 base64 媒体（data: 开头）体积太大，替换为占位文本防止撑爆 db；
 * 网络 url 原样保留
 */
const sanitizeElements = (elements: MessageElement[]): MessageElement[] =>
  elements.map(el =>
    'file' in el && el.file.startsWith('data:') && MEDIA_PLACEHOLDER[el.type]
      ? { type: 'other' as const, text: MEDIA_PLACEHOLDER[el.type] }
      : el
  )

/** 时间戳归一为毫秒（karin 事件是秒级，部分接口返回毫秒：>1e12 视为毫秒） */
const toMillis = (time: number) => (time > 1e12 ? time : time * 1000)

export const messageDb = {
  /**
   * 写入一条消息（INSERT OR IGNORE 幂等：自己发的消息会被 send 接口与协议端回显各写一次，
   * 后到者直接忽略；recalled 标记以先入库的行为准，撤回走 markRecalled 更新）
   */
  async insert (msg: ChatMessage): Promise<void> {
    const db = await init()
    await db.run(
      `INSERT OR IGNORE INTO messages
        (self_id, scene, peer, message_id, seq, sender_id, sender_name, time, elements, recalled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        msg.selfId, msg.scene, msg.peer, msg.messageId, msg.seq,
        msg.senderId, msg.senderName, toMillis(msg.time),
        JSON.stringify(sanitizeElements(msg.elements))
      ]
    )
  },

  /** 标记消息已撤回（找不到行时静默忽略：可能是插件启用前的消息） */
  async markRecalled (selfId: string, scene: ChatMessage['scene'], peer: string, messageId: string): Promise<void> {
    const db = await init()
    await db.run(
      'UPDATE messages SET recalled = 1 WHERE self_id = ? AND scene = ? AND peer = ? AND message_id = ?',
      [selfId, scene, peer, messageId]
    )
  },

  /** 按 bot 取全部消息（时间升序），供前端启动时全量拉取 */
  async listByBot (selfId: string): Promise<ChatMessage[]> {
    const db = await init()
    const rows = await db.all<MessageRow>(
      'SELECT * FROM messages WHERE self_id = ? ORDER BY time ASC',
      [selfId]
    )
    return rows.map(row => ({
      messageId: row.message_id,
      seq: row.seq,
      selfId: row.self_id,
      scene: row.scene,
      peer: row.peer,
      senderId: row.sender_id,
      senderName: row.sender_name,
      // 库存毫秒；ChatMessage 契约为秒级，前端统一经 toMillis() 归一，两种单位都兼容
      time: row.time,
      elements: JSON.parse(row.elements) as MessageElement[],
      recalled: row.recalled === 1
    }))
  }
}
