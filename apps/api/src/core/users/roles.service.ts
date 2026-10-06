import { Injectable, NotFoundException } from '@nestjs/common';
import { ALL_PERMISSIONS, SYSTEM_ROLES, type Role as RoleDto } from '@lean/shared';
import { BusinessException } from '../../common/errors';
import { RequestContext } from '../../common/request-context';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { SaveRoleDto } from './users.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService, private readonly ctx: RequestContext, private readonly audit: AuditService) {}

  async list(): Promise<RoleDto[]> {
    const roles = await this.prisma.db.role.findMany({
      include: { _count: { select: { userRoles: true } } },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return roles.map((r) => ({
      id: r.id, code: r.code, name: r.name, description: r.description, isSystem: r.isSystem,
      permissions: r.permissions, userCount: r._count.userRoles,
    }));
  }

  permissions() {
    return ALL_PERMISSIONS.map((code) => ({ code, group: code.split('.')[0] }));
  }

  async create(dto: SaveRoleDto) {
    if (await this.prisma.db.role.findFirst({ where: { code: dto.code } })) {
      throw new BusinessException('ROLE_CODE_TAKEN', 'Rol kodu kullanılıyor');
    }
    const role = await this.prisma.db.role.create({ data: { ...dto, tenantId: this.ctx.tenantId, isSystem: false } });
    await this.audit.log('role', role.id, 'created', dto);
    return role;
  }

  async update(id: string, dto: SaveRoleDto) {
    const role = await this.prisma.db.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException();
    if (role.code === SYSTEM_ROLES.TENANT_ADMIN) {
      throw new BusinessException('SYSTEM_ROLE_LOCKED', 'Şirket yöneticisi rolü değiştirilemez');
    }
    // Sistem rollerinin kodu değişmez; izinleri şirket ihtiyacına göre uyarlanabilir
    const data = role.isSystem ? { name: dto.name, description: dto.description, permissions: dto.permissions } : dto;
    const updated = await this.prisma.db.role.update({ where: { id }, data });
    await this.audit.log('role', id, 'updated', AuditService.diff(role, data));
    return updated;
  }

  async remove(id: string) {
    const role = await this.prisma.db.role.findUnique({ where: { id }, include: { _count: { select: { userRoles: true } } } });
    if (!role) throw new NotFoundException();
    if (role.isSystem) throw new BusinessException('SYSTEM_ROLE_LOCKED', 'Sistem rolleri silinemez');
    if (role._count.userRoles) throw new BusinessException('ROLE_IN_USE', 'Kullanıcılara atanmış rol silinemez');
    await this.prisma.db.role.delete({ where: { id } });
    await this.audit.log('role', id, 'deleted', { code: role.code });
  }
}
