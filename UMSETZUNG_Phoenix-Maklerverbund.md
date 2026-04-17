# UMSETZUNG: Phoenix Maklerverbund — Website-Redesign
## Komplette Arbeitsgrundlage für die Entwicklung

---

## 1. Startplan: Wie wir loslegen

### 1.1 Sofort umsetzbar (ohne Wartezeit auf den Kunden)

Wir können direkt starten mit allem, was wir haben. CRM-Zugang und API brauchen wir erst für den Maklerfinder und das Registrierungsformular — das ist Phase 2. Phase 1 ist die komplette statische Website.

**Reihenfolge:**

1. Projekt-Ordnerstruktur anlegen
2. Globale Komponenten (Header, Footer, Navigation)
3. Startseite (neu)
4. Makler-werden-Seite (Inhalte bestehend + Formular-Platzhalter)
5. Kundenseite (neu)
6. Alle 7 B2C-Produktseiten (Pots 1:1 übernommen)
7. Über uns (Texte 1:1)
8. Maklerfinder (Platzhalter, API-Anbindung in Phase 2)
9. Rechtliche Seiten (Impressum, Datenschutz, Erstinformation, Barrierefreiheit, Beschwerdemanagement)

### 1.2 Was wir vom Kunden brauchen (parallel anfragen)

- [ ] CRM-Zugangsdaten (Innendienst-Account → entwicklung@superbrand.marketing) — **Torsten**
- [ ] Make-Account wird von uns angelegt — **Dennis**
- [ ] Texte überarbeiten (Über uns, Startseite) — **Lothar & Dennis**
- [ ] Aktualität der DigiDo-Links prüfen — **Lothar**
- [ ] Klärung: Dürfen Partner-Logos (z.B. Falk) drauf? — **Lothar**

### 1.3 Wie kommen wir an die Fotos und Assets?

**Logo:**
- Bereits vorhanden: `https://www.phoenix-maklerverbund.de/wp-content/uploads/2023/09/scale.png`

**Geschäftsführer-Fotos:**
- Torsten Deterding: `https://www.phoenix-maklerverbund.de/wp-content/uploads/2023/10/torsten-deterding.256x256.jpg`
- Lothar Nast: `https://www.phoenix-maklerverbund.de/wp-content/uploads/2023/10/1517077959954.jpg`

**Partner-Netzwerk-Grafik:**
- `https://www.phoenix-maklerverbund.de/wp-content/uploads/2023/09/Frame-9.webp`

**Karten-Vorschau (Google Maps):**
- `https://www.phoenix-maklerverbund.de/wp-content/uploads/2023/09/mapsExmaple.png`

**Versicherer-Logos (auf der Website gehostet):**
- Barmenia: `https://www.phoenix-maklerverbund.de/wp-content/uploads/2023/09/barmenia.png`
- SDK: `https://www.phoenix-maklerverbund.de/wp-content/uploads/2023/09/1920px-SDK_Versicherung_logo.svg_.png`
- HanseMerkur: `https://www.phoenix-maklerverbund.de/wp-content/uploads/2023/09/HanseMerkur_Logo_2018.svg-1.png`
- ARAG: `https://www.phoenix-maklerverbund.de/wp-content/uploads/2023/09/512px-ARAG_Logo.svg_-1.png`
- IDEAL: `https://www.phoenix-maklerverbund.de/wp-content/uploads/2023/09/IDEAL-Logo.webp`
- DELA: `https://www.phoenix-maklerverbund.de/wp-content/uploads/2023/09/DELA_Logo.jpg` (nicht vorhanden auf Seite, muss nachgeliefert werden oder von extern)
- Neodigital: `https://www.phoenix-maklerverbund.de/wp-content/uploads/2023/09/Frame-5.png`
- Ammerländer: `https://www.phoenix-maklerverbund.de/wp-content/uploads/2023/09/Frame-6.png`

**Makler-Fotos (aktuell im Maklerfinder):**
- Werden über Revolution Slider geladen (dummy.png Platzhalter) → Die echten Fotos stecken in WordPress-Uploads, nicht direkt sichtbar im Markdown
- Für die neuen Makler: Kommen über den Upload-Prozess (Phase 2)
- Für bestehende 8 Makler: Können wir aus dem WP-Backend exportieren oder direkt über die WP-Media-URLs laden

**Erstinformation PDF:**
- `https://www.phoenix-maklerverbund.de/wp-content/uploads/2023/09/Phoenix_Erstinformation.pdf`

**Kundenmagazin-Bilder (extern gehostet bei Digidor):**
- `https://www.phoenix-maklerverbund.de/wp-content/uploads/2023/09/magazin.webp`
- `https://www.phoenix-maklerverbund.de/wp-content/uploads/2023/09/pv.webp`
- `https://www.phoenix-maklerverbund.de/wp-content/uploads/2023/09/65198_2000_background.jpg`

