/**
 * N10-O — DÉCISION PURE de lecture d'un Cerfa SCANNÉ (sans AcroForm). Aucune I/O, aucun appel modèle. Reçoit DEUX lectures
 * INDÉPENDANTES par champ (OCR `mistral-ocr` + vision `mistral-medium`) et n'écrit QUE si elles s'accordent.
 *
 * 🔒 DOCTRINE (mesure du 21/08) :
 * - Accord sur une VALEUR → écrite, confiance 'confirmee' (deux sources indépendantes se recoupent).
 * - Désaccord → RIEN d'écrit ; les DEUX lectures journalisées avec leur source. On ne tranche JAMAIS entre les deux.
 * - VIDE ≠ 0 (porté par CE code, jamais délégué au modèle) : une lecture 'vide' = case blanche → abstention (rien écrit), JAMAIS 0.
 *   Un « 0 » écrit au Cerfa arrive en statut 'valeur' valeur='0' → écrit 0. La distinction vit dans le statut de lecture, pas ici.
 * - Destinations = un TABLEAU DE SURFACES : une sous-destination est « déclarée » si une SURFACE figure sur sa ligne (jamais une
 *   « case cochée »). Accord = les deux lectures déclarent le MÊME ensemble de sous-destinations.
 */

/** Une lecture d'un champ par UNE source. 'vide' = case blanche (≠ 0) ; 'illisible' = abstention explicite. */
export type LectureValeur = { statut: 'valeur'; valeur: string } | { statut: 'vide' } | { statut: 'illisible' };

const norm = (s: string) => s.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
const resume = (l: LectureValeur): string => (l.statut === 'valeur' ? `« ${l.valeur} »` : l.statut);

export type AccordChamp =
  | { statut: 'ecrire'; valeur: string; confiance: 'confirmee'; ocr: LectureValeur; vision: LectureValeur }
  | { statut: 'vide'; motif: string; ocr: LectureValeur; vision: LectureValeur }        // les deux : champ non renseigné → rien écrit
  | { statut: 'illisible'; motif: string; ocr: LectureValeur; vision: LectureValeur }
  | { statut: 'desaccord'; motif: string; ocr: LectureValeur; vision: LectureValeur };  // rien écrit ; les deux journalisées

/** Accorde DEUX lectures d'un même champ. N'écrit que si les deux donnent la MÊME valeur. VIDE n'est jamais transformé en 0. */
export function accorder(ocr: LectureValeur, vision: LectureValeur): AccordChamp {
  if (ocr.statut === 'valeur' && vision.statut === 'valeur') {
    if (norm(ocr.valeur) === norm(vision.valeur)) return { statut: 'ecrire', valeur: ocr.valeur, confiance: 'confirmee', ocr, vision };
    return { statut: 'desaccord', motif: `lectures divergentes (OCR ${resume(ocr)} vs vision ${resume(vision)})`, ocr, vision };
  }
  if (ocr.statut === 'vide' && vision.statut === 'vide') return { statut: 'vide', motif: 'champ non renseigné (les deux lectures : case blanche)', ocr, vision };
  if (ocr.statut === 'illisible' && vision.statut === 'illisible') return { statut: 'illisible', motif: 'illisible pour les deux lectures', ocr, vision };
  // toute autre combinaison (une valeur / l'autre vide ou illisible ; vide vs illisible) = désaccord : rien écrit.
  return { statut: 'desaccord', motif: `lectures non concordantes (OCR: ${resume(ocr)} · vision: ${resume(vision)})`, ocr, vision };
}

// ── DESTINATIONS (ensemble de sous-destinations déclarées par une SURFACE) ──────────────────────────────────────────────────────
export interface ProvenanceDestination { sousDestination: string; valeur: string }
export type AccordDestinations =
  | { statut: 'ecrire'; retenues: string[]; provenances: ProvenanceDestination[] }
  | { statut: 'vide'; motif: string }                                                    // les deux : aucune sous-destination déclarée
  | { statut: 'desaccord'; motif: string; ocrRetenues: string[]; visionRetenues: string[] };

const memeEnsemble = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

/** Accorde les destinations : chaque lecture déclare l'ensemble des sous-destinations portant une SURFACE. Accord = mêmes ensembles. */
export function accorderDestinations(sousDest: readonly string[], ocr: Readonly<Record<string, LectureValeur>>, vision: Readonly<Record<string, LectureValeur>>): AccordDestinations {
  const ocrSet = sousDest.filter((sd) => ocr[sd]?.statut === 'valeur');
  const visionSet = sousDest.filter((sd) => vision[sd]?.statut === 'valeur');
  if (!memeEnsemble(ocrSet, visionSet)) {
    return { statut: 'desaccord', motif: 'les deux lectures ne déclarent pas les mêmes sous-destinations', ocrRetenues: ocrSet, visionRetenues: visionSet };
  }
  if (ocrSet.length === 0) return { statut: 'vide', motif: 'aucune sous-destination déclarée par une surface (les deux lectures)' };
  const provenances = ocrSet.map((sd) => ({ sousDestination: sd, valeur: (ocr[sd] as { valeur: string }).valeur }));
  return { statut: 'ecrire', retenues: ocrSet, provenances };
}

