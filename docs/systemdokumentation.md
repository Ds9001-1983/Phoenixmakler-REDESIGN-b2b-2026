# Makler-Profile und internes Dashboard — Systemdokumentation

**Projekt:** Phönix Maklerverbund — Website-Redesign 2026
**Stand:** 09.09.2026
**Erstellt von:** SUPERBRAND.marketing für die Phönix Maklerverbund GmbH
**Quelle:** `docs/systemdokumentation.md` im Projekt-Repository; das PDF entsteht daraus
mit `scripts/doku-pdf.py`.

Wo eine Lösung ungewöhnlich aussieht, steht die Begründung daneben. Das ist Absicht: Fast
jeder Umweg in diesem System hat einen konkreten Anlass, und ohne die Begründung wird er
bei der nächsten Überarbeitung „vereinfachend" wieder ausgebaut.

---

## Inhalt

**Teil I — Das System verstehen**
1. Wozu es dient
2. Das Kernkonzept
3. Architektur
4. Die vier Oberflächen

**Teil II — Wer ist öffentlich sichtbar**
5. Zwei Schalter statt CRM-Status
6. Alle Ausgabewege und ihre Bedingungen

**Teil III — Zugang**
7. Der Makler-Zugang (Magic Link)
8. Der Team-Zugang
9. Was das System bewusst nicht tut

**Teil IV — Daten**
10. Datenmodell
11. Speicherorte und Caches
12. Die Vercel-Blob-Eigenheit

**Teil V — Abläufe**
13. Vom Bewerber zum veröffentlichten Profil
14. Profil pflegen und freigeben
15. Link verloren
16. Der Status-Wächter

**Teil VI — CRM-Anbindung**
17. Was gelesen und was geschrieben wird
18. Was im CRM nicht geht — und warum

**Teil VII — Betrieb**
19. Umgebungsvariablen
20. E-Mails
21. Deployment und Prüfschritte
22. Bekannte Einschränkungen

---
---

# Teil I — Das System verstehen

## 1. Wozu es dient

Jeder Makler des Phönix-Maklerverbunds soll seine öffentliche Profilseite selbst pflegen
können — ohne Benutzername und Passwort, ohne Redaktionsaufwand auf Phoenix-Seite und ohne
dass das CRM angefasst wird. Gleichzeitig behält Phoenix die Kontrolle darüber, was
veröffentlicht wird.

Drei Gruppen arbeiten mit dem System:

| Wer | Was er tut | Wo |
|---|---|---|
| **Makler** | Profil ausfüllen, Foto hochladen, ändern | `/makler-profil` |
| **Phoenix-Team** | Links verteilen, Profile prüfen, freigeben, Sichtbarkeit steuern | `/intern` |
| **Besucher** | Makler suchen, Profile ansehen | `/makler-suche`, `/makler/{name}` |

## 2. Das Kernkonzept

> Das **CRM (Professional.Works)** bleibt die alleinige Quelle für Identität und Kontakt
> der Makler. Die **Profilinhalte** liegen als eigene Schicht daneben. Wer **öffentlich
> erscheint**, entscheidet das interne Dashboard — nicht mehr der CRM-Status.

Der letzte Halbsatz ist der Kern des Ganzen. Phoenix führt Makler unter dem Status
„passiv", die tatsächlich arbeiten, aber nach außen anonym bleiben müssen, weil sie
hauptberuflich woanders tätig sind. Hinge die Veröffentlichung am Status, ließe sich beides
nicht trennen.

## 3. Architektur

| Baustein | Technik |
|---|---|
| Framework | Astro 4 (hybrid: statische Seiten plus Serverless-Functions) |
| Hosting | Vercel |
| Datenspeicher | Vercel Blob (privat) |
| Stammdaten | Professional-Works-CRM über REST-API |
| E-Mail | Nodemailer über SMTP (Goneo) |
| Zugangs-Token | HMAC-SHA256, serverseitig signiert |

**Datenfluss**

```
Professional.Works CRM ──► Identität, Status, Name, E-Mail, Telefon
        │
        ▼
   Vermittler-Liste ──────────────────┐
        │                             │
        ▼                             ▼
  /makler-profil (Editor)      /intern (Dashboard)
        │                             │
        │ speichert                   │ steuert
        ▼                             ▼
  Vercel Blob                   Sichtbarkeits-Kennzeichen
  makler-profile/{uid}.json     makler-flags/state.json
        │                             │
        └──────────┬──────────────────┘
                   ▼
        Öffentliche Ausgabe
        /makler-suche, /makler/{slug}, sitemap.xml
```

Es gibt bewusst **keine Datenbank**. Bei rund hundert Maklern und einer Handvoll Profilen
wäre der Betriebsaufwand größer als der Nutzen. Die Konsequenzen dieser Entscheidung stehen
in Kapitel 12 — sie sind real und man muss sie kennen.

## 4. Die vier Oberflächen

### 4.1 Profil-Editor — `/makler-profil`