**Aktion:** Alle Bilder von `phoenix-maklerverbund.de/wp-content/uploads/` runterladen und lokal in `/public/images/` sichern. Das machen wir im ersten Schritt automatisiert.

---

## 2. Projekt-Struktur

```
phoenix-maklerverbund/
├── public/
│   ├── images/
│   │   ├── logo.png                    (scale.png)
│   │   ├── torsten-deterding.jpg
│   │   ├── lothar-nast.jpg
│   │   ├── partner-netzwerk.webp       (Frame-9.webp)
│   │   ├── maps-preview.png
│   │   ├── magazin.webp
│   │   ├── pv.webp
│   │   ├── extremwetter.jpg
│   │   └── logos/
│   │       ├── barmenia.png
│   │       ├── sdk.png
│   │       ├── hansemerkur.png
│   │       ├── arag.png
│   │       ├── ideal.webp
│   │       ├── neodigital.png
│   │       └── ammerlaender.png
│   ├── docs/
│   │   └── Phoenix_Erstinformation.pdf
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── Header.astro (oder .jsx/.html)
│   │   ├── Footer.astro
│   │   ├── Navigation.astro
│   │   ├── HeroSection.astro
│   │   ├── TeaserCard.astro            ← Pot-Komponente
│   │   ├── ProductBlock.astro          ← Produkt mit Logo + Rechner
│   │   ├── MaklerCard.astro            ← Maklerfinder-Karte
│   │   ├── CTAButton.astro
│   │   └── ErstinformationModal.astro
│   ├── layouts/
│   │   └── BaseLayout.astro
│   ├── pages/
│   │   ├── index.astro                 ← Startseite (NEU)
│   │   ├── makler-werden.astro         ← Hauptseite (NEU)
│   │   ├── makler-suche.astro          ← Maklerfinder
│   │   ├── ueber-uns.astro
│   │   ├── kontakt.astro
│   │   ├── kunde/
│   │   │   ├── index.astro             ← Kundenseite (NEU)
│   │   │   ├── altersvorsorge.astro
│   │   │   ├── einkommenssicherung.astro
│   │   │   ├── zahnzusatzversicherung.astro
│   │   │   ├── krankenhauszusatzversicherung.astro
│   │   │   ├── haustier.astro
│   │   │   ├── haus-wohnen.astro
│   │   │   └── vermoegensaufbau.astro
│   │   ├── impressum.astro
│   │   ├── datenschutz.astro
│   │   ├── erstinformation.astro
│   │   ├── barrierefreiheit.astro
│   │   └── beschwerdemanagement.astro
│   ├── data/
│   │   ├── pots-altersvorsorge.json
│   │   ├── pots-einkommenssicherung.json
│   │   ├── pots-zahnzusatz.json
│   │   ├── pots-krankenhauszusatz.json
│   │   ├── pots-haustier.json
│   │   ├── pots-haus-wohnen.json
│   │   ├── pots-vermoegensaufbau.json
│   │   ├── makler-werden-vorteile.json
│   │   └── navigation.json
│   └── styles/
│       ├── global.css
│       └── variables.css
├── _redirects                           ← 301-Redirects
└── package.json
```

---

## 3. Globale Elemente (1:1 übernehmen)

### 3.1 Header / Navigation

**Desktop:**
```
[Logo]                              [Makler finden]  [★ Makler werden]
Über uns    Leistungen    Kontakt
```

**Mobile:** Burger-Menü + sticky "Makler werden" CTA unten

### 3.2 Footer (aktueller Inhalt — 1:1 übernehmen)

```
[Logo]

Durch unsere Netzwerkorganisation bieten wir Ihnen Zugang zu exklusiven
Ressourcen, Weiterbildungsprogrammen und einer starken Verhandlungsposition
gegenüber Anbietern.

UNSERE LEISTUNGEN          KONTAKT                        ADRESSE
- Gesundheitsvorsorge      Tel: 02634/659858-0            Zum weißen Stein 17
- Altersvorsorge           Fax: 02634/659858-9            56587 Oberhonnefeld-Gierend
- Einkommenssicherung      info@phoenix-maklerverbund.de
- Vermögensaufbau                                         [Google Maps Vorschau]

─────────────────────────────────────────────────────
Deine Webseite von Superbrand.marketing
Impressum | Beschwerdemanagement | Erstinformation zum Vermittlerstatus
```

### 3.3 Erstinformation Modal (Trigger: nur bei /kunde/*)

