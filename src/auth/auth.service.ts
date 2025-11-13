import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminRole } from '@prisma/client';
import crypto from 'crypto';
import { PrismaService } from 'src/prisma.service';
import { TokenStore } from './token-store';

type KeycloakLoginResult = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  token_type: 'Bearer';
};

type ActorType = 'internal' | 'client';
type InternalRole = 'SUPER_ADMIN' | 'ADMIN' | 'BACKOFFICE' | 'TECHNICIAN';
type ClientRole = 'ADMIN' | 'OPERATOR';

@Injectable()
export class AuthService {
  constructor(
    private cfg: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private keycloakUrl(path = '') {
    const baseUrl = this.cfg.get<string>('KC_BASE_URL')!.replace(/\/$/, '');
    const realm = this.cfg.get<string>('KC_REALM')!;
    const p = path ? (path.startsWith('/') ? path : `/${path}`) : '';
    return `${baseUrl}/realms/${realm}${p}`;
  }

  private issuer() {
    const baseUrl = this.cfg.get<string>('KC_BASE_URL')!.replace(/\/$/, '');
    const realm = this.cfg.get<string>('KC_REALM')!;
    return `${baseUrl}/realms/${realm}`;
  }

  private async getAdminAccessToken(): Promise<string> {
    const url = this.keycloakUrl('/protocol/openid-connect/token');
    const clientId = this.cfg.get<string>('KC_ADMIN_CLIENT_ID')!;
    const clientSecret = this.cfg.get<string>('KC_ADMIN_CLIENT_SECRET')!;

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) {
      const message = await res.text().catch(() => '');
      throw new UnauthorizedException(
        `Admin token failed: ${message || res.statusText}`,
      );
    }

    const json = (await res.json()) as KeycloakLoginResult;
    return json.access_token;
  }

  /** Password grant for user-facing login */
  private async loginWithPassword(params: {
    identifier: string;
    password: string;
  }) {
    const { identifier, password } = params;
    const clientId = this.cfg.get<string>('KC_CLIENT_ID')!;
    const clientSecret = this.cfg.get<string>('KC_CLIENT_SECRET')!;
    const url = this.keycloakUrl('/protocol/openid-connect/token');

    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: clientId,
      client_secret: clientSecret,
      username: identifier,
      password,
      scope: 'openid',
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new UnauthorizedException(`Login failed: ${msg || res.statusText}`);
    }

    const json = (await res.json()) as KeycloakLoginResult;
    const sid = crypto.randomUUID();
    const safeExpires = Number.isFinite(json.expires_in)
      ? json.expires_in
      : 300; // fallback 5m
    const expiresAt = Math.floor(Date.now() / 1000) + safeExpires;

    TokenStore.set(sid, {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      idToken: json.id_token,
      expiresAt,
      issuer: this.issuer(),
    });

