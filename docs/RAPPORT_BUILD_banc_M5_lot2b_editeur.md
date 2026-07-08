# RAPPORT — build « Banc M5 · Lot 2b : éditeur du profil de test (38 variables + cartes d'année) »

> Éditeur UI d'un CLONE en mémoire du profil actif. N'écrit rien ; ne touche NI le moteur NI config_scoring.
> Golden bit-identique. **Non committé.** Commit SÉPARÉ, manuel (Arno).

## Diagnostic (recon LECTURE SEULE)
- **`profilTest.ts` (Lot 2)** : `clonerProfil` (structuredClone, indépendant), `diffProfils` (récap scalaires + cartes
  ADD/DEL/MOD), `validerCartesAnnee` (re-export), `STATUT_VARIABLE`/`VARIABLES_VESTIGIALES` — tous PURS, client-safe.
- **`pilotage/mappingConfig.ts` (META)** : table déclarative par COLONNE `config_scoring` — libellé, unité, famille,
  statut (VIVE/VESTIGIALE/DE GARDE/MIROIR), type, min/max/pas, optionsEnum, editable, infobulle. **Client-safe** (aucun
  `server-only`). C'est la source à réutiliser (BE-23). `FAMILLES_ORDRE` = ordre de regroupement.
- **`profilConfig.chargerProfilDegagement` (`:99-136`)** : mappe colonnes→champs INLINE (non exporté) → j'ai reconstruit
  ce mapping 1:1 dans un pont dédié (aucune modification de `profilConfig`).
- **Branchement Lot 5** : `POST /api/admin/banc-comparer` accepte déjà `body.profilTest` (`comparerProfils(params,
  profilTest)`) → l'UI n'a qu'à envoyer le profil de test édité. Point d'injection prêt, aucun changement backend Lot 5.

## Implémentation (5 fichiers)
- **`banc-test/pontProfil.ts` (NEW, pur, testé)** : pont colonne↔champ `ProfilDegagement` (38 entrées, 1:1 avec
  `chargerProfilDegagement`). `lire`/`ecrire` (ecrire mute un CLONE). `pontProfil.test.ts` : 38 colonnes = celles de
  META, mapping fidèle sur le défaut, round-trip + immutabilité de la source (3 tests).
- **`api/admin/banc-profil-actif/route.ts` (NEW)** : `GET` → `chargerProfilDegagement()` (profil actif), LECTURE SEULE,
  gardé par proxy.ts. Sert à initialiser le clone.
- **`banc-test/EditeurProfilTest.tsx` (NEW)** : éditeur groupé par famille (ordre M1), réutilisant META (libellés,
  bornes, statuts, types, enums). VESTIGIALES grisées + « sans effet sur le score » (lecture seule, BE-21a). Édition
  scalaire → clone + `ecrire` clampé aux bornes META (BE-24) → `onChange`. Cartes d'année : CRUD (ajout/édition/
  suppression) + `validerCartesAnnee` (erreurs affichées). Badge ● sur chaque champ modifié vs actif ; compteur
  d'écarts (`diffProfils`) + bouton Réinitialiser (BE-26).
- **`banc-test/BancSaisie.tsx` (MODIFIÉ)** : charge le profil actif (fetch, setState async) → `profilTest =
  clonerProfil(actif)` ; rend l'éditeur ; `lancer()` envoie `{...parametres, profilTest}` → deltas ≠ 0 dès qu'une
  variable diverge ; péremption inclut le profil (CA-5.4) ; « Lancer » bloqué si cartes invalides (BE-24).

## A. DÉCISIONS HORS-SPECS
- **A1 — Pont colonne↔champ reconstruit (non réutilisé depuis `profilConfig`).** Le mapping y est INLINE et non
  exporté ; l'exporter = toucher un fichier sensible (interdit). Choix : pont dédié `pontProfil.ts`, **testé pour
  fidélité** (round-trip + valeurs par défaut == champs du profil) → attrape toute divergence de mapping. Alternative
  écartée : refactorer `profilConfig` pour exposer un mapper (hors périmètre, fichier sensible).
- **A2 — Éditeur sur `ProfilDegagement` (pas sur une map de colonnes).** Le profil de test EST un `ProfilDegagement`
  (ce que `comparerProfils` attend) ; le pont permet de réutiliser META (par colonne) tout en éditant le profil.
  Alternative écartée : éditer une map de colonnes puis convertir → aurait dupliqué le mapping colonne→profil.
