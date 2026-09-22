# AUDIT & REGISTRE DE DETTE — Sans Vis-à-Vis®

> **Statut : DIAGNOSTIC À FROID — lecture seule, AUCUN code modifié par ce document.**
> Date du diagnostic : **2026-09-21**. Méthode : reconnaissance en lecture seule sur 5 axes
> (moteur de calcul, couche données/PostGIS, sécurité/auth/RGPD, tests & dette technique, **performance
> & charge de calcul**), chaque constat ancré `fichier:ligne`. Périmètre : code réel sous `app/app/`
> (≈ 116 000 lignes de code + 81 000 lignes de tests, mesuré).
>
> **Comment utiliser ce document (c'est un REGISTRE, pas un rapport figé) :**
> - Le §2 « Registre priorisé » est la table de travail : chaque item a un **ID**, une **sévérité**,
>   un **effort** et un **statut** (⬜ à faire · 🔄 en cours · ✅ fait · ⏸️ écarté). On coche/met à jour
>   au fil des chantiers.
> - Un chantier qui résout un item = **un lot = un commit** (convention SVAV). Tout item touchant le
>   **golden**, `config_scoring`, un invariant ou la **sécurité** → relecture humaine + commit séparé
>   (règle `CLAUDE.md §14`).
> - Le §7 « Journal de révision » trace chaque passage (date / quoi). Un futur audit **met à jour les
>   statuts ici** plutôt que d'ouvrir un doc concurrent.
> - Aucun secret n'est recopié dans ce document (les problèmes de secrets sont décrits, jamais leur valeur).

---

## 1. Verdict global

**Actif objectivement solide, nettement au-dessus de la moyenne pour un projet de cette taille et de ce
mode de construction.** Ce n'est pas un prototype fragile : moteur de calcul, sécurité, RGPD, tests et
documentation sont pensés et cohérents. **Les vrais risques ne sont pas dans le code métier — ils sont
autour : le filet de contrôle a des trous, le temps de réaction est lourd, et la connaissance repose sur
une seule personne.**

### Tableau de bord

| Domaine | Niveau | Synthèse |
|---|---|---|
| Moteur de calcul (verdict/score) | 🟢 Solide | Calcul pur isolé, label découplé du score, aucun arrondi, invariants tenus |
| Sécurité & RGPD | 🟢 Solide | Auth sérieuse, anti-fraude, RGPD complet — **1 réserve de conception (fail-open admin)** |
| Base de données / spatial | 🟢 Solide | SQL 100 % paramétré, PostGIS discipliné — **robustesse des connexions à durcir** |
| **Efficacité (temps de réaction)** | 🔴 **Faible** ⚠️ *(à requalifier)* | **~132 allers-retours base EN SÉRIE / certification** — estimation **structurelle** du 21/09 qui annonçait « > 3 s probable ». **Chronométrée le 22/09 : 0,15 s à chaud / 0,69 s à froid** (§2, encadré Performance). L'estimation était pessimiste ; le temps ressenti venait du **tunnel** (T3), pas du pipeline. Note /20 non revue — un vrai renotage demande une mesure en conditions de production. |
| Besoin en calculs | 🟢 Solide | Calcul délégué à PostGIS (set-based), non CPU-bound ; le goulot est dans les round-trips, pas le calcul |
| Tests (volume & rigueur) | 🟢 Solide | 8 795 cas de test, garde-fous d'architecture exécutables |
| Dette technique « classique » | 🟢 Très bon | ~6 TODO / 0 FIXME sur 116 k lignes |
| **Filet de contrôle (le « gate »)** | 🔴 **Faible** | **`tsc` rouge + hors gate ; golden hors `npm test` — point noir technique** |
| **Pérennité / dépendance humaine** | 🔴 **Faible** | **Bus factor = 1 — point noir stratégique** |

### Notation /20 (2026-09-21)

> Barème français : 16+ excellent · 14-15 très bon · 12-13 bon · 10-11 passable · < 10 insuffisant.
> Jugements calibrés sur les preuves des audits, pas des mesures live (l'efficacité est une estimation
> **structurelle**, pas chronométrée).

| Dimension | Note | En bref |
|---|:---:|---|
| Qualité de code | **15/20** | Propre, typé, peu de dette — mais `tsc`/lint rouges & hors gate, monolithe `page.tsx` |
| Architecture | **15/20** | Séparation nette + garde-fous d'imports exécutables — front monolithique, pipeline en série |
| Robustesse | **13/20** | Défensif & testé — mais pools non durcis (crash possible), requêtes non bornées, golden hors gate |
| Efficacité (temps de réaction) | **9/20** | ~132 round-trips sériels / certification (> 3 s probable) — corrigeable par **P1** |
| Besoin en calculs | **14/20** | Appétit élevé (raster LiDAR) mais bien géré (set-based PostGIS) ; goulot = round-trips, pas calcul |
| *(bonus)* Sécurité | **15/20** | Au-dessus de la moyenne ; réserve = fail-open vers admin (**M1**) |
| *(bonus)* Pérennité / bus factor | **8/20** | 1 auteur, ~19 commits/j — risque patrimonial n°1 (**F1**) |
| **GLOBAL** | **~13/20** | **Solide mais perfectible** |

> ⚡ Le levier **P1** (batcher les 61 faisceaux) remonterait à lui seul l'**efficacité de ~9 à ~14** et la
> **robustesse de +1 à +2** : c'est le meilleur rapport impact/effort du registre.

---

## 2. Registre priorisé des actions

> Sévérité : 🔴 élevée · 🟠 moyenne · 🟡 faible. Effort indicatif. Statut : ⬜ à faire.

### Priorité 1 — Gains rapides / filet de contrôle (jours, fort impact)

| ID | Sév. | Effort | Statut | Action | Preuve |
|----|------|--------|--------|--------|--------|
| **G1** | 🔴 | S | ✅ | Mettre `tsc --noEmit` **et** `eslint` dans le contrôle de fin ; corriger l'erreur de type en **production** + les ~42 erreurs lint | `ADemanderVue.tsx:273` (type prod) ; lint concentré `page.tsx` (22), `FaisceauMap.tsx` (11) |
| **G2** | 🔴 | S | ✅ | **Sceller le golden dans `npm test`** : assertion pure `analyser(...) === 29.107259068449615` dans un vrai `.test.ts` (sans PostGIS) | golden uniquement dans `app/lib/db/pipeline.itest.ts:42` (suite d'intégration, **hors** `npm test`) |
| **G3** | 🟠 | S | ✅ | Durcir les 3 pools : ajouter `pool.on('error', …)` (évite crash process) + timeouts/bornage du pool principal | `db/client.ts:8` (pool nu) ; gabarit déjà présent `analytics/pool.ts:33-41` |
| **G4** | 🟠 | S | ✅ **soldé** | **`/api/check-building` supprimée** (route publique morte, aucun appelant ; accord Arno 2026-09-22 ; commit `bb8b6e8`). ✅ **Résidu SOLDÉ le 2026-09-22** : la limitation de cadence des routes publiques lourdes est livrée — voir **T8** (`0890df2`). | `app/api/check-building/route.ts` supprimé ; cadence : migration 227 + `lib/cadence/` + `api/analyse`, `api/internaute/auth/creer` |
| **G5** | 🟡 | S | ⬜ | Supprimer le code d'auth mort + purger le secret en clair du `.env` ; **dédupliquer les variables `SMTP_PERSONNE_*`** ; rafraîchir `.env.example` | `app/lib/admin/password.ts` (SHA-256 non salé, 0 importeur) ; `.env` (`ADMIN_PASSWORD` clair ; **relevé 2026-09-22 : `SMTP_PERSONNE_USER`, `SMTP_PERSONNE_PORT` et `SMTP_PERSONNE_PASS` sont définis 3 fois CHACUN — seule la dernière occurrence compte, les deux premières sont un leurre pour quiconque relit le fichier**) |

### Performance / temps de réaction *(ajouté 2026-09-21 — recon dédiée du chemin chaud)*

> Constat : une certification (`/api/analyse` → `pipeline.ts`) enchaîne **~132 allers-retours PostGIS en
> SÉRIE**, dont **~122 (≈ 90 %) viennent de la boucle des 61 faisceaux** (61 × 2 requêtes séquentielles).
> Aucun cache sur le chemin chaud, aucun `statement_timeout` sur le pool de calcul. Estimation
> **structurelle** (non chronométrée) : **certification > 3 s probable** (plancher ~1,5-2 s, sans plafond).
> La cause n'est **pas** l'intensité de calcul (bien déléguée à PostGIS, set-based) ni le front — c'est le
> **nombre de round-trips sériels**. **P1 seul devrait ramener une certification en zone « correct » (1-3 s).**
>
> 🔬 **Chronométrage réel du 2026-09-22 (mesure, plus une estimation) — l'estimation était PESSIMISTE :**
> réplique en lecture seule de `construireEntree` sur le point golden d'Asnières, 3 passages :
> **0,688 s à froid puis 0,154 / 0,159 s à chaud** (`analyserAdresse` bout en bout : 0,645 / 0,157 / 0,167 s ;
> corps de réponse : **2 036 octets**). Détail du passage à froid : `validerOrigine` 396 ms · `obstaclesSurAxe`
> 130 ms · `faisceauxAmplitude` (61) 119 ms · `resoudreEpoqueImmobilier` 25 ms · `resoudreMonuments` 12 ms ·
> reste < 5 ms. **P1/P2/P4 restent des gains réels, mais ne sont PAS une urgence** : le temps de réaction
> ressenti ne vient pas de là (cf. **T3** — le tunnel). ⚠️ Mesure sur base locale chaude, jeu de données de
> test : elle ne préjuge pas du comportement en production sur un volume LiDAR national.

| ID | Sév. | Effort | Statut | Action | Preuve |
|----|------|--------|--------|--------|--------|
| **P1** | 🟠 *(fort levier)* | M | ⬜ | **Batcher la détection d'obstacles des 61 faisceaux** (≈ 122 round-trips sériels → ≈ 2) via `unnest(...) WITH ORDINALITY` — **le motif existe déjà juste à côté**. ⚠️ touche le chemin du golden → rejeu Asnières + feu vert + commit séparé | boucle sérielle `faisceaux.ts:40` ; 2 req/faisceau `obstacles.ts:549,629` ; motif batch déjà présent `obstacles.ts:657,770,821` |
| **P2** | 🟠 | M | ⬜ | Paralléliser les étapes **indépendantes** de `construireEntree` (`Promise.all`) : obstacles principal, `faisceauxAmplitude`, immobilier, monuments, paysage. Seule `resoudreVueNature` reste après `faisceaux` | attentes sérielles indépendantes `pipeline.ts:118,128,146,151,161` ; dépendance réelle `pipeline.ts:140` |
| **P3** | 🟠 | S | ✅ *(résidu)* | **Plafond posé sur le chemin de l'analyse publique** (`eddf022`) : pool dédié `svav_analyse_publique`, `statement_timeout` **15 s** + attente d'une connexion **10 s**, sélectionné par `AsyncLocalStorage` à la porte unique `query()` → les 7 modules du chemin public sont INTOUCHÉS (golden bit-identique). **PAS** de plafond global sur le pool partagé : décision du porteur, il tuerait les imports/veille/relève légitimement longs. Plafond atteint → **503 JSON propre**, jamais d'attente infinie. ⚠️ **Résidu NON traité** : le **garde-fou de latence** (rejeu Asnières chronométré en CI / EXPLAIN de non-régression) — à rouvrir. | `db/plafondAnalyse.ts` ; `client.ts:15-25` (routage contextuel) ; `api/analyse/route.ts` (503) ; `db/plafondAnalyse.test.ts` (preuve que le pool partagé reste SANS plafond) |
| **P4** | 🟡 | S | ⬜ | Mémoïser `chargerProfilDegagement` (config singleton `id=1` relue en base à **chaque** analyse) | `profilConfig.ts:58,83` (2 round-trips/analyse pour une config quasi constante) |

### Tunnel public & QR de certificat *(ajouté 2026-09-22 — diagnostic double, lecture seule)*

> Deux symptômes rapportés le 22/09 depuis l'iPhone : (1) le parcours public affichait « Le service
> d'analyse met trop de temps à répondre » un essai sur deux ; (2) le QR d'un certificat reçu n'ouvrait
> rien. **Aucun des deux n'avait la cause qu'on lui prêtait.**
>
> **(1) Ce n'était ni le calcul, ni la base.** Prouvé : le calcul tient en 0,15 s à chaud (ci-dessus) ;
> aucun plafond pg n'existait sur ce chemin, donc aucun ne pouvait expirer ; et surtout l'analytique du
> jour montre **3 événements `resultat` pour 3 `analyse_lancee`**, tous `SANS_VIS_A_VIS` en commune INSEE
> **92004** — le serveur a calculé et produit un verdict **à chacun des trois essais**, y compris ceux où
> l'écran affichait l'erreur. L'hypothèse « test hors zone LiDAR » est écartée par les données (adresse
> certifiée : *8 Rue Denfert-Rochereau, Asnières-sur-Seine*). **La défaillance est dans l'acheminement de
> la réponse**, entre le serveur et le téléphone — métriques du tunnel à l'appui (**T3**).
>
> **(3) Même racine, troisième symptôme (22/09, ajout)** : dans l'espace client, ouvrir un document menait à
> `http://localhost:9000/svav-dev/…`. Ce n'est pas le même code que (2), mais c'est **la même erreur de
> fond — une adresse valable seulement depuis le Mac, fabriquée par le serveur et remise au navigateur**.
> Ici, l'endpoint S3 dans une URL signée (**T6**, corrigé pour l'espace client ; **T7** pour le reste).
>
> **(2) Le QR pointait vers une machine qui n'existait plus** : `SITE_URL=http://192.168.1.164:3000`, une
> ancienne IP DHCP du Mac (IP réelle au moment du constat : `192.168.1.14` ; ping 100 % de perte, entrée
> ARP incomplète, port 3000 fermé). La page de vérification, elle, est en parfait état : `HTTP 200`,
> « authentique », en 20 ms à chaud, sur les trois formes d'URL (`?n=&j=`, `?ref=&doc=visuel`, jeton faux).