    return { sid, expiresAt };
  }

  async fetchUserInfo(accessToken: string) {
    const url = this.keycloakUrl('/protocol/openid-connect/userinfo');
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new UnauthorizedException('Invalid token');
    return res.json() as Promise<{
      sub: string;
      email?: string;
      preferred_username?: string;
      actor_type?: string;
    }>;
  }

  async logout(sid: string) {
    TokenStore.delete(sid);
  }

  private async createKeycloakUser(
    adminToken: string,
    params: {
      username: string;
      email: string;
      emailVerified?: boolean;
      enabled?: boolean;
      attributes?: Record<string, string[] | string>;
      firstName?: string;
      lastName?: string;
    },
  ): Promise<string> {
    const adminUrl = `${this.cfg.get('KC_BASE_URL')!.replace(/\/$/, '')}/admin/realms/${this.cfg.get('KC_REALM')}/users`;

    const payload: any = {
      username: params.username,
      email: params.email,
      enabled: params.enabled ?? true,
      emailVerified: params.emailVerified ?? true,
      requiredActions: [],
      firstName: params.firstName ?? undefined,
      lastName: params.lastName ?? undefined,
      attributes: params.attributes ?? undefined,
    };

    const res = await fetch(adminUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 409)
      throw new BadRequestException('User already exists');
    if (res.status !== 201) {
      const txt = await res.text().catch(() => '');
      throw new BadRequestException(`Create user failed: ${res.status} ${txt}`);
    }

    const loc = res.headers.get('location');
    const id = loc?.split('/').pop();
    if (!id)
      throw new BadRequestException('Create user: missing Location header');
    return id;
  }

  private async setKeycloakPassword(
    adminToken: string,
    userId: string,
    password: string,
  ) {
    const url = `${this.cfg.get('KC_BASE_URL')!.replace(/\/$/, '')}/admin/realms/${this.cfg.get('KC_REALM')}/users/${userId}/reset-password`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        type: 'password',
        value: password,
        temporary: false,
      }),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new BadRequestException(
        `Set password failed: ${msg || res.statusText}`,
      );
    }
  }

  private async createUserProfile(input: {
    subject: string;
    email?: string;
    username?: string;
    actorType: ActorType;
    name?: string;
    phone?: string;
    internalRole?: InternalRole;
    clientRole?: ClientRole;
    companyId?: string;
  }) {
    const issuer = this.issuer();

    return this.prisma.$transaction(async (tx) => {
      const auth = await tx.auth.upsert({
        where: { issuer_subject: { issuer, subject: input.subject } },
        create: {
          issuer,
          subject: input.subject,
          email: input.email,
          username: input.username,
        },
        update: {
          email: input.email,
          username: input.username,
        },
      });

      if (input.actorType === 'internal') {
        if (!input.internalRole)
          throw new BadRequestException('Role is not Provided');

        if (input.internalRole === 'TECHNICIAN') {
          await tx.technician.create({
            data: {
              userId: auth.userId,
              name: input.name ?? 'Technician',
              phone: input.phone ?? null,
            },
          });

          return {
            actorType: 'internal' as const,
            role: 'Technician' as const,
            profile: {
              userId: auth.userId,
              name: input.name ?? 'Technician',
              phone: input.phone ?? null,
            },
          };
        } else {
          const role = input.internalRole as AdminRole;

          await tx.admin.create({
            data: {
              userId: auth.userId,
              name: input.name ?? role,
              phone: input.phone ?? null,
              role,
            },
          });

          return {
            actorType: 'internal' as const,
            role: role,
            profile: {
              userId: auth.userId,
              name: input.name ?? role,
              phone: input.phone ?? null,
              role,
            },
          };
        }
      }

      if (!input.companyId)
        return new BadRequestException('Company Id is not provided');

      if (!input.clientRole)
        return new BadRequestException('Role is not provided');

      const company = await tx.company.findUnique({
        where: { id: input.companyId },
        select: { id: true },
      });

      if (!company) return new BadRequestException('Invalid Company');

      await tx.client.create({
        data: {
          userId: auth.userId,
          companyId: input.companyId,
          name: input.name ?? input.clientRole,
          phone: input.phone ?? null,
          role: input.clientRole,
        },
      });

      return {
        actorType: 'client' as const,
        role: input.clientRole,
        profile: {
          userId: auth.userId,
          companyId: input.companyId,
          name: input.name,
          phone: input.phone ?? null,
          role: input.clientRole,
        },
      };
    });
  }

  async registerAndLogin(input: {
    email: string;
    password: string;
    username?: string;
    firstName?: string;
    lastName?: string;

    actorType: ActorType;
    name?: string;
    phone?: string;

    internalRole?: AdminRole | 'TECHNICIAN';

    clientRole?: ClientRole;
    companyId?: string;
  }) {
    if (!input.actorType)
      throw new BadRequestException('Actor Type is not provided');

    const adminToken = await this.getAdminAccessToken();

    const userId = await this.createKeycloakUser(adminToken, {
      username: input.username ?? input.email,
      email: input.email,
      attributes: input.actorType
        ? { actorType: [input.actorType] }
        : undefined,
      firstName: input.firstName,
      lastName: input.lastName,
    });

    await this.setKeycloakPassword(adminToken, userId, input.password);

    await new Promise((r) => setTimeout(r, 1000));

    const profile = await this.createUserProfile({
      subject: userId,
      email: input.email,
      username: input.username ?? input.email,
      actorType: input.actorType,
      name: `${input.firstName ?? ''} ${input.lastName ?? ''}`.trim(),
      phone: input.phone,
      internalRole: input.internalRole,
      clientRole: input.clientRole,
      companyId: input.companyId,
    });

    const { sid, expiresAt } = await this.loginWithPassword({
      identifier: input.email,
      password: input.password,
    });
    return { sid, expiresAt, profile };
  }
}
