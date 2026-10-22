/**
 * ══ LOCATION — « OUTILS DE SUIVI » : LECTURE DU SUIVI MENSUEL D'ARNO (CA_JBP_2026.xlsx) (Arno, 22/10/2026) ═══════════════════
 *
 * Un onglet par mois (« Janv », « Fév », … « Sept »), une ligne par bail : A propriétaire, B honoraires propriétaire HT,
 * C locataire, D honoraires locataire HT, E = B + D (CA HT), F prime de nouvelle gestion, G apporteur d'affaires, H commission
 * de l'apporteur (souvent `=E8*10%`). En bas : « TOTAL CA HT », « TOTAL CA HT - APPORTEURS », « COMS JB Brut »
 * (`=C19*15%+F18`, parfois `-F24` : une rétrocession nommée en F23), puis la « VENTILATION » : « Location avec Gestion »
 * (`=E3+E5+…`) et « Location sans Gestion ».
 *
 * PUR : le classeur arrive déjà lu (`ClasseurLu` : valeur ou résultat de formule, et la formule), sans dépendre d'exceljs —
 * le script d'import l'adapte, les tests passent une copie anonymisée. Rien n'est arrondi : les montants sont ceux du fichier.
 * Ce que le fichier a d'étrange est DIT (`anomalies`), jamais corrigé en silence.
 */

export interface CelluleLue { v: number | string | null; f?: string }
export interface FeuilleLue { nom: string; cellules: Record<string, CelluleLue> }
export interface ClasseurLu { feuilles: FeuilleLue[] }

export interface LigneExcel {
  /** Clé stable de la ligne : « AAAA-MM#rang » (le rang de la ligne dans l'onglet). */
  cle: string;
  mois: string;
  rang: number;
  proprietaire: string;
  locataire: string;
  honoProprietaireHt: number;
  honoLocataireHt: number;
  /** La colonne E du fichier (CA HT de la ligne), telle que calculée par le fichier. */
  caFichier: number;
  prime: number;
  apporteurTexte: string | null;
  commission: number;
  /** Le taux lu dans la formule de la commission (`=E8*10%` → 0,1) ; null si saisie à la main ou absente. */
  tauxCommission: number | null;
  avenant: boolean;
  parking: boolean;
  /** D'après la ventilation du bas de l'onglet ; null si la ligne n'y figure ni « avec » ni « sans ». */
  avecGestion: boolean | null;
}

export interface TotauxExcel {
  caHt: number;
  primes: number;
  apporteurs: number;
  caNet: number;
  commissionBrute: number;
  tauxNegociateur: number | null;
  retrocession: { libelle: string; montant: number } | null;
  ventilationAvec: number | null;
  ventilationSans: number | null;
}

export interface MoisExcel {
  mois: string;
  nomFeuille: string;
  negociateur: string;
  lignes: LigneExcel[];
  totaux: TotauxExcel;
  anomalies: string[];
}

const sansAccents = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (t: string): string => sansAccents(t).toLowerCase().replace(/\s+/g, ' ').trim();

const MOIS: [RegExp, number][] = [
  [/^janv/, 1], [/^fev/, 2], [/^mars/, 3], [/^avr/, 4], [/^mai/, 5], [/^juin/, 6], [/^juil/, 7], [/^aou/, 8], [/^sep/, 9], [/^oct/, 10], [/^nov/, 11], [/^dec/, 12],
];
/** « Janv » → 1, « Avril  » → 4, « Aout » → 8 ; null si l'onglet n'est pas un mois. */
export function numeroMois(nomFeuille: string): number | null {
  const n = norm(nomFeuille);
  for (const [re, m] of MOIS) if (re.test(n)) return m;
  return null;
}

