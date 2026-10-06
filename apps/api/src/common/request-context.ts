import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { RequestUser } from './request-user';

/** İstek kapsamındaki tenant ve kullanıcı bilgisine erişim (AsyncLocalStorage). */
@Injectable()
export class RequestContext {
  constructor(private readonly cls: ClsService) {}

  get tenantId(): string {
    const tenantId = this.cls.get<string | undefined>('tenantId');
    if (!tenantId) throw new UnauthorizedException('Tenant context missing');
    return tenantId;
  }

  get optionalTenantId(): string | undefined {
    return this.cls.isActive() ? this.cls.get<string | undefined>('tenantId') : undefined;
  }

  get user(): RequestUser {
    const user = this.cls.get<RequestUser | undefined>('user');
    if (!user) throw new UnauthorizedException();
    return user;
  }

  get optionalUser(): RequestUser | undefined {
    return this.cls.isActive() ? this.cls.get<RequestUser | undefined>('user') : undefined;
  }

  get userId(): string {
    return this.user.id;
  }

  setUser(user: RequestUser) {
    this.cls.set('tenantId', user.tenantId);
    this.cls.set('user', user);
  }

  /** Arka plan işleri için: verilen tenant bağlamında (kullanıcısız) çalıştır. */
  runForTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return this.cls.run(async () => {
      this.cls.set('tenantId', tenantId);
      return fn();
    });
  }
}