Die persönliche Bearbeitungsseite des Maklers. Sie hat fünf Zustände, die clientseitig
umgeschaltet werden:

| Zustand | Wann |
|---|---|
| `loading` | beim Aufruf |
| `editor` | Token gültig und Makler zugangsberechtigt |
| `request` | kein oder abgelaufener Token → E-Mail-Formular für einen neuen Link |
| `resend` | Aufruf über den dauerhaften Link (`?m=…`) → Knopf „Neuen Link senden" |
| `error` | Serverfehler |

Bearbeitbar sind Profilfoto, Überschrift, Biografie, Schwerpunkte, Qualifikationen,
Bürozeiten, eine optionale Spezialisierung und abweichende Kontaktdaten. Ein Statusbanner
zeigt dem Makler jederzeit, ob sein Profil online ist, offline ist oder auf die Freigabe
wartet.

### 4.2 Öffentliche Profilseite — `/makler/{slug}`

Sichtbar nur, wenn das Profil freigegeben **und** der Makler im Dashboard auf sichtbar
gestellt ist — sonst 404. Enthält strukturierte Daten (JSON-LD) für Suchmaschinen und wird
eine Stunde im CDN gehalten.

### 4.3 Freigabe-Seite — `/makler-freigabe?token=…`

Erreichbar ausschließlich über einen signierten Link, der per E-Mail an die interne
Phoenix-Adresse geht. Zeigt das eingereichte Profil in der Vorschau und erlaubt Freigeben,
Zurückwerfen mit Hinweistext und Offline-Nehmen.

### 4.4 Internes Dashboard — `/intern`

Anmeldung per Magic Link an eine feste Team-Liste. Zeigt alle geführten Makler mit
Suchfeld und je Zeile:

- **Status** — Profil-Ampel, ob ein Foto vorliegt, ob er öffentlich ist
- **Senden** — verschickt die Einladung an die im CRM hinterlegte Adresse
- **WhatsApp** — schickt den dauerhaften Link per WhatsApp (nur bei hinterlegter Mobilnummer)
- **Link kopieren** — legt den dauerhaften Link in die Zwischenablage
- **Vorschau** — zeigt das Profil so, wie es öffentlich aussähe
- **Freigeben / Vom Netz nehmen**
- **In die Suche / Aus der Suche**

---
---

# Teil II — Wer ist öffentlich sichtbar

## 5. Zwei Schalter statt CRM-Status

Die Veröffentlichung wird über **zwei voneinander unabhängige Schalter** gesteuert:

| Schalter | Gespeichert in | Wirkt auf |
|---|---|---|
| **In der Maklersuche zeigen** | `makler-flags/state.json` | ob der Makler überhaupt öffentlich auftaucht |
| **Profilseite öffentlich** | `published` im Profil | ob die Detailseite erreichbar ist |

Der erste Schalter ist die Voraussetzung für alles Öffentliche. Steht er auf „nein",
existiert der Makler nach außen nicht — weder als Karte in der Suche, noch als Profilseite,
noch in der Sitemap, noch in der Empfehlungsliste des Bewerbungsformulars, noch über den
Foto-Endpunkt.

**Warum zwei Schalter und nicht einer:** Beide Fragen sind unabhängig voneinander. Ein
Makler kann in der Suche stehen, ohne je ein Profil ausgefüllt zu haben — das ist der
Normalfall, denn von rund hundert Maklern haben bisher sechs ein Profil. Umgekehrt kann ein
fertiges Profil geprüft und freigegeben sein, während der Makler nach außen noch nicht
auftreten soll.

**Warum das Kennzeichen nicht im Profil liegt:** Die allermeisten Makler haben gar keinen
Profildatensatz. Ein Kennzeichen im Profil-JSON hätte für sie keinen Speicherort.

**Warum eine eigene Datei und nicht die des Status-Wächters:** Jene Datei schreibt der
tägliche Cron-Lauf. Ein Schalter, den jemand im Dashboard umlegt, darf nicht von einem
Automatismus überschrieben werden können.

**Die Voreinstellung ist „nicht sichtbar".** Ein Makler ohne Kennzeichen erscheint nicht.
Das ist die sichere Richtung: Eine Statusänderung im CRM kann niemanden versehentlich
öffentlich machen. Die Kehrseite: Ein neu angelegter Makler erscheint **nicht automatisch**
in der Maklersuche, sondern erst nach einem Klick im Dashboard.

## 6. Alle Ausgabewege und ihre Bedingungen

Es gibt **fünf** Stellen, an denen Makler-Daten nach außen gehen. Zwei davon werden leicht
übersehen — wer den Sichtbarkeitsfilter dort vergisst, macht den ganzen Mechanismus wirkungslos.

| Ausgabeweg | Bedingung |
|---|---|
| `/makler-suche` | Schalter „in der Suche" |
| `/makler/{slug}` | Schalter **und** Profil freigegeben |
| `/sitemap.xml` | Schalter **und** Profil freigegeben |
| `/api/vermittler-search` | Schalter |
| `/api/vermittler-foto` | Schalter **oder** angemeldetes Teammitglied |

