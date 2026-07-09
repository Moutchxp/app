# Rapport de build — M3-4 Lot E : refonte visuelle de la tuile « Administratif »

> Run `/svav-build` autonome. **Lot PUREMENT VISUEL** : aucune logique, route, SQL ni règle d'autorisation
> modifiée. Aucun commit. Livraison à Arno. Un seul fichier de production touché : la page `/admin/comptes`.

## 0. Synthèse

| Critère de sortie | Résultat |
|---|---|
| GOLDEN `29.107259068449615` | ✅ 23/23 (aucun fichier moteur touché) |
| `tsc` / `eslint` | ✅ 0 / 0 |
| `npm test` | ✅ **595 passed / 21 skipped** (48 fichiers) |
| `next build` | ✅ (bundle client propre) |
| Aucun bleu dans la page | ✅ (grep + test source) |
| `password.ts`/`motDePasse.ts`/`proxy.ts`/`garde.ts` byte-unchanged | ✅ (diff vide) |
| Aucune route / SQL / migration / Gemini | ✅ |
| Revues R1 / R2 / R3 | ✅ VALIDER / CORRIGER (corrigé) / CORRIGER (corrigé) |

**Fichiers touchés par CE lot** : `app/(admin)/admin/(protected)/comptes/page.tsx` (réécrit) + `…/comptes/page.parts.test.ts`
(nouveau). Rien d'autre. (Le working tree contient aussi les fichiers du Lot D, non encore committés par Arno — ils
ne sont PAS de ce lot.)

