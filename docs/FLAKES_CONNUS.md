# Flakes connus (registre)

> Registre des tests qui échouent par **intermittence** sans qu'un défaut de code soit prouvé.
> But : qu'un échec déjà diagnostiqué ne relance pas une enquête à zéro, et qu'on ne reparte
> **jamais** sur une piste déjà réfutée.
>
> **Règle d'écriture (non négociable) : un flake se documente avec son NIVEAU DE PREUVE, jamais
> avec une hypothèse présentée comme une cause.** Trois niveaux, à séparer visiblement dans chaque
> entrée :
>
> - ✅ **PROUVÉ** — établi par mesure reproductible (chiffres, protocole).
> - ❌ **RÉFUTÉ** — hypothèse testée et écartée, à ne pas rejouer.
> - ❓ **NON ÉTABLI** — pas de cause démontrée. Une hypothèse résiduelle reste une hypothèse : on
>   l'étiquette comme telle, on ne la promeut pas en « cause ».
>
> Une entrée par flake. Ajouter les nouveaux au fil de l'eau.

---

## `certificatPdf.test.ts` — égalité octet à octet des PDF générés

- **Fichier / test** : `app/lib/pdf/certificatPdf.test.ts`. Surface d'abord observée : bloc
  `genererCertificatPdf — QR par TYPE de document` → test **« ONE-SHOT : typeDocument est IGNORÉ
  (QR décoratif, jamais de doc) »**. Concerne en réalité les **~10 assertions de déterminisme**
  du fichier (deux générations aux mêmes entrées → `Buffer.equals` intégral).
- **Symptôme** : `a.equals(b)` renvoie `false` de façon **intermittente en suite complète**
  (`npm test`) ; **vert en isolé et au re-run**.

### ✅ PROUVÉ — le générateur PDF est déterministe octet à octet

- **400 générations dans un même process** (200 one-shot en alternant `typeDocument`, 200 gabarit
  « compte ») → **0 divergence** vs la 1ʳᵉ.
- **Deux générations espacées de 1,2 s** (franchissant une frontière de seconde) → **0 octet** de
  différence, longueurs identiques.
- Le `/ID` du trailer = **MD5 dérivé du dict `info`**, dont `CreationDate`/`ModDate` valent `emisLe`
  (paramètre **figé** par l'appelant) — pas de source d'horloge dans les octets.
- **Isolation vitest** : `vitest.config.ts` n'impose ni `pool` ni `setupFiles` → défauts vitest
  (**`forks` + `isolate: true`**) → **chaque fichier de test tourne dans un process forké neuf** →
  une fuite d'état d'un autre fichier est **structurellement exclue**. Le seul fichier à faux timers
  (`app/lib/analytics/writer.test.ts`) **restaure en `afterEach`**.

### ❌ RÉFUTÉ — « comparaison d'octets non déterministe / horodatage / timestamp »

L'ancien diagnostic est **FAUX**. Un intervalle de 1,2 s ne change pas un octet ; le seul
`new Date()` par défaut de pdfkit est **écrasé** par `emisLe`. **Ne pas repartir sur la piste du
timestamp.**

### ❓ NON ÉTABLI — la cause de l'échec intermittent

- Observé **une seule fois** (suite complète, 21/08/2026). **Jamais reproduit** : 4 suites complètes
  + 3 runs isolés = tous verts.
- Hypothèse **résiduelle et NON PROUVÉE** (à ne pas promouvoir en cause) : aléa environnemental /
  ressources sous charge parallèle (nombreux workers forkés exécutant en concurrence des addons
  natifs — sharp/libvips, fontkit, pdfkit/zlib).

### Conduite à tenir si rouge

Les 10 assertions d'égalité passent par le helper `attendreIdentiques(a, b, libellé)`. En cas
d'échec, le message porte : **longueurs**, **nombre d'octets divergents**, **5 premiers offsets**,
**contexte ASCII ±60** du 1er offset (côté a ET b), et les **deux buffers sont dumpés dans
`os.tmpdir()`** (`svav-flake-<libellé>-<suffixe>-a.pdf` / `-b.pdf`).

1. **LIRE le dump et le JOINDRE** au rapport (offsets + les deux PDF). C'est la première info exigée.
2. **NE PAS relancer à l'aveugle** en espérant que ça passe : la relance sans lecture perd la seule
   occurrence exploitable.
3. **NE PAS « corriger » le générateur** `certificatPdf.ts` : il est prouvé sain (voir ci-dessus).
4. **NE PAS rouvrir la piste timestamp** : réfutée.
5. Si le dump montre une **vraie** divergence reproductible (offsets stables entre occurrences),
   c'est un fait NOUVEAU → il remplace le « NON ÉTABLI » ci-dessus, avec sa preuve.

---

## Test « fantôme » — un fichier de test JAMAIS collecté (défaut de COLLECTE, PAS un flake)

> ⚠️ Ce n'est **pas** un flake (rien d'intermittent) : c'est un test qui ne tournait **jamais** tout
> en étant annoncé vert. Consigné ici car c'est la même **famille de dette** que `curation.test.ts`
> (resté rouge et invisible du 14/07 au 03/08/2026) : un contrôle qu'on **croit** actif ne l'est pas.
> **RÉSOLU + VERROUILLÉ** le 2026-09-15.

