# RECON — Best-of des plans : pourquoi il est vide sur les noms opaques, et pourquoi il optimise le tracé d'emprise (lecture seule)

> Run de RECON **lecture seule** (aucune écriture, aucune modification de la sélection best-of).
> Contexte : ressenti « le best-of propose des pièces inutiles / est vide » sur le permis
> **PC07512025V0006** (`sitadel_dossier.id = 531`), 42 pièces PDF à noms opaques. Chaque affirmation
> est citée `fichier:ligne`. Cette recon accompagne le LOT PROV-1 (points 1 et 2 déjà livrés).

---

## 1. Comment le best-of est calculé aujourd'hui

**Chaîne de bout en bout** : `emprise/route.ts:60` appelle `classerPiecesParFamille(piecesPdf)` → les
`proposees` deviennent `propose=true` (`route.ts:81`) → côté client `construireBandePlans`
(`TraceEmpriseRendu.tsx:104-118`) ne garde que les pièces `propose` → **c'est la bande best-of**.

**Critère = le NOM DE FICHIER seul** (`planMasse.ts:111-118` `classerPiecesParFamille`, via `familleDeNom`
`planMasse.ts:53-59`). Une pièce entre dans le best-of si son nom matche l'une de **trois familles** :

| Famille | Motif (sur le NOM) | `planMasse.ts` |
|---|---|---|
| `masse` | `/plan (de) masse/` **ou** code `PC2` (R.431-9) | `:16-17, 55` |
| `etage` | `/plan (du) niveau·rez·rdc·sous-sol·étage·R+n/` | `:45, 56` |
| `coupe` | `/coupe·façade·élévation/` **ou** code `PC3` | `:46-47, 57` |
| — | aucun match → `null` → **« autres »** (repli, HORS best-of) | `:58` |

**Ordre** (`classerPiecesParFamille:114`) : `masse (0) → étage (1) → coupe (2)` (rang de famille
`planMasse.ts:105`), puis score de nom décroissant (`scoreNomPlanMasse:28-37` : +100 forme « plan de
masse », +80 code PC2, +15 « projet » / −5 « existant »), puis ordre d'origine.

---

## 2. Pourquoi la bande est VIDE sur 531 (noms opaques)

Les 42 pièces de 531 portent des noms **opaques** (« PC 075 120 25 V0006_202508010945110257.pdf »…) qui
ne matchent **aucun** motif de nom : ni « plan de masse », ni code PC2/PC3, ni « coupe/façade », ni « plan
du R+n ». `familleDeNom` rend donc `null` pour les **42 pièces** → **0 proposée → bande best-of vide**
(reproduit : `classerPiecesParFamille` sur 531 rend `proposees=0, autres=42`).

**La classification PAR NOM SEUL échoue entièrement sur les versements à noms opaques** — même cause racine
que LECT-1 point A (le Cerfa introuvable par son nom `nom_fichier ~* 'cerfa 13409'`). Aucune reprise par le
CONTENU n'existe pour repêcher ces pièces : `familleDePage` (`planMasse.ts:84-89`) et `tracabilitePlanche`
(`:97-103`) ne raffinent que la traçabilité PAR PAGE de pièces **déjà proposées par le nom** ; elles
n'AJOUTENT jamais une pièce à la bande. La confirmation par texte (`route.ts:66`) ne s'applique qu'à la
shortlist des `proposees` — vide ici, donc jamais exécutée.

> Conséquence directe (corrigée au LOT PROV-1 point 1) : bande vide → on ouvre une pièce depuis le repli
> (`nav='piece'`) → « revenir au best-of » passait par `appliquerPlan` qui sortait tôt sur bande vide
> (`if (bande.length === 0) return;`) → bouton mort. Corrigé par `cibleBestOf` (`TraceEmpriseRendu.tsx`).

---

## 3. Pourquoi il optimise le TRACÉ D'EMPRISE, pas la LECTURE des caractéristiques

Le but écrit du module (`planMasse.ts:2`) : « détection *plan de masse* **pour le sélecteur du tracé
d'emprise** ». Le best-of sert à trouver une **vue EN PLAN traçable** pour dessiner l'emprise au sol du
futur bâtiment. D'où le **verrou métier** `estTracable` (`planMasse.ts:62-66`) : masse + étage sont
traçables ; **coupe / façade sont VERROUILLÉES** (ce sont des élévations — y caler une emprise n'a aucun
sens géométrique).

C'est ce qui explique l'ordre `masse → étage → coupe` : pour **tracer**, on veut d'abord le plan le plus
sûr (masse au 1:1000, sinon un étage souvent plus net), la coupe en dernier car non traçable.

---

## 4. Confrontation à la doctrine du porteur

Doctrine : **COUPES + CERFA = deux gisements PRIORITAIRES** ; plans de façade et de masse ensuite ;
notices / avis de services / pièces administratives en dernier.

Trois écarts, dont un qui n'est PAS un bug mais un **désaccord de FINALITÉ** :

1. **Le Cerfa n'est JAMAIS dans le best-of.** Les familles ne connaissent que masse/étage/coupe (des
   *plans*). Le Cerfa n'est pas un plan → `familleDeNom` rend `null` → « autres ». La doctrine en fait un
   gisement prioritaire ; le best-of l'ignore.

2. **La coupe est classée DERNIÈRE (rang 2), pas première.** L'inverse de la doctrine — **mais délibéré
   pour la finalité actuelle** (tracé d'emprise : une coupe n'est pas traçable, `estTracable:66`).

3. **🔑 Désaccord de FINALITÉ (cause profonde du ressenti « best-of mauvais »).** Le best-of actuel
   optimise le **tracé d'emprise** (vue en plan) ; la doctrine décrit les **gisements de LECTURE des
   caractéristiques** (coupes = hauteurs/cotes → cf. LECT-1 B ; Cerfa = valeurs déclarées → cf. LECT-1
   A/C). Ce sont **deux tâches différentes**, aujourd'hui mélangées dans le même bloc « projection ». La
   doctrine s'applique à *où LIRE les caractéristiques*, pas à *où TRACER l'emprise*.

---

## 5. Orientations (décidées avec le porteur)

- **(a) — PRIORITAIRE, faite dans la foulée de cette recon.** Reconnaître les familles
  (**masse / étage / coupe / Cerfa**) par le **CONTENU**, comme LECT-1 A (Cerfa 13409 en tête) et B
  (marqueurs de coupe : cotes de nivellement, faîtage/égout…), pour **survivre aux noms opaques**. Même
  cause racine que 531 → répare la bande vide immédiatement, sans dépendre du nom de fichier.

- **(b) — RETENUE, lot dédié ULTÉRIEUR (ne pas commencer maintenant).** SÉPARER les deux best-of : un
  « pour TRACER » (plans traçables : masse/étage) et un « pour LIRE » (coupes + Cerfa), puisque la
  finalité diffère. Réconcilie proprement la doctrine et le verrou de traçabilité, sans forcer une seule
  liste à servir deux buts contradictoires.

---

## 6. Cadre de la recon

Lecture seule. Aucune modification de `planMasse.ts` ni de la sélection. Aucune commande de relève ou
d'envoi. Corpus figé le 28/08/2026.