```
Erstinformation zum Vermittlerstatus
[Mehr erfahren] → /erstinformation
[Download] → /docs/Phoenix_Erstinformation.pdf
[Bereits gelesen] → Modal schließen
```

---

## 4. Seiteninhalt: Startseite (/) — NEU

```
HERO-BEREICH
"Phönix Maklerverbund"
"Ihr Mehrwert-Verbund für Finanz- und Versicherungslösungen"

[Ich möchte Partner werden →]  [Ich bin Kunde →]

──────────────────────────────────────────

WARUM PHÖNIX? (3-4 Kacheln)
- Seit 2012 | Inhabergeführt & ungebunden
- 120+ Vermittler im Netzwerk
- Exklusive Vereinbarungen & Courtagen
- Professional Works MVP kostenlos

──────────────────────────────────────────

PARTNER-NETZWERK
Bild: partner-netzwerk.webp (Frame-9.webp)

──────────────────────────────────────────

CTA: "Jetzt Partner werden →" → /makler-werden
```

---

## 5. Seiteninhalt: Makler werden (/makler-werden) — BESTAND + NEU

### Text 1:1 übernehmen von aktueller Seite:

```
HEADLINE: "Ihr Mehrwert-Verbund für Finanz- und Versicherungslösungen"

TEXT: "Seit 2012 bietet der Phönix Maklerverbund individuelle Unterstützung
für Finanz- und Versicherungsmakler. Über 70 Partner profitieren von unseren
Diensten in Altersvorsorge, Krankenversicherung und mehr."

DIENSTLEISTUNGEN UND VORTEILE:
- Branchen-Spezialisierung: Fachliche Unterstützung in Altersvorsorge,
  Krankenabsicherung und Finanzierung.
- Persönliche Beratung: Maßgeschneiderte Lösungen für optimale Kundenbetreuung.
- Transparenz und Qualität: Unsere Grundprinzipien für eine erfolgreiche Partnerschaft.

"Ihre Selbständigkeit, unsere Priorität"
TEXT: "Wir fördern Ihre Selbständigkeit durch rechtlich eigenständige Vereinbarungen,
damit Sie flexibel und sicher agieren können."

UNSERE ALLEINSTELLUNGSMERKMALE:
- Exklusive Vereinbarungen mit Versicherern
- Umfassendes Courtagemodell
- Professionelle rechtliche Unterstützung

PRAKTISCHE UNTERSTÜTZUNG:
- Verwaltungsvereinfachung: Wir stellen Ihnen ein professionelles
  Maklerverwaltungsprogramm mit umfassender Digitalisierung und weiteren Tools.
- Individuelle Instrumente: Wir stellen Werkzeuge bereit, die Sie wirklich brauchen.

NETWORKING UND WEITERBILDUNG:
- Spezielle Deckungskonzepte
- Regelmäßige Online-Meetings und Marktaktualisierungen

SCHRITT FÜR SCHRITT: WECHSEL AUS DER AUSSCHLIEßLICHKEIT:
TEXT: "Wenn Sie einen Wechsel in Erwägung ziehen, berücksichtigen Sie
vertragliche Details und Kündigungsfristen. Wir unterstützen Sie bei jedem Schritt."

Was zu beachten ist:
- Überprüfen Sie Ihren bestehenden Vertrag.
- Klären Sie rechtliche Fragen zur Kundenakquise und Kundendaten.

Wie wir Ihnen helfen können:
- Unterstützung bei Vertragsauflösung
- Hilfestellung bei der Bestandsumdeckung

ZUSAMMENFASSUNG:
"Der Phönix Maklerverbund steht für Transparenz, Qualität und die Förderung
Ihrer Selbständigkeit. Wir sind Ihr persönlicher Dienstleister im Bereich
Finanz- und Versicherungsmakler."
```

### NEU: Registrierungsformular (unten auf der Seite)

```
HEADLINE: "Jetzt Partner werden"

Formular-Felder (basierend auf PW-API "Nutzer erstellen"):
- Anrede (Dropdown)
- Vorname (Text)
- Nachname (Text)
- Straße + Nr (Text)
- PLZ (Text)
- Ort (Text)
- Telefon (Text)
- E-Mail (Email)
- Geburtsdatum (Date) — wird nur intern an API gesendet
- Nationalität (Dropdown)
- IHK-Nummer (Text, optional)

Checkboxen:
☐ Ich stimme der Datenschutzerklärung zu (Pflicht)
☐ Ich möchte kontaktiert werden

[Jetzt Partner werden →]

Erfolgs-Meldung: "Vielen Dank für Ihr Interesse! Wir melden uns in Kürze bei Ihnen."
```

---

## 6. Seiteninhalt: Kundenseite (/kunde) — NEU

