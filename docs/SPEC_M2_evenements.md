# SPEC M2 — Nomenclature des événements, rétention, PII

> Étude d'architecture. Aucun code, aucune migration. Ce document définit **ce qu'on émet, quand, avec
> quelles propriétés, combien de temps on le garde, et quelle donnée personnelle il contient (idéalement
> aucune)**. Il s'appuie sur les décisions de `SPEC_M2_rgpd_et_donnees_personnelles.md` et sur la revue
> adversariale (R1 vie privée, R2 moteur, R3 volumétrie, R4 honnêteté).

---

## 1. Philosophie du store : agrégation À L'ÉCRITURE + contexte de session éphémère

Le plan a **déjà scellé** (revue adversariale « majeur ») : *« agrégation à l'écriture, horodatage
tronqué au jour »* (`docs/PLAN_INTERFACE_INTERNE.md:467`, §C.3 `:288-295`). Trois des quatre reviews
(R1-2, R3-4, R4-#2/#6) confirment que garder des **événements bruts à la seconde** au repos serait une
**régression** de pseudonymisation. **Décision retenue (défaut) :**

- **Store durable = compteurs agrégés au grain JOUR (Europe/Paris), pseudonymes, k-safe.** Pas
  d'horodatage à la seconde au repos, pas de ligne par visiteur conservée durablement.
- **Contexte de session éphémère** : pour calculer le **parcours du tunnel** (étape la plus loin
  atteinte, complétion) et une **durée bucketée**, on maintient un état de session **à courte durée de
  vie** (TTL de quelques heures à ≤ 48 h, en config). À la **clôture** de la session (ou par un job de
  compaction), cet état est **replié en compteurs jour + buckets** puis **supprimé**. Les secondes
  absolues n'existent qu'en vol, jamais au repos durable.
- **Aucune donnée personnelle directe** ne doit entrer dans le store (ni IP, ni UA brut, ni referer
  complet, ni email — voir §4).

> ⚠️ **Décision d'Arno (voir résumé chat, Q1)** : ce document décrit la **voie A (agrégat + session
> éphémère)**, recommandée. La **voie B (événements bruts, rétention courte, tronqués au jour)** reste
> possible mais coûte plus cher en rétention/purge et en risque pseudonyme ; elle n'est PAS le défaut.

---

## 2. Le seam d'émission — hors du chemin de calcul (résumé ; détail R2 dans `SPEC_M2_statistiques.md` §7)

- L'émission se fait **dans la couche route/`after()`**, jamais dans `app/lib/svv/**` ni
  `app/lib/db/pipeline.ts`. Le writer vit dans un module isolé (`app/lib/analytics/**`, à créer).
- **Fire-and-forget non bloquant** via `after()` de Next 16 (`next/server`, confirmé disponible) : la
  réponse au tunnel part **avant** l'émission ; si l'émission échoue, la certification **aboutit quand
  même**.
- **Pool `pg` DÉDIÉ borné** pour l'analytics (jamais le pool partagé `app/lib/db/client.ts:8`), avec
  `statement_timeout` court → une écriture analytics ne peut **jamais** affamer les lectures LiDAR du
  tunnel.
- **Golden bit-identique par construction** : le golden (`pipeline.itest.ts`) appelle `analyserAdresse`
  en direct, sans passer par la route ni le writer ; les tables analytics sont **disjointes** des tables
  de calcul.

---

## 3. Nomenclature des événements (tunnel public)

Chaque « événement » alimente un **incrément de compteur jour** et/ou une **mise à jour de l'état de
session éphémère**. Nom = `snake_case`, stable, versionnable (ajouter un nom ne casse aucune agrégation
existante — évolutivité). Le tunnel réel (`app/page.tsx`, machine à états) sert de référence des moments.

