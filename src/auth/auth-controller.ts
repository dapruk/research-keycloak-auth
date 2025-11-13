import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { PrismaService } from 'src/prisma.service';
import { AuthService } from './auth.service';
import { TokenStore } from './token-store';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly cfg: ConfigService,
  ) {}

  private setSessionCookie(res: Response, sid: string, expiresAt: number) {
    const cookieName = this.cfg.get<string>('SESSION_COOKIE_NAME');
    if (!cookieName) throw new Error('SESSION_COOKIE_NAME is not defined');

    const ttlMs = Math.max(
      1,
      (expiresAt - Math.floor(Date.now() / 1000)) * 1000,
    );
    res.cookie(cookieName, sid, {
      httpOnly: true,
      secure: false, // set true in HTTPS/production
      sameSite: 'lax',
      maxAge: ttlMs,
      signed: true,
      path: '/',
    });
  }

  @Post('register')
  async register(
    @Body()
    body: {
      email: string;
      password: string;
      username?: string;
      firstName?: string;
      lastName?: string;

      actorType: 'internal' | 'client';
      name?: string;
      phone?: string;

      internalRole?: 'SUPER_ADMIN' | 'ADMIN' | 'BACKOFFICE' | 'TECHNICIAN';

      clientRole?: 'ADMIN' | 'OPERATOR';
      companyId?: string;
    },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body?.email || !body?.password || !body?.actorType) {
      return { ok: false, message: 'email, password, actorType are required' };
    }
    if (body.actorType === 'client' && (!body.clientRole || !body.companyId)) {
      return {
        ok: false,
        message: 'clientRole and companyId are required for client actor',
      };
    }

    const { sid, expiresAt, profile } = await this.auth.registerAndLogin({
      email: body.email,
      password: body.password,
      username: body.username,
      firstName: body.firstName,
      lastName: body.lastName,

      actorType: body.actorType,
      name: body.name,
      phone: body.phone,

      internalRole: body.internalRole as any,
      clientRole: body.clientRole as any,
      companyId: body.companyId,
    });

    this.setSessionCookie(res, sid, expiresAt);
    return { ok: true, profile, expiresAt };
  }

  @Post('login')
  async login(
    @Body() body: { identifier: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body?.identifier || !body?.password) {
      return { ok: false, message: 'identifier and password required' };
    }

    const { sid, expiresAt } = await (this.auth as any).loginWithPassword({
      identifier: body.identifier,
      password: body.password,
    });

    this.setSessionCookie(res, sid, expiresAt);
    return { ok: true, expiresAt };
  }

  @Get('me')
  async me(@Req() req: Request) {
    const cookieName = this.cfg.get<string>('SESSION_COOKIE_NAME');
    if (!cookieName) throw new Error('SESSION_COOKIE_NAME is not defined');

    const sid = req.signedCookies?.[cookieName];
    if (!sid) throw new UnauthorizedException('No session');

    const session = TokenStore.get(sid);
    if (!session) throw new UnauthorizedException('Invalid session');

    const info = await this.auth.fetchUserInfo(session.accessToken);

    const issuer =
      this.cfg.get<string>('KC_BASE_URL')!.replace(/\/$/, '') +
      `/realms/${this.cfg.get('KC_REALM')}`;

    const auth = await this.prisma.auth.upsert({
      where: { issuer_subject: { issuer, subject: info.sub } },
      create: {
        issuer,
        subject: info.sub,
        email: info.email ?? undefined,
        username: info.preferred_username ?? undefined,
      },
      update: {
        email: info.email ?? undefined,
        username: info.preferred_username ?? undefined,
      },
      include: {
        Admin: true,
        Technician: true,
        Clients: true,
        CompanyOwned: true,
      },
    });

    const actorType =
      auth.Admin || auth.Technician
        ? 'internal'
        : (auth.Clients?.length ?? 0) > 0 ||
            (auth.CompanyOwned?.length ?? 0) > 0
          ? 'client'
          : null;

    return {
      issuer: auth.issuer,
      subject: auth.subject,
      email: auth.email,
      username: auth.username,
      actor_type: actorType,
    };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookieName = this.cfg.get<string>('SESSION_COOKIE_NAME');
    if (!cookieName) throw new Error('SESSION_COOKIE_NAME is not defined');

    const sid = req.signedCookies?.[cookieName];
    if (sid) {
      await this.auth.logout(sid);
      res.clearCookie(cookieName, { path: '/' });
    }
    return { ok: true };
  }
}