```
HEADLINE: "Willkommen beim Phönix Maklerverbund"

TEXT: "Der Phönix Maklerverbund unterstützt ungebundene Versicherungsmakler
bei der Abwicklung ihrer Geschäfte. Ihr persönlicher Ansprechpartner ist
Ihr Versicherungsmakler."

PROMINENT: Makler-Suche
"Finden Sie Ihren Versicherungsmakler"
[PLZ oder Name eingeben]  [Suchen →]

──────────────────────────────────────────

"Informieren Sie sich über unsere Leistungsbereiche:"

KACHELN (7 Stück, verlinken auf /kunde/*):
- Altersvorsorge → /kunde/altersvorsorge
- Einkommenssicherung → /kunde/einkommenssicherung
- Zahnzusatzversicherung → /kunde/zahnzusatzversicherung
- Krankenhauszusatzversicherung → /kunde/krankenhauszusatzversicherung
- Ihr Haustier → /kunde/haustier
- Haus & Wohnen → /kunde/haus-wohnen
- Vermögensaufbau → /kunde/vermoegensaufbau

TRIGGER: Erstinformation-Modal erscheint beim Betreten
```

---

## 7. B2C-Produktseiten: Pots-Daten (1:1 übernehmen)

Jede Seite besteht aus Teaser-Pots und/oder Produkt-Blöcken. Hier alle Daten für die JSON-Dateien.

### 7.1 Altersvorsorge (/kunde/altersvorsorge)

**Seitentitel:** "Eine Auswahl für ihre Altersvorsorge"

**Pots (nur Teaser — keine Produkt-Blöcke):**

| # | Headline | Bild | Link | Typ |
|---|----------|------|------|-----|
| 1 | Vorteile bei Ihrer Absicherung & Vorsorge sichern | Digidor-CDN (Pot-Bild) | Digidor-Link | Teaser-Pot |
| 2 | Clevere ETF-Anlage ohne Abgeltungsteuer | Digidor-CDN (Pot-Bild) | Digidor-Link | Teaser-Pot |
| 3 | Absicherung für Frauen | Digidor-CDN (Pot-Bild) | Digidor-Link | Teaser-Pot |

**Abschluss-CTA:**
```
"Finden Sie ihren qualifizierten Ansprechpartner"
TEXT: "Wir bieten Ihnen eine Auswahl an Experten, die Ihre individuellen
Bedürfnisse verstehen und maßgeschneiderte Lösungen bieten. Profitieren
Sie von unserer langjährigen Erfahrung und unserem breiten Netzwerk."
[Jetzt Makler finden] → /makler-suche
```

### 7.2 Einkommenssicherung (/kunde/einkommenssicherung)

**Seitentitel:** "Eine Auswahl für ihre Einkommenssicherung"

**Pots:**

| # | Headline | Typ |
|---|----------|-----|
| 1 | Die mentale Gesundheit fördern | Teaser-Pot → Digidor |
| 2 | Schützen Sie Ihre wichtigsten Fähigkeiten ganz individuell! | Teaser-Pot → Digidor |
| 3 | Versicherungsschutz im Homeoffice | Teaser-Pot → Digidor |

**Produkt-Blöcke:**

| # | Produkt | Text | Logo | Link |
|---|---------|------|------|------|
| 1 | DELA Risikolebensversicherung | "Die Dela ist ein niederländischer Spezialversicherer mit Schwerpunkt auf Risikolebensversicherungen und Sterbegeldversicherungen. Wir empfehlen sie wegen eines sehr guten Preis-Leistungs-Verhältnisses." | DELA_Logo.jpg | ssl.barmenia.de/... |
| 2 | IDEAL Risikolebensversicherungen Familie | "Das Berliner Unternehmen bietet seit über 100 Jahren innovative Absicherungsprodukte für unterschiedliche Zielgruppen. Sie haben hier die Möglichkeit eine Risikolebensversicherung für Familien zu berechnen und online abzuschließen." | IDEAL-Logo.webp | ssl.barmenia.de/... |
| 3 | IDEAL Risikolebensversicherung Kreditabsicherung | "Das Berliner Unternehmen bietet seit über 100 Jahren innovative Absicherungsprodukte für unterschiedliche Zielgruppen. Sie haben hier die Möglichkeit eine Risikolebensversicherung speziell zur Absicherung eines Immobilienkredites zu berechnen und abzuschließen." | IDEAL-Logo.webp | ssl.barmenia.de/... |

### 7.3 Zahnzusatzversicherung (/kunde/zahnzusatzversicherung)

**Seitentitel:** "Eine Auswahl für ihre Zahnzusatzversicherung"

**Pots:**