**`/api/vermittler-search`** ist ohne Anmeldung erreichbar und liefert Maklernamen aus; er
speist die Auswahlliste „Empfohlen von" im Bewerbungsformular. Ohne Filter stünden hier
genau die Makler namentlich, die anonym bleiben sollen.

**`/api/vermittler-foto`** liefert Profilfotos allein anhand der Vermittlernummer. Ohne
Filter wäre ein anonymer Makler „unsichtbar, außer man rät eine Zahl". Angemeldete
Teammitglieder dürfen auch nicht-öffentliche Fotos sehen, weil die Vorschau sonst leer
wäre — in diesem Fall wird die Antwort ausdrücklich als privat markiert, damit das Bild
nicht im gemeinsamen CDN landet und anschließend an jeden ausgeliefert wird.

---
---

# Teil III — Zugang

## 7. Der Makler-Zugang (Magic Link)

Statt Passwörtern nutzt das System **signierte Links**. Ein Token besteht aus einer
base64-kodierten Nutzlast und einer HMAC-SHA256-Signatur; Manipulation wird beim Vergleich
erkannt, der zeitunabhängig erfolgt.

| Token-Art | Zweck | Gültigkeit |
|---|---|---|
| `trigger` | Onboarding anstoßen | 14 Tage |
| `upload` | Foto-Upload | 30 Tage |
| `profil` | Editor-Zugang | **14 Tage** |
| `profil-request` | dauerhafter Selbstbedienungs-Link | **unbegrenzt** |
| `profil-admin` | Freigabe/Moderation | 30 Tage |
| `team-login` | Anmeldung am Dashboard | **10 Minuten** |
| `team-session` | Team-Sitzung (Cookie) | 30 Tage, gleitend |

**Warum der Editor-Link nur 14 Tage gilt:** Weil sich jeder Makler jederzeit selbst einen
neuen holen kann, ist eine lange Laufzeit unnötiges Risiko.

**Der dauerhafte Link (`profil-request`)** ist der Gegenentwurf: Er läuft nie ab, gewährt
aber **selbst keinen Zugang**. Wer ihn öffnet, sieht nur die maskierte Zieladresse und
einen Knopf; erst der Klick verschickt einen frischen 14-Tage-Link an die **im CRM
hinterlegte** Adresse. Seine Nutzlast enthält bewusst nur die Vermittlernummer, kein
Ablaufdatum und keine Adresse — dadurch ergibt derselbe Makler immer denselben Link, und
Name und Adresse sind stets aktuell.

**Doppelte Zugangsprüfung:** Ein gültiger Token allein genügt nie. Die Vermittlernummer muss
zusätzlich in der aktuellen Zugangsliste stehen. Wer aus dem Verbund ausscheidet, verliert
den Zugang sofort — auch mit einem noch gültigen Link.

**Zugangsberechtigt** sind Makler mit den CRM-Status *aktiv*, *passiv* und *neuer Partner*.
Bewusst weiter gefasst als die öffentliche Sichtbarkeit: Ein passiver Makler arbeitet und
darf sein Profil pflegen, auch wenn er nicht öffentlich erscheint.

## 8. Der Team-Zugang

Das Dashboard hat keine Passwörter. Wer sich anmelden will, gibt seine dienstliche Adresse
ein und bekommt einen Anmeldelink; danach bleibt er 30 Tage angemeldet, mit gleitender
Verlängerung nach sieben Tagen und einer harten Obergrenze von 180 Tagen.

**Der Anmeldelink setzt beim Aufruf kein Cookie.** Er zeigt eine Bestätigungsseite mit
einem Knopf, der die Anmeldung per POST einlöst. Das ist keine Umständlichkeit, sondern
notwendig: Sicherheits-Gateways und Linkvorschauen von Mail-Anbietern rufen Links vorab
auf. Bei einem Einmal-Link wäre er dadurch verbraucht, bevor der Empfänger ihn sieht — ein
Fehler, den man aus der Ferne nicht nachvollziehen kann.

**Die Sitzung ist zustandslos.** Es gibt keinen Sitzungsspeicher, weil auf Vercel mehrere
Instanzen parallel laufen. Stattdessen ein signiertes Cookie mit den Merkmalen `HttpOnly`,
`Secure`, `SameSite=Lax` und `Path=/`.

`SameSite=Lax` ist bewusst gewählt: Bei `Strict` würde der Browser das Cookie
unterschlagen, wenn jemand den Link aus Outlook oder WhatsApp öffnet — er sähe den
Anmeldebildschirm, obwohl er angemeldet ist. Als Nebeneffekt schickt `Lax` bei
fremdseitigen POST-Anfragen kein Cookie mit und erledigt damit den größten Teil des
CSRF-Schutzes; ergänzend prüfen alle schreibenden Endpunkte den Absender.

**Zugang entziehen** geht auf zwei Wegen, ohne Sperrliste:

