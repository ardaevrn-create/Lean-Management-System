import { Injectable } from '@nestjs/common';
import { SYSTEM_ROLE_PERMISSIONS, SYSTEM_ROLES, type SystemRoleCode } from '@lean/shared';
import { BusinessException } from '../../common/errors';
import { hashPassword } from '../auth/auth.service';
import { normalizeTenantCode, normalizeUsername } from '../auth/crypto';
import { PrismaService } from '../prisma/prisma.service';

export const SYSTEM_ROLE_NAMES: Record<SystemRoleCode, string> = {
  TENANT_ADMIN: 'Şirket Yöneticisi',
  EXECUTIVE: 'Üst Yönetim',
  MANAGER: 'Birim Yöneticisi',
  QUALITY_COORDINATOR: 'Kalite / Yalın Koordinatörü',
  KPI_OWNER: 'KPI Sorumlusu',
  AUDITOR: 'Denetçi',
  COMMITTEE_MEMBER: 'Komite Üyesi',
  EMPLOYEE: 'Çalışan',
};

export interface ProvisionTenantInput {
  code: string;
  name: string;
  adminUsername: string;
  adminPassword: string;
  adminFullName: string;
  adminEmail?: string;
  isPlatformAdmin?: boolean;
}

/** Yeni şirket açılışı: sistem rolleri, kök organizasyon birimi ve yönetici kullanıcı. */
@Injectable()
export class TenantProvisioningService {
  constructor(private readonly prisma: PrismaService) {}

  async provision(input: ProvisionTenantInput) {
    const code = normalizeTenantCode(input.code);
    if (!/^[A-Z0-9-]{2,20}$/.test(code)) throw new BusinessException('INVALID_TENANT_CODE', 'Şirket kodu 2-20 karakter, harf/rakam/tire olmalı');
    if (await this.prisma.raw.tenant.findUnique({ where: { code } })) {
      throw new BusinessException('TENANT_CODE_TAKEN', 'Bu şirket kodu kullanılıyor');
    }
    const passwordHash = await hashPassword(input.adminPassword);

    return this.prisma.raw.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { code, name: input.name } });
      const roles = await Promise.all(
        (Object.keys(SYSTEM_ROLES) as SystemRoleCode[]).map((roleCode) =>
          tx.role.create({
            data: {
              tenantId: tenant.id,
              code: roleCode,
              name: SYSTEM_ROLE_NAMES[roleCode],
              isSystem: true,
              permissions: SYSTEM_ROLE_PERMISSIONS[roleCode],
            },
          }),
        ),
      );
      const root = await tx.orgUnit.create({
        data: { tenantId: tenant.id, type: 'COMPANY', name: input.name, path: '/', level: 0 },
      });
      await tx.orgUnit.update({ where: { id: root.id }, data: { path: `/${root.id}/` } });
      const admin = await tx.user.create({
        data: {
          tenantId: tenant.id,
          username: normalizeUsername(input.adminUsername),
          email: input.adminEmail ?? null,
          fullName: input.adminFullName,
          passwordHash,
          isPlatformAdmin: input.isPlatformAdmin ?? false,
        },
      });
      const adminRoles = roles.filter((r) => r.code === SYSTEM_ROLES.TENANT_ADMIN || r.code === SYSTEM_ROLES.EMPLOYEE);
      await tx.userRole.createMany({
        data: adminRoles.map((r) => ({ tenantId: tenant.id, userId: admin.id, roleId: r.id })),
      });
      return { tenant, admin, rootOrgUnit: root, roles };
    });
  }
}