| # | Headline | Typ |
|---|----------|-----|
| 1 | Der neue ZAHN SORGLOS-Tarif | Teaser-Pot → Digidor |
| 2 | Schöne Zähne für kaum mehr als ein Lächeln… | Teaser-Pot → Digidor |
| 3 | Es ist nie zu spät für ein gesundes Lächeln | Teaser-Pot → Digidor |

**Produkt-Blöcke:**

| # | Produkt | Text | Logo | Link |
|---|---------|------|------|------|
| 1 | Zahnzusatzversicherung (SDK) | "Die Süddeutsche Krankenversicherung bietet mit ihrer Zahnzusatzversicherung wahrscheinlich das flexibelste Produkt ihres Portfolios. Starten sie jetzt mit einem 'kleinen' Beitrag und erhöhen sie je nach Bedarf alle 5 Jahre den Versicherungsschutz." | sdk.png | ssl.barmenia.de/... |
| 2 | Zahnzusatzversicherung (HanseMerkur) | "Als einer der ältesten privaten Krankenversicherer in Deutschland bietet die Hanse Merkur ein gutes Preis-Leistungs-Verhältnis. Jetzt hier berechnen und abschließen." | hansemerkur.png | ssl.barmenia.de/... |
| 3 | Zahnzusatzversicherung (Barmenia) | "Die Barmenia glänzt mit einem hervorragenden Preis-Leistungs-Verhältnis. Berechnen sie hier ohne Wartezeit und ohne Gesundheitsfragen. Jetzt auch mit Leistung für Kieferorthopädie für Erwachsene." | barmenia.png | ssl.barmenia.de/... |

### 7.4 Krankenhauszusatzversicherung (/kunde/krankenhauszusatzversicherung)

**Seitentitel:** "Eine Auswahl für Krankenhauszusatzversicherung"

**Pots:**

| # | Headline | Typ |
|---|----------|-----|
| 1 | Mehr Komfort für schnelle Genesung | Teaser-Pot → Digidor |
| 2 | Mein Kind muss ins Krankenhaus – was nun? | Teaser-Pot → Digidor |
| 3 | Weil mir Ihre Gesundheit am Herzen liegt! | Teaser-Pot → Digidor |

**Produkt-Blöcke:**

| # | Produkt | Text | Logo | Link |
|---|---------|------|------|------|
| 1 | Krankenhauszusatzversicherung (Barmenia) | "Was ist ihnen Wichtig? Arzthonorare ohne Begrenzung, einfache Gesundheitsprüfung und ein attraktives Preis-Leistungs-Verhältnis? Jetzt hier informieren und berechnen." | barmenia.png | ssl.barmenia.de/... |
| 2 | Krankenhauszusatzversicherung (ARAG) | "Einer der schnellwachsensten privaten Krankenversicherer der letzten Jahre. Keine Begrenzung auf die Höchstsätze der Gebührenordnung der behandelnden Ärzte. Unterstützung bei der Wahl des Krankenhauses und vieles mehr. Jetzt hier berechnen." | arag.png | ssl.barmenia.de/... |
| 3 | Krankenhauszusatzversicherung (SDK) | "Vor Allem im Ernstfall ist eine gute Absicherung wichtig. Für sie und ihre Liebsten die besten Ärzte und die beste Unterbringung im Krankenhaus. Auch ohne Gesundheitsfragen in der Variante 'Klinik bei Unfall'. Erhalten sie ihr persönliches Angebot mit wenigen Klicks." | sdk.png | ssl.barmenia.de/... |

### 7.5 Haustier (/kunde/haustier)

**Seitentitel:** "Eine Auswahl für ihre Tierversicherungen"

**Pots:**

| # | Headline | Typ |
|---|----------|-----|
| 1 | Katzenversicherung | Teaser-Pot → Digidor |
| 2 | Haftpflicht Hunde | Teaser-Pot → Digidor |
| 3 | Hundeversicherung | Teaser-Pot → Digidor |

**Produkt-Blöcke:**

| # | Produkt | Text | Logo | Link |
|---|---------|------|------|------|
| 1 | Tierkrankenversicherung (Barmenia) | "Mit den Tierversicherung der Barmenia versichern sie ihr Tier so umfassend, wie Sie es sich wünschen. Damit sie sich unabhängig von den Kosten jederzeit für das Wohl ihres Tieres entscheiden können. Hier für Hund, Katze und Pferd berechnen und abschließen." | barmenia.png | ssl.barmenia.de/... |
| 2 | Katzen Op Versicherung (HanseMerkur) | "Katzen landen immer auf ihren Pfoten? Bei einem Unfall kanns sich auch der geschickteste Freigänger verletzen und oft der der Mensch nicht unschuldig daran. Tierarztrechnungen von über 3000,-€ sind dann keine Seltenheit. Jetzt besser für ein gutes Gefühl vorsorgen. Hier berechnen und abschließen" | hansemerkur.png | ssl.barmenia.de/... |
| 3 | Tierkrankenversicherung (ARAG) | "Ein weiterer Versicherer für ihren Hund oder ihre Katze. Wahlweise als OP oder Krankenvollversicherung. Genießen sie ein unbesorgtes Leben mit Ihrem Vierbeiner. Jetzt hier berechnen und abschließen." | arag.png | ssl.barmenia.de/... |

