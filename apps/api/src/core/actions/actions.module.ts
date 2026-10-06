import { Global, Module } from '@nestjs/common';
import { ActionsController } from './actions.controller';
import { ActionsImporter } from './actions.importer';
import { ActionsReminderJob } from './actions-reminder.job';
import { ActionsService } from './actions.service';

@Global()
@Module({
  controllers: [ActionsController],
  providers: [ActionsService, ActionsReminderJob, ActionsImporter],
  exports: [ActionsService],
})
export class ActionsModule {}
