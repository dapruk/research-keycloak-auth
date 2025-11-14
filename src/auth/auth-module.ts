import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import { PrismaService } from 'src/prisma.service';
import { AuthController } from './auth-controller';
import { AuthService } from './auth.service';
import { KeycloakAuthGuard } from './keycloak-auth.guard';
import { KeycloakAuthService } from './keycloak-auth.service';

@Module({
  imports: [ConfigModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    KeycloakAuthService,
    KeycloakAuthGuard,
    PrismaService,
    Reflector,
  ],
  exports: [AuthService, KeycloakAuthService, KeycloakAuthGuard],
})
export class AuthModule {}