### 7.6 Haus & Wohnen (/kunde/haus-wohnen)

**Seitentitel:** "Eine Auswahl für Haus und Wohnen"

**Pots:**

| # | Headline | Typ |
|---|----------|-----|
| 1 | Starker Schutz bei Extremwetter | Teaser-Pot → Digidor |
| 2 | Wärmepumpe, Photovoltaik-Anlage und Co. absichern | Teaser-Pot → Digidor |
| 3 | Ist Ihre Hausratversicherung up to date? | Teaser-Pot → Digidor |

**Produkt-Blöcke:**

| # | Produkt | Text | Logo | Link |
|---|---------|------|------|------|
| 1 | Neodigital Hausrat Wechseltarif | "Jetzt schnell und unkompliziert garantiert 5% des Beitrages sparen. Es sind mindestens die Leistungen ihrer Vorversicherung abgesichert und vieles mehr. Jetzt hier informieren und abschließen." | neodigital.png (Frame-5.png) | ssl.barmenia.de/... |
| 2 | Neodigital Wohngebäude Wechseltarif | "Der Markt der Wohngebäudeversicherer ist angespannt auf Grund der explodierenden Kosten und Preise. Umso ungewöhnlicher ist das Angebot der HUK Tochter Neodigital. Die für viele Wohngebäudeversicherungen den Beitrag noch einmal um 5% reduziert. Hier informieren." | neodigital.png (Frame-5.png) | ssl.barmenia.de/... |
| 3 | Ammerländer Ebike Versicherung | "Egal ob Dienstrad oder privates E-bike. Die Ammerländer war einer der ersten Anbieter auf dem Markt mit Fahrradvollkaskoversicherungen. Jetzt hier berechnen und abschließen." | ammerlaender.png (Frame-6.png) | ssl.barmenia.de/... |

### 7.7 Vermögensaufbau (/kunde/vermoegensaufbau)

**Seitentitel:** "Eine Auswahl für ihren Vermögensaufbau"

**Pots:**

| # | Headline | Typ |
|---|----------|-----|
| 1 | Anschlussfinanzierung: Kann ich steigende Zinsen stoppen? | Teaser-Pot → Digidor |
| 2 | Nachhaltigkeits Trends | Teaser-Pot → Digidor |
| 3 | Sparstrumpf war gestern! | Teaser-Pot → Digidor |

**Abschluss-CTA:** (gleich wie Altersvorsorge)
```
"Finden Sie ihren qualifizierten Ansprechpartner"
TEXT: "Wir bieten Ihnen eine Auswahl an Experten..."
[Jetzt Makler finden] → /makler-suche
```

---

## 8. Seiteninhalt: Über uns (/ueber-uns) — 1:1

```
HEADLINE: "Zu uns und der Geschäftsleitung"
SUB: "Phönix Maklerverbund: Ihr ungebundener Partner in der Assekuranz"

EINLEITUNG: WER WIR SIND
"Seit unserer Gründung im Jahr 2012 hat sich der Phönix Maklerverbund als
ungebundener und inhabergeführter Verbund im Versicherungsbereich etabliert.
Mit über 70 Partnern bieten wir ein Netzwerk von Fachwissen und
Dienstleistungen, das seinesgleichen sucht."

UNSERE GESCHICHTE
"Angefangen mit einer Handvoll Kollegen am 20. Juni 2012, können wir heute
stolz auf ein starkes Netzwerk von über 70 Partnern blicken."

UNGEBUNDENHEIT ALS KERNWERT
"Anders als viele andere Maklerverbünde sind wir 100% inhabergeführt.
Dies garantiert unsere vollkommene Ungebundenheit von Kapitalgebern
und Versicherungsgesellschaften."

UNSERE GESCHÄFTSFÜHRUNG:
- Torsten Deterding: Versicherungsfachwirt mit umfangreicher Erfahrung
  in der Assekuranz seit 1997.
  [Foto: torsten-deterding.jpg]

- Lothar Nast: Versicherungsfachwirt und gelernter Versicherungskaufmann,
  tätig in der Assekuranz seit 1988.
  [Foto: lothar-nast.jpg]

BERUF UND BERUFUNG
"Für uns ist die Versicherungsbranche nicht nur ein Beruf, sondern eine
Berufung. Unsere Expertise und Leidenschaft fließen in jeden Aspekt
unserer Arbeit ein, um für unsere Partner und Kunden den bestmöglichen
Service zu bieten."

"Mit dem Phönix Maklerverbund wählen Sie einen Partner, der auf allen
Ebenen Ungebundenheit, Expertise und eine individuelle Herangehensweise
garantiert. Wir freuen uns auf eine erfolgreiche Zusammenarbeit."

ZITAT: "Unser Beruf ist uns auch Berufung"
```