| Fall | Mittel | Wirkung |
|---|---|---|
| Person verlässt das Team | Adresse aus `TEAM_ALLOWLIST` entfernen | nur diese Person, ab dem nächsten Aufruf |
| Verdacht auf Missbrauch | `TEAM_SECRET` ändern | alle sofort |

Damit das funktioniert, wird bei **jeder** Anfrage zusätzlich zur Signatur geprüft, ob die
Adresse noch auf der Liste steht. Das Cookie allein trägt nicht.

**Wichtig:** Der Team-Zugang läuft über die **E-Mail-Adresse**, nicht über die
CRM-Vermittlernummer. Ändert ein Teammitglied seine Adresse, muss die Liste angepasst
werden — sonst sperrt es sich aus.

**Warum ein eigenes `TEAM_SECRET`:** Das allgemeine Signaturgeheimnis signiert die
dauerhaften Makler-Links, die in fremden Postfächern liegen. Wären beide identisch, hieße
ein einziges Leck: alle Makler-Links **und** voller Team-Zugang.

**Dreifacher Schutz gegen versehentliche Veröffentlichung.** Astro backt Seiten ohne die
Kennzeichnung `prerender = false` zur Bauzeit als statische Dateien ins CDN — die
Maklerliste läge dann öffentlich im Netz. Der Entwicklungsserver verbirgt das, weil er auch
statische Seiten bei jedem Aufruf ausführt. Deshalb sichern drei Ebenen gleichzeitig:
eine Middleware, eine eigene Prüfung im Kopf jeder internen Seite, und Kopfzeilen in der
Vercel-Konfiguration. Vor jedem Deploy gehört geprüft, dass unter `.vercel/output/static/`
kein `intern`-Verzeichnis entstanden ist.

## 9. Was das System bewusst nicht tut

- **Kein Passwort für Makler.** Der Verzicht war die Ausgangsanforderung: Passwörter für
  hundert Makler zu verwalten, kostet mehr, als es einbringt.
- **Kein Versand per GET.** Zustandsändernde Aktionen laufen ausschließlich über POST,
  damit Vorschau-Abrufe und Scanner nichts auslösen.
- **Keine E-Mail-Adresse aus der Anfrage.** Empfänger werden immer frisch aus dem CRM über
  die Vermittlernummer aufgelöst. Käme die Adresse aus dem Aufruf, wäre das System ein
  Versandwerkzeug für beliebige Empfänger über unsere Absender-Reputation. *Eine einzige
  Ausnahme:* Wird ein Profil zurückgeworfen und der Makler ist im CRM nicht mehr auffindbar,
  greift ersatzweise die Adresse aus dem signierten Moderations-Token — damit die Begründung
  ihn noch erreicht. Sie stammt auch dort nicht aus dem Aufruf, sondern aus einer von uns
  selbst signierten Nutzlast.
- **Keine Zugangslinks in der Zwischenablage oder im Quelltext.** Kopiert und per WhatsApp
  verschickt wird immer der dauerhafte Link, nie der 14-Tage-Editor-Link.

---
---

# Teil IV — Daten

## 10. Datenmodell

Ein JSON-Dokument je Makler unter `makler-profile/{uid}.json`.

| Feld | Bedeutung |
|---|---|
| `v` | Schema-Version |
| `uid` | Vermittlernummer aus dem CRM |
| `slug` | sprechende URL, kollisionsfrei |
| `published` | aktuell öffentlich sichtbar? |
| `everApproved` | jemals freigegeben? |
| `eingereichtAm` | erstes Speichern |
| `freigegebenAm` | letzte Freigabe |
| `aktualisiertAm` | letzte Änderung |
| `headline`, `bio` | Überschrift und Biografie |
| `skills[]`, `qualifikationen[]` | Listen |
| `buerozeiten[]` | je Wochentag von/bis |
| `fokus` | optionale Spezialisierung |
| `kontakt` | abweichende Kontaktdaten; leere Felder fallen auf das CRM zurück |

**Validierungsgrenzen**, serverseitig erzwungen:

| Feld | Grenze |
|---|---|
| Überschrift | 80 Zeichen |
| Biografie | 1.500 Zeichen |
| Schwerpunkte | max. 12 × je 200 Zeichen |
| Qualifikationen | max. 12 × je 220 Zeichen |
| Bürozeiten | max. 7 Einträge, Format `HH:MM`, von < bis |
| Spezialisierung | 60 Zeichen |
| Telefon / E-Mail / Website | 40 / 120 / 200 Zeichen |

Client-Eingaben werden grundsätzlich nicht vertraut. Dabei wird zweierlei unterschieden:

- **Der ganze Speichervorgang wird abgelehnt** (HTTP 422, mit Meldung im Editor), wenn
  Überschrift oder Biografie fehlen, wenn die Spezialisierung eingeschaltet ist, aber kein
  Text darin steht, oder wenn E-Mail-Adresse bzw. Website nicht lesbar sind.
