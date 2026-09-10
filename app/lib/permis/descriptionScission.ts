/**
 * CR-1b — SCINDER la description du Cerfa en deux parts : la PHRASE GÉNÉRÉE par le téléservice (Paris) et la DÉCLARATION HUMAINE du
 * pétitionnaire, puis PARSER la part générée (très structurée). PUR (aucune I/O, aucune IA), testable.
 *
 * POURQUOI — le téléservice pré-remplit le champ libre par une phrase de gabarit AVANT le texte de l'architecte. Deux cas :
 *   1. MARQUEUR EXPLICITE « //Remplace le texte généré automatiquement ci-dessus// » (témoin 470) : tout ce qui PRÉCÈDE le marqueur
 *      est généré, tout ce qui SUIT est humain.
 *   2. MARQUEUR ABSENT (témoin 468) : la part générée se reconnaît à sa SYNTAXE de gabarit — une phrase RIGIDE de la forme
 *        « Construction d'un bâtiment à R+{N} sur {M} niveau(x) de sous-sol à destination {DEST} Surface créée: {S} m². »
 *      (mesurée identique sur 468/470, et sur les arrêtés de 531/11430). Si elle est présente EN TÊTE, elle est la part générée ; le
 *      reste est humain.
 * Si RIEN ne ressemble à ce gabarit (témoins 531 et 7424, rédigés par l'architecte), TOUT est humain — on ne DEVINE jamais.
 *
 * ⚠️ Le 531 illustre le piège : sa valeur stockée (« Construction d'une résidence sociale de 21 logements R+3+attique+combles … Abattage
 *    de 2 arbres … ») N'EST PAS le gabarit rigide (« d'un bâtiment à R+N … à destination … »), c'est l'architecte — donc HUMAIN entier.
 *
 * PROVENANCE — la part générée est un DÉRIVÉ produit par la mairie (téléservice), PAS une déclaration d'architecte : ses valeurs
 *   portent la méthode `teleservice` (cf. precedenceMethodes.ts), placée SOUS les plans/coupes et la déclaration humaine, AU-DESSUS de
 *   l'IA. Ce module ne fait qu'EXTRAIRE et TRACER ; l'instruction des champs (écriture) est un lot distinct (CR-3).
 */

/** Valeurs DÉRIVÉES de la phrase générée par le téléservice. `null` = ABSENT (jamais 0 ni « null » : ce sont des marques de non-saisie). */
export interface ValeursGenerees {
  niveauxHorsSol: number | null;   // le N de « R+N » tel qu'énoncé (étages au-dessus du RDC) — VERBATIM, aucune addition du RDC
  niveauxSousSol: number | null;   // « sur M niveau(x) de sous-sol » — M ; « 0 niveau(x) » ⇒ null (marque de non-saisie, piège 470)
  destination: string | null;      // « à destination … » — verbatim ; « null » (ou « null, null, null ») ⇒ null (non renseigné)
  surfaceCreeeM2: number | null;   // « Surface créée: S m² » — S
}

/** Résultat de la scission : les deux parts (VERBATIM) + les valeurs dérivées de la part générée (méthode `teleservice`). */
export interface ScissionDescription {
  genere: string | null;           // phrase pré-remplie par le téléservice (ou null si aucune)
  humain: string | null;           // déclaration du pétitionnaire (ou null)
  valeurs: ValeursGenerees | null;  // valeurs lues dans `genere` (null si pas de part générée)
}

/** Marqueur EXPLICITE inséré par le téléservice quand l'architecte a remplacé le texte auto : sépare généré (avant) / humain (après). */
const RE_MARQUEUR = /\/\/\s*Remplace\s+le\s+texte\s+g[ée]n[ée]r[ée]\s+automatiquement\s+ci-dessus\s*\/\//i;

/**
 * Syntaxe RIGIDE de la phrase générée (ancrée en TÊTE). Rigide À DESSEIN : on ne veut PAS happer une phrase d'architecte qui décrit un
 * bâtiment autrement. Exige « Construction d'un bâtiment à R+N sur M niveau(x) de sous-sol à destination … Surface créée: S m² ».
 */
