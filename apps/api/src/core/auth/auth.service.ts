import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { AuthUser, LoginResponse, TokenPair } from '@lean/shared';
import { BusinessException } from '../../common/errors';
import { config } from '../../config';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from './access.service';
import { normalizeTenantCode, normalizeUsername, randomToken, sha256 } from './crypto';

export const hashPassword = (password: string) => bcrypt.hash(password, 10);

/** Şifre politikası: en az 8 karakter, harf ve rakam. */
export function assertPasswordPolicy(password: string) {
  if (password.length < 8 || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(password) || !/\d/.test(password)) {
    throw new BusinessException('WEAK_PASSWORD', 'Şifre en az 8 karakter olmalı, harf ve rakam içermelidir.');
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly access: AccessService,
  ) {}

  async login(tenantCode: string, username: string, password: string): Promise<LoginResponse> {
    const tenant = await this.prisma.raw.tenant.findUnique({ where: { code: normalizeTenantCode(tenantCode) } });
    const login = normalizeUsername(username);
    const user = tenant?.status === 'ACTIVE'
      ? await this.prisma.raw.user.findFirst({
          where: {
            tenantId: tenant.id,
            isActive: true,
            OR: [{ username: login }, { email: { equals: login, mode: 'insensitive' } }],
          },
        })
      : null;
    // Zamanlama saldırılarına karşı kullanıcı yoksa da hash karşılaştırması yap
    const ok = await bcrypt.compare(password, user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    if (!user || !ok) throw new UnauthorizedException({ statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Geçersiz şirket kodu, kullanıcı adı veya şifre' });

    await this.prisma.raw.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const tokens = await this.issueTokens(user.id, user.tenantId);
    return { ...tokens, user: await this.me(user.id) };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const stored = await this.prisma.raw.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: { include: { tenant: true } } },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date() || !stored.user.isActive || stored.user.tenant.status !== 'ACTIVE') {
      throw new UnauthorizedException();
    }
    await this.prisma.raw.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    return this.issueTokens(stored.userId, stored.user.tenantId);
  }

  async logout(refreshToken: string) {
    await this.prisma.raw.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.raw.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new BusinessException('INVALID_CURRENT_PASSWORD', 'Mevcut şifre hatalı');
    }
    assertPasswordPolicy(newPassword);
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new BusinessException('SAME_PASSWORD', 'Yeni şifre eskisiyle aynı olamaz');
    }
    await this.prisma.raw.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
    });
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.raw.user.findUniqueOrThrow({ where: { id: userId }, include: { tenant: true } });
    const assignments = await this.access.loadAssignments(user.id, user.tenantId);
    return {
      id: user.id,
      tenantId: user.tenantId,
      tenantCode: user.tenant.code,
      tenantName: user.tenant.name,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      locale: user.locale,
      mustChangePassword: user.mustChangePassword,
      permissions: [...new Set(assignments.flatMap((a) => a.permissions))].sort(),
      employeeId: user.employeeId,
    };
  }

  private async issueTokens(userId: string, tenantId: string): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync({ sub: userId, tid: tenantId });
    const refreshToken = randomToken(48);
    await this.prisma.raw.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + config.jwtRefreshDays * 86_400_000),
      },
    });
    return { accessToken, refreshToken };
  }
}
