# RAPPORT DE BUILD — Module Internaute, LOT B3 : refonte FicheDetail (en-tête + contacts) + lignes d'analyses compactes + Test nouvel onglet

> Run `/svav-build` autonome. **Aucun commit** (livraison à Arno). Golden `29.107259068449615` **NON concerné** (aucun
> fichier moteur/score/pipeline/migration/ingestion touché ; seuls des imports LECTURE de `config.ts`/`libelles.ts`).
> Un seul composant `FicheDetail` (défini dans `InternautesVue.tsx`) → la refonte se répercute sur les DEUX fiches (moteur
> de recherche commercial + panneau « Vérification — 10 derniers »).

## Fichiers touchés (5)
- **`app/lib/internaute/formatTelephone.ts`** (NOUVEAU, pur & client-safe) — `formaterTelephone(e164)` → format NATIONAL
  via `libphonenumber-js` (`06 12 34 56 78` FR, `0476 12 34 56` BE, `(415) 555-2671` US) ; repli FR par groupes de 2, sinon
  chaîne brute ; `null`/`""` → `""`. **AFFICHAGE seul — la donnée stockée reste E.164.**
- **`app/lib/internaute/formatTelephone.test.ts`** (NOUVEAU, +8 tests) — voir Preuves.
- **`app/lib/internaute/pontProjetBanc.ts`** — les 3 helpers (`ecrire`/`lire`/`vider`) `sessionStorage` → **`localStorage`**
  (clé jetable), commentaires mis à jour. Mapping/coercition/garde azimut NULL **inchangés**.
- **`app/(admin)/admin/(protected)/internautes/InternautesVue.tsx`** — en-tête (respiration + « Téléphone : »/« Email : »
  reformatés, police < nom), resserrage du haut (fiche commerciale), boucle d'analyses → **lignes compactes scrollables**
  (verdict · note/100+libellé · date à heure · [Test à droite]), `BoutonTestProjet` → `window.open('_blank')`, retrait de
  `useRouter`/`router` morts et des helpers devenus morts (`Champ`, `labelPayload`, `LABEL_PAYLOAD`).
- **`app/(admin)/admin/(protected)/banc-test/BancSaisie.tsx`** — commentaire de l'effet de handoff (sessionStorage → localStorage) ;
  la mécanique de purge (lire → appliquer → purger dans le callback différé, StrictMode-safe) est **conservée**.

## A. DÉCISIONS HORS-SPECS (à contrôler par Arno)

**A1 — Détail verbeux par analyse (« Le bien », adresse, lat/lon/azimut/hauteurs) RETIRÉ de l'affichage.** La spec dit la
verbosité « MASQUÉE/condensée dans la ligne compacte … seulement de l'affichage ». Choix : la ligne compacte ne montre que
`verdict · note · date · [Test]` ; **tout le reste disparaît de l'affichage** (les valeurs restent dans `p` pour le bouton
Test). Conséquence : les helpers `Champ`/`labelPayload`/`LABEL_PAYLOAD` deviennent morts → **supprimés** (eslint propre).
Alternative écartée : un `<details>` déroulant par ligne qui aurait CONSERVÉ le détail (bien/adresse) accessible sous la
ligne compacte — écartée car (a) la spec dit explicitement « disparaissent de l'affichage », (b) non demandé, (c) scope. ⚠️
**Impact réel** : l'adresse du bien et les caractéristiques ne sont plus visibles nulle part dans la fiche → voir doute **B1**.

