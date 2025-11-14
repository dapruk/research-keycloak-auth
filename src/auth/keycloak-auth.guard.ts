import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { KeycloakAuthService } from './keycloak-auth.service';
import { PERMISSION_KEY } from './permission-decorator';
import { TokenStore } from './token-store';

@Injectable()
export class KeycloakAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cfg: ConfigService,
    private readonly kcAuth: KeycloakAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission =
      this.reflector.get<string>(PERMISSION_KEY, context.getHandler()) ??
      this.reflector.get<string>(PERMISSION_KEY, context.getClass());

    if (!permission) {
      throw new Error('No Keycloak permission metadata on handler');
    }

    const req = context.switchToHttp().getRequest<Request>();

    const cookieName = this.cfg.get<string>('SESSION_COOKIE_NAME');
    if (!cookieName) throw new Error('SESSION_COOKIE_NAME is not defined');

    const sid = (req as any).signedCookies?.[cookieName];
    if (!sid) {
      throw new UnauthorizedException('No session');
    }

    const session = TokenStore.get(sid);
    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }

    const accessToken = session.accessToken;
    if (!accessToken) {
      throw new UnauthorizedException('Missing access token');
    }

    const allowed = await this.kcAuth.checkPermission(accessToken, permission);

    if (!allowed) {
      throw new ForbiddenException('Not allowed by Keycloak policy');
    }

    return true;
  }
}