const texte = (c: CelluleLue | undefined): string => (c === undefined || c.v === null ? '' : String(c.v).trim());
const nombre = (c: CelluleLue | undefined): number | null => {
  if (c === undefined || c.v === null || c.v === '') return null;
  if (typeof c.v === 'number') return Number.isFinite(c.v) ? c.v : null;
  const t = c.v.replace(/\s/g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
};
/** Les lignes citées par une formule pour une colonne : `E3+E5` → [3, 5] ; `SUM(E3:E6)` → [3, 4, 5, 6]. */
const lignesDe = (formule: string | undefined, colonne: string): number[] => {
  if (formule === undefined) return [];
  const plages = [...formule.matchAll(new RegExp(`\\b${colonne}(\\d+):${colonne}(\\d+)\\b`, 'g'))]
    .flatMap((m) => Array.from({ length: Math.max(0, Number(m[2]) - Number(m[1]) + 1) }, (_, i) => Number(m[1]) + i));
  const seules = [...formule.replace(new RegExp(`\\b${colonne}\\d+:${colonne}\\d+\\b`, 'g'), '').matchAll(new RegExp(`\\b${colonne}(\\d+)\\b`, 'g'))].map((m) => Number(m[1]));
  return [...plages, ...seules];
};
/** `E8*10%` → 0,1 ; `C19*15%+F18` → 0,15. */
const tauxDeFormule = (formule: string | undefined): number | null => {
  const m = formule?.match(/\*\s*(\d+(?:[.,]\d+)?)\s*%/);
  return m ? Number(m[1].replace(',', '.')) / 100 : null;
};
const euros = (x: number): string => `${x.toFixed(2).replace('.', ',')} €`;

/** Lit UN onglet de mois. `annee` : l'année du fichier (2026 pour CA_JBP_2026). */
export function lireFeuille(f: FeuilleLue, annee: number): MoisExcel | null {
  const m = numeroMois(f.nom);
  if (m === null) return null;
  const mois = `${annee}-${String(m).padStart(2, '0')}`;
  const c = (adresse: string): CelluleLue | undefined => f.cellules[adresse];
  const rangs = [...new Set(Object.keys(f.cellules).map((a) => Number(a.replace(/^[A-Z]+/, ''))))].sort((a, b) => a - b);
  const rangOu = (re: RegExp): number | null => rangs.find((r) => re.test(norm(texte(c(`A${r}`))))) ?? null;
  const anomalies: string[] = [];
  const rTotal = rangOu(/^total ca ht$/);
  if (rTotal === null) return { mois, nomFeuille: f.nom, negociateur: texte(c('A1')), lignes: [], totaux: VIDES, anomalies: ['Ligne « TOTAL CA HT » introuvable : onglet ignoré.'] };
  const rAvec = rangOu(/^location avec gestion/);
  const rSans = rangOu(/^location sans gestion/);
  const avec = new Set(rAvec === null ? [] : lignesDe(c(`B${rAvec}`)?.f, 'E'));
  const sans = new Set(rSans === null ? [] : lignesDe(c(`B${rSans}`)?.f, 'E'));

  const lignes: LigneExcel[] = [];
  for (const r of rangs.filter((x) => x >= 3 && x < rTotal)) {
    const proprietaire = texte(c(`A${r}`));
    const locataire = texte(c(`C${r}`));
    if (proprietaire === '' && locataire === '') continue;
    const hp = nombre(c(`B${r}`)) ?? 0;
    const hl = nombre(c(`D${r}`)) ?? 0;
    const e = nombre(c(`E${r}`));
    const caFichier = e ?? hp + hl;
    const refsE = c(`E${r}`)?.f;
    if (refsE !== undefined && /[A-D]\d+/.test(refsE) && [...refsE.matchAll(/[A-D](\d+)/g)].some((x) => Number(x[1]) !== r)) {
      anomalies.push(`Ligne ${r} (${proprietaire}) : la formule du CA (=${refsE}) lit une autre ligne${Math.abs(caFichier - (hp + hl)) < 0.005 ? ' — même montant, sans effet' : ` — ${euros(caFichier)} au lieu de ${euros(hp + hl)}`}.`);
    } else if (Math.abs(caFichier - (hp + hl)) >= 0.005) {
      anomalies.push(`Ligne ${r} (${proprietaire}) : CA ${euros(caFichier)} ≠ honoraires ${euros(hp)} + ${euros(hl)}.`);
    }
    const h = c(`H${r}`);
    const apporteurTexte = texte(c(`G${r}`)) || null;
    const commission = nombre(h) ?? 0;
    const tauxCommission = tauxDeFormule(h?.f);
    if (commission > 0 && apporteurTexte === null) anomalies.push(`Ligne ${r} (${proprietaire}) : commission d’apporteur (${euros(commission)}) sans apporteur nommé.`);
    if (commission > 0 && h?.f === undefined) anomalies.push(`Ligne ${r} (${proprietaire}) : commission d’apporteur saisie à la main (${euros(commission)}, sans formule).`);
    const prime = nombre(c(`F${r}`)) ?? 0;
    if (prime !== 0 && prime !== 150 && prime !== 15) anomalies.push(`Ligne ${r} (${proprietaire}) : prime de nouvelle gestion de ${euros(prime)} (ni 150 ni 15).`);
    const avecGestion = avec.has(r) ? true : sans.has(r) ? false : null;
    lignes.push({
      cle: `${mois}#${r}`, mois, rang: r, proprietaire, locataire, honoProprietaireHt: hp, honoLocataireHt: hl, caFichier, prime,
      apporteurTexte, commission, tauxCommission, avenant: /\(avenant\)/i.test(proprietaire),
      parking: /\b(parking|park|box)\b/i.test(sansAccents(proprietaire)), avecGestion,
    });
  }
  const sansVentilation = lignes.filter((l) => l.avecGestion === null && l.caFichier !== 0);
  if (sansVentilation.length > 0) {
    anomalies.push(`Ventilation incomplète : ${sansVentilation.length} ligne(s) ni « avec » ni « sans » gestion (${sansVentilation.map((l) => `ligne ${l.rang}`).join(', ')}).`);
  }
  const cTotal = c(`C${rTotal + 2}`);
  // `=C19*15%+F18-F24` : la rétrocession est en F24, son nom au-dessus (F23).
  const mRetro = cTotal?.f?.match(/-\s*F(\d+)/);
  const retro = mRetro ? { libelle: texte(c(`F${Number(mRetro[1]) - 1}`)) || 'Rétrocession', montant: nombre(c(`F${mRetro[1]}`)) ?? 0 } : null;
  const totaux: TotauxExcel = {
    caHt: nombre(c(`B${rTotal}`)) ?? 0,
    primes: nombre(c(`F${rTotal}`)) ?? 0,
    apporteurs: nombre(c(`H${rTotal}`)) ?? 0,
    caNet: nombre(c(`C${rTotal + 1}`)) ?? 0,
    commissionBrute: nombre(cTotal) ?? 0,
    tauxNegociateur: tauxDeFormule(cTotal?.f),
    retrocession: retro,
    ventilationAvec: rAvec === null ? null : nombre(c(`B${rAvec}`)) ?? 0,
    ventilationSans: rSans === null ? null : nombre(c(`B${rSans}`)) ?? 0,
  };
  if (totaux.ventilationAvec !== null && totaux.ventilationSans !== null && Math.abs(totaux.ventilationAvec + totaux.ventilationSans - totaux.caHt) >= 0.005) {
    anomalies.push(`Ventilation : avec ${euros(totaux.ventilationAvec)} + sans ${euros(totaux.ventilationSans)} = ${euros(totaux.ventilationAvec + totaux.ventilationSans)}, pour un CA de ${euros(totaux.caHt)}.`);
  }
  return { mois, nomFeuille: f.nom, negociateur: texte(c('A1')), lignes, totaux, anomalies };
}

const VIDES: TotauxExcel = { caHt: 0, primes: 0, apporteurs: 0, caNet: 0, commissionBrute: 0, tauxNegociateur: null, retrocession: null, ventilationAvec: null, ventilationSans: null };

/** Lit tout le classeur : les onglets de mois, dans l'ordre du calendrier. */
export function lireClasseur(classeur: ClasseurLu, annee: number): MoisExcel[] {
  return classeur.feuilles.map((f) => lireFeuille(f, annee)).filter((x): x is MoisExcel => x !== null).sort((a, b) => a.mois.localeCompare(b.mois));
}
