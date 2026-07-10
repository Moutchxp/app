# RAPPORT BUILD — M2 Lot 2 : instrumentation du tunnel public

> Chantier autonome `/svav-build`. **Aucun commit effectué** (livraison remise à Arno).
> Golden **29.107259068449615** **INCHANGÉ** (23/23, re-joué — preuve §C). 4 revues adversariales : **VALIDER ×4**.

---

## 0. Résumé exécutif

Premier lot qui ÉMET des événements depuis le parcours internaute. Il branche le canal isolé du Lot 1 ;
il ne le crée pas. **Le test du lot — une écriture analytique ne peut jamais casser/ralentir une
certification — est prouvé** (§B-preuve, revue R1 VALIDER).

**Deux cibles d'écriture :**
- `analytics_session` (une ligne par VISITE : `session_id` v4 éphémère + `etape_max` + acquisition +
  `complete`) — écrite par le nouveau writer de session ; compactée en `session_fin` par le Lot 3.
- `analytics_compteur_jour` (agrégats jour) — via `incrementerCompteur` (Lot 1).

**10 événements publics** émis (le 11ᵉ, `session_fin`, est synthétisé par la compaction du Lot 3, jamais émis).

### Fichiers livrés
| Fichier | Rôle | État |
|---|---|---|
| `app/lib/analytics/contexte.ts` | Réduction PII à l'émission (UA→device/famille, referer→host, UTM bucket, commune, score→tranche, bot) | **neuf** |
| `app/lib/analytics/commune.ts` | Dérivation commune INSEE par KNN `adresse_ban` (point jeté, INSEE seul) | **neuf** |
| `app/lib/analytics/session.ts` | Writer de la session éphémère (`majSession`, UPSERT, never-throws) | **neuf** |
| `app/lib/analytics/mesureClient.ts` | Émission CLIENT (sid `sessionStorage`, `sendBeacon`, fire-and-forget) | **neuf** |
| `app/api/mesure/route.ts` | BEACON des événements client (validation, filtre bots, dispatch en `after()`) | **neuf** |
| `db/migrations/020_m2_analytics_config.sql` | Config : `k_anonymat_min=11` (posé) + `bots_ua_motif` — **NON exécutée** | **neuf** |
| `app/api/analyse/route.ts` | +émission `resultat` (verdict+tranche+commune) en `after()`, hors du try de calcul | modifié |
| `app/page.tsx` | Émissions client aux paliers du tunnel (fire-and-forget) | modifié |
| `app/components/AdresseAutocomplete.tsx` | Capte le `citycode` BAN (commune), jamais la position | modifié |
| `vitest.integration.config.ts` | Alias `server-only` (requis par l'itest important les modules server-only) | modifié |
| + 6 fichiers de tests (contexte, session, commune, 2 routes, garde lot2) + 1 itest | | **neuf** |

Intouchés (vérifiés byte-unchanged) : tout le moteur (`svv/**`, `pipeline.ts`, `obstacles.ts`,
`origine.ts`, `faisceaux.ts`, `hauteurLidar.ts`, `profilConfig.ts`), `writer.ts`/`pool.ts`/`emission.ts`/
`config.ts` (Lot 1), `maintenance.ts` (Lot 3), `eslint.config.mjs` + `gardeImports.test.ts` (garde),
le golden `pipeline.itest.ts`, les 2 fichiers Gemini, `password.ts`/`motDePasse.ts`/`proxy.ts`/`garde.ts`.

### Points d'émission (fichier:ligne) → événement
| Événement | Où | Fichier:ligne |
|---|---|---|
| `session_debut` | client, au montage (1 fois) | `page.tsx` useEffect (session) |
| `etape_atteinte` | client, à chaque écran de funnel + « analyse » | `page.tsx` useEffect + `handleAnalyse` |
| `adresse_saisie` | client, sélection BAN | `page.tsx` `onSelectAdresse` |
| `point_origine_place` | client, bouton « Valider » (commune=citycode BAN) | `page.tsx` bouton confirmer |
| `point_origine_refuse` | client, validation bloquée (dédupliquée) | `page.tsx` useEffect refuse |
| `photo_prise` | client, capture | `page.tsx` `capturePhoto` |
| `analyse_lancee` | client, lancement | `page.tsx` `handleAnalyse` |
| `resultat` | **SERVEUR**, `/api/analyse` `after()` | `app/api/analyse/route.ts` |
| `clic_certificat` | client | `page.tsx` `onObtenirCertificat` |
| `clic_estimation` | client | `page.tsx` boutons estimation |

---

## A. DÉCISIONS HORS-SPECS (le plus important)

### A-1. Endpoint BEACON `/api/mesure` créé (le plan ne le nommait pas)
Le tunnel est une SPA sans routeur : **6 des 9 transitions d'écran sont 100 % client** (recon), sans aller
serveur naturel. Le plan (`PLAN_M2_lots` Lot 2) dit « émission client des etape_atteinte/session_debut »
sans nommer le récepteur. **Décision : créer `/api/mesure`** (public, hors middleware admin), qui reçoit
les événements client, RÉDUIT côté serveur (UA→device, referer→host, UTM→bucket), filtre les bots, puis
écrit en `after()`. Alternative écartée : Server Action (couple au rendu). C'est une route → autorisée à
importer le writer (la garde ne vise que le moteur).

### A-2. Commune SANS coordonnée — DEUX sources, jamais le point
- **`resultat`** : commune dérivée **côté serveur** dans le `after()` de `/api/analyse`, par **KNN sur
  `adresse_ban`** (index GiST, ~0,16 ms) à partir des lat/lon que la route a déjà pour le calcul. lat/lon
  utilisés EN VOL puis jetés ; seul l'INSEE (5 car) est stocké. C'est la géo autoritative de la carte (M-7).
- **`point_origine_place`** : commune = **`citycode` BAN** capté à la sélection d'adresse (`AdresseAutocomplete`),
  transmis par le client. « Commune dérivable de adresse_ban » (SPEC_M2_rgpd §A.3). Jamais la position.
- Trou de spec comblé : SPEC_M2_evenements dit « commune dérivée du point » ; le point n'existe côté serveur
  qu'aux routes analyse/origine. Voir A-3 pour pourquoi pas la route origine.

### A-3. `point_origine_place`/`refuse` émis CÔTÉ CLIENT, pas depuis `/api/origine`
Le plan listait `/api/origine` comme site d'émission. **La recon a révélé que `/api/origine` est appelée à
CHAQUE moveend** (validation live du marqueur) → y émettre `point_origine_place` sur-compterait massivement.
**Décision : émettre depuis le client** au moment de la CONFIRMATION (bouton « Valider », actif seulement si
statut VALIDE) et du BLOCAGE. `/api/origine` reste NON instrumentée. Écart au plan tracé ; raison = éviter
le sur-comptage. (Conséquence : la commune de `point_origine_place` vient de l'adresse BAN, pas du point —
peut différer si le marqueur a franchi une limite communale ; signal secondaire, la carte s'appuie sur `resultat`.)

### A-4. Session éphémère = `sessionStorage` (par onglet), PAS un cookie
Le cartouche demandait « où vit l'état de session ». **Décision : `crypto.randomUUID()` (v4 aléatoire) en
`sessionStorage`** — par onglet, jeté à la fermeture, jamais un cookie, jamais persistant entre visites,
jamais cross-site. C'est la preuve la plus forte de « pas un traceur » (revue R3 VALIDER). Aucun `Set-Cookie`
public. Alternative écartée : cookie 1st-party (persiste au-delà de l'onglet → plus « traceur-like »).

### A-5. Modèle d'écriture par événement
- `session_debut` → écrit UNIQUEMENT la ligne de session (acquisition). **Pas de compteur** : la provenance
  remonte via `session_fin` (compaction, Lot 3), qui porte l'acquisition. Évite un compteur d'acquisition redondant.
- `etape_atteinte` → fait monter `etape_max` (session) **ET** un compteur `etape_atteinte` (volume d'entrées/écran).
- `resultat` → compteur (verdict+tranche+commune), **serveur** ; ne touche pas la session (pas de sid côté /api/analyse).
- Les autres → compteur simple.

### A-6. `score_tranche` = quartiles /100 (1-4), figé
SPEC dit « ≤ 4 tranches, jamais le score exact » sans borne. **Décision : quartiles /100** (`<25→1, <50→2,
<75→3, ≥75→4`, `contexte.scoreTranche`). Constante de code (bucket de vie privée, pas une variable de
scoring). Pourrait migrer en config si besoin ; laissé figé pour ce lot.

### A-7. Rang du funnel = ordre RÉEL de l'UI (photo AVANT localisation)
L'enum `etape` (018) liste `localisation` avant `photo`, mais **l'UI actuelle affiche l'écran photo AVANT
localisation** (recon). **Décision : `etape_max` monte selon l'ordre RÉEL de l'UI** (`intro, photo,
localisation, axe, infos_logement, analyse, resultat`), sinon « l'étape la plus loin » régresserait. ⚠️
**Écart doc/code signalé** : CLAUDE.md §10 documente localisation→photo ; le code fait photo→localisation.
À arbitrer hors de ce lot (documentation ou UI).

### A-8. Filtre bots à deux règles
Règle 1 (intrinsèque) : un bot **sans JS** n'émet jamais le beacon → écarte les previews de lien/crawlers
sans JS (le principal). Règle 2 : motif regex `bots_ua_motif` **en config (020)**, lu par le beacon avec
cache TTL 60 s + repli codé (fonctionne même sans 020). « Pilotage sans code » respecté.

### A-9. Écrans hors funnel non mappés + `consentement` replié
`accueil`/`certificat` (hors funnel) et `consentement` (pas de valeur dans l'enum 018) n'émettent pas
d'`etape_atteinte` ; `consentement` se replie sur `intro`. Trou d'enum comblé sans inventer de valeur.

### A-10. Seuil k = 11 (arbitrage Arno)
Le cartouche disait « défaut 5 » ; la spec (SPEC_M2_rgpd §A.3.4) plancher **11** (« ne pas descendre sous »).
**J'ai signalé la contradiction et Arno a tranché : 11.** Seedé en 020, **appliqué NULLE PART** dans ce lot
(prouvé par test), commentaire « À CONFIRMER PAR DPO AVANT PUBLICATION ».

### A-11. `AdresseAutocomplete` capte le `citycode` BAN
Le composant jetait le `citycode` (ne gardait que label/lat/lon). Étendu pour le conserver (grain commune),
sans jamais conserver la position exacte.

### A-12. Alias `server-only` re-ajouté à `vitest.integration.config.ts`
L'itest de ce lot importe des modules `server-only` (writer/session/pool/commune) → l'alias (déjà présent
dans la config unitaire, inoffensif à l'exécution) est requis. (Il avait été retiré au Lot 3, dont l'itest
n'importait pas de module server-only.)

---

## B. DOUTES (à trancher par Arno / DPO)

### B-0. ⚠️ Arno DOIT brancher le cron de maintenance AVANT tout déploiement
`analytics_session` **se remplit sans se vider** tant que le job de maintenance (Lot 3) n'est pas déclenché.
Le cron n'est PAS fourni (décision d'exploitation, Lot 3 §B-0, option A = cron système). **Sans lui** : les
lignes de session (sid + acquisition) s'accumulent au repos ET le TTL de 2 j n'est pas appliqué (enjeu RGPD).
Impact traçage nul (lignes non ré-identifiables), mais l'**enforcement de rétention repose sur cette action
hors dépôt**. → À faire : `cron` quotidien post-minuit Paris → `npm run analytics:maintenance`.

### B-1. k-anonymat AU REPOS (revue R2-O1) — DPO, différé aux lots 4-5
À faible trafic, une ligne `resultat` à n=1 dans une petite commune (jour × commune × verdict × tranche)
est un quasi-identifiant à froid (rétention 400 j). **Ce n'est pas une violation de la règle** (commune =
grain accepté §A.3 ; tranche au lieu du score ; jour, pas seconde) et c'est **explicitement déféré au DPO**.
Le seuil k=11 est posé pour l'affichage (lots 4-5). **À trancher DPO avant publication.**

### B-2. Beacon sans rate-limit (revue R1-O2)
`/api/mesure` n'a ni throttle ni cap de taille de corps. **Ne peut pas nuire au tunnel** (pool dédié max 2,
post-réponse, jamais de ressource partagée) mais reste une surface d'inflation des compteurs / de charge DB.
Non demandé par le cartouche. Option future : throttle par IP + cap de taille.

### B-3. `point_origine_refuse` — couverture partielle
Émis pour `hors_emprise` (HORS_BATIMENT/SANS_BATIMENT, dédupliqué par statut). `non_deplace` (état initial,
non pertinent) et `hors_lidar` (altitude nulle, détectée plus tard) ne sont pas émis. Signal d'abandon
principal capté ; complétude à affiner si besoin.

### B-4. `sessionStorage` restauré à « rouvrir l'onglet fermé » (revue R3-C4)
Techniquement, le navigateur restaure `sessionStorage` sur Ctrl+Shift+T / reprise après crash → même sid =
**continuation de la même visite pilotée par le navigateur**, pas une reconnaissance applicative d'un retour
(l'app n'a aucun moyen de recoller deux visites). Nuance à mentionner dans `SPEC_M2_rgpd` pour l'exactitude DPO.

---

## C. CONFORMITÉ SVAV

| Vérification | Résultat | Preuve |
|---|---|---|
| **GOLDEN 29.107259068449615** | ✅ **INCHANGÉ (bit-identique)** | intégration **39/39** dont golden **23/23** ; `pipeline.itest.ts` byte-unchanged ; le golden appelle `analyserAdresse` en direct (hors route/instrumentation) |
| **Verdict/score NON influencés** | ✅ | `resultat` seulement LU (jamais muté/recalculé) ; émission en `after()` post-réponse ; corps de réponse inchangé (test `route.test.ts` : `resultat` `toEqual` la sortie moteur) |
| **Émission NON bloquante (LE test)** | ✅ | `route.test.ts` : 200 + verdict correct même si commune KO **et** writer KO ; after post-réponse + writer/commune/session never-throws + pools séparés |
| **Anonymat (aucune PII)** | ✅ | réducteurs testés (`contexte.test.ts`) + CHECK 018 + anti-fingerprint + beacon ignore lat/lon/email du corps (`mesure/route.test.ts`) ; revue R2 VALIDER champ par champ |
| **Commune sans coordonnée** | ✅ | KNN `adresse_ban` (point jeté, INSEE seul) ; itest : Asnières→`92004` ; commune-poubelle « 48.9,2.27 »→null |
| **Session non traçante** | ✅ | v4 aléatoire, `sessionStorage` par onglet, jamais cookie/persistant/cross-site, jetée à la compaction ; revue R3 VALIDER ; itest : 2 visites = 2 sids distincts |
| **Garde anti-couplage** | ✅ **verte** | `gardeImports.test.ts` 8/8 inchangé + `lot2Instrumentation.test.ts` (route→writer autorisé, moteur→writer interdit) ; aucun moteur n'importe analytics |
| **Seuil k posé, NON appliqué** | ✅ | test walk repo-entier : `k_anonymat` lu par aucun code (seulement 020 + ce rapport) |
| **Config externalisée** | ✅ | `bots_ua_motif` + `k_anonymat_min` en `analytics_config` (020), repli codé sûr |
| **Aucun fichier moteur / Gemini touché** | ✅ | vérifié byte-unchanged (§0) |
| **tsc / eslint / build** | ✅ | tsc 0 ; eslint 0 sur tous les fichiers neufs/modifiés ; `page.tsx` = **24 problèmes = baseline original** (0 régression) ; `next build` ✓ ; `/api/mesure` routé (Node) |
| **Tests** | ✅ | unit **734 pass** / 21 skip (+35) ; intégration **39** (golden 23 + maintenance 11 + instrumentation 5) |
| **Migration non exécutée** | ✅ | 020 écrite, **non jouée** ; aucun DDL appliqué |
| **RGPD** | ⚠️ voir §B-0, B-1, B-4 | cron de rétention (Arno) ; k-au-repos (DPO) ; nuance sessionStorage |

---

## D. Synthèse des 4 revues adversariales

| Revue | Axe | Verdict | Suite |
|---|---|---|---|
| **R1** | L'émission casse-t-elle la certif ? | **VALIDER** | after post-réponse, pools séparés, KNN indexé+post-réponse, writer never-throws. **O1 (cache repli bot) CORRIGÉ** ; O2 (rate-limit) → §B-2. |
| **R2** | Une PII fuit-elle ? | **VALIDER** | Aucune PII n'atteint un événement (champ par champ). O1 (k-au-repos) → §B-1 (DPO) ; O2 (referer = IP d'un serveur tiers, pas de l'utilisateur) info ; O3 (log DETAIL) inatteignable. |
| **R3** | Session = traceur ? | **VALIDER (T)** | Éphémère/aléatoire/par-onglet/jetée/non-reliée/non-cross-site. C1 (cron rétention) → §B-0 ; C4 (sessionStorage restauré) → §B-4. Exemption « mesure d'audience » = avis DPO (J). |
| **R4** | Golden & couplage | **VALIDER** | Golden bit-identique (rejoué 11/11) ; couplage impossible ; garde distingue route/moteur (16 tests, eslint réel ×2) ; pool isolé ; k non appliqué. C1/C2 (portée du walk k) **CORRIGÉS** ; C3/C4 (durcissements) notés. |

Aucun constat bloquant. Les corrections cheap (R1-O1, R4-C1/C2) sont **appliquées**. Les résidus sont des
décisions **Arno/DPO** (§B-0, B-1, B-4) ou des durcissements optionnels (§B-2), hors périmètre code du lot.

---

## E. Prochaine étape

1. **Appliquer 020** (optionnel, le beacon marche sans — repli) :
   `psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/020_m2_analytics_config.sql`
2. **Brancher le cron de maintenance (§B-0) AVANT tout déploiement** — sinon `analytics_session` ne se vide jamais.
3. **DPO avant publication (§B-1)** : chiffre k défendable + qualification du store + base légale d'un « résultat » communal.
4. Le Lot 2 étant livré, la chaîne peut continuer : **Lot 4** (API de lecture k-anonyme) puis **Lot 5** (dashboard).

### Confirmations
Aucun écran de statistiques, aucun dashboard, aucune route de lecture analytics. Seuil k **non appliqué**
(posé seulement). Aucun fichier moteur touché. Aucun fichier Gemini touché. **Aucun cron branché**. Aucune
dépendance npm ajoutée. **Aucun commit.**
