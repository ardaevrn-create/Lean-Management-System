import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SYSTEM_ROLES, type CreatedCredential, type Paginated, type UserListItem, type UserRef } from '@lean/shared';
import { BusinessException } from '../../common/errors';
import { pageArgs, paginated, parseSort } from '../../common/pagination';
import { RequestContext } from '../../common/request-context';
import { assertPasswordPolicy, hashPassword } from '../auth/auth.service';
import { normalizeUsername, temporaryPassword } from '../auth/crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateUserDto, RoleAssignmentDto, UpdateUserDto, UserQuery } from './users.dto';

const userInclude = {
  employee: { select: { orgUnit: { select: { name: true } } } },
  roles: { include: { role: { select: { name: true } }, orgUnit: { select: { name: true } } } },
} satisfies Prisma.UserInclude;

const toItem = (u: Prisma.UserGetPayload<{ include: typeof userInclude }>): UserListItem => ({
  id: u.id, username: u.username, fullName: u.fullName, email: u.email, isActive: u.isActive,
  mustChangePassword: u.mustChangePassword, lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  employeeId: u.employeeId, orgUnitName: u.employee?.orgUnit?.name ?? null,
  roles: u.roles.map((r) => ({ roleId: r.roleId, roleName: r.role.name, orgUnitId: r.orgUnitId, orgUnitName: r.orgUnit?.name ?? null })),
});

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly ctx: RequestContext, private readonly audit: AuditService) {}

  async list(query: UserQuery): Promise<Paginated<UserListItem>> {
    const where: Prisma.UserWhereInput = {};
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.q) {
      where.OR = [
        { fullName: { contains: query.q, mode: 'insensitive' } },
        { username: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const orderBy = parseSort(query.sort, ['fullName', 'username', 'lastLoginAt', 'createdAt'] as const, { fullName: 'asc' });
    const [rows, total] = await Promise.all([
      this.prisma.db.user.findMany({ where, include: userInclude, orderBy, ...pageArgs(query) }),
      this.prisma.db.user.count({ where }),
    ]);
    return paginated(rows.map(toItem), total, query);
  }

  /** Kişi seçici için hafif arama (tüm kullanıcılar erişebilir). */
  async lookup(q?: string): Promise<(UserRef & { orgUnitName: string | null })[]> {
    const rows = await this.prisma.db.user.findMany({
      where: {
        isActive: true,
        ...(q ? { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { username: { contains: q, mode: 'insensitive' } }] } : {}),
      },
      select: { id: true, fullName: true, username: true, employee: { select: { orgUnit: { select: { name: true } } } } },
      orderBy: { fullName: 'asc' },
      take: 20,
    });
    return rows.map((u) => ({ id: u.id, fullName: u.fullName, username: u.username, orgUnitName: u.employee?.orgUnit?.name ?? null }));
  }

  async get(id: string): Promise<UserListItem> {
    const u = await this.prisma.db.user.findUnique({ where: { id }, include: userInclude });
    if (!u) throw new NotFoundException('User not found');
    return toItem(u);
  }

  async create(dto: CreateUserDto): Promise<CreatedCredential> {
    const username = normalizeUsername(dto.username);
    await this.assertUsernameFree(username);
    if (dto.employeeId) await this.assertEmployeeFree(dto.employeeId);
    const password = dto.password ?? temporaryPassword();
    if (dto.password) assertPasswordPolicy(dto.password);
    const roleIds = dto.roleIds?.length ? dto.roleIds : [await this.employeeRoleId()];
    const tenantId = this.ctx.tenantId;
    const user = await this.prisma.db.user.create({
      data: {
        tenantId, username, fullName: dto.fullName, email: dto.email ?? null, employeeId: dto.employeeId ?? null,
        passwordHash: await hashPassword(password), mustChangePassword: true,
        roles: { create: roleIds.map((roleId) => ({ tenantId, roleId })) },
      },
    });
    await this.audit.log('user', user.id, 'created', { username, roleIds });
    return { userId: user.id, employeeId: user.employeeId, username, temporaryPassword: password };
  }

  /**
   * Personel kayıtlarından toplu hesap açar. Kullanıcı adı = sicil no.
   * Hesabı zaten olan personel atlanır.
   */
  async createForEmployees(employeeIds: string[]): Promise<CreatedCredential[]> {
    const employees = await this.prisma.db.employee.findMany({
      where: { id: { in: employeeIds }, user: { is: null }, isActive: true },
    });
    const taken = new Set(
      (await this.prisma.db.user.findMany({
        where: { username: { in: employees.map((e) => normalizeUsername(e.employeeNo)) } },
        select: { username: true },
      })).map((u) => u.username),
    );
    const roleId = await this.employeeRoleId();
    const tenantId = this.ctx.tenantId;
    const result: CreatedCredential[] = [];
    for (const e of employees) {
      const username = normalizeUsername(e.employeeNo);
      if (taken.has(username)) continue;
      const password = temporaryPassword();
      const user = await this.prisma.db.user.create({
        data: {
          tenantId, username, fullName: `${e.firstName} ${e.lastName}`, email: e.email, employeeId: e.id,
          passwordHash: await hashPassword(password), mustChangePassword: true,
          roles: { create: [{ tenantId, roleId }] },
        },
      });
      result.push({ userId: user.id, employeeId: e.id, username, temporaryPassword: password });
    }
    if (result.length) await this.audit.log('user', 'bulk', 'createdFromEmployees', { count: result.length });
    return result;
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserListItem> {
    const before = await this.prisma.db.user.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('User not found');
    if (id === this.ctx.userId && dto.isActive === false) {
      throw new BusinessException('SELF_DEACTIVATE', 'Kendi hesabınızı pasife alamazsınız');
    }
    await this.prisma.db.user.update({ where: { id }, data: dto });
    if (dto.isActive === false) {
      await this.prisma.raw.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await this.audit.log('user', id, 'updated', AuditService.diff(before, dto));
    return this.get(id);
  }

  async resetPassword(id: string): Promise<CreatedCredential> {
    const user = await this.prisma.db.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    const password = temporaryPassword();
    await this.prisma.db.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(password), mustChangePassword: true },
    });
    await this.prisma.raw.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log('user', id, 'passwordReset');
    return { userId: id, employeeId: user.employeeId, username: user.username, temporaryPassword: password };
  }

  async setRoles(id: string, assignments: RoleAssignmentDto[]): Promise<UserListItem> {
    await this.get(id);
    const roles = await this.prisma.db.role.findMany({ where: { id: { in: assignments.map((a) => a.roleId) } } });
    if (roles.length !== new Set(assignments.map((a) => a.roleId)).size) throw new BusinessException('INVALID_ROLE', 'Geçersiz rol');
    if (id === this.ctx.userId) {
      const adminRole = await this.prisma.db.role.findFirst({ where: { code: SYSTEM_ROLES.TENANT_ADMIN } });
      if (adminRole && this.ctx.user.permissions.has('user.manage') && !assignments.some((a) => a.roleId === adminRole.id && !a.orgUnitId)) {
        const hadAdmin = await this.prisma.db.userRole.findFirst({ where: { userId: id, roleId: adminRole.id } });
        if (hadAdmin) throw new BusinessException('SELF_ADMIN_REMOVE', 'Kendi yönetici rolünüzü kaldıramazsınız');
      }
    }
    const tenantId = this.ctx.tenantId;
    await this.prisma.db.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({
        data: assignments.map((a) => ({ tenantId, userId: id, roleId: a.roleId, orgUnitId: a.orgUnitId ?? null })),
      });
    });
    await this.audit.log('user', id, 'rolesChanged', assignments);
    return this.get(id);
  }

  private async employeeRoleId() {
    const role = await this.prisma.db.role.findFirst({ where: { code: SYSTEM_ROLES.EMPLOYEE } });
    if (!role) throw new Error('EMPLOYEE role missing');
    return role.id;
  }

  private async assertUsernameFree(username: string) {
    if (await this.prisma.db.user.findFirst({ where: { username } })) {
      throw new BusinessException('USERNAME_TAKEN', `Kullanıcı adı kullanılıyor: ${username}`);
    }
  }

  private async assertEmployeeFree(employeeId: string) {
    if (await this.prisma.db.user.findFirst({ where: { employeeId } })) {
      throw new BusinessException('EMPLOYEE_HAS_USER', 'Bu personelin zaten kullanıcı hesabı var');
    }
  }
}