## 1. Preuve — l'identité n'est plus dupliquée
**Avant** : « Détails » ouvrait un bloc SOUS le résumé → nom/e-mail/rôle/dernière connexion affichés DEUX fois.
**Après (expansion en place)** : `carte()` teste `ouvertId === c.id` → si ouvert, rend **UNIQUEMENT** `<Detail/>`
(qui porte l'identité une seule fois, `DetailContenu`), **jamais** le résumé en plus ; sinon rend le résumé seul.
`ouvertId` est un `number | null` unique → **une seule carte dépliée**, ouvrir referme la précédente. « Fermer » est
en bas du détail et revient au résumé. **Test** : `renderToStaticMarkup(DetailContenu)` → l'identifiant apparaît
**exactement 1 fois**.

## 2. Preuve — aucun bleu (y compris focus)
Le bleu venait du **focus par défaut du navigateur** (les classes globales `.svv-btn` n'ont aucun `:focus-visible`)
et de la **coche native** de la case à cocher. Correctifs :
- Boutons/chips/inputs/repli : `:focus-visible { outline: 2px solid var(--color-svv-red); outline-offset: 2px }`.
- Case à cocher : `.cpt-case input { accent-color: var(--color-svv-red) }` + focus rouge.
**Preuve** : `grep -niE "blue|#0000ff|#00f|rgb(0,0,255)"` sur la page → **vide** ; test source
(`page.parts.test.ts`) asserte l'absence de bleu ET la présence des anneaux `focus-visible` rouges.

## 3. Couleurs retenues (origine)
| Usage | Valeur | Origine |
|---|---|---|
| Rouge plein / contour / anneau de focus | `var(--color-svv-red)` = `#a30402` | **token existant** (`globals.css`) |
| Hover rouge plein | `var(--color-svv-red-dark)` = `#850302` | token existant |
| Trame de fond des cartouches | `var(--color-svv-field)` = `#f3f4f6` | token existant |
| Bordure fine | `var(--color-svv-line)` = `#e6e8ec` | token existant |
| Texte / secondaire | `--color-svv-ink` / `--color-svv-muted` / `--color-svv-gray` | tokens existants |
| Chip cochée | `--color-svv-green-soft` / `--color-svv-green-ink` | tokens existants (mêmes que `.svv-pill`) |
| Hover rouge-contour | `#fbeceb` | **valeur nouvelle** — teinte rouge TRÈS claire dérivée de `#a30402`, usage hover unique. En dur car le périmètre du lot est la page (interdiction de toucher `globals.css`). *Recommandation future : en faire un token `--color-svv-red-soft`.* |
| Blanc de fond / voile de modale | `#fff` / `rgba(20,20,20,.55)` | valeurs neutres usuelles, pas de token dédié |

## 4. Contraste sur la trame grise `#f3f4f6` (WCAG AA ≥ 4.5:1)
- Texte `ink #16202c` → **~15:1** ✅ · Texte `gray #454545` (`cpt-id`) → **~8.7:1** ✅ · Texte `muted #5c6573` → **5.35:1** ✅
- Chip cochée `green-ink #1e7a3d` sur `green-soft #e7f4ec` → **4.79:1** ✅ (marge AA ; ne pas assombrir le fond).
Tous les textes courants passent AA. (Chip d'un administrateur : `disabled` + `opacity` → contraste effectif ~3:1,
mais WCAG 1.4.3 **exempte les contrôles désactivés** ; conservé, non bloquant.)

## 5. Tests modifiés / ajoutés — aucune logique déplacée
- **Ajouté** : `comptes/page.parts.test.ts` — teste `formaterDate` (Intl fr-FR, « jamais », jamais l'ISO brut),
  `Chip` (ARIA `aria-pressed`, indicateur ✓/□, `disabled`), `DetailContenu` (identité 1 seule fois ; admin → 6 chips
  cochées+désactivées), et l'absence de bleu (scan du source). Rendu via `react-dom/server` (dépendance EXISTANTE) +
  `createElement` → aucune nouvelle dépendance, aucun jsdom.
- **Aucun test existant modifié** : la refonte n'a changé aucun libellé/contrat testé côté serveur ; les tests des
  Lots B/C/D/M3-0 restent verts **sans modification** (595 passed). Les interactions stateful (clic → dépli, une
  seule carte) sont garanties par la structure du code (état `ouvertId` unique) et non testables sans jsdom
  (dépendance interdite) — tracé en catégorie B.

## 6. Revues adverses — verdicts & arbitrages
| Revue | Axe | Verdict | Notable |
|---|---|---|---|
| R1 | Régression fonctionnelle | **VALIDER** | 7 contrats API identiques ; perms cochées = perms envoyées (chips contrôlés sans état interne) ; admin verrouillé ; modale intouchée ; une carte à la fois ; aucune logique cachée. |
| R2 | Accessibilité / mobile | **CORRIGER** | Focus/cibles/overflow/motion conformes. À corriger : `aria-expanded` sur « Détails », nom accessible du détail, nom + focus de la modale. |
| R3 | Cohérence visuelle | **CORRIGER** | Hiérarchie plein/contour/neutre correcte partout ; séparateurs retirés ; trame OK. À corriger : coche « transmis » en bleu natif. |

**Arbitrages (tous des correctifs a11y/visuels, zéro logique) :**
- **R3-2 (case bleue)** — *corrigé* : `accent-color` rouge + focus rouge sur la case.
- **R2-3a** — *corrigé* : `aria-expanded={false}` + `aria-controls` sur « Détails ».
- **R2-3b** — *corrigé* : détail = `role="region"` + `aria-labelledby` vers l'en-tête (id ajouté).
- **R2-8** — *corrigé* : modale `aria-labelledby` (titre id) + **focus initial** dans la modale au montage.
- *Tracés, non corrigés* : `#fbeceb` en dur (périmètre page ; token futur) ; « Fermer » de la modale en **primaire**
  (c'est l'unique CTA, désactivé tant que « transmis » n'est pas coché) vs « Fermer » du détail en **neutre**
  (arbitrage porteur, semantiquement défendable) ; green-ink 4.79:1 (passe AA) ; chip admin désactivée ~3:1
  (exemptée WCAG) ; **piège de focus complet + Échap** de la modale (amélioration a11y d'un composant préexistant,
  à traiter dans une passe a11y dédiée — hors périmètre « visuel » de ce lot ; le focus initial + le nom accessible
  sont livrés).

Aucun constat n'a exigé un changement de logique → aucun arrêt.

## A. DÉCISIONS HORS-SPECS
- **A1 — Système de boutons page-scoped `.cpt-btn`** au lieu des `.svv-btn` globaux : les classes globales n'offrent
  ni le secondaire ROUGE-contour ni les 3 niveaux ni un focus non-bleu. Le système local est plus complet et évite
  de toucher `globals.css` (hors périmètre). *Impact* : à surveiller si `.svv-btn` évolue (divergence possible).
- **A2 — `#fbeceb` en dur** (hover rouge-contour) faute de pouvoir créer un token (périmètre page). Documenté.
- **A3 — Chips = `<button aria-pressed>`** (pas des `<input type=checkbox>`) : meilleur contrôle du style/focus et
  état par forme (✓/□) indépendant de la couleur. Le comportement de formulaire (bascule du `perms`) est identique.

## B. DOUTES
- **B1 — Tests d'interaction (dépli, une carte à la fois) non automatisés** : nécessiteraient jsdom (dépendance
  interdite). Couverts par la structure du code (`ouvertId` unique ; rendu conditionnel résumé XOR détail) + le test
  de `DetailContenu` (identité 1 fois). Vérification finale par le test manuel navigateur.
- **B2 — « Fermer » de la modale en primaire** (cf. arbitrages) : à trancher par Arno s'il préfère un neutre.

## C. ÉCARTS DE CONFORMITÉ
**Aucun.** Golden 23/23 (aucun fichier moteur/`config_scoring`/`pipeline.itest.ts` touché) ; `password.ts`/
`motDePasse.ts`/`proxy.ts`/`garde.ts` byte-unchanged ; aucune route, aucun SQL, aucune migration ; Gemini hors
périmètre ; responsive mobile-first (375px : 2 colonnes de chips, cartes empilées, aucun débordement) ;
`prefers-reduced-motion` respecté (transitions neutralisées ; l'expansion est un rendu conditionnel instantané) ;
focus visible rouge partout ; contrôles annoncés (aria-pressed, aria-expanded, role=region/group).

## Test manuel pour Arno (navigateur, idéalement à 375px)
1. `/admin/comptes` : chaque compte est un cartouche **gris clair uniforme** à bordure fine, **sans filet horizontal**.
2. « Détails » : le résumé **disparaît**, le détail prend sa place **dans la même carte** (aucune info en double) ;
   « Fermer » (gris, en bas) revient au résumé. Ouvrir une autre carte **referme** la première.
3. Les **6 permissions** sont des **pastilles** tactiles en grille ; l'état coché montre un **✓** (perceptible sans
   la couleur) ; pour un administrateur elles sont **cochées et verrouillées**.
4. Boutons : **rouge plein** = Créer / Enregistrer ; **rouge contour** = Détails/Régénérer/Promouvoir/(Dés)activer ;
   **gris contour** = Fermer. **Aucun bleu**, y compris au **focus clavier** (anneau **rouge**) et sur la case
   « j'ai transmis » (coche **rouge**).
5. Dates : « 9 juillet 2026, 22:31 » (heure locale) ; « jamais » si aucune connexion.
6. Section « Comptes désactivés (n) » repliée, nettement séparée (contour pointillé), même traitement visuel.

## Verdict de recon-valid (Phase 8)
**VALIDER.** Chantier confirmé purement visuel (R1 : aucune régression fonctionnelle, 7 contrats API identiques,
modale intouchée) ; identité affichée une seule fois (expansion en place, une carte à la fois) ; **aucun bleu**
(focus/coche à la palette rouge) ; hiérarchie plein/contour/neutre appliquée partout ; trame grise uniforme + bordure,
séparateurs retirés ; chips accessibles (ARIA, forme) ; dates lisibles fr-FR sans mismatch d'hydratation ; contraste
AA ; responsive 375px ; `prefers-reduced-motion` respecté. Golden 23/23, `password.ts`/`motDePasse.ts`/`proxy.ts`/
`garde.ts` byte-unchanged, aucune route/SQL/migration. À toi de committer, fichier par fichier.
