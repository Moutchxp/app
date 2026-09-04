/**
 * LOT 67 — LECTURE APPROFONDIE d'un RÉCAPITULATIF de demande (télé-service, « Basé sur le cerfa n° 13409 »). Ce document est une
 * couche TEXTE PROPRE et ÉTIQUETÉE (« Label : valeur ») — à ne pas confondre avec un Cerfa SCANNÉ bruité (dont `cerfaTexte.ts` tire
 * péniblement quelques valeurs par heuristique). Ici on lit de façon DÉTERMINISTE ce que le formulaire DÉCLARE, champ par champ, sans
 * IA (règle du LOT 67, régime ①). Le champ libre « Courte description… » est extrait VERBATIM et n'est JAMAIS interprété (régime ②).
 * PUR (aucune I/O), testable.
 *
 * DISCIPLINE :
 * - Aucune valeur DÉRIVÉE : on ne convertit pas une surface en une autre, on ne déduit ni bâtiments ni étages du texte libre. La
 *   « surface de plancher » (Cerfa) et la « surface créée » (Sitadel) sont des mesures DISTINCTES, jamais reportées l'une sur l'autre.
 * - Champ ABSENT du formulaire → laissé null ET listé dans `absents` avec un motif (N10-R : jamais un vide muet).
 * - Champ AMBIGU (ex. la nature du projet, dont les libellés « Nouvelle construction / Travaux sur existant » figurent tous SANS
 *   marque de sélection lisible dans le texte aplati) → NON écrit, listé dans `ambigus`.
 * - Ce lecteur ALIMENTE UN INSTANTANÉ INFORMATIF affiché en lecture seule ; il n'écrit RIEN dans les colonnes de valeur arbitrées par
 *   `precedenceMethodes` (nb_places_stationnement, surface_plancher_m2, destinations…), pour ne pas contourner la précédence ni créer
 *   une seconde vérité concurrente de Sitadel / du Cerfa AcroForm.
 */
export interface DeclarationsRecapCerfa {
  dateDepot: string | null;               // « Déposé le : JJ/MM/AAAA » (déclaration Cerfa ; Sitadel porte sa propre date, non écrasée)
  superficieTerrainM2: number | null;     // « Superficie totale du terrain (m²) »
  logementsTotal: number | null;          // « Nombre total de logements créés »
  logementsIndividuels: number | null;    // « dont individuels »
  logementsCollectifs: number | null;     // « dont collectifs »
  niveauxDessusSol: number | null;        // « Nombre de niveaux du bâtiment le plus élevé › Au dessus du sol »
  niveauxDessousSol: number | null;       // « … Au dessous du sol »
  stationnementAvant: number | null;      // « Nombre de places avant réalisation du projet »
  stationnementApres: number | null;      // « Nombre de places après réalisation du projet »
  empriseAuSolCreeeM2: number | null;     // « Emprise au sol créée (en m²) »
  surfacePlancherTotaleM2: number | null; // ligne « Surfaces totales (m²) », colonne Surface totale (déclaration Cerfa ≠ surf_creee)
  descriptionProjet: string | null;       // champ libre « Courte description… » — VERBATIM, jamais résumé ni interprété
  absents: { champ: string; motif: string }[];
  ambigus: { champ: string; motif: string }[];
  present: boolean;                        // false si le texte n'est pas un récapitulatif reconnaissable (rien lu)
}

const RE_RECAP = /r[ée]f[ée]rences?\s+cadastrales|courte\s+description\s+de\s+votre\s+projet|nombre\s+total\s+de\s+logements\s+cr[ée]{2}s/i;