- **Incident** : `app/(admin)/admin/(protected)/permis/BlocDemandePieces.toutCocher.test.tsx` était
  bien écrit et passait en exécution ciblée, mais **la suite ne l'a jamais exécuté**. Il a été annoncé
  vert dans le commit `10dcf4e` sans avoir tourné une seule fois dans `npm test`.

### ✅ PROUVÉ — cause ÉTABLIE (ce n'est pas une hypothèse)

- `vitest.config.ts` avait `include: ['app/**/*.test.ts']` — **`.ts` uniquement**. Un fichier en
  **`.test.tsx`** ne matche pas ce pattern → **hors collecte**, silencieusement.
- Vérifié : `npx vitest list --filesOnly` renvoyait **570** fichiers ; `git ls-files` en listait
  **571** ressemblant à un test. L'unique écart tracké était ce `.tsx`. (Le 571ᵉ sur disque,
  `sandbox/additionne.test.ts`, est **gitignoré** — bac à sable isolé avec sa propre config, hors
  périmètre projet, à ne pas collecter.)

### Correctifs (deux, complémentaires)

1. **Élargissement du `include`** → `app/**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}` : toute
   extension TS/JS et les deux conventions (`.test.`/`.spec.`) sont désormais collectées. Portée
   gardée à `app/**` (n'aspire pas `sandbox/`). Zéro fichier nouvellement collecté aujourd'hui (tous
   les tests tracked sont des `.test.ts`) → aucun risque de rouge caché révélé au passage.
2. **Méta-test garde-fou** `app/lib/collecteTests.test.ts` : compare l'ensemble des fichiers de test
   **suivis par git** (donc hors gitignore) à l'ensemble **réellement résolu** par le `include` de la
   config (via **tinyglobby**, le globber même de vitest → aucune divergence de matcher). Tout fichier
   ressemblant à un test **non collecté** fait **échouer `npm test`** en nommant le coupable. Une garde
   de sanité (`> 50` tests trouvés) empêche un faux vert si `git ls-files` ne répond pas.

### Conduite à tenir si le méta-test est ROUGE

- Il liste un fichier de test **non collecté**. **NE PAS le renommer, le déplacer hors scope, ni le
  passer en `.skip`** pour faire taire l'alerte : ce serait re-masquer un test qui ne tourne pas.
- **Corriger la COLLECTE** : élargir `test.include` pour couvrir l'extension/emplacement, ou déplacer
  le fichier sous une zone couverte — puis vérifier que le test **passe** réellement. S'il échoue,
  c'est un **vrai test rouge** qui dormait : il se traite comme tel (jamais désactivé).

---

## `pieceEntrante.test.ts` — motif « stockage non configuré » attendu, autre motif reçu (17/10/2026)

- **Fichier / tests** : `app/lib/stockage/pieceEntrante.test.ts` — les **5 tests** qui supposent le stockage NON
  configuré en test et attendent le motif `stockage non configuré` :
  « un .csv passe la whitelist », « un .html passe la whitelist (idem) », « deposerDocumentDossier (chemin GED / Drive)
  accepte aussi text/html », « stockage non configuré (type + taille OK) → non déposé… » et « type + taille OK mais
  stockage non configuré (tests) → non déposé, sans exception ».
- **Symptôme** : les 5 échouent **ensemble**, **en suite complète** (`npm test`), **deux fois le 17/10/2026** (lots
  « tuile Location » et « Location pour de vrai ») ; **verts en isolé** (23/23) **et à la suite complète suivante**
  (1216 puis 1217 fichiers verts). Aucun fichier de `app/lib/stockage/` n'était modifié par ces lots.

### ✅ PROUVÉ

- Échec **intermittent** et **groupé** (les 5 tests de la même hypothèse « stockage non configuré » tombent ensemble) :
  2 occurrences sur 6 suites complètes le 17/10/2026 ; 0 en isolé.
- Le code testé n'a pas changé pendant les occurrences (aucune modification de `app/lib/stockage/*`).

### ❓ NON ÉTABLI — la cause

- Le motif réellement reçu n'a pas été capturé lors des deux occurrences (sortie filtrée sur les seuls titres).
- **3ᵉ occurrence, 17/10/2026** (lot « refonte de l'accueil Location ») : mêmes 5 tests, suite complète ; vert à la suite
  complète suivante (1219 fichiers). Motif encore NON capturé (sortie filtrée) — la suite suivante a été lancée avec la
  sortie entière enregistrée, mais l'échec ne s'est pas reproduit.
- **4ᵉ occurrence, 17/10/2026** (lot « famille de bien », tuile Location) : mêmes 5 tests, suite complète ; vert à la
  relance suivante (1224 fichiers). Motif encore NON capturé : le journal de la suite en échec a été écrasé par la relance
  (même fichier de sortie). Leçon : écrire la sortie de chaque passe dans un fichier DISTINCT avant de relancer.
- Hypothèse **résiduelle et NON PROUVÉE** (à ne pas promouvoir en cause) : ces tests dépendent de l'ENVIRONNEMENT
  (« S3_* absents ») ; si la configuration de stockage est visible du processus de test et que le service ne répond
  pas à temps sous la charge de la suite complète, le dépôt s'arrête sur un autre motif.

### Conduite à tenir si rouge

- Relancer le fichier seul (`npx vitest run app/lib/stockage/pieceEntrante.test.ts`) puis la suite complète ; si vert,
  consigner l'occurrence ici (date, suite, **motif reçu en entier** — sans filtrer la sortie).
- **Ne pas** passer ces tests en `.skip` ni assouplir l'attente : la prochaine occurrence doit servir à capturer le motif
  reçu, seule donnée qui manque pour établir la cause.

---

## `prodMettreAJourServeur.test.ts` — « Test timed out in 5000ms » en suite complète (stabilisé le 25/10/2026)

- **Fichier / tests** : `app/lib/ops/prodMettreAJourServeur.test.ts`, bloc « serveur.sh — chaque fin écrit une ligne finale
  explicite ». Tests observés en échec : « arrêt INATTENDU en pleine route… » et « commit DÉJÀ en service… ».
- **Symptôme** : `Error: Test timed out in 5000ms.` (délai par défaut de vitest), **seulement en suite complète** (`npm test`,
  ~1 455 fichiers en parallèle), lots du 25/10/2026 ; **vert en isolé et à la suite complète suivante**.

### ✅ PROUVÉ

- Chaque test lance de **vrais processus** `/bin/bash` (`deploy/maj/serveur.sh`, puis `scripts/prod-mettre-a-jour.sh` qui relit
  le journal) avec de fausses commandes `flock` / `id` / `systemctl` ; le scénario « arrêt inattendu » contient un `sleep 1` et
  remonte les processus parents par `ps`.
- Durées **seul** (25/10/2026, `--reporter=verbose`) : 693 ms, 837 ms, 236 ms, 356 ms, **1 719 ms** (arrêt inattendu), 2 ms —
  fichier entier 3,85 s. La marge sous le délai de 5 s est donc faible, et la création de processus est ce qui ralentit le plus
  quand ~1 455 fichiers se disputent le CPU.
- L'échec est un **dépassement de délai du test**, pas une assertion fausse : aucune attente sur le code ou le journal n'a échoué.

### Correctif

- Délai porté à **30 s pour ce fichier seul** (`describe(…, { timeout: 30_000 }, …)`) ; le délai global de vitest n'a pas changé,
  et les assertions non plus. Les `spawnSync` gardent leur propre garde de 20 s par script.

### Conduite à tenir si rouge

- Si le message est encore un **dépassement de délai** (à plus de 30 s) : mesurer la durée du test dans la suite qui a échoué
  avant d'allonger encore. Un script qui ne rend plus la main est un vrai défaut, et un délai plus long ne le corrige pas.
- Si une **assertion** échoue (ligne finale, code de sortie, conclusion du Mac) : ce n'est pas ce flake. C'est un défaut de
  `serveur.sh` ou de `prod-mettre-a-jour.sh`, à instruire comme tel.

---

## `EcransTransaction.test.tsx` — « Test timed out in 5000ms » en suite complète (stabilisé le 31/10/2026, lot DM)

- **Fichier / tests** : `app/(admin)/admin/(protected)/transaction/EcransTransaction.test.tsx`, les tests qui rendent des
  dizaines d'écrans d'affilée : « en Année, chaque total = la somme des 12 mois pris un par un » (lot CT), « contrôle 6 : le CA
  de l'année = la somme de ses 12 mois » (lot DG), « chaque écran (Compromis, Le mois …) : la même structure pour les deux
  sociétés » (lot DK), « Tout en Vendu, Compromis, Vendu + compromis » et « Période = la somme des années ; Tout = le total
  historique » (lots DG / DH).
- **Symptôme** : en `npm test` complet, un de ces tests échoue par **dépassement du délai de 5 s** ; vert en isolé et au re-run.

### ✅ PROUVÉ

- Durées **seul** (31/10/2026, `--reporter=verbose`) : **2 312 ms** (lot CT), **2 007 ms** (contrôle 6), **1 855 ms** (lot DK) —
  les autres sous la seconde. La marge sous 5 s est faible quand la suite entière se dispute le CPU.
- L'échec constaté est un **dépassement de délai**, jamais une assertion fausse (même test vert au re-run, sans changement).

### ❓ NON ÉTABLI

- Aucune cause autre que la charge n'a été cherchée ; aucune n'est affirmée.

### Correctif

- Délai porté à **30 s pour ces cinq tests seuls** (`it(…, …, 30_000)`, repère « LOT DM » dans le fichier) ; délai global de
  vitest et assertions inchangés. Décision d'Arno du 31/10/2026 (réponse à la question du lot GE4).

### Conduite à tenir si rouge

- **Dépassement au-delà de 30 s** : mesurer la durée du test dans la suite qui a échoué avant d'allonger ; un écran qui boucle
  (rendu sans fin) est un vrai défaut — cf. la note « suite figée = boucle de rendu ».
- **Assertion fausse** : ce n'est pas ce flake ; c'est un écart de calcul ou d'écran à instruire.

---

## Turbopack (`next dev`) — « does not support external modules (request: node:fs) » sur `/admin/mon-espace` (18/11/2026)

- **Où** : serveur de développement (`next dev`, Next.js 16.4.6, Turbopack), page `/admin/mon-espace`. Ce n'est pas un
  test de la suite : c'est une panne de construction de page, consignée ici parce qu'elle est intermittente et non expliquée.
- **Symptôme (rapporté par Arno, 18/11/2026 vers 11h21)** : `GET /admin/mon-espace` → **500** ; Turbopack s'arrête sur une
  erreur FATAL : « Failed to write app endpoint /(admin)/admin/(protected)/mon-espace/page — the chunking context (unknown)
  does not support external modules (request: node:fs) ».

### ✅ PROUVÉ

- **Non reproduite** : peu après, Arno a rouvert `/admin/mon-espace`, connecté, sur le même serveur : la page s'affiche
  normalement, sans erreur. Le processus `next dev` lancé le 17/11/2026 à 18h49 était toujours vivant et en écoute.
- **Aucun import de `node:fs` dans le graphe de la page** : graphe esbuild depuis `mon-espace/page.tsx` (258 fichiers,
  même méthode que `app/lib/garde/clientBoundary.guard.test.ts`) — aucun fichier du dépôt n'y importe `node:fs` / `fs` ;
  côté navigateur (au-delà de chaque frontière `'use client'`), les seuls paquets atteints sont `react`, `react-dom` et
  `next/navigation`.
- **La page compile sans erreur** sous Turbopack : `next build --experimental-build-mode compile --debug-build-paths
  "app/(admin)/admin/(protected)/mon-espace/page.tsx"` → « Compiled successfully » (18/11/2026, code de `1f3a7e7b`).
- L'erreur n'apparaît pas dans `.next/dev/logs/next-development.log` (seulement dans le terminal du serveur).

### 2e occurrence (rapportée par Arno, 19/11/2026 vers 15h50) — ce qui a été mesuré

- **Même message** rapporté (« Failed to write app endpoint /(admin)/admin/(protected)/mon-espace/page — … does not support
  external modules (request: node:fs) »), avec un journal de panne `next-panic-6f12a3d3988dbfbc9f714029c67bdd05.log`.
- ✅ **Le journal de panne n'existe pas sur ce Mac** : absent de `$TMPDIR` (`/var/folders/_h/…/T/`), et aucun fichier
  `next-panic-*` nulle part sous `/var/folders` (recherche faite hors bac à sable).
- ✅ **Le serveur de recette ne s'était PAS arrêté** : le seul `next dev` de la machine (PID 47413, lancé le 17/11/2026 à 18h49,
  verrou `.next/dev/lock` à son nom, en écoute sur le port 3000) répondait encore 200 à 15h58. Son terminal
  (`.captures/recette-interception/serveur-iphone.log`, 17/11 → 19/11) ne contient **aucune** réponse 500, aucun « FATAL »,
  aucune panique ; `GET /admin/mon-espace` y est servi en **200**. Rien non plus dans `.next/dev/logs/next-development.log`
  ni dans la trace `.next/dev/trace` (aucun `ensure-page` en échec pour `mon-espace` autour de 15h50). Aucun autre dossier
  `.next/dev` sur la machine.
- ✅ **Ce qui ne répondait plus, mesuré : le TUNNEL.** Le tunnel `kirk-literature-finger-tube` (cloudflared du 18/11 à 15h30)
  n'avait plus aucune connexion enregistrée depuis le 18/11/2026 à 16h35 (heure de Paris) : erreurs continues côté Cloudflare
  (« control stream encountered a failure while serving ») jusqu'au 19/11 (`tunnel-2026-11-18.log`). Le serveur, lui, gardait
  l'adresse du tunnel du 17/11 (`dome-byte-links-language`) pour les liens des mails.
- ✅ **Graphe d'imports rejoué sur le code du 19/11 (`aa05a701`)** : `mon-espace/page.tsx`, `mon-espace/recapitulatif/page.tsx`
  et les trois layouts de la route (`app/layout.tsx`, `app/(admin)/layout.tsx`, `app/(admin)/admin/(protected)/layout.tsx`) —
  côté navigateur (au-delà de chaque `'use client'`, imports dynamiques compris), **aucun** `node:*`, `fs`, `pg`, `dns` ni
  `server-only`. Même résultat en partant des **379 composants client du dépôt** (849 fichiers côté navigateur).
- ✅ **Compilation ciblée Turbopack** (`next build --experimental-build-mode compile --debug-build-paths` sur
  `mon-espace/page.tsx`, puis `mon-espace/**/page.tsx`) : « Compiled successfully », sans avertissement
  (`.captures/recette-interception/compile-mon-espace-2026-11-19.log`).
- **Non reproduite**, donc **aucune modification du code** (règle ci-dessous). Recette relancée (nouveau tunnel, nouveau
  terminal `serveur-2026-11-19.log`).

### ❓ NON ÉTABLI — la cause

- Aucune cause n'est établie. Le code ne fait entrer `node:fs` nulle part dans la page : rien n'indique un défaut du dépôt,
  et rien ne prouve non plus un état interne du serveur de développement. Ne pas promouvoir l'une ou l'autre en cause.
- 19/11 : le processus qui a affiché l'erreur n'est PAS le serveur de recette en écoute sur ce Mac (voir ci-dessus) ; lequel
  c'était, et où, reste à établir (terminal, machine, dossier, commande).

### Conduite à tenir si elle revient

- **Copier l'erreur ENTIÈRE du terminal** (avec l'heure et la trace d'imports si Turbopack en donne une) avant toute relance.
- **Noter d'où elle vient** : quel terminal, quelle commande (`npm run recette`, `npm run dev`…), quel dossier, et copier le
  fichier `next-panic-*.log` dans `.captures/` tout de suite (il n'était plus là le 19/11). Vérifier aussi `lsof -iTCP:3000`
  et `.next/dev/lock` : un seul `next dev` par dossier.
- Rejouer le graphe d'imports de la page (frontière client, recherche de `node:` / `fs`) et la compilation ciblée ci-dessus
  sur le code du moment ; si les deux sont propres, relancer `next dev` et consigner l'occurrence ici.
- Ne rien « corriger » dans le code sans une reproduction : une modification sans panne reproduite ne prouve rien.

---

## Suite complète lente et « 5 errors » juste après un gros import en base (20/11/2026, lot 3 quater « adresse officielle BAN »)

- **Symptôme** : `npm test` a fini en **252 s** (au lieu de ~90 s) avec un résumé **« Errors 5 errors »** et aucun test en
  échec affiché dans les dernières lignes ; la suite complète relancée aussitôt est **verte** (1830 fichiers, 27 415 tests,
  0 erreur, ~92 s). Contexte : lancée **juste après l'insertion d'environ 1,6 million d'adresses** dans `adresse_ban` de la
  base de recette `svav_recette` (import des fichiers BAN de 6 départements, `app/scripts/ban-csv-import.ts`, puis
  `ANALYZE adresse_ban`).

### ✅ PROUVÉ

- Une seule occurrence. Durée 252 s (« transform 217.94s, import 721.10s, tests 1124.67s, environment 295.04s » contre
  environ 50 / 200 / 540 / 120 s d'ordinaire) : toute la suite a été ralentie, pas un seul fichier.
- Elle ne s'est pas reproduite : **trois** suites complètes vertes ensuite (une juste après ; deux de suite le 20/11/2026,
  90,2 s et 91,4 s, sorties entières gardées dans deux fichiers distincts), sans aucune modification du code entre-temps.
- Les tests unitaires (`npm test`) ne lisent pas `svav_recette` : leurs accès à la base sont simulés.

### ❓ NON ÉTABLI

- **Les noms des tests et les messages des 5 erreurs n'ont pas été capturés** : seules les 4 dernières lignes de la sortie
  ont été lues (`tail -4`), et la relance a été faite sans garder la sortie de la passe en échec.
- La cause du ralentissement : l'hypothèse « la machine était chargée par PostgreSQL après l'import (écriture, `ANALYZE`,
  autovacuum) » est **plausible mais NON PROUVÉE** — ni la charge CPU ni l'activité de PostgreSQL n'ont été mesurées au moment
  de la suite. Le lien entre ce ralentissement et les « 5 errors » (des délais dépassés ?) n'est pas établi non plus.

### Conduite à tenir si cela revient

- Écrire la sortie ENTIÈRE de chaque passe dans un fichier distinct (`npm test > .../npmtest-1.log 2>&1`) AVANT de relancer,
  puis y chercher `Error`, `timed out`, `FAIL` : le nom du test et le message sont la donnée qui manque.
- Après un import massif en base, noter la charge (`top -l 1 | head -12`) au lancement de la suite.

---

## `PreavisAccueil.test.tsx` — « page rechargée pendant la coupure : la photo … REVIENT dans le formulaire et repart » (21/11/2026)

- **Fichier / test** : `app/(admin)/admin/(protected)/location/PreavisAccueil.test.tsx`, bloc « SAUVEGARDE AUTOMATIQUE du compte
  rendu : rien ne se perd » (Arno, 15/11/2026, 6e retour), test « page rechargée pendant la coupure : la photo gardée dans le
  téléphone REVIENT dans le formulaire et repart ».
- **Symptôme** : en `npm test` complet, `expected +0 to be 1` sur `expect(photosDeposees).toBe(1)` (dernière ligne du test) ;
  le test a duré **3 066 ms**.

### ✅ PROUVÉ

- Une occurrence, le 21/11/2026 (lot « préavis des N colocataires » et « durée proposée présélectionnée »), sortie entière
  gardée. Les fichiers modifiés par ce lot ne touchent ni la pré-visite, ni son compte rendu, ni la file d'attente locale.
- Le même fichier, lancé **seul trois fois de suite** juste après, est **vert** (196 / 196) ; la suite complète relancée
  aussitôt est **verte** (1858 fichiers, 27 676 tests), sans aucune modification du code entre-temps.
- L'attente du test (`patienter`, défini dans ce bloc) **abandonne au bout de 3 000 ms** sans échouer, puis l'assertion suit :
  une durée de 3 066 ms veut dire que la photo n'était pas encore passée à « ok » au bout des 3 s — d'où 0 photo déposée.

### ❓ NON ÉTABLI

- Pourquoi la reprise de la photo depuis la file d'attente locale (IndexedDB simulé) a dépassé 3 s ce jour-là : la charge de la
  suite complète est l'hypothèse **plausible mais NON MESURÉE** (charge CPU non relevée au moment de l'échec).

### Conduite à tenir si rouge

- Regarder la **durée** du test dans la sortie : **≈ 3 000 ms** → c'est ce flake (l'attente a expiré) ; relancer le fichier seul.
- Si le test échoue **seul**, ou bien avant 3 s : ce n'est pas ce flake — la reprise de la photo après rechargement est à
  instruire (c'est la promesse d'Arno « rien ne se perd »).
