import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class KeycloakAuthService {
  constructor(private readonly cfg: ConfigService) {}

  async checkPermission(
    access_token: string,
    permission: string,
  ): Promise<boolean> {
    if (!access_token) throw new UnauthorizedException('Missing Access Token');

    const baseUrl = this.cfg.get<string>('KC_BASE_URL')!.replace(/\/$/, '');
    const realm = this.cfg.get<string>('KC_REALM')!;
    const clientId = this.cfg.get<string>('KC_CLIENT_ID')!;

    const url = `${baseUrl}/realms/${realm}/protocol/openid-connect/token`;

    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:uma-ticket',
      audience: clientId,
      response_mode: 'decision',
      permission,
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('AuthZ error', res.status, txt);
      return false;
    }

    const json = (await res.json()) as { result?: boolean };
    return json.result === true;
  }
}