- **Still bereinigt** werden Listen, Bürozeiten, Telefonnummern und alle Längen — hier
  kürzt oder verwirft der Server ohne Meldung. Der Editor zeigt eine Zeichenzahl nur bei
  Überschrift, Biografie, Schwerpunkten und Qualifikationen; bei Spezialisierung, Telefon,
  E-Mail und Website gibt es keine Anzeige, sondern nur die stille Kürzung.

Websites ohne Protokoll werden automatisch ergänzt.

**Slug-Bildung:** Umlaute werden transliteriert (ä→ae, ö→oe, ü→ue, ß→ss), der Rest
normalisiert. Kollisionen mit fremden Profilen werden durch Anhängen von `-2`, `-3`
aufgelöst. Ein einmal vergebener Slug bleibt für den Makler stabil.

## 11. Speicherorte und Caches

| Inhalt | Ort | Cache |
|---|---|---|
| Profile | `makler-profile/{uid}.json` | 5 Minuten |
| Profilfotos | `vermittler/{uid}.{ext}` | 5 Minuten (nur die Liste) |
| Sichtbarkeits-Kennzeichen | `makler-flags/state.json` | 60 Sekunden |
| Zustand des Status-Wächters | `makler-status/state.json` | kein Cache |
| Vermittler-Listen aus dem CRM | — | 1 Stunde |

Alle Blob-Speicher sind **privat**. Fotos und Profile werden ausschließlich über eigene,
kontrollierte Endpunkte ausgeliefert. Die Caches liegen im Arbeitsspeicher der jeweiligen
Serverless-Instanz — sie sind eine Beschleunigung, kein verlässlicher gemeinsamer Zustand.

**Welcher Cache beim Umlegen eines Schalters wirklich zählt:** nicht die 60 Sekunden der
Kennzeichen-Datei, sondern die **eine Stunde** der Vermittler-Listen — denn dort ist der
Filter bereits angewandt, das Ergebnis also mitgespeichert. Damit ein Klick trotzdem sofort
wirkt, leert der Sichtbarkeits-Endpunkt diese Listen ausdrücklich mit. Wer den Schalter an
anderer Stelle im Code umlegt, muss das mittun, sonst bleibt die Änderung bis zu eine
Stunde unsichtbar.

## 12. Die Vercel-Blob-Eigenheit

**Das ist der wichtigste Fallstrick des ganzen Systems.** Wer hier etwas ändert, sollte
diesen Abschnitt gelesen haben.

Vercel Blob liefert eine Datei nach dem Überschreiben **für kurze Zeit weiterhin in der
alten Fassung** aus, und speichert sie ohne Zutun einen Monat lang zwischen. Für einen
Zustandsspeicher ist beides gefährlich.

Ohne Gegenmaßnahme führt das zu zwei Fehlerbildern, die beide nicht wie Fehler aussehen:
Der Status-Wächter hält bereits versorgte Makler erneut für „neu aktiviert" und verschickt
doppelt — und eine Freigabe scheint wirkungslos, weil direkt nach dem Schreiben der alte
Stand gelesen und dann minutenlang zwischengespeichert wird.

**Drei Gegenmaßnahmen, angewandt auf alle drei Zustandsdateien** (Profile,
Sichtbarkeits-Kennzeichen, Zustand des Status-Wächters):

1. **Die Zwischenspeicherung wird auf 60 Sekunden begrenzt** — das erlaubte Minimum.
2. **Nach dem Schreiben wird der geschriebene Stand durchgeschrieben**, statt den Cache nur
   zu leeren. Die schreibende Instanz arbeitet danach sofort mit dem richtigen Stand.
3. **Veraltete Stände werden erkannt.** Beim Lesen wird der Zeitstempel im Inhalt gegen den
   der Ablage geprüft; weichen sie ab, wird bis zu dreimal gelesen, mit je 1,5 Sekunden
   Pause dazwischen. Bleibt es dabei, meldet das System den Stand als veraltet — der
   Status-Wächter überspringt den Lauf dann vollständig, statt auf falscher Grundlage zu
   handeln. Bei den Kennzeichen wird stattdessen mit dem veralteten Stand weitergearbeitet
   und das protokolliert; ein Schreibversuch bricht in dem Fall mit einer Meldung ab.

**Profilfotos sind ausgenommen.** Sie werden ohne die 60-Sekunden-Begrenzung abgelegt und
deshalb einen Monat zwischengespeichert. Das ist gewollt — Fotos ändern sich selten. Damit
ein Austausch trotzdem sofort greift, löscht der Upload zuerst alle vorhandenen Dateien des
Maklers und legt die neue danach unter einem Pfad ab, der sich aus der Vermittlernummer
und der Dateiendung ergibt.

**Was bleibt:** Eine Änderung wirkt auf der bedienenden Instanz sofort, auf anderen
Instanzen mit bis zu etwa einer Minute Verzögerung. Für die tägliche Arbeit ist das
unerheblich; wer eine Änderung sofort auf einem anderen Gerät prüfen will, sollte es wissen.

---
---

# Teil V — Abläufe

## 13. Vom Bewerber zum veröffentlichten Profil