- **A3 — VESTIGIALES en LECTURE SEULE (grisées + « sans effet »), pas masquées.** BE-21a : « masquées OU marquées
  non-consultées ». Choix : affichées grisées avec le statut et « sans effet sur le score » (cohérent avec M1 qui les
  montre `editable:false`). Elles ne peuvent PAS être éditées → ne peuvent pas influencer le score (renforce CA-2.6).
- **A4 — Clamp des scalaires aux bornes META à l'écriture (BE-24).** Une valeur hors [min,max] est ramenée dans la
  plage avant d'entrer dans le clone. Les cartes chevauchantes bloquent l'exécution (`validerCartesAnnee` + garde sur
  « Lancer »). Alternative écartée : laisser saisir hors bornes → risque de valeurs absurdes (ex. `distanceMaxM=0`).
- **A5 — Récap des écarts = éditeur groupé + badges ● + compteur (pas une liste séparée).** BE-25 « récap bien
  visible » : le regroupement par famille (BE-25a) + le ● par champ modifié + le compteur `diffProfils.total` +
  (Lot 5) le récap `ecarts` au comparatif rendent les écarts visibles à la source. Alternative écartée : un panneau
  récap dédié → redondant avec les badges inline.

## B. DOUTES
- **B1 (mineur, non-render)** — l'éditeur (grille de 38 champs + cartes) n'a pas été vérifié visuellement (pas de
  navigateur). Garanties : pont testé (3/3), tsc 0, eslint 0, build ✓, golden 22/22. À valider à l'œil sur `/admin/banc-test`.
- **B2 (mineur)** — le badge ● « modifié » compare `String(valeur)` (tolérant aux types) ; suffisant pour l'affichage.
  Le récap canonique reste `diffProfils` (Lot 2, testé).

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **L'éditeur NE PEUT PAS muter l'actif ni config_scoring** : chaque édition fait `clonerProfil(profilTest)`
    (structuredClone, indépendance prouvée Lot 2) puis `ecrire` sur le CLONE ; `profilActif` n'est que LU (diff/reset).
    `config_scoring` n'est jamais écrit (la route profil-actif est un SELECT ; comparerProfils est pur). Reset =
    `clonerProfil(profilActif)`.
  - **GOLDEN** : `test:integration` **22/22**, `29.107259068449615` inchangé (édition 100 % en mémoire ; moteur/config
    non touchés).
  - **NO-WRITE** : aucune écriture DB, aucune migration ; route `banc-profil-actif` = lecture ; profil de test jamais
    persisté (BE-27).
  - **PILOTAGE SANS CODE** : réutilise META (VIVE/VESTIGIALE/DE GARDE) + `validerCartesAnnee` — pas de barème dupliqué
    (BE-23). Constantes géométriques hors profil (ORIENTATION_SECTEURS…) NON exposées (BE-21b : non tunables).
  - **ISOLATION dure** : `coucheDegagement`, `config_scoring`, `profilConfig`, `PROFIL_GOLDEN_REF`, `geom_point`,
    Gemini, `verdict`, `pipeline.ts`, seam Lot 1, `profilTest.ts`, `bancEssai.ts`, `mappingConfig` — **intouchés**
    (lus/importés seulement). `git status` = `BancSaisie.tsx` (M) + 4 fichiers neufs.
  - **prefers-reduced-motion** : aucune animation ajoutée.
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **439** (436 + 3 pont) · `next build` ✓ (routes
    `/admin/banc-test` + `/api/admin/banc-profil-actif`).

## Vérification manuelle attendue (Arno)
- Modifier une variable VIVE (ex. « ×80 » `plafond_degagement`) → badge ●, compteur d'écarts ↑ → « Lancer » → delta ≠ 0,
  actif inchangé. Éditer une VESTIGIALE : impossible (grisée). Ajouter deux cartes d'année chevauchantes → erreur +
  « Lancer » bloqué. « Réinitialiser » → 0 écart, delta 0.

## Verdict de conformité : livraison prête. Éditeur des 38 variables + cartes d'année sur un CLONE en mémoire (pont
## testé, META réutilisée, cartes validées) ; l'actif et config_scoring restent intacts ; deltas ≠ 0 débloqués ;
## golden 22/22. À valider à l'œil sur /admin/banc-test.
