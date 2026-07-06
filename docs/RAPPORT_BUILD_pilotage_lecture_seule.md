# RAPPORT FINAL — build « M1 Pilotage LECTURE SEULE » (Étape 2)

> Run `/svav-build` autonome sur `docs/SPEC_pilotage_lecture_seule.md`. **Non committé** (Arno valide et
> commit). Trois catégories : A décisions hors-specs · B doutes · C écarts de conformité.

## Résumé
Livraison **complète et verte, lecture seule intégrale**. Route `GET /api/admin/config` (SELECT des 46
colonnes de `config_scoring id=1`, via le pool générique `client.ts`, `server-only`, gardée par le proxy),
page Pilotage affichant les 46 variables **groupées par famille** (libellé + unité + **nom technique
visible** + statut + valeur + défaut), badge **profil actif / repli**, bannière **Couche 1 seule**.
`tsc`/`eslint` 0 ; **vitest 11/11** ; `npm test` sans régression ; **golden 14/14, `29.107259068449615`
inchangé** ; smoke test route **401 (sans session) / 200 + 46 champs (avec session)**.

## Fichiers produits
- `app/(admin)/admin/(protected)/pilotage/mappingConfig.ts` (+ test) — 46 entrées, défauts **codés en dur**
  du seed migration 003, corrections C1/C2/C3.
- `app/(admin)/api/admin/config/repli.ts` (+ test) — `evaluerRepli` (3 conditions, `MODES` copié, pur).
- `app/(admin)/api/admin/config/route.ts` (+ test) — `GET` unique, SELECT id=1, `{present,valeurs,repli}`.
- `app/(admin)/admin/(protected)/pilotage/page.tsx` — remplace le placeholder (client, fetch de la route).

## A. DÉCISIONS HORS-SPECS (à contrôler par Arno)
- **A1 — Page = composant client** (`'use client'`) qui `fetch('/api/admin/config')` en relatif same-origin
  (cookie de session envoyé). Alternative écartée : composant serveur (URL absolue + reforward cookie
  fragile, ou `query()` direct qui court-circuiterait la frontière « route dédiée » D1). Honore D1.
- **A2 — `repli.ts` co-localisé** avec la route (`app/(admin)/api/admin/config/repli.ts`), fonction pure
  sans `server-only` (aucun secret/DB), importée uniquement par la route.
- **A3 — Défauts codés en dur** dans `mappingConfig.ts` (copiés verbatim du seed migration 003), **PAS**
  importés de `PROFIL_DEGAGEMENT_DEFAUT` — respect strict de l'isolation (pas d'import `app/lib/svv`).
- **A4 — Orientation côte à côte via détection de préfixe** (`estOrientation`) plutôt qu'un champ ajouté
  au type `ColonneMeta` (garde la forme de type minimale).
- **A5 — Rangement des familles** : `borne_annee_1900/1935` classées en Famille 2 (barème par famille de
  bâtiment), conforme au mapping de la spec. Répartition : F0:1, F1:2, F2:16, F3:6, F4:4, F5:10, F6:1,
  F7:1, F8:5 = 46.
- **A6 — Teintes de statut hors palette** : badges « de garde » (ambre) et « miroir » (bleu) en hex codés
  en dur, faute de tokens SVAV dédiés (le nuancier `--color-svv-*` ne couvre pas amber/bleu). Voir B/D2.

## B. DOUTES (à trancher par Arno)
- **B1 — `formaterMalusPct` peut arrondir (touche EX-7 / §5 « aucun arrondi »)** : `toLocaleString('fr-FR')`
  applique par défaut `maximumFractionDigits:3`. **Sans effet sur la valeur actuelle 0,01** (défaut), mais
  une valeur `couloir_malus_pct` non standard réellement stockée (ex. `0.0125`) s'afficherait « 0,013 »
  (arrondie), contredisant EX-7/EX-20 « valeur brute sans arrondi ». **Correction recommandée (1 ligne)** :
  rendre la fraction via `String(valeur)` (ou `maximumFractionDigits:20`) et n'appliquer le formatage
  qu'à l'équivalent « % ». → voir aussi C1.
- **B2 — Palette (EX-14)** : hex codés en dur pour garde/miroir/repli. `#fff`/`#eceef1`/`#fdecec`
  pourraient réutiliser `--color-svv-field`/`-line` ; amber/bleu n'ont pas d'équivalent token. À arbitrer
  (élargir les tokens ou tolérer ces teintes).
- **B3 — Test route** : `query` mocké → aucun test ne prouve que le `SELECT` liste bien les **46 vraies
  colonnes** (une faute de frappe SQL passerait). Partiellement couvert par `mappingConfig.test` +
  smoke-test manuel (46 champs observés). À renforcer si souhaité (test d'intégration route↔DB).

## C. ÉCARTS DE CONFORMITÉ
- **C1 — MINEUR (EX-7 « valeur brute sans arrondi »)** : le formateur du malus (B1) peut arrondir
  l'affichage d'une valeur non standard. **Aucun impact sur les données actuelles** (0,01 exact), aucun
  impact moteur (affichage pur, ne réalimente aucun calcul). **Correction 1 ligne recommandée avant
  commit** (ou suivi). Tout le reste de la batterie est **vert** :
- **Golden** : `test:integration` 14/14, `29.107259068449615` **inchangé** (aucun mouvement).
- **Lecture seule** : `GET` unique, aucun `INSERT/UPDATE/DELETE`, aucune méthode non-GET, aucun champ
  éditable — vérifié par grep + smoke test.
- **Isolation** : aucun import `app/lib/svv` ni métier DB ; seul `client.ts` (lecture) ; défauts en dur.
- **Moteur / config_scoring / migrations / Gemini** : aucun fichier touché.

---

## Verdict de conformité : livraison prête (1 correction cosmétique mineure recommandée — B1/C1). Aucune
## suppression de données (Règle dure non sollicitée). Aucun blocage.
