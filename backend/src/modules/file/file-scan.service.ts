import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '#app/database/prisma.service.js'

@Injectable()
export class FileScanService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(fileId: string, tenantId: string, db: PrismaService | Prisma.TransactionClient = this.prisma) {
    const file = await db.fileObject.findFirst({ where: { id: fileId, tenantId }, select: { id: true, status: true } })
    if (!file) throw new NotFoundException('文件不存在')
    if (file.status === 'DELETED') throw new ConflictException('已删除文件不能扫描')
    await db.fileObject.update({ where: { id: fileId }, data: { status: 'QUARANTINED', scanStatus: 'PENDING', scanDetail: null } })
    const existing = await db.fileScanJob.findFirst({
      where: { fileId, tenantId, status: { in: ['PENDING', 'RUNNING'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    if (existing) return existing.id
    return (await db.fileScanJob.create({ data: { fileId, tenantId } })).id
  }
}
