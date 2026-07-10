# SPEC M2 — RGPD & données personnelles (Q-A, Q-B, Q-C)

> Étude d'architecture. **Aucun code, aucune migration.** Ce document est écrit pour être lu par un
> non-technicien (Arno). Il tranche ce qui peut l'être techniquement, et **isole clairement** ce qui
> relève d'un **avis juridique / DPO** — jamais présenté comme un fait acquis.
>
> ⚠️ **Avertissement liminaire (non négociable).** Je ne suis pas juriste. Ce document distingue
> partout **(T) ce qui est un fait d'ingénierie** (minimisation, k-anonymat, irréversibilité — je peux
> le trancher) de **(J) ce qui exige un avis d'un professionnel du droit / DPO** (base légale,
> qualification « anonyme vs pseudonyme », chiffres de rétention, exemption de consentement). **Aucune
> ligne ci-dessous ne remplace un avis juridique.**

---

## 0. Le fait qui commande tout : aujourd'hui, on ne stocke RIEN

- Le tunnel public est une **application 100 % éphémère** : un seul état React (`app/page.tsx:1145`,
  type `Etape` `:25`), **aucune URL par écran, aucun routeur** (l'« écran » est un état, pas une page).
- Les routes de calcul (`app/api/analyse/route.ts`, `app/api/origine/route.ts`) sont en **lecture
  seule** : zéro `INSERT/UPDATE`. Aucune table de test / résultat / internaute n'existe (inventaire
  base : seules `admin_utilisateur`, `admin_utilisateur_log`, `config_edit_log`,
  `curation_patrimoine_log` portent du comportemental, **tout côté admin**).
- **Conséquence** : au déploiement de M2, les statistiques publiques produisibles **rétroactivement =
  quasi zéro**. Tout se mesure **à partir du jour où l'on commence à écrire des événements**. Il faut le
  dire à Arno sans détour (cf. `SPEC_M2_statistiques.md` §métriques).
- **Corollaire de conception** : puisqu'on part d'une page blanche, on peut choisir le modèle le **plus
  protecteur** dès le départ, sans dette héritée.

---

## Q-A — La carte des tests est-elle licite, et sous quelle forme ?

