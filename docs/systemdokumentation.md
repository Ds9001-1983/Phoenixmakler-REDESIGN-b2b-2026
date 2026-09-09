# Makler-Self-Service-Profile — Systemdokumentation

**Projekt:** Phönix Maklerverbund — Website-Redesign 2026
**Modul:** Self-Service-Profile für Makler
**Stand:** 22.06.2026
**Zeitraum der Umsetzung:** 16.–22.06.2026

---

## Inhaltsverzeichnis

1. [Überblick & Zielsetzung](#1-überblick--zielsetzung)
2. [Kernkonzept in einem Satz](#2-kernkonzept-in-einem-satz)
3. [Architektur](#3-architektur)
4. [Die drei Oberflächen](#4-die-drei-oberflächen)
5. [Zugangssystem & Sicherheit (Magic Link)](#5-zugangssystem--sicherheit-magic-link)
6. [Moderations-Workflow „Erstfreigabe, dann frei"](#6-moderations-workflow-erstfreigabe-dann-frei)
7. [Datenmodell & Speicherung](#7-datenmodell--speicherung)
8. [E-Mail-Benachrichtigungen](#8-e-mail-benachrichtigungen)
9. [API-Endpunkte (Referenz)](#9-api-endpunkte-referenz)
10. [Ablaufdiagramme (alle Flows)](#10-ablaufdiagramme-alle-flows)
11. [Bulk-Versand an alle Makler (Rollout-Werkzeug)](#11-bulk-versand-an-alle-makler-rollout-werkzeug)
12. [Konfiguration (Umgebungsvariablen)](#12-konfiguration-umgebungsvariablen)
13. [Betrieb & Wartung](#13-betrieb--wartung)
14. [Dateiübersicht](#14-dateiübersicht)

---

## 1. Überblick & Zielsetzung

Jeder Makler des Phönix-Maklerverbunds soll seine **eigene öffentliche Profilseite**
selbst pflegen können — ohne Login/Passwort, ohne Redaktionsaufwand auf Phoenix-Seite und
ohne dass das CRM angefasst wird. Gleichzeitig behält Phoenix die **redaktionelle Kontrolle**:
Ein Profil geht erst nach einer ersten Freigabe online.

Das Modul liefert:

- eine **persönliche Bearbeitungsseite** je Makler (Foto, Bio, Schwerpunkte, Bürozeiten, …),
- eine **öffentliche Profilseite** je Makler (eigene URL, im Maklerfinder verlinkt),
- eine **Freigabe-/Moderationsoberfläche** für das Phoenix-Team,
- ein **manipulationssicheres Zugangssystem** über signierte Links,
- eine vollständige **E-Mail-Strecke** (Einladung, Freigabe-Anfrage, Überarbeitung),
- ein **Werkzeug zum Sammelversand** der Einladung an alle Bestandsmakler.

---

## 2. Kernkonzept in einem Satz

> Das **CRM (Professional.Works)** bleibt die alleinige Quelle für Identität & Kontakt der
> Makler; die Profilinhalte liegen als **separate, additive Redaktionsschicht** (JSON in
> Vercel Blob) daneben und werden über **signierte Zugangslinks** vom Makler selbst gepflegt.

Das bedeutet: Wer Makler *ist* und ob er *aktiv* ist, entscheidet immer das CRM. Was auf
seiner Profilseite *steht*, pflegt der Makler selbst. Beides ist sauber getrennt.

---

## 3. Architektur

**Technische Basis**

| Baustein | Technologie |
|---|---|
| Framework | Astro 4 (Hybrid: statische Seiten + Serverless-Functions) |
| Hosting | Vercel (Serverless Functions) |
| Datenspeicher Profile | Vercel Blob — `makler-profile/{uid}.json` (privat) |
| Datenspeicher Fotos | Vercel Blob — `vermittler/{uid}.{ext}` (privat) |
| Stammdaten / Identität | Professional-Works-CRM (PW), per REST-API |
| E-Mail-Versand | Nodemailer über SMTP (Goneo) |
| Zugangs-Token | HMAC-SHA256, server-seitig signiert |

**Datenflüsse**

```
                         ┌─────────────────────────┐
                         │  Professional.Works CRM  │  ← Identität, aktiv-Status,
                         │   (Stammdaten, status=1) │    Name, E-Mail, Telefon
                         └───────────┬──────────────┘
                                     │ loadVermittler()  (Cache 1h)
                                     ▼
   Makler ──Magic-Link──►  /makler-profil  ──speichert──►  Vercel Blob
                          (Editor, Browser)               makler-profile/{uid}.json
                                     │                            │
                                     │ Foto-Upload                │ loadProfilBySlug()
                                     ▼                            ▼
                          vercel blob vermittler/{uid}   /makler/{slug}  (öffentlich)
                                                                  ▲
   Phoenix ─Admin-Link─►  /makler-freigabe ──freigeben──────────┘
                          (Vorschau + Moderation)
```

Der **CRM-Bearer-Token bleibt immer server-seitig** (Serverless-Function); der Browser
des Maklers sieht ihn nie. Profilbilder und Profil-JSON liegen in **privaten** Blob-Stores
und werden nur über eigene, kontrollierte Endpunkte ausgeliefert.

---

## 4. Die drei Oberflächen

### 4.1 Profil-Editor — `/makler-profil?token=…`
Datei: `src/pages/makler-profil.astro`

Die persönliche Bearbeitungsseite des Maklers. Sie hat **vier Zustände**, die clientseitig
abhängig vom Token-Check umgeschaltet werden:

| Zustand | Wann |
|---|---|
| **Laden** | initialer Moment beim Aufruf |
| **Editor** | Token gültig **und** uid ist aktiver Makler → Formular erscheint, vorbefüllt |
| **Link anfordern** | kein/abgelaufener Token oder uid kein aktiver Makler → E-Mail-Formular zur Selbst-Neuanforderung |
| **Fehler** | Serverfehler |

**Editor-Felder** (mit Live-Zeichenzählern und Pflichtfeld-Markierung):

- **Profilfoto** — Direkt-Upload (JPG/PNG/WEBP/HEIC, max. 8 MB), sofort gespeichert.
- **Überschrift / Claim** *(Pflicht)*
- **Über mich** *(Pflicht)* — mehrzeilige Biografie.
- **Schwerpunkte** — eine pro Zeile.
- **Ausbildung & Qualifikationen** — eine pro Zeile.
- **Bürozeiten** — pro Wochentag aktivierbar, mit Von/Bis-Zeiten.
- **Spezialisierung** — optionaler Hervorhebungs-Badge.
- **Kontakt (optional)** — Telefon, E-Mail, eigene Website (https:// wird automatisch ergänzt). Leere Felder fallen auf die CRM-Daten zurück.

Ein **Status-Banner** zeigt dem Makler jederzeit, ob sein Profil online ist, offline ist
oder auf die Erstfreigabe wartet.

### 4.2 Öffentliche Profilseite — `/makler/{slug}`
Datei: `src/pages/makler/[slug].astro`

Die nach außen sichtbare Maklerseite mit eigener, sprechender URL (z. B.
`/makler/karl-heinz-burger`).

- Sichtbar **nur**, wenn das Profil `published` ist **und** der Makler im CRM aktiv ist —
  sonst sauberes **404** (kein Daten-Leak von Entwürfen/Offline-Profilen).
- Ausgabe inkl. **strukturierter Daten (JSON-LD)** für Suchmaschinen.
- **CDN-Caching** für veröffentlichte Profile (1 Stunde), für schnelle Auslieferung.

### 4.3 Freigabe-/Moderationsseite — `/makler-freigabe?token=…`
Datei: `src/pages/makler-freigabe.astro`

Die interne Oberfläche für das Phoenix-Team. Erreichbar ausschließlich über einen
signierten Admin-Link, der **nur per E-Mail an die Phoenix-Benachrichtigungsadresse** geht.

Funktionen:

- **Vorschau** des eingereichten Profils (so, wie es live aussähe),
- **Freigeben** → Profil geht online,
- **Zurückwerfen** mit optionalem Hinweistext → Profil bleibt offline, Makler erhält Überarbeitungs-Mail,
- **Offline nehmen** (bei bereits live geschalteten Profilen).

---

## 5. Zugangssystem & Sicherheit (Magic Link)

Datei: `src/lib/token.ts`

Statt Passwörtern nutzt das System **signierte Tokens** (HMAC-SHA256, base64url-codiert,
Format `payload.signatur`). Der Token enthält u. a. die Makler-uid, E-Mail, Name, den
Token-Typ und ein Ablaufdatum. Manipulation wird durch die Signaturprüfung erkannt; der
Vergleich erfolgt **timing-sicher**.

| Token-Typ | Zweck | Gültigkeit |
|---|---|---|
| `trigger` | Onboarding-Anstoß (Foto-Upload-Mail auslösen) | 14 Tage |
| `upload` | Foto-Upload | 30 Tage |
| `profil` | Makler-Editor-Zugang | **14 Tage** (`PROFIL_TTL_DAYS`) |
| `profil-request` | Dauerhafter Selbstbedienungs-Link (im CRM hinterlegt) | **unbegrenzt** (`exp: 0`) |
| `profil-admin` | Phoenix-Freigabe/-Moderation | 30 Tage |

**Sicherheitsmerkmale**

- Geheimnis `TRIGGER_SECRET` (32-Byte-Hex) ausschließlich server-seitig.
- Doppelte Zugangsprüfung am Editor: gültiger Token **und** uid muss in der aktiven
  CRM-Liste stehen (`loadVermittler`). Ein abgemeldeter/inaktiver Makler kommt nicht rein.
- Die uid stammt **immer aus dem signierten Token**, nie aus Client-Eingaben.
- State-ändernde Aktionen laufen ausschließlich über **POST** (kein Prefetch-/Scanner-Risiko).
- Self-Service-Neuanforderung (`/api/profil-link-request`) ist **rate-limited**
  (5 Anfragen / 10 Min / IP) und antwortet **immer generisch** — verhindert das Ausspähen,
  welche E-Mail-Adressen hinterlegt sind (E-Mail-Enumeration).

---

## 6. Moderations-Workflow „Erstfreigabe, dann frei"

Datei: `src/lib/profil.ts` (`saveProfilFromContent`, `setPublished`)

Jedes Profil trägt zwei Statusflags:

- **`everApproved`** — wurde dieses Profil **jemals** von Phoenix freigegeben?
- **`published`** — ist es **aktuell** öffentlich sichtbar?

Daraus ergibt sich die Logik:

| Aktion | Ergebnis |
|---|---|
| Makler speichert **zum ersten Mal** | `published = false`, wartet auf Erstfreigabe |
| Phoenix **gibt frei** | `published = true`, `everApproved = true` |
| Makler **ändert nach Freigabe** | Änderung geht **sofort live** (weil bereits `everApproved`) |
| Phoenix **nimmt offline / wirft zurück** | `published = false`, `everApproved = false` → die nächste Makler-Änderung muss **erneut** freigegeben werden („Offline" ist bewusst „sticky") |

**Zustandsdiagramm**

```
   [neu/Entwurf]
        │  Makler speichert
        ▼
   wartet auf Freigabe ──Phoenix: zurückwerfen──► (bleibt offline, Mail an Makler)
        │
        │  Phoenix: freigeben
        ▼
     ONLINE (everApproved=true) ──Makler ändert──► bleibt ONLINE (sofort live)
        │
        │  Phoenix: offline nehmen
        ▼
   offline + Freigabe zurückgezogen ──Makler ändert──► wartet erneut auf Freigabe
```

Bei jeder Einreichung/Änderung wird Phoenix automatisch per E-Mail informiert — mit
unterschiedlichem Hinweis je nachdem, ob es eine **neue Freigabe** braucht oder die
Änderung **bereits live** ist.

---

## 7. Datenmodell & Speicherung

### Speicherort
Ein JSON-Dokument je Makler: `makler-profile/{uid}.json` (Vercel Blob, **privat**, kein
Zufallssuffix, überschreibbar). In-Memory-Cache pro Function-Instanz (TTL 5 Min).

### Persistierte Felder (`MaklerProfil`)

| Feld | Bedeutung |
|---|---|
| `v` | Schema-Version (für spätere Migrationen) |
| `uid` | Makler-ID (= PW-User-ID) |
| `slug` | sprechende URL, kollisionsfrei erzeugt |
| `headline`, `bio` | Claim & Biografie |
| `skills[]`, `qualifikationen[]` | Listen |
| `buerozeiten[]` | `{ tag, von, bis }` je aktivem Wochentag |
| `fokus` | `{ aktiv, wert }` — Spezialisierungs-Badge |
| `kontakt` | optionale Overrides für Telefon/E-Mail/Website |
| `published`, `everApproved` | Moderationsstatus (s. o.) |
| `eingereichtAm`, `freigegebenAm`, `aktualisiertAm` | Zeitstempel (ISO) |

### Validierungsgrenzen (`LIMITS`, server-seitig erzwungen)

| Feld | Grenze |
|---|---|
| Überschrift | 80 Zeichen |
| Biografie | 1.500 Zeichen |
| Schwerpunkte | max. 12 × je 200 Zeichen |
| Qualifikationen | max. 12 × je 220 Zeichen |
| Bürozeiten | max. 7 Einträge, Zeitformat `HH:MM`, von < bis |
| Spezialisierung | 60 Zeichen |
| Telefon / E-Mail / Website | 40 / 120 / 200 Zeichen |

Die Validierung läuft **immer server-seitig** (`validateProfil`) — Client-Eingaben werden
grundsätzlich nicht vertraut. E-Mail- und Website-Formate werden geprüft, Websites ohne
Protokoll automatisch mit `https://` ergänzt.

### Slug-Bildung (`slugify`)
Deutschlandtauglich: Umlaute werden transliteriert (ä→ae, ö→oe, ü→ue, ß→ss), Rest
normalisiert. Kollisionen mit fremden Profilen werden durch Anhängen von `-2`, `-3`, …
aufgelöst. Ein einmal vergebener Slug bleibt für den Makler stabil.

---

## 8. E-Mail-Benachrichtigungen

Datei: `src/lib/mail.ts` (Nodemailer/SMTP, alle Templates als Inline-HTML im Phoenix-Look)

| Funktion | Empfänger | Auslöser |
|---|---|---|
| `sendProfilEinladung` | Makler | Onboarding-Abschluss, Selbst-Anforderung **oder Bulk-Versand** |
| `sendProfilReviewNotice` | Phoenix-Team | Makler hat gespeichert (Freigabe nötig **oder** „ist live") |
| `sendProfilRevision` | Makler | Phoenix hat zurückgeworfen (mit Hinweis + frischem Editor-Link) |

Ergänzend aus der Onboarding-Strecke: `sendPhoenixNotification` (neue Bewerbung) und
`sendApplicantPhoto` (Foto-Upload-Einladung).

Alle Mail-Versände sind **nicht-blockierend** umgesetzt: Schlägt der Versand fehl, bleibt
die Kernaktion (Speichern/Freigeben) trotzdem erfolgreich; der Fehler wird nur geloggt.

---

## 9. API-Endpunkte (Referenz)

Alle unter `src/pages/api/`, alle `prerender = false` (Serverless).

| Endpunkt | Methode | Zweck | Absicherung |
|---|---|---|---|
| `profil-info` | GET | Editor-Daten + Limits laden (Vorbefüllung) | `profil`-Token + aktiver Makler |
| `profil-save` | POST | Profil validieren & speichern, Phoenix benachrichtigen | `profil`-Token + aktiver Makler |
| `profil-link-request` | POST | Neuen Editor-Link selbst anfordern | Rate-Limit + Enumeration-Schutz |
| `profil-publish` | POST | Profil freigeben (online) | `profil-admin`-Token |
| `profil-unpublish` | POST | Profil offline nehmen | `profil-admin`-Token |
| `profil-reject` | POST | Zurückwerfen + Überarbeitungs-Mail | `profil-admin`-Token |
| `foto-upload` | POST | Profilfoto speichern | `upload`-Token |
| `vermittler-foto` | GET | Foto ausliefern | — (öffentlich, nur Bild) |

---

## 10. Ablaufdiagramme (alle Flows)

**A — Makler füllt Profil erstmalig**
```
Mail (Einladung) → /makler-profil?token=profil
   → GET profil-info  (Token prüfen + aktiv?) → Editor vorbefüllt
   → Foto-Upload (POST foto-upload, upload-Token)
   → Speichern (POST profil-save) → Blob gespeichert, published=false
   → Phoenix-Mail „neues Profil zur Freigabe"
```

**B — Phoenix gibt frei**
```
Mail (Freigabe-Anfrage) → /makler-freigabe?token=profil-admin
   → Vorschau → „Freigeben" (POST profil-publish)
   → published=true, everApproved=true → live unter /makler/{slug}
```

**C — Phoenix wirft zurück**
```
/makler-freigabe → „Zurückwerfen" + Hinweis (POST profil-reject)
   → bleibt offline → Mail „bitte überarbeiten" (mit frischem Editor-Link) an Makler
```

**D — Makler ändert nach Freigabe**
```
/makler-profil (Editor) → Speichern → sofort live (everApproved=true)
   → Phoenix-Mail „Profil aktualisiert (bereits online)"
```

**E — Link abgelaufen (Self-Service-Erneuerung)**
```
/makler-profil ohne/mit altem Token → „Link anfordern"-Formular
   → E-Mail eingeben (POST profil-link-request)
   → nur wenn aktiver Makler: neue Einladungs-Mail mit frischem Token
```

**F — Bulk-Versand (Rollout)**
```
scripts/dashboard-mail.mjs send --yes
   → alle aktiven Makler aus CRM (paginiert)
   → je Makler: profil-Token bauen + Einladungs-Mail senden
```

---

## 11. Bulk-Versand an alle Makler (Rollout-Werkzeug)

Datei: `scripts/dashboard-mail.mjs` (ausgeführt via `npx tsx`)

Werkzeug, um allen aktiven Bestandsmaklern **einmalig** ihren persönlichen Profil-Link zu
schicken. Es verwendet exakt dieselben Bausteine wie der Einzel-Flow
(`buildProfilToken` + `sendProfilEinladung`) — also **denselben Mail-Text, keine Dublette**.

**Befehle**

| Befehl | Wirkung |
|---|---|
| `npx tsx scripts/dashboard-mail.mjs dry` | Zeigt alle Empfänger + Link-Vorschau + Gesamtzahl. **Sendet nichts.** |
| `npx tsx scripts/dashboard-mail.mjs test [email]` | Sendet **eine** Test-Mail (Default: interne Test-Adresse). |
| `npx tsx scripts/dashboard-mail.mjs send --yes` | Scharfer Versand an alle. Ohne `--yes` nur Vorschau. |

**Schutzmechanismen**

- **Probelauf zuerst** (`dry`) und Test-Mail vor dem scharfen Versand.
- **Basis-URL-Schutz:** `send` bricht ab, wenn die Linkbasis leer oder `localhost` ist —
  es werden nie kaputte Links verschickt. Muss auf die Produktiv-Domain zeigen.
- **Idempotenz-Log** (`scripts/.dashboard-mail-sent.json`, nicht eingecheckt): bereits
  versendete Makler werden übersprungen → sicheres Fortsetzen nach Abbruch, **kein
  Doppelversand**.
- **Gedrosselter Versand** (Standard 1,5 s Pause je Mail) gegen SMTP-Sendelimits.
- **Empfänger-Prüfung:** Makler ohne gültige E-Mail werden übersprungen und im
  Abschlussbericht aufgeführt.
- **Eigene CRM-Paginierung:** holt auch mehr als 100 Makler (der reguläre
  `loadVermittler`-Helfer lädt nur die erste Seite — beim Skript ist das berücksichtigt).

**Durchgeführter Rollout:** 22.06.2026 — **44 aktive Makler angeschrieben, 0 Fehler.**

---

## 12. Konfiguration (Umgebungsvariablen)

| Variable | Zweck |
|---|---|
| `TRIGGER_SECRET` | Geheimnis zur Token-Signierung (32-Byte-Hex) |
| `APP_BASE_URL` | Basis-URL für alle Links — **muss auf die Produktiv-Domain zeigen** (`https://www.phoenix-maklerverbund.de`) |
| `PW_API_BASE`, `PW_USER_SLUG`, `PW_BEARER_TOKEN`, `PW_DEFAULT_AGENCY_ID` | Anbindung an das Professional-Works-CRM |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | E-Mail-Versand (Goneo SMTP) |
| `PHOENIX_NOTIFICATION_TO` | interne Phoenix-Adresse für Freigabe-/Benachrichtigungsmails |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (Profile + Fotos); in Produktion von Vercel injiziert |

> Hinweis zur lokalen Ausführung des Bulk-Skripts: `.env` sourcen
> (`set -a; . .env; set +a`) und sicherstellen, dass `APP_BASE_URL` die Produktiv-Domain
> ist. Passwörter mit Sonderzeichen (z. B. `&`) in der `.env` in einfache Anführungszeichen
> setzen, sonst bricht das Einlesen.

---

## 13. Betrieb & Wartung

- **Test-/Hilfsskript:** `scripts/profil-test.mjs` — listet aktive Makler (`list`), baut
  Editor- + Freigabe-Links für eine uid (`link <uid>`) und räumt Test-Profile auf
  (`cleanup <uid>`).
- **Künftige Neu-Makler:** bekommen den Profil-Link automatisch über die Onboarding-Strecke
  (nach dem Foto-Upload). Alternativ erneuter Bulk-Lauf — dank Idempotenz-Log erhalten nur
  noch nicht angeschriebene Makler eine Mail.
- **Profil zurücksetzen/entfernen:** über das Test-Skript bzw. direktes Löschen des
  Blobs `makler-profile/{uid}.json`.
- **Offene Betriebsaufgabe:** Der bei Live-Tests offen ausgetauschte **PW-Bearer-Token**
  wurde am 08.09.2026 im Zuge der Rechte-Erweiterung getauscht (neu in PW erzeugen, in Vercel ersetzen, alten
  widerrufen).

---

## 14. Dateiübersicht

| Datei | Rolle |
|---|---|
| `src/pages/makler-profil.astro` | Profil-Editor (Makler) |
| `src/pages/makler/[slug].astro` | öffentliche Profilseite |
| `src/pages/makler-freigabe.astro` | Freigabe-/Moderationsseite (Phoenix) |
| `src/lib/profil.ts` | Datenmodell, Validierung, Speicher- & Moderationslogik |
| `src/lib/token.ts` | Token-Signierung & -Prüfung |
| `src/lib/mail.ts` | E-Mail-Funktionen & Templates |
| `src/lib/vermittler.ts` | CRM-Anbindung (aktive Makler, Fotos) |
| `src/pages/api/profil-*.ts` | API-Endpunkte (info, save, link-request, publish, unpublish, reject) |
| `src/pages/api/foto-upload.ts` | Foto-Upload |
| `scripts/dashboard-mail.mjs` | Bulk-Versand der Profil-Einladung |
| `scripts/profil-test.mjs` | Test-/Wartungshilfe |

---

*Erstellt am 22.06.2026 im Zuge des Rollouts der Self-Service-Profile.*

---

## 15. Nachtrag 08.09.2026 — CRM-Ablage, 14 Tage, Status-Automatik

Umgesetzt nach dem technischen Sync mit Thorsten vom 08.09.2026.

### 15.1 Was sich geändert hat

| Bereich | vorher | jetzt |
|---|---|---|
| Gültigkeit Editor-Link | 60 Tage | **14 Tage** (`PROFIL_TTL_DAYS` in `src/lib/token.ts`) |
| Editor-Zugang | nur Status 1 (aktiv) | Status 1 **und** 5 (neuer Partner) |
| Öffentliche Maklersuche | Status 1 | unverändert Status 1 |
| Profil-Link im CRM | nirgends hinterlegt | Eintrag in der **Vermittlerakte → Dokumente** |
| Neue Makler | Einladung nur über den Trigger-Link | zusätzlich täglicher **Status-Wächter** |
| PW-Zugriff | 6× dupliziertes `fetch`, ohne Timeout | zentral über `src/lib/pw.ts` |

### 15.2 PW-API: `users/files` (die „pwBenutzerDatei")

Spec: `https://api.professional.works/api/v1/openapi` · Oberfläche: `https://apimanager.professional.works/api/v1/docs`

```
POST /api/v1/{pw_user}/users/files/url
  Pflicht:  file_url, user_id
  Optional: name, document_type_id (Default 50 „Sonstiges"), upload_date
GET  /api/v1/{pw_user}/users/files?user_ids[]=…&name=…   (name ist eine Teilsuche)
```

**Die Ressource kennt nur GET und POST — kein PUT, kein DELETE** (anders als
`clients/files`, das beides hat). Ein einmal geschriebener Eintrag ist dauerhaft
und per API nicht mehr korrigierbar. Daraus folgt das gesamte Design:

- Abgelegt wird der **dauerhafte** Selbstbedienungs-Link (`kind: 'profil-request'`,
  `exp: 0`), niemals der flüchtige 14-Tage-Token.
- Der Token enthält bewusst **nur die uid** — kein Name, keine E-Mail, kein
  Ablaufdatum. Dadurch ist er deterministisch: derselbe Makler ergibt immer
  dieselbe URL, ein wiederholter Lauf kann keine abweichende Dublette erzeugen.
- Vor jedem Schreiben wird der Bestand geprüft. Ist er **nicht lesbar**, wird
  **nicht geschrieben**.

Benötigte Token-Rechte: `user-file:viewAny`, `user-file:view`, `user-file:create`.
Fehlen sie, antwortet PW mit `403 {"context":{"abilities":[…]}}`; `src/lib/pw.ts`
reicht diese Namen bis ins Log durch.

### 15.3 Der dauerhafte Selbstbedienungs-Link

Im CRM steht pro Makler ein Eintrag `Profil-Link (Selbstbedienung)` mit der URL
`{APP_BASE_URL}/makler-profil?m=<Token>`.

Wer ihn öffnet, sieht die maskierte Zieladresse und einen Knopf „Neuen Link
senden". Erst der Klick löst den Versand aus (kein Versand per GET, damit
Mail-Scanner und Linkvorschauen nichts auslösen). **Empfänger ist immer die im
CRM hinterlegte Adresse**, die serverseitig über die uid aufgelöst wird — nie
etwas aus der URL. Der Link kann deshalb, auch in fremden Händen, nur eine Mail
an den Makler selbst erzeugen.

Endpunkt: `src/pages/api/profil-link-resend.ts` (`GET` = Anzeige, `POST` = Versand,
Rate-Limit 5 / 10 min / IP).

### 15.4 Status-Wächter

`src/pages/api/cron/makler-status.ts`, täglich 07:00 über `vercel.json` → `crons`.
Zustand in Vercel Blob unter `makler-status/state.json` (`src/lib/makler-state.ts`).

Modi über `?mode=` bzw. `MAKLER_WATCH_MODE`:

| Modus | Wirkung |
|---|---|
| `seed` | schreibt nur den Ist-Zustand fest, versendet nichts — **der erste Lauf** |
| `dry` | berichtet, was passieren würde; schreibt nichts, sendet nichts |
| `live` | versendet Einladungen bei Statuswechsel |

Ausgelöst wird beim Eintritt in Status **1 oder 5**. Ein späterer Wechsel 5 → 1
löst keinen zweiten Versand aus (`linkSentAt` im Zustand).

**Sicherungen — jede davon ist getestet:**

1. **Autorisierung** über `CRON_SECRET` (Vercel-Cron sendet ihn als Bearer-Token); ohne → 401.
2. **Erstsichtung ist keine Aktivierung.** Ein Makler, der im Zustand fehlt, wird
   nur festgehalten. Ein Zustandsverlust kann keinen Massenversand auslösen.
3. **Obergrenze 10 Einladungen pro Lauf.** Darüber wird nichts versendet, sondern gewarnt.
4. **Leere CRM-Antwort** (= CRM nicht erreichbar) bricht mit 503 ab, ohne den Zustand zu überschreiben.
5. **Veralteter Zustand** wird erkannt und der Lauf übersprungen — siehe 15.5.
6. **Versandsperre bei unbrauchbarer Basis-URL** — siehe 15.6.

### 15.5 Fallstrick: Vercel Blob cached einen Monat

`put()` setzt ohne Zutun `cacheControlMaxAge` auf **einen Monat**. Für einen
Zustandsspeicher ist das gefährlich: Ein veralteter Stand lässt bereits versorgte
Makler erneut als „neu aktiviert" erscheinen und löst einen zweiten Versand aus.

Gegenmaßnahmen in `src/lib/makler-state.ts`:
- `cacheControlMaxAge: 60` (das erlaubte Minimum) beim Schreiben.
- Beim Lesen wird der `updatedAt` im Inhalt gegen `uploadedAt` der Ablage geprüft.
  Weicht es ab, wird bis zu 3× erneut gelesen; bleibt es alt, kommt `stale: true`
  zurück, der Cron-Lauf bricht mit 503 ab und `saveState()` verweigert das Schreiben.

Außerdem: **Private Blobs sind über ihre URL nicht per `fetch` lesbar**, nur über
`get(url, { access: 'private' })` — dasselbe Muster wie in `src/lib/profil.ts`.

### 15.6 Versandsperre

`issueProfilLink()` in `src/lib/profil-link.ts` verschickt **keine** Einladung,
wenn `APP_BASE_URL` leer ist oder auf `localhost` zeigt, und protokolliert das.
Grund: Solche Links sind beim Empfänger wertlos. Dieselbe Sperre gilt im
Sync-Skript, dort zusätzlich, weil ein `localhost`-Eintrag im CRM dauerhaft wäre.

### 15.7 Bestands-Durchlauf

`scripts/profil-crm-sync.mjs` — trägt den Link für alle Bestandsmakler ein,
**ohne Mailversand**.

```
npx tsx scripts/profil-crm-sync.mjs dry                 # zeigt alles, schreibt nichts
npx tsx scripts/profil-crm-sync.mjs probe --uid 27417   # legt GENAU EINEN Eintrag an
npx tsx scripts/profil-crm-sync.mjs sync --yes          # legt fehlende Einträge an
      zusätzlich: --only 27417,27419   --limit 5
```

Abbruch bei: leerer/`localhost`-Basis-URL, `PW_LINK_FILE_ENABLED != 1`,
nicht lesbarem Bestand, fehlendem `--yes`. Protokoll: `scripts/.profil-crm-sync.json`.

Reihenfolge für den Rollout: Rechte prüfen → `PW_LINK_FILE_ENABLED=1` in Vercel →
deployen → `probe` gegen einen Test-Makler → **Thorsten kontrolliert im PW-UI** →
`sync --only <2-3 uids>` → Freigabe → `sync --yes`.

### 15.8 Neue Umgebungsvariablen

| Variable | Zweck |
|---|---|
| `PW_LINK_FILE_ENABLED` | `1` schaltet den CRM-Schreibpfad frei (Default `0`) |
| `PW_LINK_DOCUMENT_TYPE_ID` | Dokumententyp des Eintrags (Default `50` = „Sonstiges") |
| `CRON_SECRET` | schützt `/api/cron/makler-status` |
| `MAKLER_WATCH_MODE` | `seed` (erster Lauf) oder `live` |

### 15.9 Offene Punkte

- **Mehrere Makler teilen sich `info@pmv.gmbh`** (u. a. Samet Genc, Ali-Eren Seker,
  Marko Milanovic). `profil-link-request` findet per `.find()` nur den **ersten**
  Treffer — diese Makler können sich über das Formular keinen eigenen Link holen.
  Über den dauerhaften CRM-Link funktioniert es, weil dort die uid im Token steht.
- **Test-Makler uid 50663** („RS vom Phönix Maklerverbund") ist im CRM weiterhin aktiv.
- Systemkonten sind in `SYSTEM_ACCOUNT_UIDS` (`src/lib/vermittler.ts`) benannt:
  10278 (Firmen-Sammelkonto), 33774 (Vertriebspartnerabrechnung), 62159 (Superbrand).
  Bewusst eine Liste statt eines Rollen-Filters — `role.id === 1` würde auch echte
  Personen ausschließen (Innendienst/Hauptvermittler sind teils reguläre Makler).

---

## 16. Nachtrag 09.09.2026 — Dashboard-Ausbau und Sichtbarkeitssteuerung

Aus dem Webcall mit Thorsten vom 09.09.2026.

### 16.1 Die Veröffentlichung hängt nicht mehr am CRM-Status

**Vorher:** Wer in der Maklersuche erschien, entschied allein der PW-Status (nur „aktiv").
**Jetzt:** Ein Kennzeichen im internen Dashboard (`src/lib/makler-flags.ts`,
Blob-Datei `makler-flags/state.json`).

Anlass: Phoenix führt Makler unter „passiv", die arbeiten, aber anonym bleiben müssen.
Künftig soll im CRM nur noch zwischen aktiv und storniert unterschieden werden.

**Zwei getrennte Schalter:**

| Schalter | Gespeichert in | Wirkt auf |
|---|---|---|
| In der Maklersuche zeigen | `makler-flags` (neu) | Karte in `/makler-suche`, Voraussetzung für alles Öffentliche |
| Profilseite öffentlich | `profil.published` | `/makler/{slug}`, Sitemap, Profil-Link in der Suche |

**Ein Makler ohne Kennzeichen gilt als NICHT sichtbar.** Dadurch macht eine
Statusänderung im CRM niemanden versehentlich öffentlich — aber ein neu angelegter
Makler erscheint auch nicht mehr automatisch, sondern erst nach einem Klick im Dashboard.

**Fünf öffentliche Ausgabewege** mussten den Filter bekommen — die letzten beiden werden
leicht übersehen:
`makler-suche.astro` · `makler/[slug].astro` · `sitemap.xml.ts` ·
**`api/vermittler-search.ts`** (gibt ohne Anmeldung Maklernamen aus, speist die
„Empfohlen von"-Liste) · **`api/vermittler-foto.ts`** (liefert Fotos allein anhand der uid).
Beim Foto-Endpunkt dürfen angemeldete Teammitglieder auch unsichtbare Fotos sehen — sonst
wäre die Vorschau vor der Freigabe leer. In dem Fall wird `private, no-store` gesendet,
damit das Bild nicht im geteilten CDN landet.

**Migration:** `npx tsx scripts/sichtbarkeit-seed.mjs dry|seed` setzte die damals aktiven
Makler auf sichtbar, alle übrigen auf unsichtbar — die Webseite sah danach aus wie vorher.
Das Skript bricht ab, wenn bereits Kennzeichen gesetzt sind (`--force` überschreibt).
Nebeneffekt der Migration: Die Systemkonten „Superbrand" und „Phönix-Maklerverbund"
standen bis dahin als Makler in der öffentlichen Suche und sind jetzt draußen.

### 16.2 Dashboard-Erweiterungen

Je Zeile: Profil-Ampel (kein Profil / unvollständig / wartet auf Freigabe / offline
genommen / online), Foto vorhanden, Sichtbarkeit — dazu Knöpfe für Senden, WhatsApp,
Link kopieren, Vorschau, Freigeben bzw. vom Netz nehmen und Sichtbarkeit umschalten.

Geführt werden jetzt Status **1, 2 und 5**; `loadEditorBerechtigte()` wurde entsprechend
erweitert, damit auch passive Makler ihr Profil pflegen können.

**Vorschau** unter `/intern/vorschau/{uid}` rendert dieselbe Komponente wie die
öffentliche Seite (`MaklerProfilContent`), ohne Token und ohne JSON-LD.

**Freigeben/Depublizieren** über `/api/intern/profil-status` statt über die bestehenden
`profil-publish`/`profil-unpublish`: Jene verlangen einen signierten `profil-admin`-Token,
den man je Zeile ins HTML legen müsste — rund 94 Moderations-Zugänge auf einer Seite.
`/makler-freigabe` bleibt unverändert nutzbar.

**WhatsApp:** `src/lib/telefon.ts` normalisiert die Mobilnummer
(`communication.phone_mobile`) auf die internationale Form. Der Knopf öffnet
`whatsapp://send?…` — nur dieses Protokoll führt direkt in die Desktop-Anwendung;
`wa.me` geht immer über den Browser. Ist das Protokoll nicht registriert, passiert nichts,
deshalb der Hinweis auf `web.whatsapp.com` unter der Liste. Versendet wird der dauerhafte
Selbstbedienungs-Link, nicht der 14-Tage-Editor-Link.

### 16.3 Behobene Fehler

- **Suche im Dashboard filterte nicht.** Die Zeilen wurden über `hidden` versteckt, aber
  `.iv-row` hat `display: flex`, was `[hidden] { display: none }` überschreibt. Der Zähler
  sprang korrekt, die Zeilen blieben stehen. Jetzt `style.display` wie in `makler-suche.astro`.
- **Freigabe wirkte verzögert.** `writeProfil()` leerte nur den Cache; der folgende
  Lesevorgang holte wegen der Blob-CDN-Verzögerung den **alten** Stand und cachte ihn fünf
  Minuten. Jetzt wird der geschriebene Stand durchgeschrieben. Betraf auch die bestehende
  Freigabe über `/makler-freigabe`.
- **„Erstfreigabe ausstehend" nach dem Offline-Nehmen.** `setPublished(false)` setzt
  `everApproved` zurück; ein einmal freigegebenes Profil ist danach nur an `freigegebenAm`
  zu erkennen. Die Anzeige prüft das jetzt mit.
- **Sitemap** listete Profile nicht mehr sichtbarer Makler, deren URL 404 lieferte.

### 16.4 Zu beachten

- **Der Team-Zugang läuft über die E-Mail-Adresse** (`TEAM_ALLOWLIST`), nicht über die
  CRM-ID. Ändert ein Teammitglied seine Adresse, muss die Liste angepasst werden, sonst
  sperrt es sich aus.
- **Änderungen brauchen bis zu ~60 Sekunden**, um auf allen Serverless-Instanzen
  anzukommen — Vercel Blob liefert nach einem Überschreiben kurz die alte Fassung aus. Auf
  der bedienenden Instanz wirkt eine Änderung sofort.
- Die 141 **stornierten** Makler sind bewusst nicht im Dashboard. Thorsten hatte im Call
  erwähnt, dass auch dort Fälle für eine Veröffentlichung denkbar wären — wäre ein Filter
  „auch ehemalige zeigen" im Dashboard.