| ID | Sév. | Effort | Statut | Action | Preuve |
|----|------|--------|--------|--------|--------|
| **T1** | 🟠 | S | ✅ | **Messages d'analyse distingués** (`375f77c`) : 429 « service saturé » · 502/503/504/524/530 « connexion interrompue » · abandon à 60 s « pas répondu à temps ». Un seul texte couvrait les trois et orientait vers une attente inutile. Délai de 60 s, message de coupure réseau franche et bouton « Réessayer » inchangés. | `page.tsx:2511-2521` (3 branches) ; `page.tsx:2545-2548` (AbortError) ; délai `page.tsx:2502` |
| **T2** | 🟠 | S | ✅ | **Adresse temporaire refusée dans un QR en production** (`f3b2ac5`) : https exigé, refus de localhost/127.x/::1, IP privées (10/172.16-31/192.168), `*.trycloudflare.com`, ngrok. En développement rien n'est refusé (certificats d'essai) mais un avertissement nomme l'adresse définitive. Les 3 copies de `siteUrl()` sont factorisées en une source unique. | `lib/certificat/siteUrl.ts` ; appelants `pdf/publierCertificatPdf.ts`, `email/publierEnvoiCertificat.ts`, `api/internaute/espace/certificats/[id]/telecharger/route.ts` |
| **T3** | 🔴 | M | ⬜ **DÉCISION ARNO** | **Le tunnel rapide `cloudflared` perd des réponses** — c'est la cause du symptôme (1). Remède : **tunnel NOMMÉ + `authentification.sansvisavis.com`** (4 connexions redondantes au lieu d'1, URL stable, et l'adresse définitive des QR par la même occasion). ⚠️ **À précéder d'une recon DNS dédiée** : le domaine `sansvisavis.com` porte aussi les e-mails **Google Workspace** (MX/SPF/DKIM/DMARC) et le site actuel — une manipulation DNS à l'aveugle peut couper la messagerie. | Métriques Prometheus locales de `cloudflared` (48 min de fonctionnement) : **196 requêtes, 185 réponses codées → 11 sans réponse rendue** ; `ha_connections=1` ; `register_connection`=8 / `unregister_connection`=7 (7 échecs RPC) ; `quic_client_closed_connections`=9 ; **114 `ResetStream` reçus** ; `tunnel_request_errors`=0 (côté origine : RAS) |
| **T4** | 🔴 | M | ⬜ | **Le jeton de vérification voyage dans l'URL du QR** (`?j=<16 car>`) : il se retrouve **en clair dans tout journal d'accès** — sortie `next dev` (constaté), et demain reverse proxy, journaux Cloudflare, `Referer`, historique du navigateur, capture d'écran partagée. **Contredit frontalement la règle écrite du code** : « le JETON n'apparaît dans AUCUN log ni AUCUNE erreur : il n'entre que dans le PDF ». **À régler AVANT la mise en production** — un jeton journalisé est un jeton à considérer comme divulgué. Pistes (non tranchées, choix de conception) : jeton dans le fragment `#` (jamais envoyé au serveur) + échange côté client ; ou URL courte `/{référence}` + saisie/échange du jeton ; ou POST depuis une page d'atterrissage. | construction `pdf/certificatPdf.ts:118-122` ; lecture `verifier/page.tsx:155-156` ; règle violée `pdf/publierCertificatPdf.ts:9` |
| **T6** | 🟠 | S | ✅ | **Documents de l'espace client servis par l'application** (`87346c3`) : la voie nominatif répondait `302` vers une URL signée MinIO portant l'endpoint S3 (`localhost:9000`) — depuis l'iPhone via le tunnel, « connexion au serveur impossible » ; sur le Mac, invisible. Le PDF stocké est désormais relu côté serveur (`recuperer`) et servi en octets, comme l'étaient déjà l'anonymisé et le visuel. `Cache-Control: private, no-store` harmonisé sur les trois. Garde inchangée (`exigerInternaute` + gate de propriété unique). 2ᵉ motif, indépendant du tunnel : **une URL signée est un laissez-passer transmissible** pendant sa durée de vie vers un PDF **nominatif** — servir par l'application replace le contrôle d'accès à chaque ouverture. | `api/internaute/espace/certificats/[id]/telecharger/route.ts` (voie nominatif) ; front inchangé `espace/ListeAnalyses.tsx:75` (lien same-origin) |
| **T7** | 🟠 | M | ⬜ | **Les AUTRES livraisons par URL signée — inventaire du 2026-09-22, non traitées.** Elles portent **le même défaut d'endpoint hors du Mac** et **la même question de contrôle d'accès** (laissez-passer transmissible) que **T6**, mais sur des publics et des durées différents ; chacune demande son propre arbitrage. **(1) Admin — pièce d'emprise** : renvoie `{url}` signée inline, garde `exigerModule` + `exigerCapaciteModif`, durée par défaut `S3_URL_EXPIRATION_S`. **(2) Admin — pièce de réponse de mairie** : renvoie `{url}` signée, garde `exigerAdministrateur`, inline ou téléchargement forcé selon la pièce. **(3) Alerte GED par e-mail** : lien signé **≥ 72 h** posé dans le corps d'un mail (téléchargement forcé) — aucune garde applicative, l'accès à la boîte EST la garde ; **un lien vers `localhost:9000` est déjà mort pour son destinataire**. **(4) Alerte superstructures par e-mail** : lien signé **7 jours**, inline, même remarque. ⚠️ Pour (3) et (4), servir par l'application supposerait une URL publique atteignable **et** une garde propre (jeton de lien) : ce n'est PAS un simple copier-coller de T6 — d'où l'item ouvert plutôt qu'une correction d'élan. | (1) `(admin)/api/admin/permis/emprise/route.ts:185-186` · (2) `(admin)/api/admin/permis/reponses/route.ts:196-201` · (3) `veille/alerteGedAuto.ts:199-201`, durée `veille/alerteGed.ts:19` · (4) `permis/alerteSuperstructures.ts:142-145`, durée `:101`. `urlSignee` (`lib/stockage/index.ts:138`) est le **seul signeur** ; `api/internaute/photo/route.ts` est un dépôt (POST), il ne livre rien |
| **T8** | 🟠 | S | ✅ | **Cadence des routes publiques bornée** (`0890df2`) — c'est le **résidu de G4**. Titulaire de compte : analyses **illimitées en total**, seul le RYTHME est borné (10/10 min, 40/h) ; visiteur sans compte : 3/10 min et 10/24 h par adresse ; création de compte 3/h. Seuils dans `config_cadence` (singleton, bornes en base ET dans le code, repli sûr, interrupteur `actif`) — **pilotables sans redéploiement, mais en SQL** : pas d'écran d'administration, l'écran Réglages existant appartient au module permis/veille. Au-delà : `429` + `Retry-After` + code `cadence_depassee` distinct du 429 générique. Toute erreur du limiteur LAISSE PASSER (il ne peut pas devenir une panne). | migration `227_cadence_limites.sql` (additive) ; `lib/cadence/{config,ip,limiteur}.ts` ; branchements `api/analyse/route.ts`, `api/internaute/auth/creer/route.ts` ; message `page.tsx` |
| **T9** | 🟠 | M | ⬜ **DÉCISION ARNO** | **L'adresse du client n'est pas vérifiable par le code.** Derrière un tunnel tout arrive de la boucle locale, et **Next 16 n'expose plus l'adresse du socket** (`ip`/`geo` retirés en v15, `node_modules/next/dist/docs/…/next-request.md:123`) : impossible de contrôler soi-même qu'on parle à un mandataire de confiance. La confiance est donc **déclarée** (`CADENCE_ENTETE_IP`), jamais déduite. **Tant que la variable n'est pas posée, tous les visiteurs sans compte partagent un seul seau** — sûr (aucune usurpation possible) mais grossier : à forte affluence, des visiteurs légitimes se gêneraient. **À poser en même temps que le tunnel nommé (T3)** : `CADENCE_ENTETE_IP=cf-connecting-ip`. Les titulaires de compte ne sont pas concernés (comptés par compte). | `lib/cadence/ip.ts` ; preuve d'usurpation impossible : `lib/cadence/ip.test.ts` |
| **T10** | 🟠 | M | ⬜ | **Aucune confirmation d'adresse e-mail à l'inscription** (constat de recon, non traité — la créer n'était pas demandé). `POST /api/internaute/auth/creer` pose le mot de passe et ouvre la session **sans aucun envoi** (« aucun contact moteur, aucun envoi e-mail »). Atténuation existante et réelle : la création exige un **jeton-capacité `rectify-contact`** frappé par un VRAI parcours d'analyse — on ne peut donc pas créer des comptes en masse sans faire autant d'analyses (elles-mêmes désormais bornées, T8). Reste qu'une adresse non confirmée peut être **celle d'un tiers**, et que le certificat part par e-mail : à trancher avant la mise en production. | `api/internaute/auth/creer/route.ts` (aucun envoi) ; `lib/internaute/authCompte.ts` |
| **T11** | 🟠 | M | ⬜ **DÉCISION ARNO** | **Vérification anti-robot (Cloudflare Turnstile) à poser AVEC la mise en production.** La cadence (T8) borne le rythme mais ne distingue pas un humain d'un robot patient ; Turnstile le fait sans énigme visuelle et s'installe naturellement avec le tunnel nommé (T3), puisque les deux supposent le domaine derrière Cloudflare. À poser sur les mêmes routes que T8 (analyse, création de compte). Décision produit (friction ajoutée au parcours) **et** dépendance à un service tiers → non entrepris. | à câbler sur `api/analyse/route.ts` et `api/internaute/auth/creer/route.ts`, aux côtés de `verifierCadence` |
| **T5** | 🟠 | M | ✅ *(résidu)* | ~~**Émission d'un certificat lente : `POST /api/certificat` ≈ 11,3 s**~~ — **CAUSE TROUVÉE ET CORRIGÉE** (`6fcbb86`). Le chronométrage de chaque étape désigne la **carte d'orientation : 8358 ms** sur ~12 s (PDF nominatif 153 ms, anonymisé 89 ms, visuel 43 ms, relectures de stockage 7 ms). Ce n'étaient PAS les tuiles en échec (deux passages à 8,1 et 8,8 s avec **zéro** échec) mais la **rafale de ~100 tuiles lancées d'un coup** : congestion auto-infligée, médiane **1236-1460 ms par tuile** contre **152-159 ms** à concurrence 8. Redemandées isolément, les tuiles « fautives » répondent HTTP 200 — les ECONNRESET/HTTP 400 étaient des rejets SOUS notre propre rafale. Concurrence bornée à 8 + budget total 20 s → **carte 8358 → ~4000 ms**. ⚠️ **Résidu NON traité** : l'**envoi SMTP (~3,4 s)** reste DANS la réponse ; le sortir en post-réponse (`after()`, comme l'analytique) rendrait la main à l'internaute tout de suite. | `lib/carte/orientationCarte.ts` (`telechargerTuiles`) ; horodatages `certificat_acheminement` |
| **T12** | 🟡 | S | ✅ | **PDF allégé de 996 à 360 Kio** (`f6dbb96`, −63,9 %). Décomposition objet par objet : carte 571,8 Kio (57,4 %), logo-rond 196,9, logo-long 124,7, photo 54,5, polices 30,6. Les images « en double » n'étaient pas des doublons mais des **masques alpha** (`/SMask`) de même poids : la carte, pourtant OPAQUE, portait 286 Kio de masque inutile. Carte aplatie en JPEG q80 (aucune mise à l'échelle : 1000×617 = 314 dpi, déjà la résolution utile) ; logos rééchantillonnés à 300 dpi pour leur taille réelle d'affichage. **Photo NON touchée, à dessein** : déjà JPEG et déjà à 226 dpi, donc sous la cible. Preuve que seul le contenu des images change : 1 page avant/après, texte extrait **identique caractère pour caractère** (208 fragments). ⚠️ **Piste laissée ouverte** : la palettisation des logos descendrait à 298 Kio, mais elle **rompt le déterminisme octet à octet** du générateur (4 échecs/5 contre 0/5 sans) — pdfkit décode les PNG à alpha de façon asynchrone et numérote ses objets dans l'ordre d'achèvement. Ne pas la reprendre sans traiter cela. | `lib/pdf/certificatPdf.ts` (`actifPourPdf`), `lib/pdf/publierCertificatPdf.ts` (`carteCompressee`) |
| **T13** | 🟠 | S | ✅ *(à confirmer sur l'iPhone)* | **Double requête au téléchargement d'un document, la seconde en 401** (journal du 22/09, iPhone via tunnel : `?doc=visuel&telecharger=1` → **200**, puis la MÊME URL → **401**). **`SameSite` est HORS DE CAUSE** : le cookie internaute est **`Lax`, pas `strict`** (`lib/internaute/authSession.ts:31`, qui le commente explicitement) — `Lax` envoie le cookie sur toute requête same-origin, téléchargement compris. **CE QUE RISQUE L'INTERNAUTE** (mesuré) : la réponse 401 est un JSON de **29 octets** (`{"erreur":"non authentifié"}`, `application/json`) — si c'est elle qui alimente l'enregistrement, le fichier obtenu est **illisible, sous un nom `.png`**, sans message d'erreur. **Correctifs posés** (`2db2cb7`) : **A** — retrait de l'attribut `download` du bouton, redondant avec le `Content-Disposition: attachment` du serveur et responsable du chemin « téléchargement piloté par le navigateur » qui rejoue la requête sur iOS ; **B** *(non retenu)* ; **C** — toutes les réponses d'erreur de la route portent `Cache-Control: private, no-store` comme ses 200, pour qu'aucun cache ne resserve une erreur à la place d'un document. ⚠️ **Cause exacte NON ÉTABLIE** : on ne sait pas prouver pourquoi la 2ᵉ requête part sans cookie, ni laquelle des deux alimente le fichier. **À confirmer par un test réel sur iPhone : le fichier enregistré s'ouvre-t-il ?** | `espace/ApercuDocument.tsx` (lien sans `download`) ; `api/internaute/espace/certificats/[id]/telecharger/route.ts` (`erreur()`, `sansCache()`) ; preuves : `espace/ApercuDocument.test.tsx`, `…/telecharger/route.test.ts` |
| **T13-bis** | 🟠 | M | ⬜ **EN RÉSERVE** | **Jeton de téléchargement à usage unique** — le remède de fond du T13, **à n'implémenter QUE si le test réel sur iPhone montre encore un fichier illisible**. Principe : une requête authentifiée émet un jeton court (~30 s, usage unique) scellant `scope` + `certificatId` + `internauteId` ; l'URL de téléchargement le porte, et l'accès est prouvé par lui au lieu du cookie. **La garde n'est PAS affaiblie**, elle change de porteur — modèle déjà présent dans le dépôt (`lib/internaute/jetonRectification.ts`). Écarté pour l'instant : A et C sont sans risque et peuvent suffire ; B ajoute une surface (émission, expiration, rejeu). ⚠️ Ne PAS « régler » ce point en rendant la route publique ou en tolérant l'absence de cookie : ce serait affaiblir un contrôle d'accès sur des documents nominatifs. | à poser à côté de `exigerInternaute` dans `…/telecharger/route.ts` |
| **T5-bis** | 🟠 | M | ✅ | **Envoi SMTP sorti de la réponse d'émission** (`c5c01ed`). Mesure sur les **8 dernières émissions réelles** (écart `genere_le` → `envoye_le`) : **2,83 à 3,74 s, médiane ~3,10 s** d'attente pure, alors que le certificat et ses documents étaient déjà faits. L'émission remonte désormais `envoiADeclencher` et la route déclenche `publierEnvoiCertificat` dans `after()` — même modèle que l'instrumentation de `/api/analyse`. **Traçabilité INCHANGÉE** (statut `'envoye'`, `envoye_le`, `derniere_erreur` écrits par la même fonction, après la réponse) ; garde « jamais un 2e mail » conservée AVANT la réponse ; documents manquants toujours fabriqués avant. Écran final non modifié : il disait déjà « sera envoyé ». | `api/certificat/route.ts` (`envoyerApresReponse`) ; `lib/db/certificatEmission.ts` (`envoiADeclencher`, `acheminerSiNonEnvoye` → `boolean`) |

### Priorité 2 — Moyen terme / conception

| ID | Sév. | Effort | Statut | Action | Preuve |
|----|------|--------|--------|--------|--------|
| **M1** | 🟠 | M | ✅ | **Autorisation fail-closed** : un rôle inconnu/absent doit valoir « collaborateur sans droit », pas administrateur. **Committé le 2026-09-22 (`4e58530`)** après validation manuelle Arno + `npm test` complet vert (590 fichiers / 7755 tests). | `app/lib/admin/session.ts:116-118` (rôle ≠ 'collaborateur' → admin `permsToutes()`) + les 4 gardes (`garde.ts`, raccourci `sub===null`) |
| **M2** | 🟠 | M | ⬜ | Retirer ou borner la session « voie de secours » (`sub=null`) — non révocable hors rotation du secret | `garde.ts:150,88,115` ; émission `session/route.ts:93-108` |
| **M3** | 🟠 | M | ⬜ | Introduire un **registre de migrations** (table `schema_migrations` + mini-runner) → vérité unique sur le schéma déployé ; permet de retirer les ~57 sondes runtime | 226 migrations appliquées à la main, sans ledger ; sondes `information_schema`/`42P01` (169 occ.) |
| **M4** | 🟠 | M | ⬜ | Trancher les **deux moteurs de score** coexistants (~640 lignes calculées à chaque analyse mais absentes du total) ; réduire la signature `scoreTotal` | `analyse.ts:118,126` calculés ; `scoreTotal.ts:44` n'utilise que `noteDegagement` ; divergence `SPEC_score_qualite_vue.md` (/100) vs code (/80) |
| **M5** | 🟡 | M | ⬜ | Éliminer le pas de grille `0,5` dispersé (~12 littéraux) + les constantes **mortes** (0 usage) | `obstacles.ts:133,134,140,193,194,244,245,372,400,423,432,433` ; `BEAM_STEP_M`/`CORRIDOR_WIDTH_M`/`SPIKE_KERNEL_M`/`BEAM_RANGE_M` non consommées (`config.ts`) |

### Priorité 3 — De fond / structure & pérennité

| ID | Sév. | Effort | Statut | Action | Preuve |
|----|------|--------|--------|--------|--------|
| **F1** | 🔴 (stratégique) | L | ⬜ | **Réduire le bus factor** : outiller la relecture humaine déjà exigée sur golden/`config_scoring`/invariants/sécurité | 1 394 / 1 397 commits mono-auteur, ~19 commits/j ; politique écrite `CLAUDE.md §14` mais non outillée |
| **F2** | 🟠 | L | ⬜ | Découper le monolithe `app/page.tsx` (extraire `Home`, réduire l'état, traiter les `set-state-in-effect`) | `app/page.tsx` = 3 700 lignes, 92 `useState`, 17 `useEffect`, 2 `useMemo/useCallback` |
| **F3** | 🟠 | L | ⬜ | Migrer au fil de l'eau les ~37 tests « source-scan » (figent la **forme** du code) vers des assertions de **comportement** ; réconcilier migrations ↔ DB vivante | ~37 tests `readFileSync` d'un `.tsx` + `toContain`/regex (cf. `AGENTS.md`, section tests) |
| **F4** | 🟡 | S | ⬜ | Corriger la **doc périmée** (le compteur de certificat est décrit « non implémenté » alors qu'il est fait et atomique) | `CLAUDE.md §6` vs `db/certificatNumero.ts:37-58` |
| **F5** | 🟡 | M | ⬜ | (Sécurité) Encadrer les fetch serveur d'URL issues d'e-mails/GED de mairies derrière une allow-list d'hôtes (SSRF bornée) | `app/lib/veille/detectionRepo.ts:92-97`, `permis/drive.ts` |

---

## 3. Constat stratégique (hors action immédiate)

**Le « poids » réel du produit n'est pas où on l'imagine.** Le moteur « sans vis-à-vis » vendu au client
= **< 3 %** du code (`app/lib/svv` ≈ 3,2 k lignes). **~56 % du code est le back-office « permis de
construire »** (veille Sitadel, relève des mairies, GED, rattachement, projection… ≈ 64,5 k lignes).
Ce n'est pas un défaut, mais c'est là que se concentrent la complexité, le coût de maintenance et le bus
factor. À garder en tête pour toute décision de priorisation ou de recrutement.

---

## 4. Ce qui est déjà solide (à préserver)

- **Sécurité au-dessus de la moyenne** : argon2id + hash-leurre anti-énumération (`session/route.ts:8-134`),
  cookies `httpOnly`/`secure`/`SameSite=strict`, défense en profondeur (relecture `role/actif/perm` en base
  à chaque écriture, `garde.ts:143-168`), anti-IDOR systématique (404 indistinguable), secrets **serveur
  uniquement** (aucun `NEXT_PUBLIC_` secret, aucun `'use client'` ne lit `process.env`).
- **RGPD complet** : consentement historisé + effacement (anonymisation transactionnelle) + photos
  content-sniffées et **EXIF/GPS retirés** (`app/lib/internaute/photoDepot.ts:31-51`).
- **Moteur propre** : verdict = calcul pur sans I/O (`verdict.ts:103`), label **structurellement** découplé
  du score (`scoreTotal.ts:43-44`), invariant « aucun arrondi » tenu, `ST_Force2D` + EPSG:2154 partout.
- **Calcul lourd bien délégué** : balayage raster fait **en SQL** (`ST_Clip`/`ST_PixelAsCentroids` +
  `max FILTER GROUP BY`, `obstacles.ts:140-145`) ; le JS ne traite que ~400 cellules → pas CPU-bound.
- **Compteur de certificat vraiment atomique** (`db/certificatNumero.ts:37-58`, `INSERT … ON CONFLICT …
  RETURNING`, rollback → numéro libéré).
- **Migrations saines** (001→226 sans trou, idempotentes, auto-vérifiantes) et **garde-fous d'architecture
  exécutables** (le moteur ne PEUT pas importer l'analytics : ESLint `no-restricted-imports` + test de graphe
  d'imports).
- **Externalisation de la connaissance exceptionnelle** : 128 fichiers docs, invariants prouvés
  `fichier:ligne`, `FLAKES_CONNUS.md` avec niveaux de preuve — principal amortisseur du bus factor.

---

## 5. Détail par axe (résumé)

**Moteur** — forces : pureté, constantes dérivées verrouillées, golden découplé de la ligne live
(`profilConfig.ts:72-76`). Risques : golden hors gate quotidien (→ G2), pas de grille `0,5` dispersé et
constantes mortes (→ M5), deux modèles de score en quarantaine (→ M4).

**Données/PostGIS** — forces : zéro interpolation SQL sur le chemin certifiant (`obstacles.ts`), KNN `<->`
inliné (piège CTE évité), transactions correctes (`db/client.ts:32-46`). Risques : pools non durcis
(→ G3), pas de ledger de migrations (→ M3), SQL dynamique « sûr par convention » non contraint.

**Sécurité/RGPD** — forces : voir §4. Risques : fail-open vers admin (→ M1), break-glass non révocable
(→ M2), `/api/check-building` relique (→ G4), pas de throttle sur routes publiques lourdes (→ G4),
matériel d'auth mort + `.env` (→ G5), SSRF bornée GED (→ F5).

**Tests/dette** — forces : 8 795 cas, dette classique quasi nulle, échappatoires TS surtout dans les tests
(6 `as any` au total, tous dans `page.tsx`). Risques : `tsc` rouge + hors gate (→ G1), lint rouge (→ G1),
monolithe `page.tsx` (→ F2), tests source-scan fragiles (→ F3), bus factor (→ F1).

**Performance / temps de réaction** — forces : intensité de calcul bien gérée (set-based PostGIS, JS trivial
sur ~400 cellules) ; le chemin JS-lourd raster (`hauteurLidar.ts:154-165`) n'est **pas** sur le chemin de
certification (scripts seulement) ; requêtes individuelles déjà optimisées (KNN inliné, précédents
`validerOrigine` 1919→310 ms). Risques : **~132 round-trips sériels/certification, dont ~122 dans la boucle
des 61 faisceaux** (→ P1), étapes indépendantes non parallélisées (→ P2), config relue à chaque analyse (→ P4).
**Requalifié le 2026-09-22 par le chronométrage réel** : une analyse tient en **0,15 s à chaud / 0,69 s à
froid** — P1/P2/P4 restent des gains, mais le temps de réaction ressenti venait du **tunnel** (→ T3), pas du
pipeline. Le pool de calcul est désormais borné sur le chemin public (→ P3, `eddf022`) ; le **garde-fou de
latence** reste à faire. Émission du certificat ≈ **11,3 s**, non instruite (→ T5).

---

## 6. Rappel de méthode pour agir

- **Aucun de ces items n'est un correctif appliqué** : ce document ne fait que diagnostiquer.
- Ordre conseillé : **G1 → G2 → G3 → G4 → G5**, puis **P1 → P2 → P3 → P4** (fort levier perf), puis M*, puis F*.
- **Réordonné le 2026-09-22** : **T4** (jeton dans l'URL du QR) et **T3** (tunnel nommé + adresse définitive)
  passent **avant** P1/P2/P4 — T4 est un verrou de mise en production, T3 est la cause réelle du temps de
  réaction ressenti, alors que le chronométrage a montré le pipeline à 0,15 s. T3 exige une **décision du
  porteur** et une **recon DNS préalable** (le domaine porte la messagerie Google Workspace).
- G2, M1, M2, M4, **P1**, F1 touchent des zones **sensibles** (golden, sécurité, score, chemin certifiant) →
  feu vert du porteur + relecture humaine + commit séparé. Pour P1 : le rejeu Asnières (`pipeline.itest.ts`)
  est le filet — le résultat par faisceau doit rester **bit-identique**.

---

## 7. Journal de révision

| Date | Auteur | Modification |
|------|--------|--------------|
| 2026-09-21 | Diagnostic initial (audit 4 axes, lecture seule) | Création du registre. Tous items ⬜. |
| 2026-09-21 | Recon performance + notation | Ajout de l'axe **Performance** (items P1-P4), de la **notation /20** (§1), et de la ligne Performance au §5. Verdict global mis à jour (temps de réaction lourd). |
| 2026-09-22 | Lot « gains rapides » | ✅ **G3** filet pg 3 pools (`4c193ca`) · ✅ **G1** `tsc --noEmit` dans le gate + 6 erreurs de type corrigées + `public/**` hors lint (`d74fe25`) · ✅ **G2** garde golden PUR sans base, égalité stricte (`137b5dc`). ✅ **M1** fail-closed (session.ts + 4 gardes) committé (`4e58530`) après validation manuelle Arno + `npm test` complet vert (590 fichiers / 7755 tests). ✅ **G4** `/api/check-building` supprimée (aucun appelant ; accord Arno ; commit `bb8b6e8`) ; 3 mentions « route supprimée » ajoutées aux docs ; `npm test` complet vert après purge du cache `.next` périmé. Résidu : throttle routes publiques (`/api/analyse`) NON traité. Les 42 erreurs lint pré-existantes (any/entités/hooks) restent hors périmètre. |
| 2026-09-22 | Diagnostic double (analyse publique qui expire · QR de certificat mort) + lot de 3 correctifs | **Diagnostic en lecture seule** : le pipeline chronométré (0,154-0,688 s, réponse de 2 036 o) écarte calcul et base ; l'analytique (3 `resultat` pour 3 `analyse_lancee`, INSEE 92004) prouve que le serveur répondait ; les métriques `cloudflared` (11 requêtes sans réponse sur 196, 7 reconnexions, 114 `ResetStream` en 48 min) désignent l'acheminement. Le QR mort s'explique par `SITE_URL` figée sur une ancienne IP DHCP. **Correctifs** : ✅ **P3** plafond base scopé au chemin public + 503 propre (`eddf022`) · ✅ **T1** trois messages d'analyse distincts (`375f77c`) · ✅ **T2** adresse temporaire refusée dans un QR en production, 3 `siteUrl()` factorisées (`f3b2ac5`). **Ajouts au registre** : ⬜ **T3** tunnel nommé + `authentification.sansvisavis.com` (décision porteur, recon DNS préalable) · ⬜ **T4** jeton de vérification en clair dans l'URL du QR, verrou de mise en production · ⬜ **T5** émission ≈ 11,3 s à profiler · **G5** enrichi (`SMTP_PERSONNE_USER/_PORT/_PASS` définis 3 fois chacun). Chapeau Performance et §5 requalifiés par la mesure. `npm test` complet vert à chaque commit (592 fichiers / 7 806 tests au dernier). Dette eslint de `page.tsx` gelée : 22 problèmes avant comme après. |
| 2026-09-22 | T13 — double requête au téléchargement d'un document | **Diagnostic** (lecture seule) du 200 suivi d'un 401 sur la même URL de téléchargement, observé depuis l'iPhone : **`SameSite` hors de cause** (le cookie internaute est `Lax`, pas `strict`) ; la garde court-circuite sans toucher la base quand le cookie manque, et son 401 générique est **indistinguable** d'une session invalide ; **ce qu'un tel 401 enregistrerait = 29 octets de JSON sous un nom `.png`**, illisible et silencieux. ✅ **A** retrait de l'attribut `download` (redondant avec `Content-Disposition: attachment`, et responsable du chemin iOS qui rejoue la requête) et ✅ **C** `Cache-Control: private, no-store` sur toutes les réponses d'erreur de la route (`2db2cb7`) — aucune garde modifiée, `authGarde.ts` non touché. ⬜ **T13-bis** (jeton de téléchargement à usage unique) **EN RÉSERVE**. ⚠️ **Cause exacte NON ÉTABLIE** : à confirmer par un test réel sur iPhone — le fichier enregistré s'ouvre-t-il ? `npm test` : 597 fichiers / 7905 tests verts. |
| 2026-09-22 | T5-bis — envoi du mail après la réponse | ✅ **T5-bis** (`c5c01ed`) : l'envoi SMTP sort de la réponse d'émission. Mesuré sur les 8 dernières émissions (`genere_le` → `envoye_le`) : **2,83 à 3,74 s, médiane ~3,10 s** retirés de l'attente. Traçabilité, contenu du mail, pièces jointes et garde anti-2ᵉ-envoi inchangés ; aucun texte d'écran modifié (le parcours disait déjà « sera envoyé »). Quatre tests qui assertaient l'envoi depuis la couche d'émission ont été mis à jour — changement voulu, l'envoi est désormais prouvé côté route. Reste ouvert sur ce fil : la part **carte d'orientation (~4 s)**, plancher actuel de l'émission. `npm test` : 596 fichiers / 7891 tests verts. |
| 2026-09-22 | Émission du certificat (temps + poids) et limitation de cadence | **Émission** — chronométrage de chaque étape sur SAVV-2026-000027 : la **carte d'orientation coûtait 8358 ms** sur ~12 s (PDF nominatif 153 ms, anonymisé 89 ms, visuel 43 ms, stockage 7 ms, SMTP ~3,4 s). Hypothèse des tuiles en échec **RÉFUTÉE** (8,1 et 8,8 s avec zéro échec) : la cause était la **rafale de ~100 tuiles**, congestion auto-infligée — médiane 1236-1460 ms/tuile contre 152-159 ms à concurrence 8 ; les tuiles « fautives » répondent 200 en isolé. ✅ **T5** concurrence 8 + budget 20 s → carte **8358 → ~4000 ms** (`6fcbb86`). ✅ **T12** PDF **996,4 → 359,7 Kio (−63,9 %)** : les images « en double » étaient des **masques alpha**, la carte opaque en portait 286 Kio d'inutile ; carte en JPEG q80, logos à 300 dpi, **photo NON touchée** (déjà à 226 dpi) ; texte extrait identique caractère pour caractère (`f6dbb96`). ⬜ **T5-bis** : l'envoi SMTP (~3,4 s) reste dans la réponse. **Cadence** — ✅ **T8** résidu de **G4 soldé** : compte = analyses illimitées en total, seul le rythme borné ; seuils dans `config_cadence` (migration **227**, additive, appliquée en local) ; 429 + `Retry-After` + code distinct ; le limiteur laisse passer en cas d'erreur (`0890df2`). Ouverts : ⬜ **T9** l'adresse du client n'est pas vérifiable (Next 16 n'expose plus le socket) → poser `CADENCE_ENTETE_IP` avec le tunnel nommé ; ⬜ **T10** aucune confirmation d'e-mail à l'inscription (atténuée par le jeton-capacité) ; ⬜ **T11** Turnstile à poser avec la mise en production. `npm test` complet vert à chaque commit (596 fichiers / 7880 tests au dernier) ; dette eslint de `page.tsx` gelée à 22. |
| 2026-09-22 | Livraison des documents de l'espace client | Symptôme : depuis l'iPhone via le tunnel, un document de l'espace client ouvrait `http://localhost:9000/svav-dev/…` (« connexion au serveur impossible ») ; invisible depuis le Mac. ✅ **T6** — l'application sert elle-même les octets des trois documents, plus aucune redirection vers une URL de stockage, `Cache-Control: private, no-store`, garde d'accès inchangée (`87346c3`). ⬜ **T7** — inventaire des **4 autres livraisons par URL signée** (2 routes admin, 2 liens d'alerte par e-mail de 72 h et 7 jours) : même défaut d'endpoint hors du Mac, même question de laissez-passer transmissible, **délibérément NON corrigées** — les liens d'e-mail demandent d'abord une URL publique et une garde propre. `npm test` complet vert : 592 fichiers / 7 808 tests. |
