import { estPageCartouche, type FamillePlan } from './planMasse';
import { cotesTableNivellement } from './extractionCaracteristiques';
import { estPieceCerfaPc } from './identifierCerfa';

/**
 * PROV-3 (1) — DÉ-ESPACEMENT des titres de planches. Les cartouches de dessin encodent souvent leur titre lettre-à-lettre
 * (« P L A N  D E  M A S S E ») : après une normalisation d'espaces classique, « PLAN » devient « p l a n » et AUCUN motif texte ne
 * matche. On joint les lettres ISOLÉES séparées par un espace (une lettre à une frontière de mot, suivie d'une lettre à une frontière)
 * → « plan de masse ». N'affecte pas les cotes (chiffres). PUR.
 */
function deSpacer(s: string): string { return s.replace(/(?<=\b\p{L}) (?=\p{L}\b)/gu, ''); }
function normaliserContenu(s: string): string {
  return deSpacer(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’`_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// PROV-3 (1) — VOCABULAIRE DE PLAN DE SITE, propre au PLAN DE MASSE et ABSENT des coupes / des notices en prose : « cour commune »
//   (avec sa surface), « cote de nivellement d'îlot » (nivellement à l'échelle de l'îlot, pas des planchers). Ce sont des termes
//   d'urbanisme STANDARD du plan de masse — pas un calage sur 531, mais mesurés là (les 4 plans de masse à titre GRAPHIQUE, sans
//   aucun titre-texte, ne sont reconnaissables QUE par eux). ⚠️ à élargir/mesurer sur d'autres dossiers.
const MASSE_SITE = /cour communes?|nivellement d(?:e l)? ?ilot/; // apostrophes déjà normalisées en espace par normaliserContenu
// Une PLANCHE (titre + annotations) porte peu de texte ; un document (notice, rapport, nomenclature) en porte beaucoup. Ce seuil
//   écarte un DOC qui citerait « cour commune » en prose (mesuré : une nomenclature de 8737 car), sans toucher les planches (~500–1300 car).
const CARS_PLANCHE_MAX = 3000;

/**
 * PROV-2 (a) — FAMILLE d'une pièce par son CONTENU, en REPLI quand le NOM ne classe rien (noms opaques, ex. 531). Même cause racine
 * et mêmes signaux que LECT-1 A/B. ⚠️ On n'utilise QUE des signaux PROPRES AU DESSIN / AU FORMULAIRE, jamais une mention en prose :
 * une NOTICE qui écrit « plan de masse » ou « niveau » dans son texte NE DOIT PAS être prise pour un plan (piège mesuré sur 531 :
 * `familleDePage` sur le texte complet classait 6 notices en « masse », 3 en « étage »). Les signaux retenus, du plus spécifique au
 * moins :
 *   · CERFA  ← `estPieceCerfaPc` (LECT-1 A : n° national 13409 + contexte cerfa/permis dans les 1res pages) — 0 faux positif ;
 *   · masse  ← le CARTOUCHE réglementaire (« … CONSTRUCTIONS À ÉDIFIER OU MODIFIER », `estPageCartouche`) OU, quand le titre est
 *             GRAPHIQUE (aucun titre-texte, cas mesuré sur 531), le VOCABULAIRE DE SITE (`MASSE_SITE` : cour commune / nivellement
 *             d'îlot) sur une PLANCHE (texte court) — sur le texte DÉ-ESPACÉ (`deSpacer`, titres lettre-à-lettre). MASSE est testé
 *             AVANT coupe : un plan de masse peut porter une table de nivellement d'îlot ; ses marqueurs de site le distinguent ;
 *   · coupe  ← une TABLE DE NIVELLEMENT (LECT-1 B : suite de cotes appariées à RDC/R+n/Égout/Faîtage) — propre à une coupe/section.
 * ⚠️ Fragilité assumée (à redire au porteur) : (a) la famille 'etage' n'a PAS de signal de contenu FIABLE (le motif « plan du R+n »
 *   est trop bruité en prose) → non reconnue par le contenu ici, à défaut d'un cartouche d'étage propre ; (b) une pièce MUETTE
 *   (scan sans couche texte NI titre-texte) n'a aucun signal → non classée (reste dans « autres », atteignable au repli) ; (c) le
 *   vocabulaire de site (cour commune / nivellement d'îlot) est mesuré sur 531 — standard en urbanisme mais à élargir/mesurer ailleurs.
 *   Mesuré sur 531 : 1 cerfa + 4 masse (plans de masse, traçables) + 3 coupes surfacés (0 faux positif), là où le nom seul donnait 0.
 * PUR (aucune I/O). Vit CÔTÉ SERVEUR (importe l'extraction) : n'est appelé que par la route emprise, jamais bundlé côté client.
 */
export function familleDeContenu(pagesTexte: readonly string[]): FamillePlan | null {
  if (pagesTexte.length === 0) return null;                                             // pièce muette (scan) → non classée par le contenu
  if (estPieceCerfaPc(pagesTexte.slice(0, 3))) return 'cerfa';                          // LECT-1 A
  // MASSE d'abord (avant coupe) : un plan de masse peut porter une table de nivellement d'îlot qui ressemble à celle d'une coupe ;
  //   ses marqueurs de SITE (cour commune / nivellement d'îlot) le distinguent. Cartouche réglementaire OU, à défaut (titre graphique),
  //   vocabulaire de site sur une PLANCHE (texte court) — sur le texte DÉ-ESPACÉ (titres lettre-à-lettre).
  const dessin = pagesTexte.reduce((s, t) => s + t.length, 0) < CARS_PLANCHE_MAX;
  const contenu = pagesTexte.map((t) => normaliserContenu(t)).join(' ');
  if (pagesTexte.some((t) => estPageCartouche(t)) || (dessin && MASSE_SITE.test(contenu))) return 'masse';
  if (pagesTexte.some((t) => cotesTableNivellement(t).length > 0)) return 'coupe';      // LECT-1 B : table de nivellement = coupe
  return null;
}
