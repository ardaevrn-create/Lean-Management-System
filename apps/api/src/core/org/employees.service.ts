import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PERMISSIONS, type CreatedCredential, type Employee as EmployeeDto, type Paginated } from '@lean/shared';
import { BusinessException } from '../../common/errors';
import { pageArgs, paginated, parseSort } from '../../common/pagination';
import { RequestContext } from '../../common/request-context';
import { AccessService } from '../auth/access.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import type { CreateEmployeeDto, EmployeeQuery, UpdateEmployeeDto } from './org.dto';
import { OrgUnitsService } from './org-units.service';

const employeeInclude = {
  orgUnit: { select: { id: true, name: true, code: true, path: true } },
  manager: { select: { id: true, firstName: true, lastName: true } },
  user: { select: { id: true, username: true, isActive: true } },
} satisfies Prisma.EmployeeInclude;

type EmployeeRow = Prisma.EmployeeGetPayload<{ include: typeof employeeInclude }>;

export function toEmployeeDto(e: EmployeeRow): EmployeeDto {
  return {
    id: e.id, employeeNo: e.employeeNo, firstName: e.firstName, lastName: e.lastName,
    fullName: `${e.firstName} ${e.lastName}`, title: e.title, email: e.email, phone: e.phone,
    hireDate: e.hireDate?.toISOString().slice(0, 10) ?? null, isActive: e.isActive,
    orgUnit: e.orgUnit ? { id: e.orgUnit.id, name: e.orgUnit.name, code: e.orgUnit.code } : null,
    manager: e.manager ? { id: e.manager.id, fullName: `${e.manager.firstName} ${e.manager.lastName}` } : null,
    user: e.user,
  };
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly orgUnits: OrgUnitsService,
    private readonly users: UsersService,
  ) {}

  async list(query: EmployeeQuery): Promise<Paginated<EmployeeDto>> {
    const where: Prisma.EmployeeWhereInput = {};
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.withoutUser) where.user = { is: null };
    if (query.orgUnitId) {
      where.orgUnitId = query.includeSubUnits ? { in: await this.orgUnits.subtreeIds(query.orgUnitId) } : query.orgUnitId;
    }
    if (query.q) {
      const q = query.q.trim();
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { employeeNo: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
      ];
    }
    const orderBy = parseSort(query.sort, ['firstName', 'lastName', 'employeeNo', 'createdAt'] as const, { firstName: 'asc' });
    const [rows, total] = await Promise.all([
      this.prisma.db.employee.findMany({ where, include: employeeInclude, orderBy, ...pageArgs(query) }),
      this.prisma.db.employee.count({ where }),
    ]);
    return paginated(rows.map(toEmployeeDto), total, query);
  }

  async get(id: string): Promise<EmployeeDto> {
    const e = await this.prisma.db.employee.findUnique({ where: { id }, include: employeeInclude });
    if (!e) throw new NotFoundException('Employee not found');
    return toEmployeeDto(e);
  }

  async create(dto: CreateEmployeeDto): Promise<EmployeeDto & { credential?: CreatedCredential }> {
    await this.assertScope(dto.orgUnitId ?? null);
    await this.assertNoUnique(dto.employeeNo);
    const { createUser, hireDate, ...data } = dto;
    const created = await this.prisma.db.employee.create({
      data: { ...data, tenantId: this.ctx.tenantId, hireDate: hireDate ? new Date(hireDate) : null },
    });
    await this.audit.log('employee', created.id, 'created', dto);
    const credential = createUser ? (await this.users.createForEmployees([created.id]))[0] : undefined;
    return { ...(await this.get(created.id)), ...(credential ? { credential } : {}) };
  }

  async update(id: string, dto: UpdateEmployeeDto): Promise<EmployeeDto> {
    const before = await this.prisma.db.employee.findUnique({ where: { id }, include: { orgUnit: true } });
    if (!before) throw new NotFoundException('Employee not found');
    await this.assertScope(before.orgUnitId);
    if (dto.orgUnitId !== undefined) await this.assertScope(dto.orgUnitId);
    if (dto.employeeNo && dto.employeeNo !== before.employeeNo) await this.assertNoUnique(dto.employeeNo);
    if (dto.managerId === id) throw new BusinessException('SELF_MANAGER', 'Personel kendi yöneticisi olamaz');
    const { hireDate, ...data } = dto;
    await this.prisma.db.employee.update({
      where: { id },
      data: { ...data, ...(hireDate !== undefined ? { hireDate: hireDate ? new Date(hireDate) : null } : {}) },
    });
    // Ad değişirse bağlı kullanıcı adı da güncellenir
    if (dto.firstName || dto.lastName) {
      await this.prisma.db.user.updateMany({
        where: { employeeId: id },
        data: { fullName: `${dto.firstName ?? before.firstName} ${dto.lastName ?? before.lastName}` },
      });
    }
    if (dto.isActive === false) {
      await this.prisma.db.user.updateMany({ where: { employeeId: id }, data: { isActive: false } });
    }
    await this.audit.log('employee', id, 'updated', AuditService.diff(before, dto));
    return this.get(id);
  }

  async deactivate(id: string) {
    await this.update(id, { isActive: false });
  }

  private async assertScope(orgUnitId: string | null) {
    const path = orgUnitId ? (await this.orgUnits.get(orgUnitId)).path : null;
    if (!this.access.inScope(PERMISSIONS.EMPLOYEE_MANAGE, path)) {
      throw new BusinessException('OUT_OF_SCOPE', 'Bu birimdeki personel üzerinde yetkiniz yok');
    }
  }

  private async assertNoUnique(employeeNo: string) {
    if (await this.prisma.db.employee.findFirst({ where: { employeeNo } })) {
      throw new BusinessException('EMPLOYEE_NO_TAKEN', `Sicil no kullanılıyor: ${employeeNo}`);
    }
  }
}
