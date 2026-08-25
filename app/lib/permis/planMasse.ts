/**
 * PROJ-3d — DÉTECTION « plan de masse » pour le sélecteur du tracé d'emprise. PUR, aucune I/O. Deux niveaux :
 *  · ① SCORE PAR NOM (instantané, 0 I/O) : nomenclature réglementaire R.431-9 (PC2 = « plan de masse ») + forme « plan de masse »
 *      tolérante aux séparateurs, bonus « projet » > « existant » (on projette le FUTUR bâtiment, pas l'existant). Tri primaire.
 *  · ② CONFIRMATION PAR TEXTE (appliquée SEULEMENT à la shortlist, côté serveur) : « plan de masse » dans le texte d'une page →
 *      numéro de page proposé ; lecture d'échelle INDICATIVE, gardée contre les faux positifs (mesuré : « 1/15 » = n° de page,
 *      « 1:46 » = légende).
 * 🔴 Ne concerne QUE la sélection d'une page à AFFICHER : aucun couplage moteur / verdict / injection d'altitude.
 */

/** Normalise pour la détection : minuscules, accents retirés, séparateurs (_ - espaces multiples) réduits à un espace. */
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const MASSE = /plan\s+(de\s+)?masse/;   // « plan de masse » / « plan masse » (séparateurs déjà normalisés en espaces)
const PC2 = /\bpc\s*2(\.\d+)*\b/;       // code PC2 (R.431-9 = plan de masse). PC20 / PC39 / PC40 NON concernés (frontière de mot).

/**
 * Score « plan de masse » d'un nom de fichier (0 = pas un plan de masse). +100 si la forme « plan de masse », +80 si le code PC2 ;
 * puis, seulement si l'un des deux a matché : +15 « projet » (le futur bâtiment) OU −5 « existant ». PUR.
 */
export function scoreNomPlanMasse(nomFichier: string): number {
  const n = norm(nomFichier);
  let s = 0;
  if (MASSE.test(n)) s += 100;
  if (PC2.test(n)) s += 80;
  if (s === 0) return 0;                       // ni la forme, ni le code → pas un plan de masse
  if (/\bprojet\b/.test(n)) s += 15;           // on projette le FUTUR
  else if (/\bexistant\b/.test(n)) s -= 5;     // l'existant passe après
  return s;
}

export interface PieceScorable { id: number; nomFichier: string; typeMime: string | null }

/**
 * Sépare les pièces en « proposées » (score > 0, triées par score DÉCROISSANT puis ordre d'origine) et « autres » (ordre d'origine
 * conservé). REPLI GARANTI : aucune pièce n'est retirée — « autres » contient tout le reste, toujours atteignable. PUR.
 */
export function classerPiecesPlanMasse<T extends PieceScorable>(pieces: T[]): { proposees: T[]; autres: T[] } {
  const avecScore = pieces.map((p, i) => ({ p, i, s: scoreNomPlanMasse(p.nomFichier) }));
  const proposees = avecScore.filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.p);
  const autres = avecScore.filter((x) => x.s === 0).map((x) => x.p);
  return { proposees, autres };
}

/** Le texte d'une page mentionne-t-il « plan de masse » ? (accents / séparateurs normalisés). PUR. */
export function texteEstPlanMasse(texte: string): boolean {
  return MASSE.test(norm(texte));
}

/** Première page (1-based) dont le texte est un plan de masse, sinon null. PUR. */
export function pagePlanMasse(pagesTexte: string[]): number | null {
  const i = pagesTexte.findIndex((t) => texteEstPlanMasse(t));
  return i === -1 ? null : i + 1;
}

/**
 * Échelle INDICATIVE lue sur le texte d'une page, ou null (jamais une valeur inventée). Gardes ANTI-FAUX-POSITIFS mesurés :
 *  · dénominateur borné [50 ; 2000] → écarte « 1:46 » (légende) ;
 *  · la forme « 1/N » n'est acceptée QUE si la page mentionne « éch »/« échelle » → écarte « 1/15 » (numéro de page) ;
 *  · la forme « 1:N » (deux-points) est acceptée seule (peu ambiguë).
 * Renvoie « 1:1000 » normalisé. L'échelle NE sert PAS à classer (tous les plans en ont une) — purement indicative. PUR.
 */
export function lireEchelleTexte(texte: string): string | null {
  const t = norm(texte);
  const dansPlage = (d: number) => d >= 50 && d <= 2000;
  for (const m of t.matchAll(/1\s*:\s*(\d{2,4})/g)) { const d = Number(m[1]); if (dansPlage(d)) return `1:${d}`; }
  if (/\bech(elle)?\b/.test(t)) for (const m of t.matchAll(/1\s*\/\s*(\d{2,4})/g)) { const d = Number(m[1]); if (dansPlage(d)) return `1:${d}`; }
  return null;
}
