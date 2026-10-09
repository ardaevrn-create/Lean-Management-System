import { Module } from '@nestjs/common';
import { KaizenService } from './kaizen.service';
import { SuggestionAccessService } from './suggestion-access.service';
import { SuggestionPointsService } from './suggestion-points.service';
import { SuggestionSettingsService } from './suggestion-settings.service';
import { SuggestionStatsService } from './suggestion-stats.service';
import { KaizenController, SuggestionsController } from './suggestions.controller';
import { SuggestionsReminderJob } from './suggestions-reminder.job';
import { SuggestionsService } from './suggestions.service';

/** M7 — Öneri sistemi & Kaizen. Aksiyonlar çekirdek ActionsService üzerinden (kaynak: SUGGESTION / KAIZEN) açılır. */
@Module({
  // Sıra önemli: "suggestions/kaizen" yolları ":id" yollarından önce eşleşmeli
  controllers: [KaizenController, SuggestionsController],
  providers: [
    SuggestionSettingsService, SuggestionAccessService, SuggestionPointsService, SuggestionsService, KaizenService, SuggestionStatsService,
    SuggestionsReminderJob,
  ],
  exports: [SuggestionsService, KaizenService, SuggestionSettingsService, SuggestionPointsService, SuggestionsReminderJob],
})
export class SuggestionsModule {}
