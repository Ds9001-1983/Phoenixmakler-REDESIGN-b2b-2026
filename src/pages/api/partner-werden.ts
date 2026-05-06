import type { APIRoute } from 'astro';
import { buildTriggerToken } from '../../lib/token';
import { sendPhoenixNotification, type ApplicantData } from '../../lib/mail';

export const prerender = false;

const SALUTATION: Record<string, number> = { herr: 1, frau: 2, divers: 4 };
const SALUTATION_LABEL: Record<string, string> = { herr: 'Herr', frau: 'Frau', divers: 'Divers' };
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
const normIban = (s: string): string => s.replace(/\s+/g, '').toUpperCase();

export const POST: APIRoute = async ({ request }) => {
  const base = import.meta.env.PW_API_BASE;
  const slug = import.meta.env.PW_USER_SLUG ?? 'me';
  const token = import.meta.env.PW_BEARER_TOKEN;
  const agencyId = Number(import.meta.env.PW_DEFAULT_AGENCY_ID);
  const triggerSecret = import.meta.env.TRIGGER_SECRET;
  const appBaseUrl = import.meta.env.APP_BASE_URL;
  const phoenixTo = import.meta.env.PHOENIX_NOTIFICATION_TO;

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

  const required = ['anrede', 'vorname', 'nachname', 'strasse', 'plz', 'ort', 'telefon', 'email', 'geburtsdatum', 'ihk', 'iban'];
  for (const f of required) {
    if (!str(data[f])) return json({ error: 'missing_field', field: f }, 422);
  }
  if (data.datenschutz !== true && data.datenschutz !== 'on' && data.datenschutz !== 'true') {
    return json({ error: 'datenschutz_required' }, 422);
  }

  const email = str(data.email).toLowerCase();
  const vorname = str(data.vorname);
  const nachname = str(data.nachname);
  const telefon = str(data.telefon);
  const ihk = str(data.ihk);
  const iban = normIban(str(data.iban));
  const { street, street_nr } = splitStreet(str(data.strasse));
  const plz = str(data.plz);
  const ort = str(data.ort);
  const geburtsdatum = str(data.geburtsdatum);
  const nationalityKey = str(data.nationalitaet).toUpperCase();
  const nationality = NATIONALITY_ID[nationalityKey];
  const anredeKey = str(data.anrede).toLowerCase();

  // PW-Policy: Groß+Klein+(Zahl/Sonderzeichen), ≥8. Bewerber nutzt das Passwort nicht aktiv.
  const password = `${crypto.randomUUID().slice(0, 8).toUpperCase()}!${crypto.randomUUID().slice(0, 16)}`;

  // PW-Login muss systemweit eindeutig sein. E-Mail kann mit bestehenden Bestandsmaklern
  // kollidieren, daher zusätzlicher Random-Suffix. Bewerber nutzt das nie zum Login.
  const loginSuffix = crypto.randomUUID().slice(0, 6);
  const loginBase = `${vorname.toLowerCase()}.${nachname.toLowerCase()}`
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9.]/g, '');
  const login = `${loginBase}.${loginSuffix}`.slice(0, 64);

  const userBody: Record<string, unknown> = {
    status_id: 3,
    role_id: 1,
    salutation_id: SALUTATION[anredeKey] ?? 4,
    first_name: vorname,
    last_name: nachname,
    birth_date: geburtsdatum,
    family_status: 6,
    login,
    password,
    email,
    affiliation: { agency_id: agencyId, superior_user_id: SUPERIOR_USER_ID },
    use_alternative_address: 1,
    alternative_address: { street, street_nr, postal_code: plz, city: ort, country_id: 65 },
    use_alternative_communication: 1,
    alternative_communication: { phone_business: telefon, email },
    registration_and_newsletter_information: {
      ihk_reg_nr_34d: ihk,
      exclude_from_newsletter: data.kontakt_ok ? false : true,
    },
  };
  if (nationality) userBody.nationality = nationality;

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  // 1) Vermittler anlegen — status_id 3 = storniert
  let userRes: Response;
  try {
    userRes = await fetch(`${base}/api/v1/${slug}/users`, { method: 'POST', headers, body: JSON.stringify(userBody) });
  } catch (e) {
    console.error('PW users fetch failed', e);
    return json({ error: 'crm_unreachable' }, 502);
  }
  if (!userRes.ok) {
    const detail = await userRes.text();
    console.error('PW users error', userRes.status, detail.slice(0, 800));
    if (userRes.status === 422) return json({ error: 'validation_failed', upstream: detail.slice(0, 400) }, 422);
    if (userRes.status === 409) return json({ error: 'duplicate' }, 409);
    return json({ error: 'crm_error', status: userRes.status }, 502);
  }
  const userJson = (await userRes.json()) as { data?: { id?: number } };
  const newUserId = userJson?.data?.id ?? null;

  // 2) IBAN als Bankverbindung beim Vermittler hinterlegen — nicht-blockierend
  let bankStatus: 'ok' | 'failed' | 'skipped' = 'skipped';
  if (newUserId && iban) {
    try {
      const bankRes = await fetch(`${base}/api/v1/${slug}/bank-accounts/user`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: newUserId,
          iban_code: iban,
          depositor: `${vorname} ${nachname}`,
          validate_iban: false,
        }),
      });
      if (bankRes.ok) {
        bankStatus = 'ok';
      } else {
        bankStatus = 'failed';
        console.error('PW bank-account error', bankRes.status, (await bankRes.text()).slice(0, 400));
      }
    } catch (e) {
      bankStatus = 'failed';
      console.error('PW bank-account fetch failed', e);
    }
  }

  // 3) Kunden-Eintrag (status_id 1 = "Kunde") mit Bezug auf den Vermittler
  let clientStatus: 'ok' | 'failed' | 'skipped' = 'skipped';
  let clientId: number | null = null;
  if (newUserId) {
    try {
      const clientRes = await fetch(`${base}/api/v1/${slug}/clients`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: newUserId,
          status_id: 1,
          salutation_id: SALUTATION[anredeKey] ?? 4,
          first_name: vorname,
          last_name: nachname,
          birth_date: geburtsdatum,
          metadata: { create_type_id: 0 },
          address: { street, street_nr, postal_code: plz, city: ort, country_id: 65 },
          communication: { email, phone: telefon },
        }),
      });
      if (clientRes.ok) {
        clientStatus = 'ok';
        const cj = (await clientRes.json()) as { data?: { id?: number } };
        clientId = cj?.data?.id ?? null;
      } else {
        clientStatus = 'failed';
        console.error('PW clients error', clientRes.status, (await clientRes.text()).slice(0, 400));
      }
    } catch (e) {
      clientStatus = 'failed';
      console.error('PW clients fetch failed', e);
    }
  }

  // 4) Notification-Mail an Phoenix mit Trigger-Link — nicht-blockierend
  let mailStatus: 'ok' | 'failed' | 'skipped' = 'skipped';
  if (newUserId && triggerSecret && appBaseUrl && phoenixTo) {
    try {
      const triggerToken = buildTriggerToken(newUserId, clientId, email, triggerSecret);
      const triggerLink = `${appBaseUrl.replace(/\/+$/, '')}/api/onboarding-trigger?token=${encodeURIComponent(triggerToken)}`;
      const applicant: ApplicantData = {
        vorname,
        nachname,
        anrede: SALUTATION_LABEL[anredeKey] ?? '—',
        email,
        telefon,
        strasse: `${street}${street_nr ? ' ' + street_nr : ''}`,
        plz,
        ort,
        geburtsdatum,
        ihk,
        iban,
      };
      await sendPhoenixNotification(phoenixTo, applicant, newUserId, triggerLink);
      mailStatus = 'ok';
    } catch (e) {
      mailStatus = 'failed';
      console.error('Phoenix notification mail failed', (e as Error).message);
    }
  }

  return json({ ok: true, user_id: newUserId, client: clientStatus, bank: bankStatus, mail: mailStatus }, 200);
};