```
1  Bewerber füllt /makler-werden aus
       ↓
2  Im CRM entstehen: Vermittler (Status storniert) + Kunde + Notiz "Lead-Herkunft"
       ↓
3  E-Mail an Phoenix mit einem Trigger-Link
       ↓
4  Phoenix prüft, setzt den Status auf aktiv und klickt den Trigger-Link
       ↓
5  Der Makler bekommt: Foto-Upload-Link und Profil-Einladung
       ↓
6  Er füllt sein Profil aus und speichert  →  wartet auf Freigabe
       ↓
7  Phoenix gibt frei (Freigabe-Seite oder Dashboard)
       ↓
8  Phoenix stellt ihn im Dashboard auf sichtbar
       ↓
9  Profil ist unter /makler/{name} öffentlich
```

**Reihenfolge in Schritt 4 beachten:** erst den Status setzen, dann den Trigger klicken. Ein
Makler, der noch auf „storniert" steht, ist nicht zugangsberechtigt — der Foto-Upload würde
funktionieren, der Profil-Link aber ins Leere laufen.

**Schritt 8 lässt sich nicht überspringen.** Er ist der Preis dafür, dass die
Veröffentlichung unabhängig vom CRM-Status steuerbar ist.

## 14. Profil pflegen und freigeben

Zwei Statusflags steuern die Moderation:

| Aktion | Ergebnis |
|---|---|
| Makler speichert zum ersten Mal | wartet auf Erstfreigabe |
| Phoenix gibt frei | online; spätere Änderungen gehen **sofort** live |
| Phoenix nimmt offline | offline, und die Freigabe ist zurückgezogen — die nächste Änderung braucht wieder eine Freigabe |

Das Prinzip heißt **„Erstfreigabe, dann frei"**: Phoenix prüft einmal, danach kann der
Makler eigenständig arbeiten. Das Offline-Nehmen ist bewusst „klebrig" — wer einmal
auffällig wurde, landet wieder in der Prüfung.

Im Dashboard fasst eine **Ampel** diese Lage je Makler zusammen, in fester Reihenfolge
geprüft:

| Anzeige | Bedeutung |
|---|---|
| kein Profil | der Makler hat noch nie gespeichert |
| unvollständig | Überschrift oder Biografie fehlen |
| online | freigegeben und öffentlich |
| offline genommen | war schon einmal frei, wurde zurückgezogen |
| wartet auf Freigabe | eingereicht, noch nie freigegeben |

„Unvollständig" wird **vor** „online" geprüft: Löscht ein Makler nachträglich seine
Biografie, zeigt das Dashboard „unvollständig", obwohl die Seite noch online ist. Das ist
Absicht — die Ampel soll den Handlungsbedarf zeigen, nicht den Netzzustand. Ob ein Makler
öffentlich auftaucht, steht ohnehin in einer eigenen Spalte daneben; beide Angaben sind
unabhängig, und die Profilseite verlangt beides.

Bei jeder Einreichung wird Phoenix per E-Mail informiert, mit unterschiedlichem Hinweis, je
nachdem ob eine Freigabe nötig ist oder die Änderung bereits live ist.

## 15. Link verloren

Der häufigste Fall im Alltag, und der Grund für den dauerhaften Link. Drei Wege führen zum Ziel:

1. **Der Makler selbst** öffnet `/makler-profil`, gibt seine hinterlegte Adresse ein und
   bekommt sofort einen neuen Link. Die Antwort ist immer gleich, unabhängig davon, ob die
   Adresse bekannt ist — das verhindert das Ausspähen hinterlegter Adressen. Begrenzt auf
   fünf Anfragen in zehn Minuten.
2. **Über den dauerhaften Link**, den Phoenix im Dashboard kopieren kann.
3. **Aus dem Dashboard heraus** per Knopfdruck, wahlweise als E-Mail oder über WhatsApp.

## 16. Der Status-Wächter

Ein täglicher Lauf um 07:00 Uhr prüft, welche Makler neu aktiviert wurden, und verschickt
deren Einladung automatisch. Er schließt die Lücke, wenn niemand den Trigger-Link klickt.

**Er läuft derzeit im Beobachtungsmodus** (`MAKLER_WATCH_MODE=seed`) und verschickt nichts.
Zum Scharfschalten wird die Variable auf `live` gesetzt.

Modi: `seed` (nur den Ist-Zustand festschreiben — der erste Lauf), `dry` (berichten, was
passieren würde), `live` (versenden).

**Fünf Sicherungen, jede davon getestet:**

1. Zugang nur mit dem Cron-Geheimnis, sonst 401.
2. Ein Makler, der im Zustand fehlt, gilt als „neu gesehen", nicht als „neu aktiviert" —
   ein Zustandsverlust kann keinen Massenversand auslösen.
3. Obergrenze von zehn Einladungen pro Lauf; darüber wird nichts versendet, sondern gewarnt.
4. Eine leere CRM-Antwort bricht den Lauf ab, ohne den Zustand zu überschreiben.
5. Ein veralteter Zustand überspringt den Lauf.

