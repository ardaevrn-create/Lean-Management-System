import { ForbiddenException, Injectable } from '@nestjs/common';
import { PERMISSIONS } from '@lean/shared';
import { RequestContext } from '../../common/request-context';
import type { RequestUser } from '../../common/request-user';
import { AccessService } from '../../core/auth/access.service';
import type { GoalRow } from './hoshin-core';

type GoalMap = Map<string, GoalRow>;
const LOCAL_LEVELS = ['DEPARTMENT', 'INDIVIDUAL'];

/** Hoshin erişim kuralları: görünürlük (sahip + hoshin.view kapsamı) ve düzenleme yetkileri. */
@Injectable()
export class HoshinAccessService {
  constructor(private readonly ctx: RequestContext, private readonly access: AccessService) {}

  /** hoshin.manage kapsamı tüm şirket mi? */
  isCompanyManager(user: RequestUser = this.ctx.user): boolean {
    return this.access.has(PERMISSIONS.HOSHIN_MANAGE, user) && this.access.scopePaths(PERMISSIONS.HOSHIN_MANAGE, user) === null;
  }

  /** hoshin.manage: şirket kapsamlıysa her hedef; kapsamlıysa yalnız kapsamındaki birim hedefleri. */
  canManage(g: Pick<GoalRow, 'level' | 'orgUnit'>, user: RequestUser = this.ctx.user): boolean {
    if (!this.access.has(PERMISSIONS.HOSHIN_MANAGE, user)) return false;
    if (this.access.scopePaths(PERMISSIONS.HOSHIN_MANAGE, user) === null) return true;
    return LOCAL_LEVELS.includes(g.level) && this.access.inScope(PERMISSIONS.HOSHIN_MANAGE, g.orgUnit?.path, user);
  }

  parentOf(g: GoalRow, byId: GoalMap): GoalRow | null {
    return g.parentId ? byId.get(g.parentId) ?? null : null;
  }

  isParentOwner(g: GoalRow, byId: GoalMap, user: RequestUser = this.ctx.user): boolean {
    const p = this.parentOf(g, byId);
    return !!p && p.ownerId === user.id;
  }

  /** Hedefi düzenleme: yönetici, ya da üst hedef sahibi (kapanmamış alt hedefler). */
  canEdit(g: GoalRow, byId: GoalMap, user: RequestUser = this.ctx.user): boolean {
    if (this.canManage(g, user)) return true;
    return this.isParentOwner(g, byId, user) && ['DRAFT', 'PROPOSED', 'IN_CATCHBALL'].includes(g.status);
  }

  /** Aylık planı değiştirme: yönetici veya üst hedef sahibi. */
  canEditPlan(g: GoalRow, byId: GoalMap, user: RequestUser = this.ctx.user): boolean {
    return this.canManage(g, user) || this.isParentOwner(g, byId, user);
  }

  /** Aylık gerçekleşme / açıklama: hedef sahibi + plan düzenleyenler. */
  canEditActuals(g: GoalRow, byId: GoalMap, user: RequestUser = this.ctx.user): boolean {
    return g.ownerId === user.id || this.canEditPlan(g, byId, user);
  }

  /** Alt hedef ekleme: yönetici (alt hedefin seviye/birimine göre) veya üst hedef sahibi. */
  canAddChild(parent: GoalRow, user: RequestUser = this.ctx.user): boolean {
    return parent.ownerId === user.id || this.access.has(PERMISSIONS.HOSHIN_MANAGE, user);
  }

  /** Görünür hedef id'leri; null = hepsi. */
  visibleIds(goals: GoalRow[], user: RequestUser = this.ctx.user): Set<string> | null {
    const hasView = this.access.has(PERMISSIONS.HOSHIN_VIEW, user);
    const scope = hasView ? this.access.scopePaths(PERMISSIONS.HOSHIN_VIEW, user) : [];
    if (hasView && scope === null) return null;
    const byId: GoalMap = new Map(goals.map((g) => [g.id, g]));
    const ids = new Set<string>();
    const addWithAncestors = (g: GoalRow) => {
      let cur: GoalRow | undefined = g;
      while (cur && !ids.has(cur.id)) {
        ids.add(cur.id);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
    };
    const owned = goals.filter((g) => g.ownerId === user.id);
    for (const g of owned) addWithAncestors(g);
    // Sahip olunan hedeflerin alt ağacı
    const children = new Map<string, GoalRow[]>();
    for (const g of goals) if (g.parentId) children.set(g.parentId, [...(children.get(g.parentId) ?? []), g]);
    const stack = [...owned];
    while (stack.length) {
      const g = stack.pop()!;
      for (const c of children.get(g.id) ?? []) {
        if (!ids.has(c.id)) {
          ids.add(c.id);
          stack.push(c);
        }
      }
    }
    if (hasView) {
      for (const g of goals) {
        if (!LOCAL_LEVELS.includes(g.level) || this.access.inScope(PERMISSIONS.HOSHIN_VIEW, g.orgUnit?.path, user)) addWithAncestors(g);
      }
    }
    return ids;
  }

  assertVisible(g: GoalRow, goals: GoalRow[]) {
    const ids = this.visibleIds(goals);
    if (ids && !ids.has(g.id)) throw new ForbiddenException();
  }
}
