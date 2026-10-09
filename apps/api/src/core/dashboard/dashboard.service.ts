import { Injectable } from '@nestjs/common';
import type { MyDashboard } from '@lean/shared';
import { addDays, startOfUtcDay } from '../../common/dates';
import { RequestContext } from '../../common/request-context';
import type { RequestUser } from '../../common/request-user';
import { ActionsService } from '../actions/actions.service';
import { PrismaService } from '../prisma/prisma.service';

export type WidgetProvider = (user: RequestUser) => Promise<unknown | undefined>;

/** Kişisel pano. Modüller kendi kartlarını registerWidget ile ekler (ör. "kpi.missingEntries"). */
@Injectable()
export class DashboardService {
  private readonly widgets = new Map<string, WidgetProvider>();

  constructor(private readonly prisma: PrismaService, private readonly ctx: RequestContext, private readonly actions: ActionsService) {}

  registerWidget(key: string, provider: WidgetProvider) {
    this.widgets.set(key, provider);
  }

  async me(): Promise<MyDashboard> {
    const user = this.ctx.user;
    const today = startOfUtcDay();
    const mine = { OR: [{ ownerId: user.id }, { supporters: { some: { userId: user.id } } }], deletedAt: null, status: { in: ['OPEN' as const, 'IN_PROGRESS' as const] } };
    const [open, overdue, dueThisWeek, upcoming, unread] = await Promise.all([
      this.prisma.db.action.count({ where: mine }),
      this.prisma.db.action.count({ where: { ...mine, dueDate: { lt: today } } }),
      this.prisma.db.action.count({ where: { ...mine, dueDate: { gte: today, lte: addDays(today, 7) } } }),
      this.actions.list({ view: 'mine', status: ['OPEN', 'IN_PROGRESS'], page: 1, pageSize: 10, sort: 'dueDate:asc' }),
      this.prisma.db.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    const widgets: Record<string, unknown> = {};
    for (const [key, provider] of this.widgets) {
      const value = await provider(user);
      if (value !== undefined) widgets[key] = value;
    }
    return { actions: { open, overdue, dueThisWeek }, upcomingActions: upcoming.items, unreadNotifications: unread, widgets };
  }
}