- S'il revient en suite complète : allonger l'attente de **ce test seul** (`patienter(…, 10_000)`), sans toucher aux assertions.

---

## `dateSortieUnique.test.ts` — « aucune écriture hors de la seule porte » : `ENOENT … __garde_eslint_tmp__.ts` (25/11/2026) — ✅ CORRIGÉ

- **Fichier / test** : `app/lib/location/dateSortieUnique.test.ts`, test « aucune écriture hors de la seule porte (et de l'import
  WIPPIMMO, nommé) ».
- **Symptôme** : en `npm test` complet, `Error: ENOENT: no such file or directory, open 'app/lib/svv/__garde_eslint_tmp__.ts'`
  (ligne `readFileSync(f, 'utf8')`). Fichier seul : vert.

### ✅ PROUVÉ

- Une occurrence, le 25/11/2026 (lot « Alerte du lundi seulement avec une urgence », `0d1a809a`), sortie gardée dans
  `.captures/vingt-pourcent/npm-test-complet-25-11-E.txt` ; suite relancée aussitôt : verte, sans changement de code.
- **Cause : une COURSE entre deux fichiers de test** qui tournent en parallèle. `app/lib/analytics/gardeImports.test.ts` (garde ESLint
  réelle) **crée** `app/lib/svv/__garde_eslint_tmp__.ts`, lance `npx eslint` dessus, puis l'**efface** (`finally`). Pendant ce temps,
  `dateSortieUnique.test.ts` **liste** tout `app/` et `scripts/` (à la collecte), puis **lit** chaque fichier : quand la liste tombe
  dans la fenêtre où le fichier temporaire existe et que la lecture tombe après son effacement, `readFileSync` lève ENOENT.
  Aucun code applicatif en cause.