Zusätzlich greift eine **Versandsperre**: Ist die Basis-URL leer oder zeigt sie auf
`localhost`, wird keine Einladung verschickt. Solche Links wären beim Empfänger wertlos.

---
---

# Teil VI — CRM-Anbindung

## 17. Was gelesen und was geschrieben wird

Der Zugriff läuft über einen zentralen Baustein mit Zeitbegrenzung, Seitenweise-Abruf und
Auswertung fehlender Rechte. Ohne Zeitbegrenzung könnte ein hängendes CRM einen Aufruf bis
zum Plattform-Limit blockieren und dabei den Mailversand aufhalten.

Die Zahlen, die im Störungsfall zählen: **vier Sekunden** je Einzelabruf, **acht Sekunden**
je Listenseite, **hundert** Datensätze pro Seite, höchstens **fünfzig** Seiten. Antwortet
das CRM mit „fehlende Rechte", wird die Liste der tatsächlich vergebenen Berechtigungen aus
der Antwort ausgelesen und protokolliert — das war bei der Rechteklärung mit
Professional.Works der entscheidende Hebel.

**Lesend:** die Vermittlerliste je Status.

**Schreibend**, ausschließlich bei der Neuanmeldung: Vermittler anlegen, Bankverbindung,
Kundendatensatz, Notiz zur Lead-Herkunft, und beim Trigger-Klick eine Notiz mit dem
Foto-Upload-Link.

**Vermittler-Status im CRM** (Stand 09.09.2026):

| Status | Anzahl | Bedeutung |
|---|---|---|
| aktiv | 63 | regulärer Partner |
| passiv | 22 | arbeitet, muss aber anonym bleiben |
| neuer Partner | 12 | in Prüfung |
| storniert | 141 | ehemalige Partner |

Im Dashboard geführt werden *aktiv*, *passiv* und *neuer Partner*. Drei Systemkonten
(Firmen-Sammelkonto, Vertriebspartnerabrechnung, Dienstleister-Zugang) sind namentlich
ausgenommen — sie sind keine Personen mit Profil. Der Ausschluss greift in der
Dashboard-Liste und im Sammelversand, **nicht** in der Zugangsliste selbst; über die
Oberfläche sind diese Konten also nicht erreichbar, ein direkter Aufruf der Schnittstelle
könnte sie theoretisch schalten.

## 18. Was im CRM nicht geht — und warum

Der Profil-Link lässt sich **nicht** im CRM beim Makler hinterlegen. Vier Gründe, jeder für
sich ausreichend — sie stehen hier, damit die Frage nicht erneut untersucht wird:

- **Die vorgesehene Stelle ist gesperrt.** Vermittler-Stammdaten → Dokumente ist der
  einzige dafür gedachte Ort. Sowohl Lesen als auch Schreiben antworten mit „Token hat
  nicht die nötigen Rechte". Die Freigabe liegt bei Professional.Works.
- **Alle anderen Felder am Vermittler scheiden aus.** Sie sind entweder zu kurz, auf
  Briefen sichtbar oder fachlich belegt: Adresszusatz, Fax, Homepage, IHK- und
  Steuernummern, Bankkonto-Notiz. Ein Feld „Hinweise", wie es die CRM-Oberfläche zeigt,
  existiert in der Schnittstelle nicht.
- **Der URL-Endpunkt speichert keine URL.** Er lädt die angegebene Seite herunter und legt
  den Inhalt als Dokument ab. Die Herkunfts-URL wird verworfen. Selbst mit den fehlenden
  Rechten entstünde also kein anklickbarer Link, sondern eine eingefrorene HTML-Kopie.
- **Die Kundenakte ist der falsche Ort** und für den Bestand ohnehin nicht sicher
  zuzuordnen: Vermittler- und Kundendatensatz sind nicht verknüpft, und ein Abgleich über
  Name und Geburtsdatum trifft nur rund 70 Prozent — mit Fehlerarten, die sich nicht
  abfangen lassen (Gemeinschaftsakten, gleichnamige Kinder, Ehepartner).

**Konsequenz:** Die Anlaufstelle für die Links ist das interne Dashboard. Es erfüllt den
Zweck besser als das CRM, weil es immer aktuell ist und neue Makler von selbst erscheinen.

---
---

# Teil VII — Betrieb

## 19. Umgebungsvariablen

| Variable | Zweck |
|---|---|
| `APP_BASE_URL` | Basis aller Links — **muss** auf die Produktiv-Domain zeigen |
| `TRIGGER_SECRET` | Signatur der Makler-Token |
| `TEAM_SECRET` | Signatur der Team-Anmeldung — **eigenes** Geheimnis |
| `TEAM_ALLOWLIST` | zugangsberechtigte Team-Adressen, kommagetrennt |
| `CRON_SECRET` | schützt den Status-Wächter |
| `MAKLER_WATCH_MODE` | `seed` oder `live` |
| `PW_API_BASE`, `PW_USER_SLUG`, `PW_BEARER_TOKEN`, `PW_DEFAULT_AGENCY_ID` | CRM-Anbindung |
| `PW_LINK_FILE_ENABLED`, `PW_LINK_DOCUMENT_TYPE_ID` | CRM-Ablage (abgeschaltet, siehe Kapitel 18) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | E-Mail-Versand |
| `PHOENIX_NOTIFICATION_TO` | interne Empfängeradresse |
| `PUBLIC_PLAUSIBLE_DOMAIN` | Reichweitenmessung |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob, wird von Vercel selbst gesetzt |

