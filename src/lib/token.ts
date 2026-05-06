import { createHmac, timingSafeEqual } from 'node:crypto';

export type TokenKind = 'trigger' | 'upload';

export interface TokenPayload {
  uid: number;
  cid: number | null;
  email: string;
  kind: TokenKind;
  exp: number;
}

const b64u = (buf: Buffer | string) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const b64uDecode = (s: string): Buffer => {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
};

const sign = (data: string, secret: string) =>
  createHmac('sha256', secret).update(data).digest();

export function signToken(payload: TokenPayload, secret: string): string {
  const head = b64u(JSON.stringify(payload));
  const sig = b64u(sign(head, secret));
  return `${head}.${sig}`;
}

export function verifyToken(token: string, kind: TokenKind, secret: string): TokenPayload | null {
  if (!token || !token.includes('.')) return null;
  const [head, sig] = token.split('.');
  if (!head || !sig) return null;

  const expected = sign(head, secret);
  let actual: Buffer;
  try {
    actual = b64uDecode(sig);
  } catch {
    return null;
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(b64uDecode(head).toString('utf-8')) as TokenPayload;
  } catch {
    return null;
  }
  if (payload.kind !== kind) return null;
  if (typeof payload.exp !== 'number' || Date.now() / 1000 > payload.exp) return null;
  return payload;
}

export function buildTriggerToken(uid: number, cid: number | null, email: string, secret: string, ttlDays = 14): string {
  return signToken(
    { uid, cid, email, kind: 'trigger', exp: Math.floor(Date.now() / 1000) + ttlDays * 86400 },
    secret,
  );
}

export function buildUploadToken(uid: number, cid: number | null, email: string, secret: string, ttlDays = 30): string {
  return signToken(
    { uid, cid, email, kind: 'upload', exp: Math.floor(Date.now() / 1000) + ttlDays * 86400 },
    secret,
  );
}
