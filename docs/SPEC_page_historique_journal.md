# SPEC — Page d'historique du journal de curation (consultation, lecture seule)

> **Statut : FIGÉE.** Décisions arbitrées par Arno. Fonctionnalité de **CONSULTATION** du journal
> `curation_patrimoine_log` (append-only). **GOLDEN-SAFE** : le moteur ne lit JAMAIS ce journal
> (append-only, écrit par les seules routes admin) → aucun impact sur `29.107259068449615`,
> `test:integration` reste 15/15. **Lecture seule stricte : aucune écriture, aucune migration.**
>
> Ce document est une SPEC (exigences EARS testables), **PAS** du code. L'implémentation viendra dans
> un chantier séparé (`/svav-build`) après validation.

---

## 0. Contexte technique vérifié (recon)

- Table `curation_patrimoine_log` : `id bigint PK`, `ts timestamptz NOT NULL DEFAULT now()`,
  `action text` (CHECK 9 valeurs), `entite_id int NOT NULL`, `cleabs text`, `avant jsonb`, `apres jsonb`.
  Index : `PK(id)` + `entite_idx btree(entite_id)`. **Aucune FK** sur `entite_id` → le log survit à la
  suppression d'une entité (aujourd'hui : 29 entités loguées, 22 encore en base, **7 supprimées**).
- **Aucune route ne lit le journal pour affichage** aujourd'hui (`borne` lit `MAX(id)`, `annuler-edition`
  le rejoue). → une **nouvelle route GET** est nécessaire.
- Front : composant unique `app/(admin)/admin/(protected)/curation/CurationCarte.tsx` ; header
  `svv-cur-head` (`:897`), panneau gauche `svv-cur-panel` (`:912`), zone droite `svv-cur-map` (carte
  Leaflet brute, `mapRef`), footer Sortir/Valider/Annuler dans `svv-cur-detail`. **Aucun pattern
  modal/drawer préexistant.**
- Chaque entité (type `Entite`, mapping `partage.ts versEntite`) = `{ id, famille, ref_code, nom, statut,
  origine, point, corrige, etat, liaisons[] }`.
- **Aucune colonne utilisateur** dans le journal (session admin unique) → l'historique n'affiche pas
  de « qui ».

---

## 1. User stories

- **US-A** — En tant qu'**opérateur** (Arno), je veux consulter l'**historique d'une entité** depuis sa
  fiche, afin de comprendre les modifications successives qu'elle a subies.
- **US-B** — En tant qu'**opérateur**, je veux consulter l'**historique global** de toutes les entités,
  filtrable et paginé, afin d'auditer l'activité de curation dans le temps.
- **US-C** — En tant qu'**opérateur**, je veux que la **carte reste visible** pendant la consultation
  du journal, afin de garder mon repère spatial sans perdre l'état de la carte.

---

## 2. Exigences — Backend : lecture du journal (nouvelle route GET)

**HJ-1** — Le système DOIT exposer une route **GET de lecture par entité**
`GET /api/admin/curation/entites/[id]/journal` renvoyant les lignes de `curation_patrimoine_log` dont
`entite_id = [id]`.

**HJ-2** — QUAND la route par entité est appelée, le système DOIT trier les lignes par `id` **décroissant**
(récent → ancien).

**HJ-3** — Le système DOIT exposer une route **GET de lecture globale**
`GET /api/admin/curation/journal` renvoyant les lignes de `curation_patrimoine_log` de **toutes** les
entités.

**HJ-4** — QUAND la route globale reçoit un paramètre d'ordre `ordre=asc` ou `ordre=desc`, le système
DOIT trier par `id` dans l'ordre demandé.

**HJ-5** — SI aucun paramètre d'ordre n'est fourni à la route globale, ALORS le système DOIT trier par
`id` **décroissant** (défaut récent → ancien).

**HJ-6** — QUAND la route globale reçoit un paramètre `famille` ∈ {`inventaire`, `mh`, `mondial`}, le
système DOIT ne renvoyer que les lignes des entités de cette famille.

