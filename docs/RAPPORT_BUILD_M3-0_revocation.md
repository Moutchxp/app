# Rapport de build — M3-0 : révocation effective sur les routes d'écriture admin

> Run `/svav-build` autonome. **Aucun commit, aucune migration.** Livraison remise à Arno (commit fichier par fichier).
> Ce rapport se lit APRÈS livraison.

## 0. Synthèse

`proxy.ts` autorise d'après le JWS, figé jusqu'à 8 h : un compte désactivé, dont on a retiré une permission, ou même
supprimé, pouvait écrire pendant tout le reliquat de son jeton. Ce lot rend la révocation **immédiate** : un garde
serveur (`exigerCompteActif`) relit l'état RÉEL du compte en base à l'entrée de **chaque** route d'écriture admin,
et coupe l'accès (403 `ACCES_REVOQUE`) au prochain appel. La voie de secours (`sub=null`) est autorisée **sans aucune
requête** (règle d'or, testée). `proxy.ts` reste **stateless** ; le re-check vit dans les handlers.

| Critère de sortie | Résultat |
|---|---|
| GOLDEN `29.107259068449615` | ✅ 23/23 (aucun fichier moteur touché) |
| `tsc --noEmit` | ✅ 0 |
| `eslint` (fichiers touchés) | ✅ 0 |
| `npm test` | ✅ **525 passed / 21 skipped** (43 fichiers) |
| `next build` | ✅ |
| `password.ts` / `motDePasse.ts` byte-unchanged | ✅ (diff vide) |
| `proxy.ts` inchangé (stateless) | ✅ (diff vide) |
| Migration / DDL | ✅ aucune |
| Gemini | ✅ non touché |
| Revues adverses R1/R2/R3 | ✅ VALIDER / VALIDER / VALIDER |

## 1. Fichiers touchés

**Cœur**
- `app/lib/admin/garde.ts` (étendu) — `exigerCompteActif(request, module)` : lit le JWS ; `sub===null` → autorisé
  sans requête (RÈGLE D'OR) ; sinon `SELECT actif, role, perm_<module> WHERE id=$sub` → 403 `ACCES_REVOQUE` si
  supprimé / désactivé / collaborateur sans la perm ; administrateur ⇒ autorisé. Une seule requête, lecture seule.

**13 handlers mutants gardés** (garde en TOUT PREMIER, avant toute écriture) :

| Route | Handlers | Module |
|---|---|---|
| `config/route.ts` | PATCH | `pilotage` |
| `cartes-annee/route.ts` | POST | `cartes_annee` |
| `cartes-annee/[id]/route.ts` | PATCH, DELETE | `cartes_annee` |
| `curation/entites/route.ts` | POST | `curation` |
| `curation/entites/[id]/route.ts` | DELETE, PATCH | `curation` |
| `curation/entites/[id]/point/route.ts` | PATCH, DELETE | `curation` |
| `curation/entites/[id]/liaisons/route.ts` | POST, DELETE, PATCH | `curation` |
| `curation/entites/[id]/annuler-edition/route.ts` | POST | `curation` |

Total : 1 pilotage + 3 cartes_annee + 9 curation = **13**. Vérifié par grep : tout export POST/PATCH/DELETE écrivant
(INSERT/UPDATE/DELETE/withTransaction) appelle `exigerCompteActif`. `banc-comparer` (lecture seule) et `session`
(login/logout) volontairement NON gardés (cf. B/§4).

**UI**
- `app/(admin)/admin/(protected)/RevocationWatcher.tsx` (nouveau) — composant client monté une fois dans le layout ;
  enveloppe `window.fetch`, détecte tout `/api/admin/*` 403 `ACCES_REVOQUE` et affiche « Vos droits d'accès ont été
  modifiés. Reconnectez-vous. » + lien `/admin/login`. Responsive, cible ≥ 44 px, aucune animation (prefers-reduced-motion
  conforme par construction).
- `app/(admin)/admin/(protected)/layout.tsx` — monte `<RevocationWatcher />`.

**Tests**
- `app/lib/admin/garde.test.ts` (nouveau) — 9 cas : voie de secours (autorisé + AUCUNE requête, prouvé sur le mock),
  admin actif, collaborateur avec perm, perm retirée → 403, désactivé → 403, supprimé (0 ligne) → 403, admin en base
  outrepasse la colonne perm, cookie absent → 403 sans requête, jeton falsifié → 403 sans requête.
- `app/(admin)/api/admin/curation/entites/[id]/route.revocation.test.ts` (nouveau) — DELETE entité de bout en bout :
  collaborateur sans perm → 403 `ACCES_REVOQUE` ET `query` appelé UNE seule fois (le SELECT du garde, jamais le DELETE)
  = **preuve de non-destruction** ; compte désactivé → 403.
- 3 tests métier existants (`config/route.patch.test.ts`, `cartes-annee/route.cartes.test.ts`, `curation/curation.test.ts`) :
  ajout d'un `vi.mock` no-op du garde (cf. A2).

## 2. Revues adverses — verdicts & arbitrages

| Revue | Axe | Verdict | Constats notables |
|---|---|---|---|
| R1 | Contournement / escalade | **VALIDER** | Couverture exhaustive des 13 handlers ; garde en 1ʳᵉ instruction ; `perm_${module}` sûr (union fermée + littéraux) ; `sub=null` non forgeable (HS256, `sub` signé). Résiduels hors périmètre : N1 banc-comparer (lecture seule), N2 pas de denylist `jti`. |
| R2 | Voie de secours / lockout | **VALIDER** | Voie de secours autorisée sans requête (`WHERE id=null` inatteignable) ; jetons legacy OK ; déconnexion toujours possible ; DB down = fail-closed 500. Durcissements facultatifs : R2-3 (tolérance rôle), R2-5 (503). |
| R3 | Régression / perf | **VALIDER** | SELECT hors transaction métier (séquentiel, pas de deadlock) ; pas de N+1 ; `vi.mock` du garde = contournement honnête préservant les index de params ; preuve de non-destruction solide ; `RevocationWatcher` clone correct + cleanup OK. |

**Arbitrages :**
- **R2-3 (aligner la tolérance de rôle)** — *accepté en DOCUMENTATION, pas en logique*. Le `=== 'administrateur'`
  strict est FAIL-CLOSED (un rôle inconnu → refus = direction sûre, pas d'escalade). La colonne `role` est verrouillée
  par le CHECK de 014, donc strict et tolérant coïncident aujourd'hui. Un commentaire dans `garde.ts` documente cette
  dépendance et le comportement en cas de future 3ᵉ valeur de rôle. *Alternative écartée* : passer à
  `!== 'collaborateur'` alignerait proxy/garde mais ouvrirait un rôle inconnu en administrateur (moins sûr).
- **R2-5 (try/catch → 503 sur panne DB)** — *rejeté pour ce lot*. L'exception→500 est déjà fail-closed et sûr
  (confirmé par les 3 revues) ; un 503 cosmétique élargirait le diff sans gain de sûreté. À considérer en polish séparé.
- **R3 / couverture (test d'intégration par route)** — *accepté comme DETTE*. Le placement est vérifié par grep + le
  garde a sa couverture unitaire (`garde.test.ts`) + un test destructif e2e (DELETE entité). Une suite d'intégration
  « sans perm → 403 » par route mutante est recommandée pour attraper un futur refactor qui retirerait un appel, mais
  disproportionnée pour ce lot.

Aucun constat bloquant, aucun défaut d'architecture de fond → pas d'arrêt du run.

## A. DÉCISIONS HORS-SPECS

- **A1 — Placement UI (RevocationWatcher).** La spec demandait « le point de gestion d'erreur commun côté front ; s'il
  n'y en a pas, propose le placement minimal et justifie ». Recon : **aucun** wrapper `fetch` commun — 18 appels
  dispersés dans 5 fichiers (dont des fichiers carto sensibles). *Décision* : un composant client unique montant un
  wrapper de `window.fetch` dans le layout protégé, couvrant tous les appels admin existants et futurs sans toucher
  les 18 sites ni les fichiers carto sensibles. *Alternative écartée* : modifier chaque site d'appel (diff énorme,
  risque de régression en zone sensible). *Impact* : monkey-patch de `window.fetch` — clone du body pour ne pas
  consommer le flux, restauration au démontage, inspection limitée aux 403 `/api/admin/*` (vérifié sain par R3-5).
- **A2 — `vi.mock` no-op du garde dans les 3 tests métier.** La spec ne le prévoyait pas ; sans lui, le SELECT du
  garde s'insérerait en tête et casserait les assertions par index de params des tests existants. *Décision* :
  neutraliser le garde dans les tests de LOGIQUE MÉTIER (qui ne testent pas la révocation — elle a ses propres tests).
  *Impact* : contournement honnête, index/compteurs d'origine préservés (validé R3-3).
- **A3 — `refusRevoque` en `Response` directe, garde renvoyant `Response | null`.** La spec décrivait le comportement,
  pas la forme. *Décision* : `exigerCompteActif` renvoie `null` (autorisé) ou la `Response` 403 à retourner telle
  quelle — pattern `const refus = await …; if (refus) return refus;`, minimal et uniforme sur les 13 handlers.

## B. DOUTES

- **B1 — Race TOCTOU (fenêtre de quelques ms).** Le SELECT du garde et l'écriture métier sont deux requêtes distinctes
  (le garde n'entre pas dans la transaction du handler). Un compte pourrait être désactivé ENTRE les deux. *Décision* :
  accepté — c'est un best-effort de défense en profondeur ; le besoin (couper au prochain appel sans attendre l'exp.
  du JWS) est satisfait ; entrer le garde dans chaque transaction métier compliquerait 13 handlers pour fermer une
  fenêtre de quelques ms. *Impact* : négligeable.
- **B2 — Panne DB → 500 générique** (cf. R2-5 rejeté). Fail-closed correct ; l'UI verrait un 500, pas le message
  `ACCES_REVOQUE`. Acceptable ; un 503 explicite est un polish futur.
- **B3 — `RevocationWatcher` sans piège de focus / gestion Échap** (R3-5, gravité faible). Overlay accessible
  (`role=alertdialog`, `aria-modal`, `aria-labelledby`) mais sans focus-trap. Suffisant pour un message terminal
  « reconnectez-vous » ; à enrichir si l'overlay devient interactif.

## C. ÉCARTS DE CONFORMITÉ

**Aucun.** Golden 23/23 bit-identique (aucun fichier moteur/`config_scoring`/`pipeline.itest.ts` touché) ; verdict/score
non concernés ; `ST_Force2D` intact (aucune opération distance/raster modifiée — seules des gardes ajoutées en amont) ;
`password.ts`/`motDePasse.ts`/`proxy.ts` byte-unchanged ; aucune migration ; Gemini hors périmètre ; RGPD non concerné
(aucune donnée personnelle nouvelle). Dette consignée : **`permissionRequise` de `proxy.ts` reste fail-open** (chemin non
listé → autorisé à tout authentifié) — bascule en fail-closed **hors périmètre** (chantier séparé), sans impact ici car
toutes les routes d'écriture existantes sont couvertes par la table de perms ET par le garde M3-0.

## Verdict de recon-valid (Phase 8)

**VALIDER.** Le correctif rend la révocation immédiate sur les 13 handlers d'écriture, préserve intégralement la voie
de secours (autorisée sans requête, testée), ne touche ni `proxy.ts` (stateless) ni `password.ts`/`motDePasse.ts`
(byte-unchanged), n'introduit aucune migration. Les 3 revues adverses concluent VALIDER. Tous les critères de sortie
sont verts. Points non bloquants tracés : TOCTOU (B1), 500 vs 503 (B2), dette fail-open `proxy.ts` (§C), couverture
d'intégration par route (recommandation R3).

## Séquence pour Arno
Commit fichier par fichier (un chantier = un commit). Rien à appliquer côté base (aucune migration). Pour vérifier en
conditions réelles : créer un collaborateur, lui retirer `perm_curation` (ou le désactiver) pendant qu'il est connecté,
puis tenter une écriture de curation → 403 `ACCES_REVOQUE` + overlay « Reconnectez-vous » ; la voie de secours
(identifiant vide + mot de passe partagé) doit continuer à écrire normalement.
