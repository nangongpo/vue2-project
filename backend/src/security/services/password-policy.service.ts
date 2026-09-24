import { BadRequestException, Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import type { PasswordService } from './password.service.js'

export const PASSWORD_HISTORY_LIMIT = 5
export const PASSWORD_MIN_AGE_MS = 24 * 60 * 60 * 1000

// Preserve the exact input: no trimming, case folding, or Unicode normalization.
export function assertPasswordStrength(password: string) {
  if (typeof password !== 'string' || password.length > 256) throw new BadRequestException('密码长度必须为 12 至 128 个字符')
  const length = [...password].length
  if (length < 12 || length > 128) throw new BadRequestException('密码长度必须为 12 至 128 个字符')
  if (/[\p{Cc}\p{Cs}]/u.test(password)) throw new BadRequestException('密码不能包含控制字符或无效 Unicode 字符')
  const classes = [/\p{Ll}/u, /\p{Lu}/u, /\p{N}/u, /[^\p{L}\p{N}\s]/u].filter((pattern) => pattern.test(password)).length
  const words = password.trim().split(/\s+/u)
  const passphrase =
    length >= 20 &&
    words.length >= 4 &&
    words.every((word) => /\p{L}/u.test(word) && [...word].length >= 2) &&
    new Set(words.map((word) => word.toLowerCase())).size >= 4
  if (classes < 3 && !passphrase)
    throw new BadRequestException('密码需包含大小写字母、数字、符号中至少三类，或使用至少 20 个字符、四个不同词语的口令短语')
}

type PasswordState = { id: bigint; passwordHash: string; passwordChangedAt: Date | null }

@Injectable()
export class PasswordPolicyService {
  constructor(private readonly passwords: PasswordService) {}

  /** Caller must read the user and call this inside the SAME serializable transaction.
   * Keep session revocation and the actor-aware audit in that transaction as well.
   * Administrative resets bypass only the self-service minimum age, never history.
   */
  async replace(tx: Prisma.TransactionClient, user: PasswordState, password: string, selfService = true) {
    assertPasswordStrength(password)
    const now = new Date()
    if (selfService && user.passwordChangedAt && now.getTime() - user.passwordChangedAt.getTime() < PASSWORD_MIN_AGE_MS) {
      throw new BadRequestException('本人修改密码的间隔不能少于 24 小时')
    }
    const history = await tx.passwordHistory.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PASSWORD_HISTORY_LIMIT,
      select: { passwordHash: true },
    })
    // Compare plaintext against each independently salted, one-way hash.
    for (const hash of [user.passwordHash, ...history.map((entry) => entry.passwordHash)]) {
      if (await this.passwords.verify(password, hash)) throw new BadRequestException('不能重复使用当前或最近 5 次历史密码')
    }
    const passwordHash = await this.passwords.hash(password)
    await tx.passwordHistory.create({
      data: { userId: user.id, passwordHash: user.passwordHash, createdAt: now },
    })
    const retained = await tx.passwordHistory.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PASSWORD_HISTORY_LIMIT,
      select: { id: true },
    })
    await tx.passwordHistory.deleteMany({
      where: { userId: user.id, id: { notIn: retained.map((entry) => entry.id) } },
    })
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, passwordChangedAt: now } })
  }
}