**A2 — Affichage de la note = entier `Math.round(note)/100` + libellé produit.** La spec laisse la précision (`toFixed(...)`).
Choix : entier (`56/100`) pour la compacité, cohérent avec l'affichage du banc (`Math.round(run.score.total)`) ; arrondi
d'AFFICHAGE seulement (aucun recalcul, la valeur stockée reste brute). Libellé dérivé du /100 via les **seuils canoniques**
`SCORE_LABEL_EXCEPTIONNELLE_MIN`/`SCORE_LABEL_EXCELLENTE_MIN` (`config.ts:316-317`) + le mapper partagé `libelleScore`
(`libelles.ts:10`) — **jamais re-codés** (cohérence stricte avec l'enum du moteur). `< 60` → note nue, pas de libellé.
Alternative écartée : `toFixed(1)` (comme la liste). Impact : cosmétique.

**A3 — Libellé du bouton raccourci « Tester dans le banc » → « Tester ».** Pour tenir sur une ligne compacte (verdict + note
+ date + bouton). Le `title` conserve le sens complet (« Rejouer cette analyse dans le banc de test (nouvel onglet) »).
Alternative écartée : libellé long (repli sur 2 lignes en mobile). Impact : cosmétique.

**A4 — Resserrage du haut (fiche commerciale) = `paddingTop` 14→8 + marge basse de la rangée « Fermer » 8→2.** La spec
demande de réduire le vide « SANS supprimer Fermer ». Choix : réduction des marges/padding (bouton Fermer 44px conservé).
Alternative écartée : positionner « Fermer » en absolu haut-droite pour supprimer la rangée (risque de chevauchement avec
un nom long en mobile 375px). Impact : ~15px gagnés ; pas pixel-identique au panneau Vérification (qui n'a pas de Fermer) —
la spec l'autorise (« sans exiger un pixel identique »).

**A5 — En-tête : respiration = `<div height:10>` vide ; contacts en `.95rem`, labels « Téléphone : »/« Email : » gris 600.**
Hiérarchie de police respectée : nom `1.25rem` > contacts `.95rem` > méta `.8rem`. Le JSX du nom (prénom 400 + NOM 800)
n'a PAS été touché. Impact : lisibilité accrue, hiérarchie stricte tenue.

**A6 — Purge banc : conservation du schéma « purge dans le callback différé + `clearTimeout` au cleanup ».** La spec suggère
« sans annuler la purge au cleanup ». Choix : garder le schéma existant, qui est StrictMode-safe ET honore l'esprit de la
consigne : le `clearTimeout` annule le timer d'une passe StrictMode AVORTÉE (la clé n'ayant pas encore été purgée puisque la
purge est DANS le timer), et la re-passe re-lit la clé encore présente puis applique+purge UNE fois. La purge n'est donc
jamais perdue. Alternative écartée : supprimer le cleanup (→ double application en dev + timer fantôme). Impact : aucun
fonctionnellement ; application unique, purge unique, pas de timer résiduel.

## B. DOUTES

**B1 — Perte d'affichage du bien/adresse dans la fiche (conséquence de A1).** Suite au passage en lignes compactes, l'adresse
du bien, le type, la surface, les grandeurs de visée, etc. **ne sont plus affichés** dans la fiche internaute (ils restent en
base et alimentent le bouton Test). Décision conforme à la lettre de la spec, mais c'est un changement d'UX notable pour un
outil commercial (l'admin ne voit plus OÙ est le bien). Option de régularisation si Arno le souhaite : un `<details>`
déroulant par ligne qui ré-expose le détail sous la ligne compacte (défaut replié) — sans perdre la compacité. Retenu tel
quel (compact only) faute de demande explicite d'un déroulé ; à confirmer par Arno.

**B2 (report du LOT B, non ré-ouvert) — Fidélité du rejeu si l'analyse d'origine fut en `manuel`.** Le rejeu force `semi_auto`
(point brut pré-snap). Inchangé par ce lot ; toujours ouvert (cf. `RAPPORT_BUILD_M3_lotB_bouton_test.md` §B1).

## C. ÉCARTS DE CONFORMITÉ
**Aucun.** Batterie de conformité (Phase 6) :
- **GOLDEN** : `test:integration` **8 fichiers / 54 tests PASS**, golden `29.107259068449615` **bit-identique** (aucun fichier
  du chemin de calcul modifié ; `config.ts`/`libelles.ts` seulement IMPORTÉS en lecture).
- **VERDICT DÉCOUPLÉ** : lot 100 % affichage admin + handoff. La ligne compacte LIT `verdict`/`score` déjà persistés ; aucun
  couplage introduit. La photo n'entre jamais dans le verdict (handoff géométrique inchangé).
- **CONFIG EXTERNALISÉE / PAS DE CONSTANTE DISPERSÉE** : les seuils de libellé (75/60) sont RÉUTILISÉS depuis `config.ts`
  (exception d'affichage déjà actée) via `libelleScore` — aucune constante de score re-codée dans l'UI.
- **RGPD** : le panneau « Vérification » reçoit `actionsProjet` (bouton Test par ligne) mais **JAMAIS `actions`** (Rectifier/
  Effacer) — lecture seule préservée (`InternautesVue.tsx:1123` vs commercial `:508-511`). Handoff par **localStorage jetable**,
  purgé à la lecture, **aucune position en URL** (`window.open('/admin/banc-test','_blank','noopener')`). Reformatage tél =
  affichage seul (donnée stockée E.164 inchangée). Aucune persistance nouvelle, aucune suppression de données.
- **ST_Force2D / HAUTEUR DE VISION** : non concernés.
- **GEMINI** : `adaptateurIaPhoto.ts` / `analyse-photo/route.ts` non touchés.

## Preuves
- **Reformatage tél (8 tests)** : FR mobile `+33612345678` → `06 12 34 56 78` ; FR fixe → `01 12 34 56 78` ; **BE** `+32476123456`
  → `0476 12 34 56` (format LOCAL, pas FR) ; US → `(415) 555-2671` ; `null`/`""` → `""` ; repli FR sans indicatif → groupes
  de 2 ; chaîne non téléphonique → inchangée ; entrée non mutée.
- **« Téléphone : »/« Email : » présents** : en-tête `InternautesVue.tsx` (spans label gris 600 + valeur).
- **Police tél/email < nom** : `.95rem` < `1.25rem` (nom) ; méta `.8rem`.
- **Liste plafonnée à 5 + scroll** : conteneur `maxHeight: 5*60, overflowY:'auto'` (approximation calée bouton 44px + marges).
- **Test par ligne, bon `p`, nouvel onglet** : `actionsProjet={(p) => <BoutonTestProjet projet={p} />}` rendu DANS
  `detail.projets.map` → chaque bouton porte SON analyse ; `BoutonTestProjet` = `ecrireHandoffBanc(saisie)` (localStorage) +
  `window.open('/admin/banc-test','_blank','noopener')`.
- **Aucune position en URL** : unique navigation = `window.open` vers un chemin statique ; aucun `router.push`, aucun
  searchParams ; `useRouter`/`router` retirés.
- **Vérification = Test SANS Rectifier/Effacer** : `:1123` passe `actionsProjet` seul (pas `actions`).
- **Tri intact** : aucune logique de tri front ajoutée (l'ordre vient de `ORDER BY cree_a DESC`).

## Vérifications de sortie (les 4)
- `npx tsc --noEmit` : **PASS** (exit 0).
- `npx eslint` (5 fichiers) : **PASS** (0 problème ; `useRouter`/`router` morts retirés ; **aucun** `eslint-disable`).
- `npm test` : **PASS** — 84 fichiers, **1013 tests** (+8 `formatTelephone`), 21 skipped.
- `npm run test:integration` : **PASS** — 8 fichiers, 54 tests, **golden `29.107259068449615` bit-identique**.

## Recon de validation (Phase 8) — VERDICT : **VALIDER**
Aucun écart de conformité ; golden prouvé inchangé ; étanchéité RGPD du panneau de contrôle préservée (Test oui, Rectifier/
Effacer non) ; aucune position en URL ; nouvel onglet via localStorage jetable purgé à la lecture. Un seul doute non-bloquant
(**B1** : disparition du bien/adresse de l'affichage, conforme à la spec — option `<details>` proposée si Arno veut les ré-exposer).
