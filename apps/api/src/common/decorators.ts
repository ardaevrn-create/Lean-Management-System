import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { PermissionCode } from '@lean/shared';
import type { RequestUser } from './request-user';

export const IS_PUBLIC = 'isPublic';
/** Kimlik doğrulama gerektirmeyen uç nokta. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ALLOW_PENDING_PASSWORD = 'allowPendingPassword';
/** Şifre değiştirme zorunluluğu olan kullanıcının da erişebileceği uç nokta. */
export const AllowPendingPassword = () => SetMetadata(ALLOW_PENDING_PASSWORD, true);

export const REQUIRED_PERMISSIONS = 'requiredPermissions';
/** Verilen izinlerden en az birine sahip olmayı gerektirir. */
export const RequirePermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);

export const PLATFORM_ADMIN = 'platformAdmin';
export const PlatformAdminOnly = () => SetMetadata(PLATFORM_ADMIN, true);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): RequestUser => ctx.switchToHttp().getRequest().user,
);
