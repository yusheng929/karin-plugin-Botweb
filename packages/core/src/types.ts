export interface ApiResult<T = unknown> {
  /** 0表示成功-1表示失败 */
  code: number
  message: string
  data: T
}
