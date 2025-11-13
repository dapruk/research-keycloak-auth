export type StoredSession = {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: number;
  issuer: string;
};

const store = new Map<string, StoredSession>();

export const TokenStore = {
  set: (sid: string, session: StoredSession) => store.set(sid, session),
  get: (sid: string) => store.get(sid),
  delete: (sid: string) => store.delete(sid),
};
