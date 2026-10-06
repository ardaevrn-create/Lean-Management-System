import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { config } from '../../config';
import { AccessService } from './access.service';
import { ApiKeysController } from './api-keys.controller';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Global()
@Module({
  imports: [JwtModule.register({ secret: config.jwtSecret, signOptions: { expiresIn: config.jwtAccessTtl as any } })],
  controllers: [AuthController, ApiKeysController],
  providers: [AuthService, AccessService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService, AccessService],
})
export class AuthModule {}