`TEAM_ALLOWLIST` darf **kein** `PUBLIC_`-Präfix bekommen, sonst landet die Liste im
ausgelieferten Code. Dasselbe gilt für jedes Geheimnis in dieser Tabelle.

Zwei Eigenheiten beim Setzen:

- `CRON_SECRET` wird **ausschließlich** aus der Vercel-Umgebung gelesen. Anders als bei
  CRM- und Mail-Zugriff gibt es hier keinen Rückfall auf die Shell-Umgebung — ein lokal
  gesetzter Wert wirkt nicht.
- `BLOB_READ_WRITE_TOKEN` taucht im Code nirgends auf; die Blob-Bibliothek zieht ihn selbst
  aus der Prozessumgebung. Für jedes Skript muss er trotzdem gesourct sein.

## 20. E-Mails

| Anlass | Empfänger |
|---|---|
| Neue Bewerbung | Phoenix, mit Trigger-Link |
| Trigger geklickt | Bewerber, Foto-Upload-Link |
| Einladung zum Profil | Makler, mit 14-Tage-Link |
| Profil eingereicht oder geändert | Phoenix, mit Freigabe-Link |
| Profil zurückgeworfen | Makler, mit Hinweis und frischem Link |
| Anmeldung am Dashboard | Teammitglied (Anmeldelink) und Phoenix (Benachrichtigung) |

Alle Versände sind **nicht blockierend**: Schlägt der Versand fehl, bleibt die Kernaktion
trotzdem erfolgreich; der Fehler wird nur protokolliert.

## 21. Deployment und Prüfschritte

Auslieferung über Vercel, ausgelöst durch einen Push nach `main`. Änderungen an
Umgebungsvariablen brauchen einen **erneuten Deploy** — Vercel friert sie je Auslieferung ein.

**Vor jedem Deploy, der interne Seiten berührt:**

```
npm run build
# .vercel/output/static/intern darf NICHT existieren
```

Existiert das Verzeichnis, fehlt irgendwo `prerender = false` und die Makler-Liste läge
öffentlich im CDN. Der Entwicklungsserver zeigt diesen Fehler nicht.

**Nach dem Deploy:** `/intern` ohne Anmeldung muss auf die Anmeldeseite umleiten und darf
keine Maklerdaten im Rumpf enthalten; `/makler-suche` muss dieselbe Anzahl Karten zeigen
wie vorher.

## 22. Bekannte Einschränkungen

- **Verzögerung bis zu einer Minute** bei Änderungen über mehrere Instanzen hinweg (Kapitel 12).
- **Mehrere Makler teilen sich eine E-Mail-Adresse.** Bei der Selbstanforderung über das
  Formular wird nur der erste Treffer gefunden. Über den dauerhaften Link aus dem Dashboard
  funktioniert es, weil dort die Vermittlernummer im Link steht.
- **Stornierte Makler** (141) sind nicht im Dashboard geführt. Falls dort jemand
  veröffentlicht werden soll, wäre ein zusätzlicher Filter nötig.
- **WhatsApp öffnet nicht überall die Anwendung.** Der Knopf nutzt das Protokoll, das direkt
  zur Desktop-Anwendung führt. Ist es auf dem Rechner nicht registriert, passiert nichts —
  dann hilft nur der Umweg über die Weboberfläche von WhatsApp.
- **Der CRM-Schreibpfad ruht** und wird erst nutzbar, wenn Professional.Works die Rechte
  freigibt — was laut Kapitel 18 ohnehin nicht das gewünschte Ergebnis brächte.
- **Notbehelf der Maklersuche.** Liefert die Vermittlerliste nichts — weil das CRM
  ausfällt *oder* weil die Kennzeichen-Datei nicht lesbar ist —, zeigt `/makler-suche` acht
  fest im Code hinterlegte Einträge aus der Zeit vor der CRM-Anbindung. Der Fall ist
  selten, aber er umgeht den Sichtbarkeitsschalter. Wer die acht Namen dort nicht mehr
  sehen will, muss die hinterlegte Liste leeren.
- **Der Foto-Endpunkt prüft nur den Schalter**, nicht den CRM-Status. Ein Makler, der auf
  sichtbar steht und im CRM auf „storniert" wechselt, verschwindet aus Suche, Profilseite
  und Sitemap — sein Foto bleibt aber abrufbar, solange jemand seine Vermittlernummer
  kennt. Sauber ist: beim Ausscheiden auch den Schalter umlegen.

---
