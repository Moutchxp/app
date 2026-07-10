# PLAN M2 — Découpage en lots committables

> Étude d'architecture. **Ce document ne construit rien** : il ordonne les lots d'implémentation futurs.
> Chaque lot = **une modif logique = un commit** (convention SVAV). Le **golden ne doit JAMAIS être
> concerné** ; les lots 1-2 doivent le **prouver** (garde anti-couplage + re-run 23/23).
> Spécifications : `SPEC_M2_statistiques.md`, `SPEC_M2_evenements.md`, `SPEC_M2_rgpd_et_donnees_personnelles.md`.

---

## Pourquoi le premier lot n'est PAS le dashboard

Le dashboard est **inutile tant que rien n'est collecté** : point zéro rétroactif ≈ 0. Et surtout, la
**sécurité du seam d'écriture** (ne jamais bloquer une certification, golden intact, pool isolé) doit
être **prouvée avant** toute UI. Construire le dashboard d'abord, c'est peindre une façade sur des
fondations non coulées. **Ordre imposé par les dépendances : Fondation → Instrumentation → Compaction/
Purge → Lecture → Dashboard → Carte → Audit interne.**

Avant tout lot d'implémentation : **décisions d'Arno requises** (voir résumé chat) — Q1 (voie A agrégats
vs B événements bruts), Q2 (granularité carte), Q3 (visiteur unique), Q4 (suivi collègues), + les points
**juriste (J)**. Les lots ci-dessous supposent la **voie A** (défaut recommandé).

---

## Lot 1 — FONDATION : schéma, writer isolé, pool dédié, garde anti-couplage  *(PREMIER)*
- **Périmètre** : migration des tables analytics **autonomes** (`stat_compteur_jour`, `stat_session`
  éphémère partitionnée, `stat_admin_jour`, `config_catalogue_evenement`, `config_retention`) ; module
  writer isolé `app/lib/analytics/**` ; **pool `pg` dédié borné** (max 2-3, `statement_timeout` court) ;
  garde ESLint `no-restricted-imports` (writer interdit dans `svv/**` + `pipeline.ts`) ; **test de graphe
  d'imports**. **Aucune instrumentation du tunnel encore, aucun dashboard.**
- **Fichiers touchés** : `db/migrations/018_*` (nouveau) ; `app/lib/analytics/*` (nouveau) ;
  `.eslintrc`/config ESLint ; un test de graphe. **Ne touche AUCUN fichier moteur ni `client.ts`** (pool
  dédié = nouveau module, pas une modif de `client.ts`).
- **Tests exigés** : migration idempotente/rejouable ; tables **disjointes** (aucun FK/trigger/colonne
  sur une table de calcul — EARS-M7) ; garde ESLint échoue si on importe le writer depuis `svv`/pipeline
  ; test de graphe : `analytics/**` absent de la clôture de `pipeline.ts`/`verdict.ts`/`scoreTotal.ts` ;
  writer testé en isolation (fire-and-forget, exception avalée).
- **Critère de sortie** : **golden 23/23 bit-identique** ; garde verte ; pool dédié prouvé distinct ;
  invariant PII (aucune colonne durable ne peut recevoir IP/UA brut/referer complet/email/lat-lon/cleabs).
- **Golden concerné ?** **NON** (tables disjointes, aucun fichier moteur ; à **prouver** par re-run).

## Lot 2 — INSTRUMENTATION du tunnel public (émission best-effort)
- **Périmètre** : émission des événements (`SPEC_M2_evenements.md` §3) via `after()` (post-réponse),
  payload construit **dans** le callback gardé ; events client (bots filtrés : event JS requis) ;
  contexte de session éphémère ; pseudonymisation à l'écriture (referer host-only, allowlist UTM, strip
  click-ids, UA classé, commune dérivée, score tranché).
