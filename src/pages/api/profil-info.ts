import type { APIRoute } from 'astro';
import { verifyToken, buildUploadToken } from '../../lib/token';
import { loadVermittler } from '../../lib/vermittler';
import { loadProfilByUid, LIMITS } from '../../lib/profil';

export const prerender = false;

const j = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// Liefert das eigene Profil zum Vorbefüllen des Editors. Token-geschützt.
export const GET: APIRoute = async ({ url }) => {
  const secret = import.meta.env.TRIGGER_SECRET;
  if (!secret) return j({ error: 'server_misconfigured' }, 500);

  const token = url.searchParams.get('token');
  if (!token) return j({ error: 'missing_token' }, 400);

  const payload = verifyToken(token, 'profil', secret);
  if (!payload) return j({ error: 'invalid_or_expired' }, 410);

  // Nur aktive Makler (PW status_id=1) bekommen Zugang.
  const vermittler = await loadVermittler();
  const me = vermittler.find((v) => v.id === payload.uid);
  if (!me) return j({ error: 'not_active' }, 403);

  const profil = await loadProfilByUid(payload.uid);

  // Frischer Upload-Token, damit der bestehende /api/foto-upload (kind:'upload') 1:1
  // wiederverwendet werden kann — ohne foto-upload.ts anzufassen.
  const uploadToken = buildUploadToken(payload.uid, payload.cid, payload.email, payload.name ?? '', secret);

  return j({
    ok: true,
    uid: me.id,
    name: me.name,
    ort: me.ort,
    plz: me.plz,
    telefon: me.telefon,
    email: me.email,
    hasPhoto: me.hasPhoto,
    uploadToken,
    limits: LIMITS,
    profil: profil
      ? {
          headline: profil.headline,
          bio: profil.bio,
          skills: profil.skills,
          qualifikationen: profil.qualifikationen,
          buerozeiten: profil.buerozeiten,
          fokus: profil.fokus,
          kontakt: profil.kontakt ?? {},
          published: profil.published,
          everApproved: profil.everApproved,
          slug: profil.slug,
        }
      : null,
  });
};
