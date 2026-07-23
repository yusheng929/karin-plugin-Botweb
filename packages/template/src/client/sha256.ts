/**
 * 极简 SHA-256（公共域实现 geraintluff/sha256 的 TS 改写）。
 * 仅在 crypto.subtle 不可用（http 非 localhost 的局域网访问）时降级使用。
 */

/** 同步计算 UTF-8 字符串的 sha256，返回小写 hex */
export function sha256hexSync (input: string): string {
  // 转为字节串（每字符一个字节）
  let ascii = ''
  for (const b of new TextEncoder().encode(input)) ascii += String.fromCharCode(b)

  const rightRotate = (value: number, amount: number) => (value >>> amount) | (value << (32 - amount))
  const mathPow = Math.pow
  const maxWord = mathPow(2, 32)
  let result = ''

  const words: number[] = []
  const asciiBitLength = ascii.length * 8

  // 常量表：前 64 个素数的平方根/立方根小数部分（首次调用时生成并缓存）
  let hash: number[] = (sha256hexSync as any).h = (sha256hexSync as any).h || []
  const k: number[] = (sha256hexSync as any).k = (sha256hexSync as any).k || []
  let primeCounter = k.length
  const isComposite: Record<number, number> = {}
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0
    }
  }

  ascii += '\x80'
  while (ascii.length % 64 - 56) ascii += '\x00'
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i)
    words[i >> 2] |= j << ((3 - i) % 4) * 8
  }
  words[words.length] = (asciiBitLength / maxWord) | 0
  words[words.length] = asciiBitLength

  for (let j = 0; j < words.length;) {
    const w = words.slice(j, j += 16)
    const oldHash = hash
    hash = hash.slice(0, 8)

    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15]
      const w2 = w[i - 2]
      const a = hash[0]
      const e = hash[4]
      const temp1 = hash[7]
        + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
        + ((e & hash[5]) ^ (~e & hash[6]))
        + k[i]
        + (w[i] = i < 16 ? w[i] : (
          w[i - 16]
          + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
          + w[i - 7]
          + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
        ) | 0)
      const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
        + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]))
      hash = [(temp1 + temp2) | 0].concat(hash)
      hash[4] = (hash[4] + temp1) | 0
    }

    for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0
  }

  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255
      result += (b < 16 ? '0' : '') + b.toString(16)
    }
  }
  return result
}

/** 计算 sha256 hex：优先 crypto.subtle（安全上下文），不可用时降级纯 JS 实现 */
export async function sha256hex (input: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
  }
  return sha256hexSync(input)
}
