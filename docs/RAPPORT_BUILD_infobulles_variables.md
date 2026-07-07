# RAPPORT FINAL — build « Info-bulles "i" sur les cartes d'édition de config_scoring »

> Run `/svav-build` sur `docs/SPEC_infobulles_variables.md` (OQ1–OQ4 tranchés). **UI additive, affichage
> pur. Non committé.** Catégories : A décisions hors-specs · B doutes · C écarts de conformité.

## Résumé
Chaque carte de la page Pilotage (46 colonnes : VIVE + 5 VESTIGIALES + `id` + `mode_combinaison` +
`analysis_range_m`) expose un picto **« i »** ouvrant une explication **fondée sur le comportement réel du
moteur** (textes de la spec, eux-mêmes issus de la recon `fichier:ligne`). Contenu en métadonnées (champ
`infobulle?`), source unique. Golden **inchangé** (`29.107259068449615`), aucun fichier moteur touché.

## Fichiers (3, tous dans le périmètre)
- `mappingConfig.ts` : `infobulle?: string` ajouté à `ColonneMeta` (distinct de `aide?`) ; les 46 colonnes
  renseignées avec les textes exacts de la spec. + `mappingConfig.test.ts` (test « les 46 ont une
  `infobulle` non vide »).
- `page.tsx` : composant co-localisé `InfoBulle` (bouton « i » + bulle) câblé sur chaque carte ; purement
  additif (aucune logique d'édition/validation/paire/avertissement modifiée).

## A. DÉCISIONS HORS-SPECS
- **A1 — Factorisation des textes de famille** : les familles à texte groupé dans la spec (`mh_*`, `inv_*`,
  `a1900_*`, `a1935_*`, orientations, vestigiales) sont portées par 6 constantes (`IB_MH`, `IB_INV`,
  `IB_A1900`, `IB_A1935`, `IB_ORIENTATION`, `IB_VESTIGIALE`) réutilisées sur chaque colonne du groupe —
  **texte identique à la spec**, zéro duplication littérale. Alternative écartée : recopier le même texte 3×.
- **A2 — Un seul « i » pour le bloc orientation** : les 8 `orientation_*` partagent un texte unique → un
  seul picto sur l'en-tête du bloc orientation (au lieu de 8). Cohérent avec le fait qu'un seul secteur est
  exercé et que le texte est commun. Chaque orientation reste éditable individuellement.
- **A3 — `InfoBulle` co-localisé dans `page.tsx`** (pas de fichier séparé) : composant additif court,
  co-localisé pour rester dans le périmètre « affichage » et limiter la surface.
- **A4 — Cible tactile 44px par marges négatives** : `.svv-pil-ib-btn` a un hit-area 44×44 px (EX-5) tout
  en gardant une pastille visuelle compacte (≈18 px) via marges négatives, pour ne pas gonfler l'en-tête.

## B. DOUTES
- *Aucun.* Les textes sont une transcription fidèle de la spec (vérifiée) ; l'exactitude technique était
  déjà scellée par la recon. Cas limites d'accessibilité (fermeture hors-zone via `mousedown`, Échap)
  couverts.

## C. ÉCARTS DE CONFORMITÉ
- **Aucun.** Batterie SVAV verte :
  - **GOLDEN** : `test:integration` **14/14**, `29.107259068449615` **inchangé** (affichage pur, aucun
    chemin de score touché).
  - **AFFICHAGE PUR (EX-11)** : **aucun** fichier `app/lib/svv/**`, verdict, `config_scoring`, route
    `PATCH`/`route.ts`, `validation.ts`, `profilConfig.ts` modifié (grep `git status` : seuls
    `mappingConfig.ts`/`.test`/`page.tsx`). Aucune écriture DB.
  - **EXACTITUDE `mode_combinaison`** : le texte mentionne le **verrou de sécurité / inerte** et **ne décrit
    AUCUN comportement des 3 modes** (grep confirmé).
  - **SOURCE UNIQUE** : la bulle affiche `meta.infobulle` (`page.tsx:452,702`) ; aucun texte en dur dans le
    JSX. Les 46 colonnes ont une `infobulle` non vide (test).
  - **ACCESSIBILITÉ** : `<button>` (pas de hover-only), `aria-label`/`aria-expanded`/`aria-controls`, bulle
    `role="tooltip"`, bouton de fermeture, Échap + clic hors-zone ; **hit-area ≥ 44 px** (`page.tsx:812`) ;
    bulle `max-width: min(280px, calc(100vw − 40px))` (375 px sans débordement) ; animation neutralisée sous
    `prefers-reduced-motion` (`page.tsx:857`).
  - Non-régression : `tsc` 0 · `npm test` **295 passés / 21 skipped** · eslint 0.

---

## Verdict de conformité : livraison prête. UI additive, textes exacts (recon), golden inchangé, isolation
## totale, accessibilité et responsive satisfaits. Aucune écriture/suppression de données (Règle dure non
## sollicitée).
