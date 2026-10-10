import { Module } from '@nestjs/common'
import { DatabaseModule } from '#app/database/database.module.js'
import { SecurityModule } from '#app/security/security.module.js'
import { FileController } from '#app/modules/file/file.controller.js'
import { FileService } from '#app/modules/file/file.service.js'
import { FileStorageService } from '#app/modules/file/file-storage.service.js'
import { FileAdminController } from '#app/modules/file/file-admin.controller.js'
import { FileAdminService } from '#app/modules/file/file-admin.service.js'
import { ClamAvFileScanner } from '#app/modules/file/clamav-file-scanner.js'
import { FILE_SCANNER } from '#app/modules/file/file-scanner.js'
import { FileScanService } from '#app/modules/file/file-scan.service.js'
import { PermissionModule } from '#app/modules/permission/permission.module.js'
import { FileWorkerService } from '#app/modules/file/file-worker.service.js'

@Module({
  imports: [DatabaseModule, SecurityModule, PermissionModule],
  controllers: [FileController, FileAdminController],
  providers: [
    FileService,
    FileStorageService,
    FileAdminService,
    FileScanService,
    FileWorkerService,
    ClamAvFileScanner,
    { provide: FILE_SCANNER, useExisting: ClamAvFileScanner },
  ],
  exports: [FileService, FileScanService],
})
export class FileModule {}