**HJ-7** — SI aucun paramètre `famille` n'est fourni (ou `famille=toutes`) à la route globale, ALORS le
système DOIT renvoyer les lignes de **toutes** les familles.

**HJ-8** — Le système DOIT paginer la route globale via `limit`/`offset`, avec un **`limit` par défaut de
50** SI aucun n'est fourni.

**HJ-9** — SI le paramètre `limit` fourni est absent, non entier, ≤ 0 ou > une borne haute
(**valeur retenue : 200**), ALORS le système DOIT appliquer le défaut 50 (ou clamper à 200), jamais
échouer.

**HJ-10** — Le système DOIT joindre chaque ligne à `patrimoine_entite` (clé `log.entite_id =
patrimoine_entite.id`) en **LEFT JOIN**, afin d'exposer `famille`, `ref_code`, `nom` de l'entité
lorsqu'elle existe encore.

**HJ-11** — SI l'entité d'une ligne a été supprimée (LEFT JOIN NULL), ALORS le système DOIT récupérer son
nom via `avant->>'nom'` de la ligne `suppression_entite_manuelle` de cette même `entite_id` (fallback
« supprimée #<entite_id> » si introuvable) et marquer la ligne comme **entité supprimée**.

**HJ-12** — Le système DOIT, pour le filtre `famille` de la route globale, retrouver la famille d'une
entité supprimée via `avant->>'famille'` de sa ligne `suppression_entite_manuelle`, afin qu'une entité
supprimée reste filtrable (SHOULD ; à défaut, une entité supprimée sans ligne de suppression exploitable
est classée « famille inconnue » et n'apparaît que sous « Toutes »).

**HJ-13** — Chaque ligne renvoyée par les deux routes DOIT contenir au minimum : `id`, `ts`, `action`,
`entite_id`, `cleabs`, `avant`, `apres`, `famille` (ou null), `nom` (ou fallback), et un booléen
`supprimee`.

**HJ-14** — Les deux routes DOIVENT être **server-only** (`import 'server-only'`), gardées par
`proxy.ts` (401 sans session), exécutées en runtime Node, et lire `[id]` via `await ctx.params`.

**HJ-15** — SI une route journal échoue (erreur SQL), ALORS le système DOIT renvoyer
`{ erreur: '...' }` avec `status: 503` (jamais de 500 non capturé), à l'image de `entites/route.ts`.

**HJ-16** — Les routes journal DOIVENT être **STRICTEMENT en lecture** : aucune requête `INSERT`,
`UPDATE`, `DELETE`, `ALTER`, ni écriture DB d'aucune sorte.

**HJ-17** — Le paramètre `[id]` (route par entité) et les paramètres de la route globale DOIVENT être
**validés et paramétrés** (requêtes `query<T>(SQL, params)`), jamais concaténés (anti-injection).

**HJ-18** — SI `[id]` de la route par entité est invalide (non entier), ALORS le système DOIT renvoyer
`{ erreurs: [...] }` avec `status: 422`.

## 3. Exigences — Backend : flag « a un historique » sur la liste des entités

**HJ-20** — Le système DOIT ajouter au `SELECT_ENTITES` existant (`entites/route.ts`) un booléen
`a_historique` calculé par **sous-requête `EXISTS` corrélée** sur `curation_patrimoine_log` (`WHERE
l.entite_id = e.id`).

**HJ-21** — Le flag `a_historique` DOIT être vrai **dès qu'il existe au moins UNE ligne** de journal pour
l'entité, **sans filtre d'action** (la création manuelle compte).

**HJ-22** — Le calcul de `a_historique` DOIT se faire dans **une seule requête** (aucun N+1 : pas d'appel
par entité).

**HJ-23** — Le système DOIT propager `a_historique` du DB jusqu'au client : étendre `LigneEntiteDB`,
`versEntite` (`partage.ts`) et l'interface `Entite` (front).

**HJ-24** — L'ajout du flag `a_historique` NE DOIT PAS modifier le calcul de l'`etat`, du `point`, du
`corrige`, ni des `liaisons` d'une entité (aucune régression sur la réponse existante `{ entites,
compteurs }`).

## 4. Exigences — Volet A « historique par fiche »

**HJ-30** — LÀ OÙ une fiche est dépliée (`svv-cur-detail`), SI `entite.a_historique` est vrai, ALORS le
système DOIT afficher un bouton/lien **discret « Historique »** à côté du footer Sortir/Valider/Annuler.

**HJ-31** — SI `entite.a_historique` est faux, ALORS le système DOIT **ne pas afficher** le bouton
« Historique » de la fiche.

**HJ-32** — QUAND l'opérateur clique le bouton « Historique » d'une fiche, le système DOIT ouvrir le
journal **filtré sur cette entité** (route HJ-1).

**HJ-33** — Dans le volet A, le système DOIT trier les lignes **récent → ancien** et **ne pas** proposer
de filtre par famille (une seule entité concernée).

**HJ-34** — QUAND le volet A s'ouvre, le système DOIT garder la carte **centrée sur l'entité
sélectionnée** (la sélection courante), sans re-déclencher de recentrage superflu.

## 5. Exigences — Volet B « historique global »

**HJ-40** — Le système DOIT afficher un bouton **« Historique »** dans le header de la colonne gauche
(`svv-cur-head`).

**HJ-41** — QUAND l'opérateur clique le bouton « Historique » du header, le système DOIT ouvrir le
journal **de toutes les entités** (route HJ-3).

**HJ-42** — Le volet B DOIT afficher un contrôle de **tri asc/desc** (défaut : desc, récent → ancien).

**HJ-43** — Le volet B DOIT afficher un **filtre par famille** (`inventaire` | `mh` | `mondial`) avec
**« Toutes »** sélectionné par défaut.

**HJ-44** — Le volet B DOIT afficher des contrôles de **pagination** (page suivante/précédente ou
« charger plus ») s'appuyant sur `limit`/`offset` (défaut 50).

**HJ-45** — Le volet B DOIT inclure les lignes des **entités supprimées** (le log survit à la
suppression).

**HJ-46** — LÀ OÙ une ligne concerne une entité supprimée, le système DOIT afficher le nom récupéré
(HJ-11) suivi du libellé **« (supprimée) »**.

**HJ-47** — QUAND l'opérateur clique une ligne d'une entité **encore existante**, le système DOIT
**recentrer la carte** sur cette entité (et, SHOULD, la sélectionner en colonne gauche).

**HJ-48** — SI la ligne cliquée concerne une entité **supprimée**, ALORS le système DOIT rendre la ligne
**non cliquable** (neutre, aucun recentrage).

**HJ-49** — QUAND le volet B s'ouvre, le système DOIT laisser la carte sur l'**entité courante** si une
est sélectionnée, sinon sur la **vue par défaut**, sans forcer de recentrage.

## 6. Exigences — Modèle d'affichage (split carte + journal, zone de droite)

**HJ-50** — QUAND le journal s'ouvre (volet A ou B), le système DOIT l'afficher dans la **zone de
droite** (aujourd'hui la carte), en disposition **empilée : carte EN HAUT, journal EN BAS**.

**HJ-51** — TANT QUE le journal est affiché, le système DOIT garder la carte Leaflet **montée et
visible** (jamais démontée).

**HJ-52** — QUAND le split s'ouvre ou se ferme, le système DOIT appeler `map.invalidateSize()` pour que
la carte se redessine à sa nouvelle taille.

**HJ-53** — QUAND la carte rétrécit/s'agrandit pour le split, le système DOIT **préserver son état**
(zoom, centre, point sélectionné, emprises dessinées) — aucun reset de la vue.

**HJ-54** — Le système DOIT permettre le retour à l'affichage **carte pleine** via un bouton **« Retour »**
dans le journal.

**HJ-55** — QUAND l'opérateur **double-clique la fiche associée** en colonne gauche (celle dont le
journal est ouvert en volet A), le système DOIT **refermer le journal** et revenir à la carte pleine.

**HJ-56** — QUAND l'opérateur **clique une AUTRE fiche** en colonne gauche, le système DOIT
**sélectionner cette autre entité** ET **refermer le journal** (retour carte pleine).

**HJ-57** — Le système DOIT respecter `prefers-reduced-motion` sur les **transitions du split** (aucune
animation si l'utilisateur l'a désactivée).

**HJ-58** — QUAND le journal est fermé (par l'un des trois moyens HJ-54/55/56), le système DOIT rendre à
la carte **toute la hauteur** de la zone de droite (état d'affichage normal).

## 7. Exigences — Contenu & rendu des lignes

**HJ-60** — Le système DOIT afficher chaque ligne avec un **libellé humanisé** dérivé de `action` via un
helper de libellés FR, selon la table :
| action | libellé |
|---|---|
| `deplacement` | « Point déplacé » |
| `annulation_deplacement` | « Déplacement annulé » |
| `rattachement` | « Rattachée au bâtiment {cleabs} » |
| `detachement` | « Détachée du bâtiment {cleabs} » |
| `verification` | « Liaison vérifiée {cleabs} » |
| `creation_entite_manuelle` | « Créée » |
| `suppression_entite_manuelle` | « Supprimée » |
| `renommage` | « Renommée "{avant.nom}" → "{apres.nom}" » |
| `annulation_edition` | « Édition annulée ({apres.nb_lignes} actions) » |

**HJ-61** — SI l'action est `renommage` ET `avant.nom` est `null`, ALORS le système DOIT afficher
**« Nommée "{apres.nom}" »** (au lieu de la forme « Renommée … → … »).

**HJ-62** — Le système DOIT afficher, pour chaque ligne, l'**horodatage `ts`** (formaté lisible,
fuseau local du navigateur).

**HJ-63** — Le système DOIT afficher, pour chaque ligne, un **badge famille** (`inventaire`/`mh`/`mondial`)
de l'entité concernée (ou « inconnue » pour une supprimée non résolue).

**HJ-64** — QUAND une valeur numérique du jsonb est sérialisée en **string** (ex. `apres.jusqu_a` =
`"157"`, bigint sérialisé), le système DOIT la **normaliser en nombre** à l'affichage.

**HJ-65** — SI une action présente dans le journal n'a **pas** de libellé défini dans le helper (action
future/inconnue), ALORS le système DOIT afficher un libellé de repli neutre (ex. le nom d'action brut)
sans planter.

**HJ-66** — Le système DOIT afficher les lignes dans l'**ordre renvoyé par la route** (ne pas re-trier
côté client d'une façon qui contredirait `ordre`).

## 8. Rattachement aux invariants SVAV

**HJ-70** — La fonctionnalité DOIT être **golden-safe** : `curation_patrimoine_log` n'étant lu par aucun
chemin de score/verdict, `test:integration` DOIT rester **15/15** et le golden `29.107259068449615`
**bit-identique** après le chantier.

**HJ-71** — La fonctionnalité NE DOIT PAS toucher le moteur (`app/lib/svv/**`, `faisceaux.ts`,
`verdict.ts`, `coucheDegagement.ts`, `scoreDegagement.ts`, `pipeline.ts`, `obstacles.ts`,
`cartesAnnee.ts`), `config_scoring`, `PROFIL_GOLDEN_REF`, `geom_point`, ni les fichiers Gemini.

**HJ-72** — La fonctionnalité NE DOIT introduire **aucune migration** ni **aucune écriture DB**
(strictement lecture seule).

**HJ-73** — L'ajout du flag `a_historique` sur `entites/route.ts` (route de curation, hors chemin de
score) NE DOIT PAS altérer la réponse existante autrement qu'en **ajoutant** le champ (rétro-compatible).

**HJ-74** — La fonctionnalité NE DOIT PAS afficher de « qui » (aucune donnée d'identité par-utilisateur
n'existe : session admin unique) — pas de champ utilisateur inventé.

---

## 9. Critères d'acceptation (vérifiables)

- **CA-1** : `GET /entites/[id]/journal` renvoie les lignes de l'entité, tri `id DESC`, chaque ligne avec
  `famille`/`nom`/`supprimee` ; `[id]` invalide → 422 ; erreur SQL → 503.
- **CA-2** : `GET /journal?ordre=asc&famille=mh&limit=50&offset=50` renvoie 50 lignes max d'entités `mh`
  triées `id ASC` ; `limit` aberrant → défaut/clamp ; défaut sans params = desc, toutes familles, 50.
- **CA-3** : une entité supprimée apparaît dans le global avec son nom (via `avant->>'nom'`) + « (supprimée) »,
  ligne **non cliquable**.
- **CA-4** : `GET /entites` renvoie désormais `a_historique` par entité (true dès 1 ligne de journal),
  en une seule requête ; `etat`/`point`/`liaisons` inchangés.
- **CA-5** : le bouton « Historique » de fiche n'apparaît que si `a_historique` ; le bouton global est dans
  le header.
- **CA-6** : à l'ouverture du journal, la carte reste montée, `invalidateSize` est appelé, l'état (zoom/
  point/emprises) est préservé ; disposition carte-haut / journal-bas.
- **CA-7** : les 3 moyens de fermeture (bouton Retour, double-clic fiche associée, clic autre fiche)
  ramènent à la carte pleine ; clic autre fiche sélectionne l'autre entité.
- **CA-8** : chaque ligne est humanisée selon HJ-60/61, avec `ts` + badge famille ; `jusqu_a` affiché en
  nombre ; action inconnue → libellé de repli.
- **CA-9** : clic sur une ligne d'entité existante recentre la carte sur elle.
- **CA-10** : `test:integration` 15/15, golden `29.107259068449615` inchangé ; `git grep` confirme aucune
  écriture DB dans les routes journal ; aucune migration ajoutée.

---

## 10. Questions ouvertes (à trancher avant `/svav-build`)

- **OQ-1 (borne haute `limit`)** : proposé **200**. À confirmer.
- **OQ-2 (recentrage volet B)** : au clic d'une ligne d'entité existante, HJ-47 recentre la carte —
  faut-il AUSSI **sélectionner** l'entité en colonne gauche (ouvrir sa fiche), ou seulement recentrer la
  carte sans ouvrir la fiche ? (proposé : recentrer + surbrillance, **sans** ouvrir la fiche, pour ne pas
  fermer le journal global).
- **OQ-3 (proportion du split)** : hauteur relative carte/journal dans la zone de droite (ex. 55/45 ?),
  et si redimensionnable. (proposé : ratio fixe, non redimensionnable v1.)
- **OQ-4 (famille d'une entité supprimée sans ligne de suppression exploitable)** : classée « inconnue »
  et visible seulement sous « Toutes » (HJ-12) — OK ?
- **OQ-5 (rendu `cleabs`)** : afficher le `cleabs` brut (long) ou tronqué/raccourci dans les libellés
  rattachement/détachement/vérification ? (proposé : tronqué avec tooltip complet.)
- **OQ-6 (volet A vs B simultanés)** : ouvrir le volet B alors qu'un volet A est ouvert (ou l'inverse) —
  le second remplace-t-il le premier ? (proposé : un seul journal à la fois ; toute nouvelle ouverture
  remplace.)
- **OQ-7 (mobile / responsive)** : sur smartphone, le split carte-haut/journal-bas reste-t-il empilé
  (déjà l'orientation naturelle) ou le journal passe-t-il en plein écran ? (exigence transverse mobile
  du projet à respecter — à préciser.)

> **Aucune de ces questions ne bloque le cadrage** : les valeurs « proposé » servent de défaut si Arno ne
> tranche pas. La spec est complète et implémentable en l'état.
