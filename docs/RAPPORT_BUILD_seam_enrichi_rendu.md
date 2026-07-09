# RAPPORT — build « Chantier B · rendu du détail par faisceau enrichi (éventail) »

> Panneau de détail refondu : bandeau de statut + tableau 3 colonnes Brut|Actif|Test + sections + carte d'année
> lisible + couloir. RENDU PUR (dessine le seam enrichi du Chantier A). Golden bit-identique. **Non committé.**

## Recon (LECTURE SEULE)
- **`LigneVentil`** (front, `EventailFaisceaux.tsx:16`) : miroir de `VentilationFaisceau`. Avant ce chantier, il LUI
  MANQUAIT les 3 champs du Chantier A → ajoutés (`carteAnnee`, `familleLibelle`, `dansChaineCouloir`) + type
  `CarteAnneeLite`. Les données arrivaient déjà dans le JSON (`comparerProfils`→route renvoie la `VentilationFaisceau`
  complète), pour les DEUX runs — seul le TYPE local ne les déclarait pas. **Confirmé** : `comparaison.actif.ventilation
  .lignes` et `.test.ventilation.lignes` portent bien les 3 champs.
- **Détail actuel** : `DetailFaisceau` (2 colonnes actif/test, surlignage des écarts) — refondu.
- **Tokens SVAV** : `--color-svv-green`/`green-soft`/`green-ink`, `--color-svv-red`, `--color-svv-gray`/`muted`,
  `--color-svv-field` (gris clair). Rouge doux dérivé du token via `color-mix` (aucun hex).

## Implémentation (1 fichier : `EventailFaisceaux.tsx`)
1. **`LigneVentil` étendu** : `carteAnnee: CarteAnneeLite | null`, `familleLibelle: string | null`,
   `dansChaineCouloir: boolean`.
2. **Colonne BRUT** : tableau à 3 colonnes **Brut | Actif | Test**. En-têtes : Brut **gris**, Actif **vert**
   (`green-ink`), Test **rouge**. La colonne Brut porte les quantités géométriques invariantes au profil (distance
   brute, nature traversée) ; les lignes sans sens en brut (perçue, coeffs, famille, mode, couloir…) affichent un
   **tiret neutre** « — ».
3. **Bandeau de statut** en tête, TRAMÉ dans la couleur du statut de pondération (sur le profil de TEST) :
   perçue > brute → **hausse/vert** (`green-soft`) ; perçue < brute → **baisse/rouge** (`color-mix` du token) ;
   perçue == brute → **neutre/gris** (`field`) ; brute null → **faisceau dégagé/gris**. Libellé explicite :
   « Faisceau 11 · −60° — pondéré à la hausse (profil de test) ».
4. **Tableau structuré** par sections : *Distances* (brute, perçue, borne) ; *Famille appliquée (après précédence)*
   — `familleLibelle` pour mh/inventaire/mondial, « aucune » pour null, et pour `annee` la **CARTE D'ANNÉE lisible**
   (période « > 1910 et ≤ 1935 » depuis `carteAnnee`, coeffs cône/flanc, cap) ; *Pondérations* (coeff, nature, boost
   F4, diviseur, cap famille) ; *Combinaison* (mode P1+P2) ; *Malus couloir (ajustement AGRÉGÉ, pas par faisceau)*
   (« Dans la chaîne du malus couloir : oui/non » via `dansChaineCouloir`). Lignes où **Actif ≠ Test surlignées**
   (comportement conservé, en rouge doux dérivé du token).

## A. DÉCISIONS HORS-SPECS
- **A1 — Bandeau de statut calculé sur le run de TEST** (« le run affiché ») et LABELLISÉ « (profil de test) ». Le
  banc sert à explorer le profil de test (série rouge primaire de l'éventail) ; si le test == actif, le statut est
  représentatif. Le tableau montre de toute façon actif ET test. Alternative écartée : statut sur l'actif → moins
  aligné avec l'objet du banc.
- **A2 — Quantités géométriques (distance brute, nature traversée) placées en colonne BRUT**, avec Actif/Test = « — ».
  Elles sont invariantes au profil (identiques actif/test) → les mettre en Brut évite une redondance trompeuse dans
  Actif/Test. Les grandeurs pondérées (perçue, coeffs…) restent en Actif/Test, Brut = « — ».
- **A3 — En-tête « Actif » en VERT** (`green-ink`) comme demandé, bien que la série « actif » soit en encre dans le SVG.
  Suit la consigne explicite du chantier pour le tableau ; couleurs du graphe inchangées.
- **A4 — Rouge doux via `color-mix(in srgb, var(--color-svv-red) 10%, white)`** (trame « baisse » + surlignage écarts)
  → dérivé du token, **aucun hex en dur** (remplace l'ancien `rgba(163,4,2,.08)`), comportement de surlignage conservé.

## B. DOUTES
- **B1 (mineur, non-render)** — rendu non vérifié en navigateur (pas de navigateur). Types cohérents (tsc 0), build ✓,
  golden 23/23. `color-mix` est baseline moderne (outil admin interne). À confirmer à l'œil.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.**
  - **RENDU PUR** : le détail ne fait que LIRE la ventilation déjà calculée (Chantier A) et l'afficher ; aucun recalcul,
    aucun accès moteur/DB.
  - **GOLDEN** : `test:integration` **23/23**, `29.107259068449615` inchangé (aucun fichier moteur touché).
  - **VESTIGIAUX non exposés** : le tableau n'affiche que les champs du seam (boostF2/forfait F3 absents du seam →
    absents du rendu). **Aucun littéral** : bornes/coeffs/cap viennent de `carteAnnee` ; distances/seuils du seam.
  - **MALUS AGRÉGÉ respecté** : la ligne couloir dit explicitement « ajustement AGRÉGÉ, pas par faisceau » ; on
    n'affiche qu'un booléen d'appartenance, jamais un montant de malus par faisceau.
  - **Pas de hex en dur** : couleurs = tokens SVAV + `color-mix` du token rouge + mots-clés (`white`). Vérifié (grep hex = vide).
  - **prefers-reduced-motion** : aucune animation ajoutée.
  - **ISOLATION** : `coucheDegagement`, `config_scoring`, `PROFIL_GOLDEN_REF`, `geom_point`, Gemini, `verdict`,
    `pipeline.ts`, `faisceaux.ts`, `origine.ts`, `profilTest.ts`, `pontProfil.ts`, `bancEssai.ts`, `MapContent`,
    `MapSelector` — **intouchés**. `git status` = `EventailFaisceaux.tsx` seul. Parcours public inchangé.
  - Non-régression : `tsc` 0 · `eslint` 0 · `next build` ✓ · golden **23/23**.

## Vérification manuelle attendue (Arno)
- Lancer un test, cliquer un faisceau : bandeau tramé (hausse=vert / baisse=rouge / neutre=gris / dégagé=gris) ;
  tableau Brut|Actif|Test (Brut gris, Actif vert, Test rouge) ; sur un faisceau « année », la carte lisible
  (« > 1910 et ≤ 1935 », coeffs, cap) ; sur mh/inventaire/mondial, le libellé de famille ; ligne couloir oui/non ;
  lignes Actif≠Test surlignées.

## Verdict de conformité : livraison prête. Détail par faisceau refondu (Brut|Actif|Test, bandeau de statut, sections,
## carte d'année lisible, couloir booléen agrégé) ; rendu pur ; tokens SVAV sans hex ; golden 23/23 ; un seul fichier front.
