# SPEC — Refonte du flux de création d'un tag manuel (carte de curation)

> **Statut : FIGÉE.** Décisions arbitrées par Arno. **CHANTIER UI PUR, GOLDEN-SAFE** : le moteur ne lit
> jamais `curation_patrimoine_log`/les liaisons pour le score → aucun impact sur `29.107259068449615`,
> `test:integration` reste 15/15. **Aucune migration, aucun changement backend** : le `POST /entites`
> (création) et le `POST/DELETE /entites/[id]/liaisons` (rattachement) existants sont réutilisés **tels
> quels**. Un seul fichier front impacté : `app/(admin)/admin/(protected)/curation/CurationCarte.tsx`.
>
> Ce document est une SPEC (exigences EARS testables), **PAS** du code. L'implémentation viendra dans un
> chantier séparé (`/svav-build`) après validation.

---

## 0. Contexte technique vérifié (recon)

- `creerEntite` (`:242`) = **`POST /api/admin/curation/entites`** → INSERT `patrimoine_entite` + ligne
  journal `creation_entite_manuelle` (CTE atomique). **SEULE écriture de création** ; l'entité existe **dès
  « Créer »**.
- Le footer « Valider » (Lot 2) est **cosmétique** (`refermerCarte` : `setSelectionId(null)` +
  `setJournal(null)` + `clearLayers`) — **aucune écriture**.
- `rattacher` (`:663-666`) = **`POST /entites/{id}/liaisons {cleabs}`**, déclenché par **clic sur une
  emprise BLEUE** quand `entiteSelectionnee` est posée (`:985`).
- Puce (`:1223-1227`) : `e.etat === 'rouge' && !e.point ? cerclé rouge : plein COULEUR_ETAT[e.etat]`.
  `etatEntite` (`partage.ts:66-71`) : **rouge** = 0 liaison active · **vert** = ≥1 liaison manuelle/vérifiée
  · **orange** = auto non vérifié. **Il n'existe qu'UNE variante cerclée (`.svv-cur-dot--rouge`).**
- **Deux `scrollIntoView` désorientants** dans le parcours de création : effet `[creationOuverte]`
  (`:947-954`, remonte au formulaire) et effet `[flashId]` via `selectionner` (`:936-945`, descend vers la
  fiche car `SELECT_ENTITES … ORDER BY e.id` → nouvelle entité **en bas**).
- States : `creationOuverte` (`:288`), `formFamille` (`:289`), `formNom` (`:290`), `cleabsCible` (`:291`),
  `formulaireRef` (`:324`), `selectionId` (`:283`), `flashId` (`:286`), `itemActifRef` (`:330`),
  `creationBorneRef` (`:298`).

---

## 1. User story

- **US-FC** — En tant qu'**opérateur** (Arno), je veux créer un tag manuel et lui rattacher des polygones
  **sans être désorienté** (la fiche reste sous les yeux en haut, aucun saut de défilement), afin de
  composer le tag posément puis le « terminer » quand il est prêt.

Problème résolu : (a) l'**illusion de double validation** (il n'y a qu'une écriture, le POST — « Terminer »
ne fait que fermer) ; (b) les **deux scrolls** (remontée au formulaire + descente vers la nouvelle fiche en
bas de liste).

---

## 2. Exigences — Ouverture du formulaire (FC-1..FC-9)

**FC-1** — QUAND l'opérateur clique « + Nouveau tag », le système DOIT afficher le formulaire de création
en tête de colonne (emplacement actuel), sans le supprimer.