**Hinweis:** Texte müssen von Lothar & Dennis aktualisiert werden (z.B. "über 70 Partner" → "über 120 Partner"). Wir bauen die Seite erstmal mit den bestehenden Texten, Platzhalter für Updates.

---

## 9. Seiteninhalt: Startseite Bestand (Elemente die auf /kunde wandern)

Die aktuelle Startseite hat Content, der auf die Kundenseite verschoben wird:

**Kundenmagazin-Teaser:**
```
HEADLINE: "Jetzt zum Kundenmagazin anmelden!"
TEXT: "Mit meinem Kundenmagazin informiere ich Sie monatlich über aktuelle
Themen aus den Bereichen Versicherungen und Vorsorge. So bleiben Sie
immer auf dem Laufenden."
[Anmelden] → https://deterding.phoenix-makler.info/kundenmagazin_anmeldung.html
BILD: magazin.webp
```

**Wärmepumpe-Teaser:**
```
HEADLINE: "Wärmepumpe, Photovoltaik-Anlage und Co. richtig absichern."
TEXT: "Mit einer Wärmepumpe heizen Sie klimafreundlich. Weil die Nachfrage
nach Wärmepumpen seit Mitte 2022 steigt, sind diese ein attraktives
Diebesgut! Gut zu wissen: Wärmepumpen sind in den seltensten Fällen
gegen Diebstahl abgesichert. Dagegen können Sie aber etwas tun!"
[Mehr erfahren] → https://deterding.phoenix-makler.info/kundenmagazin_anmeldung.html
BILD: pv.webp
```

**Extremwetter-Teaser:**
```
HEADLINE: "Starker Schutz bei Extremwetter"
TEXT: "Sintflutartige Regenfälle oder tagelanger Dauerregen: Extreme
Niederschlagsmengen können schon in kürzester Zeit zu Hochwasser und
Überschwemmungen führen..."
[Mehr erfahren] → https://deterding.phoenix-makler.info/kundenmagazin_anmeldung.html
BILD: extremwetter.jpg (65198_2000_background.jpg)
```

---

## 10. Maklerfinder: Bestandsdaten der 8 aktuellen Makler

| Name | Ort | Makler-Seite |
|------|-----|-------------|
| Dieter Satler | Linz (53545) | /makler/dieter-satler/ |
| Gerhard Graf | — | /makler/gerhard-graf/ |
| Oliver Mainusch | — | /makler/oliver-mainusch/ |
| Heico Fillinger | — | /makler/heico-fillinger/ |
| André Quendler-Schäfer | — | /makler/andre-quendler-schaefer/ |
| Yvonne Hickmann | — | /makler/yvonne-hickmann/ |
| Ute Bremer | — | /makler/ute-bremer/ |
| Michael Pollvogt | — | /makler/michael-pollvogt/ |

**Phase 1:** Diese 8 Makler statisch einbauen mit den vorhandenen Daten.
**Phase 2:** Alle 120+ Vermittler dynamisch über PW-API laden.

---

## 11. 301-Redirects (_redirects)

