import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
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
