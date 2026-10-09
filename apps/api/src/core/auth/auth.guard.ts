import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ALLOW_PENDING_PASSWORD, IS_PUBLIC, PLATFORM_ADMIN, REQUIRED_PERMISSIONS } from '../../common/decorators';
import { RequestContext } from '../../common/request-context';
import type { RequestUser } from '../../common/request-user';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from './access.service';
import { sha256 } from './crypto';

export interface JwtPayload { sub: string; tid: string }

/** Bearer JWT veya x-api-key ile kimlik doğrular, izinleri kontrol eder, istek bağlamını doldurur. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly ctx: RequestContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const apiKey = req.headers['x-api-key'];
    const user = typeof apiKey === 'string' ? await this.fromApiKey(apiKey) : await this.fromBearer(req);

    req.user = user;
    this.ctx.setUser(user);

    if (user.mustChangePassword && !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD, targets)) {
      throw new ForbiddenException({ statusCode: 403, code: 'PASSWORD_CHANGE_REQUIRED', message: 'Password change required' });
    }
    if (this.reflector.getAllAndOverride<boolean>(PLATFORM_ADMIN, targets) && !user.isPlatformAdmin) {
      throw new ForbiddenException('Platform admin only');
    }
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, targets);
    if (required?.length && !required.some((p) => user.permissions.has(p))) {
      throw new ForbiddenException(`Missing permission: ${required.join(' | ')}`);
    }
    return true;
  }

  private async fromBearer(req: Request): Promise<RequestUser> {
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException();
    }
    const user = await this.prisma.raw.user.findFirst({
      where: { id: payload.sub, tenantId: payload.tid, isActive: true, tenant: { status: 'ACTIVE' } },
    });
    if (!user) throw new UnauthorizedException();
    const assignments = await this.access.loadAssignments(user.id, user.tenantId);
    return {
      id: user.id,
      tenantId: user.tenantId,
      username: user.username,
      fullName: user.fullName,
      employeeId: user.employeeId,
      isPlatformAdmin: user.isPlatformAdmin,
      isApiKey: false,
      mustChangePassword: user.mustChangePassword,
      permissions: new Set(assignments.flatMap((a) => a.permissions)),
      assignments,
    };
  }

  /** Anahtar formatı: lk_<prefix>_<secret> */
  private async fromApiKey(raw: string): Promise<RequestUser> {
    const [, prefix] = raw.split('_');
    if (!prefix) throw new UnauthorizedException();
    const key = await this.prisma.raw.apiKey.findUnique({ where: { prefix } });
    if (!key || key.revokedAt || (key.expiresAt && key.expiresAt < new Date()) || key.keyHash !== sha256(raw)) {
      throw new UnauthorizedException('Invalid API key');
    }
    const owner = await this.prisma.raw.user.findUnique({ where: { id: key.createdById } });
    await this.prisma.raw.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
    return {
      id: key.createdById,
      tenantId: key.tenantId,
      username: `apikey:${key.name}`,
      fullName: owner?.fullName ?? key.name,
      employeeId: null,
      isPlatformAdmin: false,
      isApiKey: true,
      mustChangePassword: false,
      permissions: new Set(key.permissions),
      assignments: [{ permissions: key.permissions, orgUnitId: null, orgUnitPath: null }],
    };
  }
}