### A.1 Le problème, en clair
Le point d'origine d'un test est **posé à la main dans (ou à ≤ 1 m de) l'emprise d'un bâtiment**
(`app/lib/db/origine.ts:16-17`, `ORIGIN_SNAP_TOLERANCE_M = 1.0` — ⚠️ **note** : le CLAUDE.md indique
encore « 0,30 m », c'est une **dérive de doc**, la valeur réelle du code est **1,0 m**). Le point est
snappé sur la **façade**. Une carte des tests est donc une **carte de logements** ; croisée avec un
verdict (« ce logement est SANS_VIS_A_VIS, score élevé »), c'est une **donnée personnelle
commercialement exploitable** (on peut, par recoupement avec les annonces de l'agence, savoir qui vend
un bien à vue premium).

### A.2 Les formes de restitution, du plus fin (dangereux) au plus agrégé (sûr)

| Forme | Ce qu'elle permet | Ré-identification (T) | Coût PostGIS |
|---|---|---|---|
| **Point exact** | Précision au bâtiment | **MAXIMALE** — c'est l'adresse. k = 1 toujours. | Trivial |
| **Point flouté (jitter)** | Densité approx. | **FAIBLE protection, trompeuse** : un jitter déterministe est reproductible ; en agrégat le vrai centre se retrouve ; un point isolé pointe une petite zone. « Anonymisation » de façade. | Trivial |
| **Grille fine 200 m (carroyage INSEE)** | Densité au quartier | **MOYENNE-HAUTE à faible trafic** : une maille à 1 test = 1 logement. Exige un seuil k. | Faible (`ST_SnapToGrid` L93) |
| **Maille administrative — IRIS** | Quartier (~2000 hab.) | MOYENNE si peu de tests. | Faible (jointure point-dans-polygone ; **IRIS à importer**) |
| **Maille administrative — COMMUNE** | Ville | **FAIBLE** (surtout avec suppression sous k). | Faible (commune dérivable de `adresse_ban` / import léger) |
| **Heatmap sans point cliquable** | Densité visuelle | FAIBLE **uniquement si** calculée sur des agrégats déjà k-anonymisés ; **HAUTE si** calculée sur les points bruts (un point chaud isolé = une adresse). | Moyen |

### A.3 Décision technique (T) — recommandation par défaut : **COMMUNE**, pas la maille fine
1. **Ne JAMAIS stocker, dans la base M2, le point exact ni le `cleabs` du bâtiment.** À l'écriture, on
   ne retient que la **commune** (code INSEE) du point.
2. **Défaut = carte communale** (choropleth : densité d'analyses par commune), avec **suppression sous
   un seuil k** (une commune à moins de k analyses n'est pas affichée). *Raison (minimisation, RGPD art.
   5.1.c)* : la finalité déclarée est « où est la demande » — la **commune y répond**, une grille 200 m
   de logements individuels est de la précision « parce qu'on peut », pas « parce que la finalité
   l'exige » (constat R1-6).
3. **La grille fine 200 m (ou IRIS) n'est admissible que** : (a) sur une **finalité nommée et
   documentée**, (b) après **avis DPO (J)**, (c) avec **deux seuils k distincts** — `k_comptage` (afficher
   qu'il y a de l'activité) < `k_attribut` (afficher le verdict/score) —, (d) **l-diversité** (jamais un
   verdict homogène : voir A.4), (e) **suppression complémentaire** (voir A.5), (f) **fenêtre temporelle
   ≥ jour** (jamais une heure sur une maille fine).
4. **Le seuil k est en CONFIG, jamais en dur.** Valeur de départ proposée : **k ≥ 11** (aligne le
   précédent INSEE des 11 ménages ; ne pas descendre sous, sous peine de saper sa propre référence —
   constat R1-5a). Le chiffre exact **défendable** relève d'un **avis DPO (J)**.

### A.4 Le piège que k ne protège PAS : l'attribut homogène (l-diversité) — constat R1-1
k-anonymat garantit « on ne sait pas quelle ligne est la vôtre », **pas** « on ne connaît pas votre
valeur ». Une maille à 11 analyses **toutes SANS_VIS_A_VIS** divulgue le verdict de chacune, sans jamais
isoler personne. Avec seulement **3 verdicts** (SANS / VIS / INDÉTERMINÉ), l'homogénéité est fréquente.
→ **Règle (T)** : **ne jamais afficher le verdict ni le score au niveau d'une maille fine.** Les
ventilations par verdict/score restent au niveau **commune** (ou IRIS), sous `k_attribut` **et**
l-diversité (≥ 2 verdicts distincts, aucune classe > X %). Au niveau maille fine : **densité seulement**.

### A.5 Suppression complémentaire — constat R1-5d
Masquer une maille < k mais publier le **total régional** rend la valeur masquée **récupérable par
soustraction**. → **Règle (T)** : quand une maille est supprimée, supprimer aussi assez de mailles
voisines pour que le masquage ne soit pas reconstructible (pratique standard de *statistical disclosure
control*). Ne pas publier un total qui trahit le différentiel.

### A.6 Le faux confort à éviter — constat R1-7
La carte M2 agrégée ne « protège » **rien** tant que le point exact vivra ailleurs (le futur module M3
nominatif stockera lat/lon en clair, avec sa **propre** base légale et rétention). M2 (pseudonyme,
communal) et M3 (nominatif, point exact) sont **deux traitements distincts** ; ne pas laisser « M2 est
agrégé » créer un faux sentiment de sécurité sur le point exact stocké à côté.

### A.7 Frontière DROIT / TECHNIQUE
- **(T) Je tranche** : ne pas stocker le point/cleabs en M2 ; défaut communal ; double k + l-diversité +
  suppression complémentaire ; k en config ≥ 11 ; jamais de verdict par maille fine. Ce sont des faits
  d'ingénierie de *disclosure control*.
- **(J) À demander à un juriste / DPO** : le **chiffre k exact** défendable ; si la carte communale
  k-supprimée est « anonyme » au sens légal (donc hors RGPD) ou reste « pseudonyme » ; la **base légale**
  de l'écriture d'un « résultat » (même communal + verdict) — je ne tranche aucun de ces points.

---

## Q-B — Visiteur unique, sans cookie de traçage ?

### B.1 Les mécanismes, comparés

| Mécanisme | Mesure | Consentement ? | Fiabilité réelle | Fragilité |
|---|---|---|---|---|
| **Cookie 1st-party + bandeau** | Unique/récurrent sur la durée du cookie | **Oui** (bandeau) | Bonne tant que le cookie vit | Safari ITP (cookie JS ~7 j), effacement, navigation privée |
| **Session éphémère sans consentement** | Comportement **intra-visite** (tunnel, pages d'une visite) | **Non** (si strictement de session, non persistant, non recoupé) | Bonne pour la session | Ne distingue **pas** unique/récurrent — par conception |
| **Empreinte (fingerprint)** | Retour « approximatif » | **Oui** (la CNIL traite le fingerprinting comme du traçage) | Mauvaise (collisions, dérive) | Safari/Firefox le combattent activement ; éthiquement « dark » |
| **Hash d'IP salé rotatif** | « Unique/jour » **approximatif** | Zone grise (« mesure d'audience » — voir B.3) | **Faible** : NAT/mobile = sous-comptage massif ; IP dynamique = sur-comptage | IPv4 = 2³² **brute-forçable** ; le sel « secret jeté » est un **vœu pieux** (voir B.4) |
| **Aucune distinction** | Visites (sessions) uniquement | Non | Honnête | On perd « unique/récurrent » |

### B.2 Décision (T) — recommandation : **on renonce au « visiteur unique »**, on mesure des **VISITES**
Sans identifiant persistant, « visiteur unique » et « récurrent » **ne sont pas mesurables proprement**.
La recommandation **compatible « pas de bandeau cookie »** est : un **identifiant de session éphémère**
(non persistant, jeté à la fin de la visite ; jamais stocké au repos comme identifiant durable), qui
mesure **les visites (sessions)**, la **provenance**, le **parcours du tunnel** — **sans** distinguer
unique/récurrent.

**Ce qu'on PERD en le choisissant (à dire à Arno) :** on ne pourra pas afficher « X visiteurs uniques »
ni « Y récurrents ». Le dashboard affichera **« Visites »**. C'est le prix de « pas de bandeau ».

### B.3 L'exemption « mesure d'audience » — PISTE À VÉRIFIER (J), jamais un fait
La CNIL a publié des lignes directrices selon lesquelles un dispositif de **mesure d'audience** *peut*,
**sous conditions**, être exempté de consentement. **Conditions couramment citées** (à **faire
confirmer par un DPO**, je ne les tiens pas pour acquises) : finalité strictement limitée à la mesure
pour le compte de l'éditeur, **pas de recoupement** avec d'autres traitements, **pas de partage**,
donnée **non cross-site**, IP tronquée/anonymisée, **rétention limitée** (des durées de l'ordre de
~13 mois pour l'identifiant / ~25 mois pour les données sont *souvent évoquées* — **chiffres à
vérifier**). La CNIL publie une liste d'outils qu'elle considère exemptables sous conditions.
→ **(J)** : si Arno veut un jour un « unique/jour », cette voie doit être **validée par un juriste**
avant toute implémentation. **Je ne l'active pas par défaut.**

### B.4 Pourquoi le hash d'IP « sel quotidien secret jeté » est **INTERDIT**, pas « à valider » — constat R1-3
Trois raisons **techniques** (indépendantes de tout avis juridique) :
1. **Non-atomicité sauvegarde/purge** : le sel vit en mémoire/config toute la journée → il est dans les
   **backups**, dumps, IaC. Une sauvegarde de 23:59 capture *sel + hashes ensemble*. IPv4 = 2³² ≈ 4
   milliards → ré-énumérer tous les hash avec sel connu = **minutes sur GPU**. Un seul backup mal
   découpé **dé-anonymise la journée**. « Jeté » est une promesse que le planning de backup ne tient pas.
2. Le sel **partagé sur la journée** fait du hash un **identifiant de traçage journalier** de fait → ça
   *crée* une donnée personnelle au lieu de l'éviter.
3. Métrique **vaniteuse à faible trafic** : « uniques/jour » n'apporte quasi rien et coûte cher en
   ré-identification.
→ **Décision (T) : on n'offre pas cette option.** Un juriste ne rend pas un backup atomique.

### B.5 Le danger caché : referer & UTM stockés bruts = ré-injection de données personnelles — constat R1-4 (CRITIQUE)
Les champs `referer` et `utm_*` sont des **URL libres** qui transportent régulièrement de la donnée
personnelle : **email en clair** dans une URL de campagne (`?email=jean@…`, `mc_eid=`), **click-ids**
cross-site (`gclid`/`fbclid`/`msclkid`), **`utm_term`** = la requête littérale tapée par l'internaute,
referer complet depuis un webmail (token, nom, adresse dans le path). Les stocker bruts remplirait la
table « pseudonyme » de **PII directe** → architecture auto-défaite.
→ **Décision (T)** : à l'écriture, **allowlist stricte** = seulement `source`, `medium`, `campaign`
(bucketés contre un vocabulaire attendu, l'inconnu → « autre ») ; **referer réduit au domaine**
(`instagram.com`, jamais le path/query) ; **strip inconditionnel** de tous les click-ids ; **jeter**
`utm_term`, `utm_content` et tout paramètre arbitraire.

---

## Q-C — Tracer les collègues : audit ≠ dashboard de productivité

### C.1 Deux finalités, à ne pas confondre
- **Journal d'audit (sécurité, traçabilité des écritures)** : **déjà légitime et construit** —
  `curation_patrimoine_log`, `config_edit_log`, `admin_utilisateur_log` tracent *qui a modifié quoi*,
  avec `utilisateur_id`, `session_jti`, `avant/apres`. Finalité : sécurité, imputabilité, réversibilité.
  Défendable, existant.
- **Dashboard de productivité (« qui vient quand et pour quoi faire »)** : c'est du **contrôle
  d'activité de salariés**. Obligations générales qui s'y attachent (principes, **pas un avis juridique**
  — à confirmer par un DPO **(J)**) : **information préalable** des personnes (elles doivent être
  informées qu'elles sont suivies et pourquoi), **finalité déclarée**, **proportionnalité**, **durée de
  conservation limitée**, et en France, **consultation des représentants du personnel** (CSE) le cas
  échéant. Le suivi de salariés est **plus contraint** que l'analytics client (déséquilibre
  employeur/salarié).

### C.2 Deux périmètres proposés
1. **Audit de sécurité, agrégé, sans profilage individuel** : nombre de connexions/jour, échecs de
   connexion, usage de module **agrégé** — jamais « le collaborateur X a passé N heures dans le module
   Y ». Finalité : sécurité. **Proportionné.**
2. **Suivi individuel nominatif** : « X s'est connecté à H, a utilisé A/B pendant D, depuis le lieu L ».
   → régime contraint (C.1).

### C.3 Recommandation (T) : **périmètre 1 par défaut**
Raisons : il satisfait la finalité **sécurité** (détecter une anomalie, un compte compromis) sans le
fardeau du suivi de salariés ; il évite de transformer un outil de sécurité en outil de surveillance ;
et les **journaux d'écriture existants** fournissent déjà l'imputabilité individuelle **quand un
incident l'exige** (usage ponctuel, événementiel), ce qui est différent d'un dashboard de productivité
permanent. Le **périmètre 2 est une décision d'Arno**, subordonnée à l'**information préalable** des
collaborateurs **(J)**.

### C.4 Géolocalisation d'IP d'un salarié — proportionnée à la sécurité ?
- **Pour** : détecter une connexion depuis un pays/lieu inattendu est un vrai signal (identifiants
  volés).
- **Contre** : géolocaliser en continu les connexions de 3 salariés sur un sous-domaine fermé est
  **intrusif** (révèle le domicile, les déplacements), **disproportionné** face à un modèle de menace
  faible, et la géo-IP « ville » d'une box résidentielle **révèle où habite le salarié**. La précision
  ville en France est en outre **faible** (passerelles opérateurs, CGNAT, IPv6).
- **Conclusion (T)** : **ne pas stocker la géoloc IP des salariés par défaut.** Si un besoin de sécurité
  survient, faire un **lookup ponctuel pendant l'incident** (plus proportionné qu'un stockage permanent),
  et **informer** les salariés. Le nom du compte connecté est **déjà** connu (compte nommé) — la géoloc
  n'ajoute presque rien de proportionné (voir aussi `SPEC_M2_statistiques.md` §5).

---

## Récapitulatif : décidé (T) / à valider par un juriste (J) / renoncé

**Décidé techniquement (T) :**
- Carte : défaut communal, k-suppression, jamais point/cleabs, jamais verdict par maille fine, k en
  config ≥ 11, l-diversité + suppression complémentaire.
- Pas de « visiteur unique/récurrent » sans consentement → **« Visites »**.
- Pas de `ip_hash` ; pas de fingerprint ; referer host-only + allowlist UTM + strip click-ids.
- Pas de géoloc IP salariés ; audit sécurité agrégé par défaut.
- Rétention en config, deux niveaux (session éphémère courte / agrégats k-safe) — voir
  `SPEC_M2_evenements.md`.

**À valider par un juriste / DPO (J) — Arno doit demander :**
- Le **chiffre k** défendable et si la carte communale k-supprimée est « anonyme » au sens légal.
- La **base légale** d'écriture d'un « résultat » (communal + verdict) avant toute identité.
- La **qualification** finale « anonyme vs pseudonyme » du store M2.
- Les **durées de rétention** exactes ; l'**exemption mesure d'audience** si un « unique/jour » est un
  jour voulu.
- Pour le suivi collègues individuel (périmètre 2) : information préalable, CSE, proportionnalité.

**Renoncé (dit franchement à Arno) :**
- Visiteurs uniques / récurrents ; durée moyenne « sur le site » ; page de sortie ; trafic sous-horaire ;
  compte d'« adresses distinctes ». Motifs et alternatives : `SPEC_M2_statistiques.md` §métriques.