```
# Alte URLs → Neue URLs
/altersvorsorge-2/                    /kunde/altersvorsorge           301
/einkommenssicherung/                 /kunde/einkommenssicherung      301
/zahnzusatzversicherung/              /kunde/zahnzusatzversicherung   301
/krankenhauszusatzversicherung/       /kunde/krankenhauszusatzversicherung 301
/dein-haustier/                       /kunde/haustier                 301
/haus-wohnen/                         /kunde/haus-wohnen              301
/vermoegensaufbau/                    /kunde/vermoegensaufbau         301
/makler-suche/                        /makler-suche                   301
/makler-werden/                       /makler-werden                  301
/ueber-uns/                           /ueber-uns                      301
/kontakt/                             /kontakt                        301
/impressum/                           /impressum                      301
/datenschutz/                         /datenschutz                    301
/erstinformation/                     /erstinformation                301
/beschwerdemanagement/                /beschwerdemanagement           301
/barrierefreiheit/                    /barrierefreiheit               301

# Makler-Profile (existierende)
/makler/dieter-satler/                /makler/dieter-satler           301
/makler/gerhard-graf/                 /makler/gerhard-graf            301
/makler/oliver-mainusch/              /makler/oliver-mainusch         301
/makler/heico-fillinger/              /makler/heico-fillinger         301
/makler/andre-quendler-schaefer/      /makler/andre-quendler-schaefer 301
/makler/yvonne-hickmann/              /makler/yvonne-hickmann         301
/makler/ute-bremer/                   /makler/ute-bremer              301
/makler/michael-pollvogt/             /makler/michael-pollvogt        301

# Alte Unterseiten die es evtl. noch gibt
/privatkunden/altersvorsorge-2/       /kunde/altersvorsorge           301
/privatkunden/einkommensicherung/     /kunde/einkommenssicherung      301
/privatkunden/vermoegensaufbau/       /kunde/vermoegensaufbau         301
/privatkunden__trashed/zahnzusatzversicherung/ /kunde/zahnzusatzversicherung 301
```

---

## 12. Kontaktdaten (global, für Footer + Kontaktseite)

```
Firma:    Phönix Maklerverbund GmbH
Straße:   Zum weißen Stein 17
PLZ/Ort:  56587 Oberhonnefeld-Gierend
Telefon:  02634/659858-0
Fax:      02634/659858-9
E-Mail:   info@phoenix-maklerverbund.de
Maps:     https://maps.app.goo.gl/LuPCMLrRu2hMo2LPA
```

---

## 13. Design-Tokens

```css
:root {
  /* Farben */
  --color-primary: #6cbe45;
  --color-primary-dark: #4a9e2f;
  --color-primary-light: #e8f5e0;
  --color-dark: #1a1a2e;
  --color-text: #2d2d44;
  --color-text-muted: #6b7280;
  --color-bg: #ffffff;
  --color-bg-light: #f3f4f6;
  --color-border: #e5e7eb;

  /* Typografie */
  --font-heading: 'Inter', 'Plus Jakarta Sans', system-ui, sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;
  --font-size-base: 16px;
  --line-height: 1.6;

  /* Spacing */
  --section-gap: 80px;
  --content-max-width: 1200px;
  --padding-x: 24px;

  /* Barrierefreiheit */
  --focus-outline: 3px solid #6cbe45;
  --focus-offset: 2px;
  --min-touch-target: 44px;
}
```

---

## 14. Checkliste: Erster Sprint

### Tag 1: Setup + Assets
- [ ] Projekt initialisieren
- [ ] Alle Bilder von WP-Uploads runterladen → `/public/images/`
- [ ] Erstinformation-PDF sichern → `/public/docs/`
- [ ] Design-Tokens / CSS-Variablen anlegen
- [ ] BaseLayout mit Header + Footer

### Tag 2-3: Globale Komponenten + Startseite
- [ ] Header-Komponente (Desktop + Mobile)
- [ ] Footer-Komponente (mit allen Kontaktdaten)
- [ ] Navigation (mit Makler-werden CTA)
- [ ] HeroSection (3 Varianten prototypen)
- [ ] Startseite fertig

### Tag 3-4: Makler werden + Kundenseite
- [ ] Makler-werden-Seite (Texte 1:1 + Formular-Platzhalter)
- [ ] Kundenseite (neu, mit Makler-Suche + Kacheln)
- [ ] Erstinformation-Modal (Trigger bei /kunde/*)

### Tag 4-5: Alle 7 B2C-Seiten
- [ ] TeaserCard-Komponente bauen
- [ ] ProductBlock-Komponente bauen
- [ ] JSON-Daten für alle 7 Seiten anlegen (aus dieser MD)
- [ ] Alle 7 Seiten rendern

### Tag 5-6: Über uns + Maklerfinder + Rechtliches
- [ ] Über uns (Texte 1:1)
- [ ] Maklerfinder (statisch mit 8 Maklern, Platzhalter für API)
- [ ] Impressum, Datenschutz, Erstinformation, Barrierefreiheit, Beschwerdemanagement

### Tag 6-7: Polish + Barrierefreiheit
- [ ] Responsive Testing
- [ ] WCAG 2.1 AA Check (Lighthouse, WAVE)
- [ ] 301-Redirects einrichten
- [ ] Performance Check

### Phase 2 (nach CRM-Zugang):
- [ ] PW-API Endpunkte testen
- [ ] Registrierungsformular an API anbinden
- [ ] Maklerfinder auf API umstellen
- [ ] Make-Szenarien aufsetzen
- [ ] Foto-Upload-Seite bauen
