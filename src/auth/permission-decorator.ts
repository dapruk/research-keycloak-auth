import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'kc_permission';

export const RequiresPermission = (permission: string) =>
  SetMetadata(PERMISSION_KEY, permission);
