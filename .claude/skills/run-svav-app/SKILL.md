---
name: run-svav-app
description: Lance et pilote l'application Sans Vis-à-Vis (Next.js 16 + Postgres/PostGIS + MinIO). À utiliser pour démarrer l'app, faire un smoke de l'émission de certificat, régénérer/screenshoter un certificat PDF, ou vérifier que le runtime sert (run, start, launch, smoke, screenshot, render, drive the app, émettre un certificat, rendre le PDF).
---

# Run — Sans Vis-à-Vis®

App **web Next.js 16** (React 19, TS, Tailwind v4) adossée à **PostgreSQL 17 + PostGIS** (données LiDAR
locales), **MinIO** (stockage objet S3), tuiles **IGN** (réseau), SMTP (envoi certificat). Le dev tourne en
**webpack** (`NEXT_TURBO=0 next dev`), pas Turbopack.

**On ne pilote pas cette app par des clics** : le cœur est l'API + le pipeline de certificat. Le driver
`.claude/skills/run-svav-app/driver.mjs` fait tout : préflight infra, (ré)utilisation du dev server, smoke
de l'API d'émission **sans effet de bord**, et rendu réel d'un certificat PDF → **PNG sur disque**.

> Tous les chemins sont relatifs à la racine de l'app (le dossier avec `package.json`). Lance le driver
> depuis cette racine. Il charge `.env` + `.env.local` lui-même.

## Prérequis (déjà en place sur la machine de dev — le driver les VÉRIFIE)

Le driver ne bootstrappe pas l'infra ; il **échoue clairement** si elle manque. Doivent tourner/exister :
- **Node 24**, deps installées (`npm install`), `node_modules/.bin/tsx` présent.
- **PostgreSQL + PostGIS** joignable via `DATABASE_URL` (avec les tables internaute/certificat + données LiDAR).
- **MinIO** joignable sur `S3_ENDPOINT` (bucket `svav-dev` déjà créé). Binaire présent dans `.minio/`.
- **`pdftoppm`** (poppler) pour le screenshot. macOS : `brew install poppler`.
- `.env` / `.env.local` avec `DATABASE_URL`, `S3_*`, `SITE_URL`, `INTERNAUTE_TOKEN_SECRET` (SMTP facultatif
  pour le smoke — il n'envoie aucun mail).

Vérifie tout d'un coup :

```bash
node .claude/skills/run-svav-app/driver.mjs preflight
```

Sortie obtenue :

```
✓ env: DATABASE_URL, S3_*, SITE_URL, INTERNAUTE_TOKEN_SECRET présents
✓ outils: tsx, pdftoppm
✓ Postgres joignable (12 internautes)
✓ MinIO joignable (http://localhost:9000)
```

## Run (chemin agent) — le driver

Séquence complète (préflight → réutilise/lance le dev server → smoke API → rendu+screenshot → stop) :

```bash
node .claude/skills/run-svav-app/driver.mjs all
```

Fin de sortie obtenue :

```
✓ dev déjà en service, réutilisé: http://localhost:3001
· POST /api/certificat (projet 51, SAVV-2026-000012) → HTTP 200
· {"ok":true,"numero":"SAVV-2026-000012","reference":"SVAV-69N5-CAVJ","verdict":"SANS_VIS_A_VIS","deja":true}
✓ smoke OK: chaîne runtime + jeton d'émission + ownership + DB (aucun e-mail, aucune nouvelle ligne)
✓ screenshot: /tmp/svav-cert-1.png  (rendu réel du certificat produit par les modules de prod)
✓ ALL OK
```

Sous-commandes (mêmes que dans `all`, utilisables seules) :

```bash
node .claude/skills/run-svav-app/driver.mjs up       # réutilise un dev server, sinon en lance un sur :3020
node .claude/skills/run-svav-app/driver.mjs smoke    # POST /api/certificat idempotent → deja:true (0 effet de bord)
node .claude/skills/run-svav-app/driver.mjs render   # régénère un certificat PDF + PNG /tmp/svav-cert-1.png
node .claude/skills/run-svav-app/driver.mjs down     # stoppe UNIQUEMENT le dev lancé par le driver
```

- **`up`** — Next 16 n'autorise **qu'un seul** dev server par projet ; le driver **réutilise** celui déjà en
  service (sonde `:3020/:3000/:3001/:3010` via un `POST /api/certificat` bidon → 401), et n'en lance un
  (`:3020`) que s'il n'y en a aucun. Le base URL retenu est écrit dans `/tmp/svav-driver-base`.
- **`smoke`** — ré-émet un projet **déjà certifié** : `emettreCertificat` renvoie `existant` **avant** la
  chaîne de publication (`app/lib/db/certificatEmission.ts:141`) → **aucun mail, aucune ligne créée**. Prouve
  runtime + jeton d'émission (`scope emit-certificate`, `sub=projetId`) + ownership + DB.
- **`render`** — invocation **directe** des modules de prod (`orientationCarte` + `publierCertificatPdf.assembler`
  + `certificatPdf`) via `render-cert.ts` : régénère la carte (mosaïque IGN réelle) et le PDF, puis
  `pdftoppm` → **`/tmp/svav-cert-1.png`**. C'est la couche que touchent la plupart des PR (carte / PDF).

**Le screenshot `/tmp/svav-cert-1.png` est le certificat complet** (en-tête, verdict, score, empreinte, carte
« vue-en-haut » bi-teinte, pied CRITERIMMO) — ouvre-le pour vérifier un rendu.

## Invocation directe (sans HTTP) — la couche des PR carte/PDF

Régénère un certificat PDF pour n'importe quel numéro, sans dev server :

```bash
node_modules/.bin/tsx .claude/skills/run-svav-app/render-cert.ts SAVV-2026-000012 /tmp/out.pdf
```

Importe les modules de prod, lit la ligne `certificat` jointe en base, génère carte + PDF. `DATABASE_URL` et
`SITE_URL` doivent être dans l'env (ou lance via le driver qui charge `.env`).

## Test

```bash
npx vitest run                     # suite unitaire (~1200 tests)
npm run test:integration           # rejoue le GOLDEN Asnières = 29.107259068449615 (~160 s)
```

Le golden `29.107259068449615` doit rester **bit-identique** : c'est l'invariant de non-régression du moteur.

## Run (chemin humain)

`npm run dev` (webpack, port 3000) ouvre le tunnel public sur `/` — mais le **premier** rendu de `/` compile
`app/page.tsx` (très gros) et peut prendre >60 s. Inutile en pilotage headless : le driver contourne en
sondant l'API. L'admin est sur `/admin` (307 → login ; compte via `npm run admin:creer`).

## Gotchas (cicatrices réelles)

- **Un seul dev server par projet (Next 16).** Lancer un 2e `next dev` imprime `Another next dev server is
  already running` et **sort sans écouter**. Le driver le gère en réutilisant l'existant ; ne lance jamais
  `next dev -p XXXX` en aveugle si un tourne déjà.
- **Ne jamais health-check sur `/`.** Le premier hit compile `app/page.tsx` et peut dépasser 60–120 s → faux
  négatif « app down ». Le driver sonde `POST /api/certificat` (route légère → 401) à la place.
- **Smoke idempotent = zéro effet de bord.** Il vise un projet déjà certifié → `deja:true`, **pas** de mail.
  Ne le pointe pas sur un projet non émis : une vraie émission publie le PDF **et envoie un e-mail réel**
  (SMTP est configuré). Le driver choisit toujours le dernier certificat existant, donc c'est sûr.
- **Tuiles IGN manquantes au render.** `[carte-orientation] tuile z18 … manquante (fetch failed)` est
  **toléré** : sous 25 % de pertes la carte est produite quand même (trou clair au coin). Au-delà →
  `ErreurCarteIncomplete`. Purement réseau, pas un bug.
- **`timeout` n'existe pas sur macOS** (c'est `gtimeout`, via `brew install coreutils`). N'enrobe pas les
  commandes du driver avec `timeout`.
