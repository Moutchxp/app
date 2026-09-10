/**
 * CR-2b1 — SÉLECTION RGPD des pages du Cerfa à transmettre à l'IA vision. PUR (aucune I/O), testable. PRINCIPE NON NÉGOCIABLE
 * (cadre Arno) : l'ABSTENTION est le défaut. Une page ne part QUE si elle est POSITIVEMENT une cible utile ET NÉGATIVEMENT sans
 * identité. Au moindre doute : elle ne part pas. Perdre une page = une valeur manquante ; envoyer une page d'identité = un incident.
 * Ces deux erreurs ne se valent pas.
 *
 * ⚠️ Ne s'applique PAS via `PAGES_UTILES_CERFA` (liste FIXE calibrée sur le 13409*15 de 24 pages) : sur un récapitulatif télé-service
 * la pagination varie et cette liste enverrait de mauvaises pages. Ici la sélection est PAR CONTENU, RGPD-sûre quel que soit le format.
 *
 * Mesure du 468 (pdfjs) qui justifie d'inclure l'email dans les marqueurs d'identité : seulement 3 pages/42 portent un email, tous
 * DISTINCTS et LOCALISÉS (demandeur, architecte, mention RGPD) — PAS un pied de page récurrent. Donc l'email ne sur-refuse pas.
 */

/** Marqueurs d'IDENTITÉ d'une personne (liste EXPLICITE, commentée, extensible). Conservateur : un seul suffit à refuser la page. */
const MARQUEURS_IDENTITE: { nom: string; re: RegExp }[] = [
  { nom: 'courriel', re: /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i },
  { nom: 'naissance', re: /n[ée]e?\s+le\b|date\s+de\s+naissance/i },
  { nom: 'téléphone', re: /t[ée]l[ée]phone|\bportable\s*:|\b0(?:\s?\d){9}\b/i }, // « 0 1 4 3 … » aplati inclus
  { nom: 'nom/prénom', re: /\bnom\s*(?:de\s+naissance)?\s*:|\bpr[ée]noms?\s*:/i }, // « \bnom\b » ne matche pas « Nombre »
  { nom: 'SIRET', re: /\bsiret\b|\b(?:\d\s?){14}\b/i },                          // 14 chiffres, éventuellement espacés
  { nom: 'ordre des architectes', re: /ordre\s+des\s+architectes|n[°o]\s*d['’]ordre|inscrit.{0,15}ordre/i },
  { nom: 'signature', re: /\bsignatures?\b|je\s+certifie\s+exacts?/i },
  { nom: 'domicile', re: /\bdemeurant\b|domicili[ée]/i },
];

/** CIBLES utiles (ce que l'IA doit lire) : les cases « nature du projet » et le champ libre « courte description ». */
const RE_CIBLE_NATURE = /nature\s+du\s+projet|nouvelle\s+construction|travaux\s+sur\s+(?:une\s+)?construction\s+existante/i;
const RE_CIBLE_DESCRIPTION = /courte\s+description\s+de\s+votre\s+projet/i;

/** Plafond DUR de pages transmises par dossier (jamais un dossier entier). */
export const MAX_PAGES_IA = 6;

export interface DetectionIdentite { identite: boolean; marqueurs: string[] }

/** Détecteur d'identité PUR — sur le texte pdfjs LOCAL d'une page (rien ne sort de la machine à ce stade). */
export function estPageIdentite(texte: string): DetectionIdentite {
  const t = (texte ?? '').replace(/\s+/g, ' ');
  const marqueurs = MARQUEURS_IDENTITE.filter((m) => m.re.test(t)).map((m) => m.nom);
  return { identite: marqueurs.length > 0, marqueurs };
}

export interface CiblePage { nature: boolean; description: boolean }
export function cibleDePage(texte: string): CiblePage {
  const t = (texte ?? '').replace(/\s+/g, ' ');
  return { nature: RE_CIBLE_NATURE.test(t), description: RE_CIBLE_DESCRIPTION.test(t) };
}

export interface PageTexteIa { page: number; texte: string }
export interface PageEnvoyee { page: number; cibles: string[] }
export interface PageRefusee { page: number; motif: string }
export interface SelectionIa { envoyees: PageEnvoyee[]; refusees: PageRefusee[] }

/**
 * Sélectionne, page par page, celles à transmettre. Une page part SSI elle porte une cible ET n'a AUCUN marqueur d'identité.
 * Plafond dur `MAX_PAGES_IA` : au-delà, on garde les MIEUX NOTÉES (score = nb de cibles) et on journalise les évincées. Toute page
 * refusée porte SON MOTIF (identité + marqueurs, ou « aucune cible utile », ou « plafond »). Aucune cible nulle part → sélection vide
 * (abstention totale).
 */
export function selectionnerPagesIa(pages: readonly PageTexteIa[], opts: { maxPages?: number } = {}): SelectionIa {
  const maxPages = opts.maxPages ?? MAX_PAGES_IA;
  const refusees: PageRefusee[] = [];
  const candidates: { page: number; cibles: string[]; score: number }[] = [];

  for (const p of pages) {
    const cible = cibleDePage(p.texte);
    const cibles = [cible.nature ? 'nature' : '', cible.description ? 'description' : ''].filter(Boolean);
    if (cibles.length === 0) { refusees.push({ page: p.page, motif: 'aucune cible utile (ni nature ni description)' }); continue; }
    const id = estPageIdentite(p.texte);
    if (id.identite) { refusees.push({ page: p.page, motif: `identité présente (${id.marqueurs.join(', ')}) — jamais transmise` }); continue; }
    candidates.push({ page: p.page, cibles, score: cibles.length });
  }

  // Plafond : trie par score décroissant puis page croissante, garde les N premières, journalise les évincées.
  candidates.sort((a, b) => (b.score - a.score) || (a.page - b.page));
  const gardees = candidates.slice(0, maxPages);
  for (const c of candidates.slice(maxPages)) refusees.push({ page: c.page, motif: `plafond de ${maxPages} pages atteint (page utile mais évincée)` });

  const envoyees = gardees.map((c) => ({ page: c.page, cibles: c.cibles })).sort((a, b) => a.page - b.page);
  refusees.sort((a, b) => a.page - b.page);
  return { envoyees, refusees };
}

/**
 * FORME PERSISTABLE du JOURNAL DE TRANSMISSION (cadre Arno, point B) — la preuve de ce qui est sorti (ou non) de la machine vers un
 * tiers. CR-2b1 la STOCKERA telle quelle avec la lecture IA (une entrée par pièce ; le dossier et la DATE sont portés par la table).
 * Sérialisable jsonb, lisible sans lire le code. Ce lot-ci ne stocke rien : il ne fait que FIXER la forme.
 */
export interface JournalTransmissionPiece {
  pieceId: number;                 // id dossier_document de la pièce Cerfa
  pieceNom: string;                // nom du fichier (audit lisible)
  envoyees: PageEnvoyee[];         // pages transmises à l'IA, avec leur(s) cible(s)
  refusees: PageRefusee[];         // pages écartées, chacune AVEC son motif (identité / aucune cible / plafond)
}

/** Construit l'entrée de journal d'une pièce à partir de sa sélection. */
export function journalTransmission(pieceId: number, pieceNom: string, selection: SelectionIa): JournalTransmissionPiece {
  return { pieceId, pieceNom, envoyees: selection.envoyees, refusees: selection.refusees };
}
