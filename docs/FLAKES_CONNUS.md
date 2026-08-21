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