/** Cherche « <label> … : <nombre> » et rend le nombre (borne courte pour ne pas franchir un champ voisin), ou null. */
function nbApres(texte: string, label: RegExp): number | null {
  const m = new RegExp(label.source + String.raw`[^\d:]{0,4}:?\s*(\d{1,7})(?:[.,]\d{1,2})?\b`, label.flags.replace('g', '')).exec(texte);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

export function lireDeclarationsRecapCerfa(texte: string): DeclarationsRecapCerfa {
  const t = (texte ?? '').replace(/\s+/g, ' ');
  const absents: { champ: string; motif: string }[] = [];
  const ambigus: { champ: string; motif: string }[] = [];
  const vide: DeclarationsRecapCerfa = {
    dateDepot: null, superficieTerrainM2: null, logementsTotal: null, logementsIndividuels: null, logementsCollectifs: null,
    niveauxDessusSol: null, niveauxDessousSol: null, stationnementAvant: null, stationnementApres: null,
    empriseAuSolCreeeM2: null, surfacePlancherTotaleM2: null, descriptionProjet: null, absents, ambigus, present: false,
  };
  if (!RE_RECAP.test(t)) return vide; // pas un récapitulatif reconnaissable → rien (jamais une supposition)

  const dateM = /D[ée]pos[ée]\s+le\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i.exec(t);
  const superficieTerrainM2 = nbApres(t, /Superficie\s+totale\s+du\s+terrain\s*\(m²\)/i);
  const logementsTotal = nbApres(t, /Nombre\s+total\s+de\s+logements\s+cr[ée]{2}s/i);
  const logementsIndividuels = nbApres(t, /dont\s+individuels/i);
  const logementsCollectifs = nbApres(t, /dont\s+collectifs/i);
  // niveaux : ancrés à la SECTION « Nombre de niveaux du bâtiment le plus élevé » (fenêtre courte) pour ne pas capter un autre « Au dessus ».
  const secNiv = /Nombre\s+de\s+niveaux\s+du\s+b[âa]timent\s+le\s+plus\s+[ée]lev[ée][\s\S]{0,120}/i.exec(t);
  const fenNiv = secNiv ? secNiv[0] : '';
  const niveauxDessusSol = fenNiv ? nbApres(fenNiv, /Au\s+dessus\s+du\s+sol/i) : null;
  const niveauxDessousSol = fenNiv ? nbApres(fenNiv, /Au\s+dessous\s+du\s+sol/i) : null;
  const stationnementAvant = nbApres(t, /Nombre\s+de\s+places\s+avant\s+r[ée]alisation\s+du\s+projet/i);
  const stationnementApres = nbApres(t, /Nombre\s+de\s+places\s+apr[èe]s\s+r[ée]alisation\s+du\s+projet/i);
  const empriseAuSolCreeeM2 = nbApres(t, /Emprise\s+au\s+sol\s+cr[ée]{2}e\s*\(en\s*m²\)/i);
  // surface de plancher : la ligne « Surfaces totales (m²) » suivie de la série de colonnes ; la DERNIÈRE = « Surface totale ».
  let surfacePlancherTotaleM2: number | null = null;
  const totM = /Surfaces\s+totales\s*\(m²\)\s*((?:\d{1,7}\s+){0,5}\d{1,7})/i.exec(t);
  if (totM) { const nums = totM[1].trim().split(/\s+/).map(Number).filter(Number.isFinite); if (nums.length) surfacePlancherTotaleM2 = nums[nums.length - 1]; }

  // champ libre — VERBATIM entre son étiquette et le champ suivant connu. On ne recompose pas les mots coupés par l'aplatissement PDF.
  let descriptionProjet: string | null = null;
  const desc = /Courte\s+description\s+de\s+votre\s+projet\s+ou\s+de\s+vos\s+travaux\s*:?\s*([\s\S]*?)(?=Votre\s+projet\s+porte\s+sur\s+une\s+installation|Si\s+votre\s+projet\s+n[ée]cessite|Informations\s+compl[ée]mentaires|$)/i.exec(t);
  if (desc) { const s = desc[1].trim(); if (s) descriptionProjet = s; }

  // N10-R — champs demandés par le porteur mais ABSENTS de ce formulaire : dits, jamais comblés par une supposition.
  absents.push({ champ: 'surface habitable', motif: 'le Cerfa déclare la surface de PLANCHER (tableau des surfaces), pas la surface habitable — mesures distinctes, non reportables' });
  absents.push({ champ: 'nombre de bâtiments', motif: 'aucun champ structuré « nombre de bâtiments » au formulaire ; l’information n’apparaît que dans le champ libre (non extrait en valeur, régime ②)' });
  absents.push({ champ: 'noms des bâtiments', motif: 'aucun champ structuré ; les repères « Bat. A/B/C » ne figurent que dans le champ libre (non extrait en valeur, régime ②)' });
  // AMBIGU — la nature du projet : les libellés coexistent dans le texte aplati sans marque de sélection lisible.
  if (/Nouvelle\s+construction/i.test(t) && /Travaux\s+sur\s+(?:construction\s+)?existant/i.test(t)) {
    ambigus.push({ champ: 'nature du projet', motif: 'les libellés « Nouvelle construction » et « Travaux sur construction existante » coexistent sans marque de sélection lisible dans le texte — non tranché' });
  }

  return {
    dateDepot: dateM ? dateM[1] : null, superficieTerrainM2, logementsTotal, logementsIndividuels, logementsCollectifs,
    niveauxDessusSol, niveauxDessousSol, stationnementAvant, stationnementApres, empriseAuSolCreeeM2, surfacePlancherTotaleM2,
    descriptionProjet, absents, ambigus, present: true,
  };
}