- **Fichiers touchés** : `app/api/analyse/route.ts`, `app/api/origine/route.ts` (émission `after()` **hors
  du `try` de calcul**) ; `app/page.tsx` (émission client des `etape_atteinte`/`session_debut`, sans PII) ;
  `app/lib/analytics/*`. **Ne touche NI `pipeline.ts` NI `app/lib/svv/**`.**
- **Tests exigés** : **SI le writer lève (throw sync ou async), ALORS la route répond quand même** (test
  dédié — EARS-M2) ; le writer n'est jamais dans le chemin pur (garde Lot 1 toujours verte) ; aucune PII
  dans les payloads (test d'allowlist : email/click-id/lat-lon/UA brut rejetés) ; filtrage bots (UA bot →
  non compté).
- **Critère de sortie** : **golden 23/23** ; une certification **n'échoue jamais** même writer/base en
  panne ; pool public non affamé (isolation pool prouvée).
- **Golden concerné ?** **NON** (émission en route/`after`, pipeline pur inchangé ; le golden appelle
  `analyserAdresse` en direct — hors du site d'émission).

## Lot 3 — COMPACTION session→agrégats + PURGE (config-driven)
- **Périmètre** : job de compaction (session éphémère → compteurs jour, `session_fin` synthétisé sur
  timeout d'inactivité, durée bucketée) ; purge par `DROP` de partition ; durées lues en config.
- **Fichiers touchés** : `app/lib/analytics/*` ; route/endpoint admin de déclenchement (`perm_statistiques`)
  ou script planifié ; **pas de `pg_cron` présumé**.
- **Tests exigés** : compaction correcte (buckets, étape max, complétion) ; purge `DROP` de partition ;
  durées **jamais en dur** (lues de `config_retention`) ; idempotence (rejouer la compaction d'un jour
  scellé ne double-compte pas — EARS-T3).
- **Critère de sortie** : le store durable ne contient que des agrégats jour k-safe ; l'éphémère est
  purgé au TTL ; **aucune seconde absolue au repos**.
- **Golden concerné ?** **NON**.

## Lot 4 — API de LECTURE / agrégation (pseudonyme, k-anonyme, TZ-correct)
- **Périmètre** : routes de lecture (`perm_statistiques`) : fenêtre libre (bornes `timestamptz`, `ts`
  nue dans le WHERE — EARS-V2), agrégats par jour/source/verdict/commune ; **k-suppression** + l-diversité
  côté serveur ; `statement_timeout` court.
- **Fichiers touchés** : `app/(admin)/api/admin/statistiques/*` (nouveau).
- **Tests exigés** : k-suppression (commune < k → non renvoyée) ; l-diversité (verdict homogène non
  ventilé) ; suppression complémentaire ; fenêtres alignées jour + DST (jours 23/25 h) ; **sous-jour
  interdit sur la carte** (EARS-T4) ; WHERE indexable (pas d'`AT TIME ZONE` sur la colonne).
- **Critère de sortie** : aucune réponse ne peut ré-identifier (mailles < k jamais renvoyées, même via
  un canal de comptage sous filtres — constat R1-5) ; pas d'impact sur le pool public.
- **Golden concerné ?** **NON**.

## Lot 5 — DASHBOARD UI (KPI, fenêtre, graphiques SVG, badges, mobile)
- **Périmètre** : écran `statistiques/` ; cartes KPI (visites, provenance, ratio verdicts 3 buckets +N,
  analyses lancées, entonnoir/abandon par étape) ; sélecteur de fenêtre (≥ jour) ; **badges ✓/≈/⚠** ;
  **N affiché sous chaque %** ; graphiques **SVG/CSS inline** (aucune dépendance) ; responsive 375px ;
  **aucun bleu**.
- **Fichiers touchés** : `app/(admin)/admin/(protected)/statistiques/*` (nouveau).
- **Tests exigés** : chaque estimation porte son badge/biais (EARS-D4) ; % masqué sous N<seuil (EARS-D3) ;
  « Direct / inconnu » jamais « Accès direct » ; « Visites » jamais « visiteurs uniques » ; part bots
  affichée ; 375px sans débordement ; aucun `#…blue`/focus bleu sur les nouveaux éléments.
- **Critère de sortie** : aucune tuile ne peut induire Arno en erreur (métriques refusées absentes,
  estimations badgées).
- **Golden concerné ?** **NON**.

## Lot 6 — CARTE communale (Leaflet, k-suppression, l-diversité)
- **Périmètre** : choropleth communal (densité d'analyses) ; k-suppression ; libellé « où des analyses
  ont été lancées » ; verdict/score par commune seulement (sous `k_attribut` + l-diversité) ; jamais le
  point/cleabs/maille fine.
- **Fichiers touchés** : `app/(admin)/admin/(protected)/statistiques/*` (Leaflet réutilisé) ; import léger
  des géométries communales si nécessaire (lot data séparé possible).
- **Tests exigés** : commune < k absente ; verdict homogène non affiché ; utilisable au doigt (375px) ;
  aucune fenêtre sous-jour ; aucun point exact rendu.
- **Critère de sortie** : impossible de remonter à un logement depuis la carte.
- **Golden concerné ?** **NON**.

## Lot 7 — AUDIT interne agrégé + détection brute-force *(indépendant, peut venir tôt)*
- **Périmètre** : `admin_connexion` (historique agrégé) + `admin_connexion_echec` (détection
  brute-force, manque actuel) ; vue agrégée (Q-C périmètre 1) ; **pas de géoloc IP**.
- **Fichiers touchés** : `app/(admin)/api/admin/session/route.ts` (émission échec/succès, best-effort,
  hors chemin de login critique) ; `app/lib/analytics/*` ; UI audit dans `statistiques/`.
- **Tests exigés** : un échec d'émission n'empêche jamais la connexion ; agrégat sans profilage individuel
  par défaut ; aucune IP stockée.
- **Critère de sortie** : signal de sécurité (échecs répétés) visible ; pas de surveillance individuelle
  par défaut.
- **Golden concerné ?** **NON**.

## Lot 8 (OPTIONNEL, différé) — Rollup / partition avancée quand le volume l'exige
- **Périmètre** : tables de rollup + partition mensuelle avancée **si** (voie B choisie) ou si le volume
  dépasse un seuil **configurable** ; réconciliation bords de fenêtre (EARS-T3).
- **Déclencheur** : protection du pool public / rétention, **pas** un simple nombre de lignes (constat
  R3-5/6). À faible trafic (voie A), **probablement jamais nécessaire**.
- **Golden concerné ?** **NON**.

---

## Récapitulatif dépendances

```
Lot 1 (fondation) ─┬─> Lot 2 (instrumentation) ─> Lot 3 (compaction/purge) ─> Lot 4 (lecture)
                   │                                                              │
                   │                                                              ├─> Lot 5 (dashboard)
                   │                                                              └─> Lot 6 (carte)
                   └─> Lot 7 (audit interne)   [indépendant, peut suivre le Lot 1]
Lot 8 (rollup)     [optionnel, différé, piloté par volume/rétention]
```

**Le dashboard (Lot 5) est en 5ᵉ position** : il dépend de la fondation (1), de l'instrumentation (2),
de la compaction (3) et de l'API de lecture (4). Sans événements collectés et agrégés en sécurité, il
n'a **rien à afficher** — et la sécurité du seam d'écriture prime sur toute UI.

## Garde-fous transverses à TOUS les lots
- Golden `29.107259068449615` re-joué **à chaque lot** ; jamais concerné ; les lots 1-2 le **prouvent**.
- `password.ts`/`motDePasse.ts`/`proxy.ts`/`garde.ts` : byte-unchanged sauf mention explicite (Lot 7
  touche `session/route.ts` en émission best-effort, hors logique d'auth).
- Fichiers Gemini jamais touchés. Aucune dépendance npm sans décision d'Arno (Lot 5 : SVG maison, 0 dep).
- Toute variable de comportement (seuil k, N-plancher, rétention, TTL, seuil rollup) **naît en config**,
  éditable au runtime.
