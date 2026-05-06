import type { APIRoute } from 'astro';

export const prerender = false;

const SALUTATION: Record<string, number> = { herr: 1, frau: 2, divers: 4 };
const NATIONALITY_ID: Record<string, number> = { DE: 65, AT: 10, CH: 166 };
const SUPERIOR_USER_ID = 10278;

type Body = Record<string, unknown>;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const splitStreet = (s: string): { street: string; street_nr: string } => {
  const m = s.match(/^(.*?)[\s,]+([0-9][0-9a-zA-Z\-\/\s]*)$/);
  if (m) return { street: m[1].trim(), street_nr: m[2].trim() };
  return { street: s.trim(), street_nr: '' };
};

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export const POST: APIRoute = async ({ request }) => {
  const base = import.meta.env.PW_API_BASE;
  const slug = import.meta.env.PW_USER_SLUG ?? 'me';
  const token = import.meta.env.PW_BEARER_TOKEN;
  const agencyId = Number(import.meta.env.PW_DEFAULT_AGENCY_ID);

  if (!base || !token || !agencyId) {
    return json({ error: 'server_misconfigured' }, 500);
  }

  let data: Body;
  try {
    data = (await request.json()) as Body;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  if (str(data._hp).length > 0) {
    return json({ ok: true }, 200);
  }

  const required = ['anrede', 'vorname', 'nachname', 'strasse', 'plz', 'ort', 'telefon', 'email', 'geburtsdatum'];
  for (const f of required) {
    if (!str(data[f])) return json({ error: 'missing_field', field: f }, 422);
  }
  if (data.datenschutz !== true && data.datenschutz !== 'on' && data.datenschutz !== 'true') {
    return json({ error: 'datenschutz_required' }, 422);
  }

  const email = str(data.email).toLowerCase();
  const { street, street_nr } = splitStreet(str(data.strasse));
  const nationalityKey = str(data.nationalitaet).toUpperCase();
  const nationality = NATIONALITY_ID[nationalityKey];

  // PW-Policy: Groß+Klein+(Zahl/Sonderzeichen), ≥8. Bewerber nutzt das Passwort nicht aktiv.
  const password = `${crypto.randomUUID().slice(0, 8).toUpperCase()}!${crypto.randomUUID().slice(0, 16)}`;

  const body: Record<string, unknown> = {
    status_id: 3,
    role_id: 1,
    salutation_id: SALUTATION[str(data.anrede).toLowerCase()] ?? 4,
    first_name: str(data.vorname),
    last_name: str(data.nachname),
    birth_date: str(data.geburtsdatum),
    family_status: 6,
    login: email.slice(0, 64),
    password,
    email,
    affiliation: { agency_id: agencyId, superior_user_id: SUPERIOR_USER_ID },
    use_alternative_address: true,
    alternative_address: {
      street,
      street_nr,
      postal_code: str(data.plz),
      city: str(data.ort),
      country_id: 65,
    },
    use_alternative_communication: true,
    alternative_communication: {
      phone_business: str(data.telefon),
      email,
    },
  };

  if (nationality) body.nationality = nationality;

  const ihk = str(data.ihk);
  if (ihk) {
    body.registration_and_newsletter_information = {
      ihk_reg_nr_34d: ihk,
      exclude_from_newsletter: data.kontakt_ok ? false : true,
    };
  }

  const url = `${base}/api/v1/${slug}/users`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error('PW fetch failed', e);
    return json({ error: 'crm_unreachable' }, 502);
  }

  if (!res.ok) {
    const detail = await res.text();
    console.error('PW API error', res.status, detail.slice(0, 800));
    if (res.status === 422) {
      return json({ error: 'validation_failed', upstream: detail.slice(0, 400) }, 422);
    }
    if (res.status === 409) {
      return json({ error: 'duplicate' }, 409);
    }
    return json({ error: 'crm_error', status: res.status }, 502);
  }

  return json({ ok: true }, 200);
};