const RE_GABARIT_GENERE = /^Construction\s+d['’]un\s+b[âa]timent\s+[àa]\s+R\+\d+\s+sur\s+\d+\s+niveaux?(?:\(x\))?\s+de\s+sous-sol\s+[àa]\s+destination\s+.+?\s+Surface\s+cr[ée]{2}e\s*:\s*[\d.,]+\s*m²\.?/i;

/** « null » est une marque de NON-SAISIE du téléservice (jamais une valeur). Vrai si la chaîne n'est QUE des « null » (éventuellement listés). */
function estNonRenseigne(s: string): boolean {
  const jetons = s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  return jetons.length > 0 && jetons.every((x) => x === 'null');
}

/** Parse la part GÉNÉRÉE (structure rigide) en valeurs. Champ non trouvé, « 0 niveau(x) » ou « null » ⇒ null (ABSENT, jamais 0/"null"). */
export function parserPartGeneree(genere: string): ValeursGenerees {
  const horsSol = /R\+(\d+)/i.exec(genere);
  const sousSol = /sur\s+(\d+)\s+niveaux?(?:\(x\))?\s+de\s+sous-sol/i.exec(genere);
  const dest = /[àa]\s+destination\s+(.+?)\s+Surface\s+cr[ée]{2}e/i.exec(genere);
  const surf = /Surface\s+cr[ée]{2}e\s*:\s*([\d.,]+)\s*m²/i.exec(genere);

  const nSousSol = sousSol ? Number(sousSol[1]) : NaN;
  const destBrute = dest ? dest[1].trim() : '';
  const nSurf = surf ? Number(surf[1].replace(',', '.')) : NaN;

  return {
    niveauxHorsSol: horsSol ? Number(horsSol[1]) : null,
    niveauxSousSol: Number.isFinite(nSousSol) && nSousSol > 0 ? nSousSol : null, // 0 (ou absent) ⇒ null
    destination: destBrute && !estNonRenseigne(destBrute) ? destBrute : null,     // « null[, null…] » ⇒ null
    surfaceCreeeM2: Number.isFinite(nSurf) ? nSurf : null,
  };
}

/**
 * CR-2a/CR-3 — DIVERGENCE R+N entre la phrase GÉNÉRÉE (téléservice) et la déclaration HUMAINE. Cas réel 470 : généré « R+4 », humain
 * « allant jusqu'au R+5 ». La déclaration humaine PRIME sur le téléservice (précédence) → `retenu` = valeur humaine. `null` si pas de
 * conflit lisible (pas de part générée, pas de R+N dans l'humain, ou valeurs égales). On ne DEVINE pas : il faut un « R+N » explicite.
 */
export function divergenceNiveauxHorsSol(scission: ScissionDescription): { genere: number; humain: number; retenu: number } | null {
  const genere = scission.valeurs?.niveauxHorsSol ?? null;
  if (genere == null || !scission.humain) return null;
  const m = /R\s*\+\s*(\d+)/i.exec(scission.humain);
  if (!m) return null;
  const humain = Number(m[1]);
  if (!Number.isFinite(humain) || humain === genere) return null;
  return { genere, humain, retenu: humain }; // déclaration humaine > téléservice
}

const vide = (s: string | null): string | null => { const t = (s ?? '').trim(); return t === '' ? null : t; };

/**
 * Scinde la description en { genere, humain, valeurs }. Priorité au MARQUEUR explicite ; sinon au GABARIT rigide en tête ; sinon TOUT
 * est humain (jamais de supposition). VERBATIM : les deux parts ne sont ni résumées ni recomposées.
 */
export function scinderDescription(description: string | null): ScissionDescription {
  const desc = (description ?? '').trim();
  if (desc === '') return { genere: null, humain: null, valeurs: null };

  // 1. Marqueur EXPLICITE — le plus sûr : avant = généré, après = humain.
  const marq = RE_MARQUEUR.exec(desc);
  if (marq) {
    const genere = vide(desc.slice(0, marq.index));
    const humain = vide(desc.slice(marq.index + marq[0].length));
    return { genere, humain, valeurs: genere ? parserPartGeneree(genere) : null };
  }

  // 2. Gabarit RIGIDE en tête — la part générée implicite.
  const tpl = RE_GABARIT_GENERE.exec(desc);
  if (tpl) {
    const genere = vide(tpl[0]);
    const humain = vide(desc.slice(tpl[0].length));
    return { genere, humain, valeurs: genere ? parserPartGeneree(genere) : null };
  }

  // 3. Rien de générique reconnaissable ⇒ tout est humain.
  return { genere: null, humain: desc, valeurs: null };
}