// ── PLAN D'ÉCRITURE (pur) : ce qui se pose en base + ce qui se journalise ────────────────────────────────────────────────────────
export interface ChampScalaire { cle: 'surfacePlancherM2' | 'nbLogements' | 'nbPlacesStationnement' | 'adresseTerrain'; colonne: string; page: number; numerique: boolean; accord: AccordChamp }
export interface LigneJournalIA { champ: string; role: 'retenue' | 'ecartee'; valeur: number | null; confiance: 'confirmee' | null; reserve: string | null; motif: string | null; piece: string; page: number; extrait: string }
export interface PlanCerfaScan {
  scalaires: { cle: ChampScalaire['cle']; valeur: string }[];   // à écrire (accord sur une valeur)
  destinations: string[] | null;                                 // à écrire si accord ET non vide ; null sinon (rien écrit)
  journal: LigneJournalIA[];
}

const nombre = (s: string): number | null => { const n = Number(String(s).replace(',', '.').replace(/\s/g, '')); return Number.isFinite(n) ? n : null; };

/** Construit le plan : accords → valeurs à poser + lignes de journal (methode='ia' à l'écriture). Aucune I/O. */
export function planifierEcriture(champs: readonly ChampScalaire[], piece: string, destinationsPage: number, accordDest: AccordDestinations): PlanCerfaScan {
  const scalaires: PlanCerfaScan['scalaires'] = [];
  const journal: LigneJournalIA[] = [];

  for (const c of champs) {
    const a = c.accord;
    if (a.statut === 'ecrire') {
      const num = c.numerique ? nombre(a.valeur) : null;
      // Un champ numérique dont la valeur n'est pas un nombre lisible → on n'écrit pas (désaccord de forme), on journalise.
      if (c.numerique && num === null) { journal.push({ champ: c.colonne, role: 'ecartee', valeur: null, confiance: null, reserve: null, motif: `valeur non numérique « ${a.valeur} » — non écrite`, piece, page: c.page, extrait: `OCR/vision « ${a.valeur} »` }); continue; }
      scalaires.push({ cle: c.cle, valeur: a.valeur });
      journal.push({ champ: c.colonne, role: 'retenue', valeur: num, confiance: 'confirmee', reserve: null, motif: null, piece, page: c.page, extrait: `accord OCR + vision : ${c.numerique ? a.valeur : `« ${a.valeur} »`}` });
    } else if (a.statut === 'desaccord') {
      journal.push({ champ: c.colonne, role: 'ecartee', valeur: null, confiance: null, reserve: null, motif: a.motif, piece, page: c.page, extrait: `lecture OCR: ${resume(a.ocr)}` });
      journal.push({ champ: c.colonne, role: 'ecartee', valeur: null, confiance: null, reserve: null, motif: a.motif, piece, page: c.page, extrait: `lecture vision: ${resume(a.vision)}` });
    } else { // vide | illisible → abstention motivée (rien écrit)
      journal.push({ champ: c.colonne, role: 'ecartee', valeur: null, confiance: null, reserve: null, motif: a.motif, piece, page: c.page, extrait: `OCR: ${resume(a.ocr)} · vision: ${resume(a.vision)}` });
    }
  }

  // Destinations
  let destinations: string[] | null = null;
  if (accordDest.statut === 'ecrire') {
    destinations = accordDest.retenues;
    for (const p of accordDest.provenances) {
      // PROVENANCE HONNÊTE : « surface déclarée en W2 », JAMAIS « case cochée ».
      journal.push({ champ: 'destinations', role: 'retenue', valeur: null, confiance: 'confirmee', reserve: null, motif: null, piece, page: destinationsPage, extrait: `${p.sousDestination} — surface déclarée en W2 = ${p.valeur} (accord OCR + vision)` });
    }
  } else if (accordDest.statut === 'desaccord') {
    journal.push({ champ: 'destinations', role: 'ecartee', valeur: null, confiance: null, reserve: null, motif: accordDest.motif, piece, page: destinationsPage, extrait: `OCR déclare : ${accordDest.ocrRetenues.join(', ') || '(aucune)'}` });
    journal.push({ champ: 'destinations', role: 'ecartee', valeur: null, confiance: null, reserve: null, motif: accordDest.motif, piece, page: destinationsPage, extrait: `vision déclare : ${accordDest.visionRetenues.join(', ') || '(aucune)'}` });
  } else {
    journal.push({ champ: 'destinations', role: 'ecartee', valeur: null, confiance: null, reserve: null, motif: accordDest.motif, piece, page: destinationsPage, extrait: 'aucune surface déclarée (les deux lectures)' });
  }

  return { scalaires, destinations, journal };
}