### Correction (25/11/2026, décision d'Arno)

- `dateSortieUnique.test.ts` ignore un fichier **listé puis disparu** : `lireSiPresent` rend `null` sur **ENOENT seulement** (toute
  autre erreur — droits, dossier… — fait toujours échouer l'épreuve) ; la liste tolère de même un `statSync` en ENOENT.
- **Le contrôle n'est pas affaibli** : chaque fichier sauté est vérifié **absent** à la fin de l'épreuve (`existsSync` faux), et ils
  doivent rester marginaux (< 5) ; un vrai fichier du code est donc toujours lu. Épreuve dédiée de `lireSiPresent` (absent → null ;
  dossier → erreur ; vrai fichier → lu).
- `gardeImports.test.ts` n'est pas modifié (sa garde ESLint a besoin d'un vrai fichier sous `app/lib/svv/`).

### Conduite à tenir si rouge

- Si une AUTRE garde qui parcourt `app/` (même motif `readdirSync` → `readFileSync`) échoue en ENOENT sur `__garde_eslint_tmp__.ts`
  ou un autre fichier temporaire d'épreuve : même course, même remède (tolérer ENOENT seul + vérifier l'absence).
- Si `dateSortieUnique.test.ts` échoue sur « sauté alors qu'il existe » : ce n'est PAS ce flake — un fichier réel a été ignoré, à instruire.
