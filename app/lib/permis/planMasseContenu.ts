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
// PROV (suite) — plan d'ÉTAGE (vue en plan TRAÇABLE) : CARTOUCHE DE NIVEAU (« PLAN RDC », « PLAN SSOL », « PLAN R+n », « PLANS
//   NIVEAUX », « ÉTAGE COURANT » — pluriel « PLANS » inclus). Signal du DESSIN, jamais de la prose : une notice qui écrit « plan du
//   RDC » est un long document, écarté par le seuil de PLANCHE (`dessin`). Mesuré sur 531 : 0 faux positif.
const ETAGE_CARTOUCHE = /plans?\s+(?:du\s+|des\s+)?(?:rdc|r\s?\+?\s?\d{1,2}|sous\s?sols?|ssols?|niveaux?|etages?)|etages?\s+courants?|rez\s+de\s+chaussee/;
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
  // ÉTAGE : cartouche de niveau sur une PLANCHE. Avant coupe (un plan d'étage n'a pas de table de nivellement ; le cas échéant, son
  //   cartouche de niveau prime). La garde serveur d'enregistrement accepte 'etage' (vue en plan traçable) — cf. emprise/route.ts.
  if (dessin && ETAGE_CARTOUCHE.test(contenu)) return 'etage';
  if (pagesTexte.some((t) => cotesTableNivellement(t).length > 0)) return 'coupe';      // LECT-1 B : table de nivellement = coupe
  return null;
}

/**
 * PROV (suite) — NIVEAUX portés par une planche d'étage (RDC / sous-sol / R+n / étage courant). Une planche multi-niveaux (RDC+SSOL,
 * ou R+1/R+2/R+3+R+4) entre UNE fois mais on SAIT quels niveaux elle porte. Sur texte dé-espacé. Ordre : sous-sol → RDC → R+n croissant
 * → étage courant. PUR. ⚠️ Signale ce que le TEXTE révèle : une planche muette (scan) ou à titre graphique ne rend rien de fiable.
 */
export function niveauxDeContenu(pagesTexte: readonly string[]): string[] {
  const d = pagesTexte.map((t) => normaliserContenu(t)).join(' ');
  const ss = new Set<string>(); // sous-sols / RDC
  const rs = new Set<number>(); // étages R+n
  // Niveaux ANNONCÉS par un « PLAN(S) [du/des] <niveau> » — le SUJET de la planche, jamais une mention isolée (le mot « PLAN » et le
  //   niveau peuvent être COLLÉS par le dé-espacement : « planr+4 »). Une liste « R+1 / R+2 / R+3 » derrière « PLAN » est développée.
  //   ⚠️ « étage courant » n'est PAS listé comme niveau (vague, redondant avec les R+n) — il sert à la RECONNAISSANCE de famille, pas ici.
  for (const m of d.matchAll(/plans?\s*(?:du\s+|des\s+)?(rdc|rez\s+de\s+chaussee|sous\s?sols?|ssols?|r\s?\+\s?\d{1,2}(?:\s?\/\s?r\s?\+\s?\d{1,2})*)/g)) {
    const tok = m[1];
    if (/rdc|rez/.test(tok)) ss.add('RDC');
    else if (/sol/.test(tok)) ss.add('sous-sol');
    else for (const r of tok.matchAll(/r\s?\+\s?(\d{1,2})/g)) { const n = Number(r[1]); if (n >= 1 && n <= 60) rs.add(n); }
  }
  const out: string[] = [];
  if (ss.has('sous-sol')) out.push('sous-sol');
  if (ss.has('RDC')) out.push('RDC');
  for (const n of [...rs].sort((a, b) => a - b)) out.push(`R+${n}`);
  return out;
}
