# RAPPORT — build « Chantier A · seam de ventilation ENRICHI (descriptif) »

> Enrichissement ADDITIF & OPT-IN de la ventilation par faisceau (carte d'année, libellé famille, appartenance
> couloir). Rien recalculé, agrégat intact. **GOLDEN-SAFE prouvé bit-identique.** **Non committé.** Commit SÉPARÉ.

## Décisions Arno appliquées (rappel)
- **1. Carte d'année → B'** : `familleCoeff` renvoie AUSSI la `CarteAnnee` matchée (retour additif, capture « au passage »,
  une seule sélection). PAS de re-find `carteMatche` (interdit).
- **2. Couloir membership** : booléen par faisceau dérivé des indices agrégés (aucun recalcul ; malus reste agrégé).
- **3. Identité patrimoniale → B (repli famille)** : libellé de FAMILLE pour mh/inventaire/mondial (« légende sinon
  famille » : légende indisponible côté moteur → famille). PAS d'élargissement SQL (option A reportée, non arbitrée).

## Implémentation (2 fichiers : `coucheDegagement.ts` + test)
- **`familleCoeff`** (`coucheDegagement.ts:49`) : type de retour élargi `(FamilleCoeff & { carte?: CarteAnnee }) | null` ;
  pour l'année renvoie `{ cone, flanc, distMaxM, carte: c }` — les coeffs consommés par le score sont **INCHANGÉS**,
  `carte` référence la carte DÉJÀ trouvée par le `find(carteMatche)` (aucune sélection supplémentaire).
- **`VentilationFaisceau`** : 3 champs additifs — `carteAnnee: CarteAnnee | null` (bornes+coeffs+cap de la carte
  appliquée, `null` sauf `famille==='annee'`), `familleLibelle: string | null` (« Monument Historique »/« Inventaire »/
  « Patrimoine mondial » pour mh/inventaire/mondial, `null` sinon), `dansChaineCouloir: boolean`.
- **`ventilerFaisceau`** : capture `carteAnnee = fam.carte ?? null` au passage ; calcule `familleLibelle` depuis la
  famille RÉELLEMENT appliquée (après précédence mondial>MH>Inventaire>année) ; retourne `dansChaineCouloir: false`
  (contexte agrégé inconnu du faisceau seul).
- **`ventilerAnalyse`** : après `ventilerNote` (agrégat inchangé), construit l'ensemble des indices des chaînes
  couloir **VALIDÉES** (`note.malusCouloir`) et pose `dansChaineCouloir = indices.has(i)` sur chaque ligne. Dérivation
  pure, aucun recalcul, aucune détection refaite.
- **Test** (`pipeline.itest.ts`) : rejoue Asnières via le seam enrichi → `score.total` inchangé, `ventilation.note.total
  === score.total` (**toBe strict**), champs descriptifs cohérents (carteAnnee ⇔ année ; familleLibelle ⇔ patrimoine ;
  `dansChaineCouloir` == appartenance aux indices agrégés).

## A. DÉCISIONS HORS-SPECS
- **A1 — `familleLibelle = null` pour la famille 'annee'** (et ordinaire). L'identité d'un faisceau « année » EST la
  carte (`carteAnnee`), pas une entité patrimoniale ; le libellé de famille est réservé à mh/inventaire/mondial. Évite
  de dupliquer l'information (règle « jamais les deux »).
- **A2 — `dansChaineCouloir` posé dans `ventilerAnalyse`, `false` par défaut dans `ventilerFaisceau`.** L'appartenance
  est une propriété de l'ANALYSE (nécessite les chaînes agrégées + l'index du faisceau), pas du faisceau isolé.
  `ventilerFaisceau` seul (hors analyse) renvoie donc `false` — documenté.

## B. DOUTES
- **B1 (mineur, perf prod)** — `familleCoeff` renvoie désormais un objet à 4 propriétés (au lieu de 3) pour les
  faisceaux « année », y compris sur le chemin de prod (via `distancePercueFaisceau`). La `carte` est une RÉFÉRENCE à
  l'objet déjà obtenu par `find` (aucune allocation/clone supplémentaire) → surcoût imperceptible, VALEUR bit-identique.
  Le corps de `distancePercueFaisceau` est INCHANGÉ (il lit `.cone/.flanc/.distMaxM`, ignore `.carte`).
- **B2 (mineur)** — le test n'affirme pas qu'Asnières CONTIENT un faisceau « année » ou couloir (dépend des données) ;
  il vérifie l'INVARIANT (cohérence carte⇔année, libellé⇔patrimoine, couloir⇔indices) quel que soit le cas rencontré.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **GOLDEN** : `test:integration` **23/23** (22 + 1), `29.107259068449615` inchangé. **`ventilation.note.total ===
    score.total` (toBe strict)** vérifié via le seam enrichi → l'enrichissement descriptif n'altère NI la note NI le score.
  - **AGRÉGAT INTACT / SOURCE UNIQUE** : `ventilerNote` non modifié ; `noteDegagement` délègue toujours à lui ;
    `distancePercueFaisceau` **corps inchangé** (diff : aucune ligne supprimée dans son corps). Aucun réordonnancement,
    aucun arrondi nouveau.
  - **PAS DE RE-SÉLECTION** : la carte d'année vient de l'UNIQUE `find(carteMatche)` de `familleCoeff` (retour additif),
    pas d'un second find. Le couloir vient des indices DÉJÀ calculés (aucune détection refaite).
  - **MALUS RESTE AGRÉGÉ** : `note.malusCouloir` (valeur + indices) inchangé ; `dansChaineCouloir` n'est qu'un booléen
    dérivé, le malus n'est pas transformé en ajustement par faisceau.
  - **OPT-IN / PROD INALTÉRÉ** : la ventilation n'est bâtie que sous `options.ventilation` (analyser). Sans elle,
    `ventilerFaisceau`/`ventilerAnalyse` ne sont pas appelés → valeur ET perf de prod inchangées (BE-19bis vert).
  - **VESTIGIAUX non exposés** (boostF2, forfait F3) ; **aucun littéral** : bornes/seuils viennent du profil / de la carte.
  - **faisceaux.ts NON touché** (pas d'élargissement SQL) ; `config_scoring`, `PROFIL_GOLDEN_REF`, `geom_point`, Gemini,
    `verdict`, `origine.ts`, `profilTest.ts`, `pontProfil.ts`, `bancEssai.ts`, `pipeline.ts` (signature) — **intouchés**.
    `git status` = `coucheDegagement.ts` + `pipeline.itest.ts`.
  - Non-régression : `tsc` 0 · `eslint` 0 · `npm test` **439** (`distancePercueFaisceau`/combinaison verts) · `next build` ✓.

## Ce que le seam enrichi expose désormais (pour le Chantier B — rendu)
Par faisceau, EN PLUS de l'existant : `carteAnnee` (borneMin/opMin/borneMax/opMax + cone/flanc/distMaxM) quand
`famille==='annee'` ; `familleLibelle` (« Monument Historique »/« Inventaire »/« Patrimoine mondial ») quand patrimoine ;
`dansChaineCouloir` (booléen). Aucune identité d'entité (légende/nom) — repli famille, option A (SQL) reportée.

## Verdict de conformité : livraison prête. Enrichissement descriptif additif & opt-in ; carte d'année capturée au
## passage (familleCoeff, une source), couloir dérivé des indices agrégés, repli famille sans SQL ; golden BIT-IDENTIQUE
## (note.total === score.total strict) ; distancePercueFaisceau/ventilerNote intacts ; faisceaux.ts non touché.
