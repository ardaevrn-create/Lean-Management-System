import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Team as TeamDto } from '@lean/shared';
import { RequestContext } from '../../common/request-context';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { SaveTeamDto } from './org.dto';

const include = {
  members: { include: { employee: { select: { firstName: true, lastName: true } } } },
} satisfies Prisma.TeamInclude;

const toDto = (t: Prisma.TeamGetPayload<{ include: typeof include }>): TeamDto => ({
  id: t.id, name: t.name, type: t.type, description: t.description,
  members: t.members.map((m) => ({ employeeId: m.employeeId, fullName: `${m.employee.firstName} ${m.employee.lastName}`, role: m.role })),
});

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService, private readonly ctx: RequestContext, private readonly audit: AuditService) {}

  async list(): Promise<TeamDto[]> {
    return (await this.prisma.db.team.findMany({ include, orderBy: { name: 'asc' } })).map(toDto);
  }

  async create(dto: SaveTeamDto): Promise<TeamDto> {
    const tenantId = this.ctx.tenantId;
    const team = await this.prisma.db.team.create({
      data: {
        tenantId, name: dto.name, type: dto.type, description: dto.description ?? null,
        members: { create: dto.members.map((m) => ({ tenantId, employeeId: m.employeeId, role: m.role ?? null })) },
      },
      include,
    });
    await this.audit.log('team', team.id, 'created', dto);
    return toDto(team);
  }

  async update(id: string, dto: SaveTeamDto): Promise<TeamDto> {
    const tenantId = this.ctx.tenantId;
    if (!(await this.prisma.db.team.findUnique({ where: { id } }))) throw new NotFoundException();
    const team = await this.prisma.db.$transaction(async (tx) => {
      await tx.teamMember.deleteMany({ where: { teamId: id } });
      return tx.team.update({
        where: { id },
        data: {
          name: dto.name, type: dto.type, description: dto.description ?? null,
          members: { create: dto.members.map((m) => ({ tenantId, employeeId: m.employeeId, role: m.role ?? null })) },
        },
        include,
      });
    });
    await this.audit.log('team', id, 'updated', dto);
    return toDto(team);
  }

  async remove(id: string) {
    await this.prisma.db.team.delete({ where: { id } });
    await this.audit.log('team', id, 'deleted');
  }
}