**FC-2** — QUAND le formulaire de création s'ouvre, le système DOIT **ne déclencher AUCUN `scrollIntoView`**
(suppression de l'effet `[creationOuverte]` `:947-954` pour le parcours de création).

**FC-3** — Le formulaire de création DOIT conserver ses champs actuels : **famille** (`formFamille`), **nom
optionnel** (`formNom`), et l'indication du **bâtiment ciblé** (`cleabsCible`) lorsqu'il est présent.

**FC-4** — QUAND l'opérateur double-clique un bâtiment neutre sur la carte (`ouvrirCreationCiblee`), le
système DOIT ouvrir le formulaire avec `cleabsCible` renseigné, sans `scrollIntoView`.

## 3. Exigences — Création (POST unique) (FC-10..FC-19)

**FC-10** — QUAND l'opérateur soumet le formulaire (« Créer »), le système DOIT appeler le **`POST
/entites` existant, INCHANGÉ** (une seule écriture ; l'entité est créée en base).

**FC-11** — SI le `POST /entites` échoue (`id` null), ALORS le système DOIT afficher un message d'erreur et
**ne pas** ouvrir la zone de composition (comportement actuel préservé).

**FC-12** — QUAND le `POST /entites` réussit, le système DOIT recharger la liste des entités
(`recharger()`) afin que la nouvelle entité entre dans `entites`.

**FC-13** — QUAND le `POST /entites` réussit, le système DOIT **sélectionner** la nouvelle entité
(`selectionId`/`entiteSelectionnee` posé sur son `id`) afin que le rattachement par clic-emprise soit
possible immédiatement.

**FC-14** — QUAND le `POST /entites` réussit, le système DOIT **NE PAS déclencher le scroll `[flashId]`**
vers la nouvelle fiche (dissociation « sélection » ↔ « scroll vers la position en liste »).

**FC-15** — Le système DOIT dissocier la sélection de la nouvelle entité du défilement : sélectionner la
nouvelle entité pour la carte/le rattachement NE DOIT PAS entraîner de `scrollIntoView` vers son `<li>` en
liste.

## 4. Exigences — Zone de composition en haut (FC-20..FC-34)

**FC-20** — QUAND le `POST /entites` réussit, le système DOIT afficher une **zone de composition dédiée EN
HAUT de la colonne** (au même emplacement que le formulaire), **hors de la liste triée**.

**FC-21** — La zone de composition DOIT afficher le **nom** de l'entité créée (ou un générique si nom vide),
son **badge famille**, et sa **puce d'état** (règle de puce inchangée, cf. §6).

**FC-22** — La zone de composition DOIT afficher un **message d'invitation** : « Tag créé — clique un ou
plusieurs polygones sur la carte pour les rattacher ».

**FC-23** — La zone de composition DOIT afficher un bouton **« Terminer »** (primaire) et un bouton
**« Annuler »**.

**FC-24** — TANT QUE la zone de composition est ouverte, le système DOIT garder la nouvelle entité
**sélectionnée** (`entiteSelectionnee` posé) afin que les emprises bleues candidates soient cliquables.

**FC-25** — QUAND l'opérateur clique une emprise BLEUE candidate sur la carte pendant la composition, le
système DOIT appeler le **`POST /liaisons` existant, INCHANGÉ** (rattachement).

**FC-26** — QUAND un rattachement réussit pendant la composition, le système DOIT rafraîchir l'état affiché
de l'entité (puce + éventuel compteur) **sans** `scrollIntoView`.

**FC-27** — Le système DOIT permettre **plusieurs rattachements successifs** dans la même session de
composition (composer N polygones), chacun via un clic-emprise.

**FC-28** — Le système NE DOIT PAS présenter de dialogue modal « oui/non » pour proposer le rattachement :
l'invitation est directe (message + clics-emprises), et « ne rien rattacher » se fait en cliquant
directement « Terminer ».

**FC-29** — TANT QUE la zone de composition est ouverte, le système DOIT permettre le **détachement** d'une
emprise déjà rattachée (clic emprise verte), réutilisant le `DELETE /liaisons` existant, sans scroll.

## 5. Exigences — Terminer / Annuler (FC-40..FC-49)

**FC-40** — QUAND l'opérateur clique « Terminer », le système DOIT **fermer la zone de composition** (action
cosmétique, **AUCUNE écriture**).

**FC-41** — QUAND l'opérateur clique « Terminer », le système DOIT remettre `selectionId = null` (fiche
désélectionnée) et laisser la nouvelle entité apparaître à sa place dans la liste via le re-render normal.

**FC-42** — QUAND l'opérateur clique « Terminer », le système DOIT **NE déclencher AUCUN `scrollIntoView`**.

**FC-43** — QUAND l'opérateur clique « Annuler » pendant la composition, le système DOIT fermer la zone de
composition **sans supprimer** l'entité déjà créée (défaut, cf. OQ-1) et remettre `selectionId = null`.

**FC-44** — QUAND l'opérateur clique « Annuler », le système DOIT **NE déclencher AUCUN `scrollIntoView`**.

**FC-45** — SI l'opérateur ferme la zone de composition (Terminer ou Annuler) alors que l'entité créée n'a
**aucune liaison**, ALORS l'entité DOIT rester listée avec sa puce « à placer » (rouge, cf. §6) — elle n'est
pas supprimée.

## 6. Exigences — Puce d'état (sémantique CONSERVÉE) (FC-50..FC-54)

**FC-50** — Le système DOIT **conserver à l'identique** la règle de puce actuelle : `e.etat === 'rouge' &&
!e.point` → cerclé rouge ; sinon plein `COULEUR_ETAT[e.etat]`.

**FC-51** — Le système NE DOIT PAS introduire de nouvelle variante de puce (pas de « vert cerclé ») dans ce
chantier.

**FC-52** — TANT QU'un tag manuel n'a aucune liaison active, sa puce DOIT rester **rouge « à placer »**
(repérage des tags à finir), y compris dans la zone de composition.

**FC-53** — QUAND un premier rattachement manuel réussit, la puce de l'entité DOIT passer **verte pleine**
(conséquence naturelle de `etatEntite`, sans code de puce spécifique).

**FC-54** — La zone de composition DOIT refléter l'état de la puce **en direct** (rouge → vert au 1er
rattachement) via le rafraîchissement de l'entité (FC-26).

## 7. Exigences — Suppression des scrolls (FC-60..FC-64)

**FC-60** — Le système DOIT **supprimer** le `scrollIntoView` de l'effet `[creationOuverte]` (`:947-954`)
du parcours de création.

**FC-61** — Le système DOIT **empêcher** le `scrollIntoView` de l'effet `[flashId]` (`:936-945`) de se
déclencher pour l'entité **juste créée** (le parcours de création ne provoque aucune descente vers le bas).

**FC-62** — Le système NE DOIT PAS casser le scroll `[flashId]` pour la **sélection normale d'une entité
existante** (clic liste / marqueur / étoile) : ce scroll DOIT continuer de fonctionner hors création.

**FC-63** — Le système PEUT conserver le rôle de **surbrillance** de `flashId` (`svv-cur-item--flash`) hors
création, mais DOIT le **dissocier** du scroll pour l'entité juste créée.

**FC-64** — Le parcours complet de création (ouverture formulaire → Créer → composition → Terminer) NE DOIT
produire **aucun `scrollIntoView`**.

## 8. Exigences — Non-régression des features livrées (FC-70..FC-74)

**FC-70** — La refonte NE DOIT PAS casser l'**historique volet A/B** (split carte/journal) : ouverture,
fermeture, filtres, pagination, recentrage restent fonctionnels.

**FC-71** — La refonte NE DOIT PAS casser le **footer Valider/Annuler/Sortir** des fiches existantes
(entités non en cours de création).

**FC-72** — La refonte NE DOIT PAS casser le **rattachement/détachement/vérification classique** d'une
entité existante sélectionnée depuis la liste.

**FC-73** — La refonte NE DOIT PAS modifier le **`SELECT_ENTITES`** ni l'ordre de liste backend
(`ORDER BY e.id`) : le reclassement de la nouvelle entité se fait par le re-render client normal.

**FC-74** — La zone de composition et le footer Valider/Annuler des fiches existantes NE DOIVENT PAS
coexister sur la même entité de façon contradictoire (la zone de composition est l'unique UI de l'entité
tant qu'elle est « en création »).

## 9. Rattachement aux invariants SVAV (FC-80..FC-84)

**FC-80** — La refonte DOIT être **golden-safe** : aucune écriture DB nouvelle, aucun endpoint modifié →
`test:integration` **15/15**, golden `29.107259068449615` **bit-identique**.

**FC-81** — La refonte NE DOIT introduire **aucune migration**.

**FC-82** — La refonte NE DOIT PAS toucher le moteur (`app/lib/svv/**`, `faisceaux.ts`, `verdict.ts`,
`coucheDegagement.ts`, `scoreDegagement.ts`, `scoreTotal.ts`, `analyse.ts`, `pipeline.ts`, `obstacles.ts`,
`cartesAnnee.ts`), `config_scoring`, `PROFIL_GOLDEN_REF`, `geom_point`, ni les fichiers Gemini.

**FC-83** — La refonte DOIT respecter `prefers-reduced-motion` pour toute transition ajoutée à la zone de
composition.

**FC-84** — La refonte NE DOIT modifier **qu'un seul fichier front**
(`app/(admin)/admin/(protected)/curation/CurationCarte.tsx`) — aucun autre fichier (hors tests/docs).

---

## 10. Critères d'acceptation (vérifiables)

- **CA-1** : à l'ouverture du formulaire « Nouveau tag », la colonne ne défile pas (aucun `scrollIntoView`).
- **CA-2** : après « Créer », le POST `/entites` est appelé **une seule fois** ; l'entité existe en base
  (ligne `creation_entite_manuelle`).
- **CA-3** : après « Créer », une **zone de composition** s'affiche en haut avec nom + badge famille + puce
  + message d'invitation + boutons « Terminer » / « Annuler » ; la colonne **ne défile pas**.
- **CA-4** : pendant la composition, un clic sur une emprise bleue appelle `POST /liaisons` ; après succès,
  la puce passe rouge→vert (au 1er rattachement) sans défilement.
- **CA-5** : plusieurs emprises peuvent être rattachées successivement dans la même session.
- **CA-6** : « Terminer » ferme la zone, remet `selectionId=null`, **n'écrit rien**, ne défile pas ;
  l'entité apparaît dans la liste à sa place (ordre `id`).
- **CA-7** : « Annuler » ferme la zone **sans supprimer** l'entité créée (défaut), ne défile pas.
- **CA-8** : un tag terminé sans aucune liaison reste listé avec la puce **rouge « à placer »**.
- **CA-9** : la sélection normale d'une entité existante (clic liste/marqueur/étoile) **défile toujours**
  vers sa fiche (scroll `[flashId]` non cassé hors création).
- **CA-10** : historique volet A/B, footer Valider/Annuler/Sortir des fiches existantes, et
  rattachement/détachement classique restent fonctionnels.
- **CA-11** : `test:integration` 15/15, golden `29.107259068449615` inchangé ; `git diff` = un seul fichier
  front modifié ; aucune migration, aucun endpoint touché.

---

## 11. Questions ouvertes (à trancher avant `/svav-build`)

- **OQ-1 (« Annuler » après création)** : défaut proposé = **fermer la zone SANS supprimer** l'entité déjà
  créée (elle reste listée, rouge « à placer »). Alternative : proposer une **suppression** (réutiliserait
  le `DELETE /entites/[id]` existant, gardé `origine='manuel'`) via une confirmation. → **À trancher.**
  *(Note : « Annuler » = mot déjà utilisé par le footer des fiches existantes pour le rollback ; ici il
  s'agit d'une autre action — vérifier qu'il n'y a pas de confusion de libellé, cf. OQ-5.)*
- **OQ-2 (zone haute vs formulaire)** : la zone de composition **remplace-t-elle** le formulaire au même
  emplacement (le formulaire disparaît, la zone apparaît) ou s'affiche-t-elle **en dessous** ? Défaut
  proposé : **remplace** (même emplacement, transition simple).
- **OQ-3 (compteur de rattachements)** : afficher un **compteur « n polygone(s) rattaché(s) »** dans la zone
  de composition ? Défaut proposé : **oui**, discret (aide à savoir où on en est).
- **OQ-4 (surbrillance flashId en création)** : conserver la **surbrillance** (`svv-cur-item--flash`) de la
  nouvelle entité dans la liste (sans scroll) ou la supprimer aussi ? Défaut proposé : **supprimer la
  surbrillance en création** (la fiche est déjà mise en avant dans la zone haute).
- **OQ-5 (libellé « Terminer »)** : confirmer le libellé **« Terminer »** pour le bouton primaire de la zone
  de composition (vs « Fermer » / « OK »), pour le distinguer du « Valider » du footer des fiches existantes.
- **OQ-6 (comportement si l'opérateur clique une AUTRE fiche pendant la composition)** : la sélection d'une
  autre entité doit-elle **fermer** la zone de composition (comme un « Terminer » implicite) ? Défaut
  proposé : **oui**, fermeture implicite (cohérent avec l'exclusivité de sélection existante).

> **Aucune de ces questions ne bloque le cadrage** : les valeurs « défaut proposé » servent de repli si Arno
> ne tranche pas. La spec est complète et implémentable en l'état.
