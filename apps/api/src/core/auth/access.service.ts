import { ForbiddenException, Injectable } from '@nestjs/common';
import type { PermissionCode } from '@lean/shared';
import { RequestContext } from '../../common/request-context';
import type { RequestUser, RoleAssignment } from '../../common/request-user';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Rol + kapsam tabanlı erişim kontrolü.
 * Bir izin, kapsamsız (tüm şirket) veya belirli birim alt ağaçları için verilmiş olabilir.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService, private readonly ctx: RequestContext) {}

  /** Kullanıcının rol atamalarını yükler (guard tarafından çağrılır). */
  async loadAssignments(userId: string, tenantId: string): Promise<RoleAssignment[]> {
    const roles = await this.prisma.raw.userRole.findMany({
      where: { userId, tenantId },
      include: { role: { select: { permissions: true } }, orgUnit: { select: { path: true } } },
    });
    return roles.map((r) => ({
      permissions: r.role.permissions,
      orgUnitId: r.orgUnitId,
      orgUnitPath: r.orgUnit?.path ?? null,
    }));
  }

  has(permission: PermissionCode, user: RequestUser = this.ctx.user): boolean {
    return user.permissions.has(permission);
  }

  assert(permission: PermissionCode, user: RequestUser = this.ctx.user) {
    if (!this.has(permission, user)) throw new ForbiddenException(`Missing permission: ${permission}`);
  }

  /**
   * İznin geçerli olduğu birim path'leri. null = tüm şirket, [] = hiç yetki yok.
   */
  scopePaths(permission: PermissionCode, user: RequestUser = this.ctx.user): string[] | null {
    const relevant = user.assignments.filter((a) => a.permissions.includes(permission));
    if (relevant.some((a) => a.orgUnitPath === null)) return null;
    return relevant.map((a) => a.orgUnitPath as string);
  }

  /** Bir birimin (path'i verilen) iznin kapsamında olup olmadığı. */
  inScope(permission: PermissionCode, orgUnitPath: string | null | undefined, user: RequestUser = this.ctx.user) {
    const paths = this.scopePaths(permission, user);
    if (paths === null) return true;
    if (!orgUnitPath) return false;
    return paths.some((p) => orgUnitPath.startsWith(p));
  }

  /**
   * Prisma filtresi: orgUnit ilişkisi olan kayıtlar için kapsam koşulu.
   * Döndürülen değer `where.orgUnit` içine konur; null => filtre yok.
   */
  orgUnitFilter(permission: PermissionCode, user: RequestUser = this.ctx.user) {
    const paths = this.scopePaths(permission, user);
    if (paths === null) return null;
    return { OR: paths.map((p) => ({ path: { startsWith: p } })) };
  }

  /** Kapsamdaki birim id'leri (null = hepsi). */
  async scopedOrgUnitIds(permission: PermissionCode, user: RequestUser = this.ctx.user): Promise<string[] | null> {
    const filter = this.orgUnitFilter(permission, user);
    if (filter === null) return null;
    if (filter.OR.length === 0) return [];
    const units = await this.prisma.db.orgUnit.findMany({ where: filter, select: { id: true } });
    return units.map((u) => u.id);
  }
}
