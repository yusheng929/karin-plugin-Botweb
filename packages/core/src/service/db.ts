/**
 * 插件私有 sqlite 存储（@karinjs/sqlite3：karin 同款 napi 预编译 sqlite3，支持 node>=18）。
 * db 文件位于 karin 运行时插件目录 @karinjs/karin-plugin-botweb/data/botweb.db（不在仓库/插件包内）。
 * 两张表：profiles（好友/群/头像资料缓存）、members（群成员缓存）。
 * 注意：聊天消息不落库——历史消息一律走协议端 getHistoryMsg 拉取（见 service/bot.ts 的 history）。
 */
import path from 'node:path'
import fs from 'node:fs'
import sqlite3 from '@karinjs/sqlite3'
import { logger } from 'node-karin'
import { dir } from '@/dir'

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
      await db.run(`CREATE TABLE IF NOT EXISTS members (
        self_id    TEXT NOT NULL,
        group_id   TEXT NOT NULL,
        user_id    TEXT NOT NULL,
        nick       TEXT NOT NULL DEFAULT '',
        card       TEXT NOT NULL DEFAULT '',
        role       TEXT NOT NULL DEFAULT 'member',
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (self_id, group_id, user_id)
      )`)
      // 老库迁移：members 补 title 列（群内专属头衔，空串=无）
      const memberCols = await db.all<{ name: string }>('PRAGMA table_info(members)')
      if (!memberCols.some(c => c.name === 'title')) {
        await db.run(`ALTER TABLE members ADD COLUMN title TEXT NOT NULL DEFAULT ''`)
      }
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

/** 群成员行（members 表） */
export interface MemberRow {
  self_id: string
  group_id: string
  user_id: string
  nick: string
  card: string
  role: string
  /** 群内专属头衔（空串=无） */
  title: string
  updated_at: number
}

export const memberDb = {
  /** 按主键取单个成员（未命中返回 null） */
  async get (selfId: string, groupId: string, userId: string): Promise<MemberRow | null> {
    const db = await init()
    const row = await db.get<MemberRow>(
      'SELECT * FROM members WHERE self_id = ? AND group_id = ? AND user_id = ?',
      [selfId, groupId, userId]
    )
    return row ?? null
  },

  /** upsert 成员：空字符串字段不覆盖已有值（role 始终覆盖） */
  async upsert (row: Omit<MemberRow, 'updated_at'>): Promise<void> {
    const db = await init()
    await db.run(
      `INSERT INTO members (self_id, group_id, user_id, nick, card, role, title, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (self_id, group_id, user_id) DO UPDATE SET
         nick       = CASE WHEN excluded.nick != '' THEN excluded.nick ELSE members.nick END,
         card       = CASE WHEN excluded.card != '' THEN excluded.card ELSE members.card END,
         role       = excluded.role,
         title      = CASE WHEN excluded.title != '' THEN excluded.title ELSE members.title END,
         updated_at = excluded.updated_at`,
      [row.self_id, row.group_id, row.user_id, row.nick, row.card, row.role, row.title, Date.now()]
    )
  },

  /** 按 bot + 群取全部成员 */
  async list (selfId: string, groupId: string): Promise<MemberRow[]> {
    const db = await init()
    return db.all<MemberRow>('SELECT * FROM members WHERE self_id = ? AND group_id = ?', [selfId, groupId])
  }
}
