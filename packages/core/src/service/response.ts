import type { ApiResult } from '@/types'

/** 返回处理成功JSON */
export const ok = <T> (data: T) => ({
  code: 0,
  message: '',
  data
})

/** 返回处理失败JSON */
export const fail = (message: string, code = -1): ApiResult<any> => ({
  code,
  message,
  data: null
})