| # | nom (`nom`) | Moment d'émission | Propriétés (allowlist, aucune PII) | Alimente |
|---|---|---|---|---|
| 1 | `session_debut` | 1er chargement d'une visite (côté client, après exécution JS — filtre bots §5) | `source`, `medium`, `campagne` (bucketés), `referer_hote` (eTLD+1), `device_type`, `navigateur_famille` | Visites, provenance, device |
| 2 | `etape_atteinte` | Entrée sur un écran du tunnel (intro, localisation, photo, axe, infos logement, analyse, résultat) | `etape` (enum fermée), `rang` (position dans le tunnel) | Entonnoir, étape la plus loin atteinte |
| 3 | `adresse_saisie` | L'internaute valide une adresse | *(aucune — jamais l'adresse elle-même)* | Complétion étape 2 |
| 4 | `point_origine_place` | Point d'origine validé (déplacé + dans emprise) | `commune_insee` (dérivée du point, jamais lat/lon exacts) | Carte communale, complétion |
| 5 | `point_origine_refuse` | Validation bloquée (hors emprise, non déplacé) | `raison` (enum : hors_emprise, non_deplace, hors_lidar) | Abandon avec cause (constat R4-T « pourquoi ») |
| 6 | `photo_prise` | Photo capturée / validée | `orientation_ok` (bool), *(jamais la photo, jamais le GPS EXIF)* | Complétion étape photo |
| 7 | `analyse_lancee` | Lancement du calcul | *(aucune)* | « Analyses lancées » (§métriques) |
| 8 | `resultat` | Verdict rendu | `verdict` (SANS/VIS/INDETERMINE), `score_tranche` (≤ 4 tranches, JAMAIS le score exact), `commune_insee` | Ratio verdicts, carte communale |
| 9 | `clic_certificat` | Clic « obtenir le certificat » | *(aucune)* | Conversion |
| 10 | `clic_estimation` | Clic « estimer la valeur » | *(aucune)* | Conversion |
| 11 | `session_fin` | Clôture (timeout d'inactivité, ou compaction TTL) | `etape_max` (étape la plus loin), `duree_bucket` (enum : `<5s`, `5-30s`, `30-120s`, `120s-10min`, `>10min`), `complete` (bool : a atteint `resultat`) | Durée bucketée, complétion, abandon |

**Notes de conception :**
- **`session_fin` est DÉRIVÉ, pas capturé** : il n'existe aucun signal de départ fiable dans le tunnel
  (pas de `beforeunload`/`sendBeacon`/heartbeat — vérifié `app/page.tsx`, le seul `visibilitychange`
  `:1314-1326` pilote la caméra). `session_fin` est donc **synthétisé** par le job de compaction sur
  timeout d'inactivité. C'est pourquoi « durée » et « page de sortie » sont des **estimations bornées**,
  pas des mesures (voir R4-#6 et `SPEC_M2_statistiques.md`).
- **Le score exact n'est jamais stocké** : seulement une **tranche** (≤ 4), pour éviter qu'un score
  précis + commune + verdict ne redevienne un quasi-identifiant (constat R1-1/5).
- **`commune_insee` est la seule géo** dans le store durable (jamais lat/lon, jamais cleabs, jamais la
  maille 200 m — sauf activation explicite d'une finalité fine validée DPO, cf. RGPD §A.3).

## 3.bis Événements internes (admins) — séparés physiquement

| nom | Moment | Propriétés | Finalité |
|---|---|---|---|
| `admin_connexion` | Connexion réussie d'un compte admin | `utilisateur_id`, `module_cible` (si connu) | Audit sécurité agrégé (Q-C périmètre 1) |
| `admin_connexion_echec` | Échec de connexion | `identifiant_tente` (haché ? à trancher), *(pas d'IP stockée)* | Détection brute-force (manque actuel, cf. §7 « ce qui manque ») |

Les événements internes vivent dans une **table séparée** de l'analytics public (finalités, régimes et
rétentions distincts — cf. `SPEC_M2_statistiques.md` §schéma). **Pas de géoloc IP** (Q-C §C.4).

---

## 4. Pseudonymisation — que stocke-t-on exactement

| Donnée brute | Au repos durable | Règle |
|---|---|---|
| **IP** | **JAMAIS** (ni brute, ni hachée) | Décision RGPD §B.4. Aucun `ip_hash`. Si une géo est voulue, elle est dérivée en **commune/département** en vol depuis une base **locale** puis l'IP est **jetée** (pas d'appel à une API tierce — sinon on envoie l'IP à un sous-traitant). |
| **User-agent** | **classé** en `device_type` (mobile/desktop/tablette) + `navigateur_famille` (grossier) ; UA brut **jeté** | Anti-fingerprint |
| **Referer** | **hôte seul** (`instagram.com`), jamais path/query | Constat R1-4 |
| **UTM** | allowlist `source`/`medium`/`campagne` bucketés ; `term`/`content`/params arbitraires **jetés** ; click-ids (`gclid`/`fbclid`/`msclkid`/`mc_eid`) **strippés** | Constat R1-4 |
| **Adresse / lat-lon / cleabs** | **JAMAIS** ; seulement `commune_insee` dérivée | RGPD §A |
| **Score** | **tranche** (≤ 4), jamais exact | Constat R1-1/5 |
| **Horodatage** | `jour_paris` (date, Europe/Paris) au repos ; secondes en vol (session éphémère) uniquement | Constat R1-2, R3-2/3 |
| **Identifiant de session** | éphémère, TTL court, **jeté à la compaction** ; jamais un identifiant durable | RGPD §B.2 |

**Invariant PII : le store durable M2 ne doit contenir AUCUNE donnée personnelle directe.** Un test
d'acceptation (voir `PLAN_M2_lots.md`) doit vérifier qu'aucune colonne du store durable ne peut recevoir
d'IP, d'UA brut, de referer complet, d'email, de lat/lon ou de cleabs.

---

## 5. Filtrage des bots (constat R4-T1) — sinon le chiffre-titre ment

À faible trafic, **un seul** bot de prévisualisation de lien (Slack, WhatsApp, iMessage, Facebook,
frappé **à chaque fois qu'Arno colle son lien**) ou crawler (GPTBot, bingbot, moniteur uptime) peut
représenter une **large part** des « visites » — pile quand Arno partage son lien.
- **Règle 1** : ne compter une visite (`session_debut`) qu'**après exécution d'un événement JS client**
  (élimine les bots sans JS et les previews de lien).
- **Règle 2** : liste d'**User-Agents bots** côté serveur (en config), exclus du comptage.
- **Règle 3** : le dashboard **affiche la part filtrée** (« N visites, dont M écartées comme non
  humaines »), pour ne pas cacher l'incertitude.

---

## 6. Rétention — en CONFIG, jamais en dur ; purge par partition

- **Toutes les durées naissent dans une table de config** (`config_retention` : `type` → `jours`),
  éditable au runtime par un non-développeur (exigence transverse « pilotage sans code »).
- **Deux niveaux distincts** (constat R1-7, R3-6) :
  - **Contexte de session éphémère** : TTL **court** (heures à ≤ 48 h en config), supprimé après
    compaction en agrégats.
  - **Agrégats k-safe (compteurs jour)** : irréversibles et anonymisés → **rétention plus longue
    possible** (le chiffre exact est **(J)** à confirmer par un DPO ; départ proposé : agrégats
    plusieurs mois à ~13 mois, session éphémère 30-90 j max — **à valider**).
- **Purge = `DROP` de partition mensuelle** (constat R3-6), pas un `DELETE` massif (WAL/bloat). Le store
  et l'éphémère sont partitionnés par mois dès le départ (coût nul à faible volume, purge triviale
  ensuite).
- Mécanisme d'exécution de la purge : job planifié. `pg_cron` n'est **pas** garanti présent en local →
  la purge est un **lot dédié** (endpoint admin déclenchable + éventuel cron système), spécifié dans
  `PLAN_M2_lots.md`. Ne pas présumer `pg_cron`.

---

## 7. Ce qui manque aujourd'hui et prépare le schéma (rappel)
- Aucune détection d'**échec de connexion / brute-force** sur `app/(admin)/api/admin/session/route.ts`
  (seul le succès met à jour `derniere_connexion_a`, `app/lib/admin/comptes.ts:76-78`). L'événement
  `admin_connexion_echec` (§3.bis) comble ce trou de sécurité — cheap, haute valeur.
- Aucun **historique** de connexion admin (seulement `derniere_connexion_a`, la **dernière**).
  `admin_connexion` fournit l'historique agrégé (Q-C périmètre 1).

---

## 8. Évolutivité — ajouter un événement dans 6 mois sans migration destructrice
- Un **nouveau `nom` d'événement** = une nouvelle valeur + une entrée dans le **catalogue d'événements
  en config** (nom, propriétés attendues, rétention). **Aucune migration de schéma** : le store est
  keyé par `nom` + dimensions dénormalisées ; un `nom` inconnu des anciennes requêtes est simplement
  ignoré par elles (les agrégations ne cassent pas).
- Les propriétés rares / en devenir vivent en **JSONB `props`** (queue longue), **jamais** dans le hot
  path (voir `SPEC_M2_statistiques.md` §volumétrie : dénormaliser en colonne dès qu'une propriété entre
  dans un `WHERE`/`GROUP BY` fréquent ; **pas de GIN par défaut**).
- Une **nouvelle métrique** = une nouvelle requête d'agrégation sur les compteurs existants, **sans
  toucher au schéma**.