- **pdfkit doit rester externalisé** (`serverExternalPackages: ['pdfkit']` dans `next.config.ts`) : sinon le
  PDF plante en runtime (`.afm` non émis par webpack → ENOENT). Déjà en place.
- **Fichiers Gemini hors périmètre** : ne touche pas `app/lib/svv/adaptateurIaPhoto.ts` ni
  `app/api/analyse-photo/route.ts`.

## Troubleshooting

| Symptôme | Cause / fix |
|---|---|
| `✗ MinIO injoignable` | MinIO down. Le binaire est dans `.minio/` ; démarre-le (`MINIO_ROOT_USER=… MINIO_ROOT_PASSWORD=… ./.minio/minio server .minio/data --address :9000`) puis relance `preflight`. |
| `✗ Postgres injoignable` | PG down ou `DATABASE_URL` faux. Vérifie `psql "$DATABASE_URL" -c 'select 1'`. |
| `up` → `Next refuse un 2e dev server` | Un `next dev` tourne déjà mais sur un port hors des candidats. Ajoute son port à `CANDIDATE_PORTS` dans `driver.mjs`, ou arrête-le. |
| `render` → beaucoup de `tuile … manquante` puis `ErreurCarteIncomplete` | Réseau IGN dégradé (>25 % de tuiles perdues). Réessaie ; ce n'est pas l'app. |
| smoke ≠ `deja:true` | Le dernier certificat pointe un projet dont l'émission n'est pas idempotente (rare). Vise un `SAVV-…` connu-émis via `render-cert.ts`. |
