import { Global, Module } from '@nestjs/common';
import { AuditController } from './audit/audit.controller';
import { AuditService } from './audit/audit.service';
import { DomainEvents } from './events/domain-events';
import { ExcelService } from './excel/excel.service';
import { AttachmentsController } from './files/attachments.controller';
import { StorageService } from './files/storage.service';
import { ImportRegistry } from './imports/import-registry';
import { ImportsController } from './imports/imports.controller';
import { ImportsService } from './imports/imports.service';
import { MailService } from './notifications/mail.service';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';

/** Tüm modüllerin kullandığı çapraz servisler. */
@Global()
@Module({
  controllers: [AuditController, NotificationsController, AttachmentsController, ImportsController],
  providers: [AuditService, DomainEvents, ExcelService, StorageService, ImportRegistry, ImportsService, MailService, NotificationsService],
  exports: [AuditService, DomainEvents, ExcelService, StorageService, ImportRegistry, ImportsService, NotificationsService],
})
export class SharedServicesModule {}
