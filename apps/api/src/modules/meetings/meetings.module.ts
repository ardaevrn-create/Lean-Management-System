import { Module } from '@nestjs/common';
import { MeetingAccessService } from './meeting-access.service';
import { MeetingTypesService } from './meeting-types.service';
import { MeetingsController, MeetingTypesController } from './meetings.controller';
import { MeetingsReminderJob } from './meetings-reminder.job';
import { MeetingsService } from './meetings.service';
import { MeetingsStatsService } from './meetings-stats.service';

/** M4 — Toplantı yönetimi. Aksiyonlar çekirdek ActionsService üzerinden (kaynak: MEETING) açılır. */
@Module({
  // Sıra önemli: "meetings/types" yolları ":id" yollarından önce eşleşmeli
  controllers: [MeetingTypesController, MeetingsController],
  providers: [MeetingAccessService, MeetingTypesService, MeetingsService, MeetingsStatsService, MeetingsReminderJob],
  exports: [MeetingsService, MeetingsReminderJob],
})
export class MeetingsModule {}
