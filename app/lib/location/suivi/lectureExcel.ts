/**
 * ══ LOCATION — « OUTILS DE SUIVI » : LECTURE DU SUIVI MENSUEL D'ARNO (CA_JBP_2026.xlsx) (Arno, 22/10/2026) ═══════════════════
 *
 * Un onglet par mois (« Janv », « Fév », … « Sept »), une ligne par bail : A propriétaire, B honoraires propriétaire HT,
 * C locataire, D honoraires locataire HT, E = B + D (CA HT), F prime de nouvelle gestion, G apporteur d'affaires, H commission
 * de l'apporteur (souvent `=E8*10%`). En bas : « TOTAL CA HT », « TOTAL CA HT - APPORTEURS », « COMS JB Brut »
 * (`=C19*15%+F18`, parfois `-F24` : une rétrocession nommée en F23), puis la « VENTILATION » : « Location avec Gestion »
 * (`=E3+E5+…`) et « Location sans Gestion ».
 *
 * 🔴 L'HISTORIQUE 2019 → 2025 (Arno, 23/10/2026) — le même suivi, mais le modèle a bougé au fil des ans ; tout est lu,
 * rien n'est deviné :
 *   · l'ANNÉE vient du NOM DE L'ONGLET quand il la porte (« Nov 19 » → 2019, dans le fichier 2020), sinon du fichier ;
 *   · les COLONNES se repèrent par l'EN-TÊTE (« PROPRIETAIRES », « TOTAL CA HT », « GESTION », « APPORTEURS D'AFFAIRES »,
 *     « COMS… APPORTEURS », « GESTION PERDU », « Loyers cc ») — l'ancien modèle (2019 → mai 2020) n'a ni CA ni commission et
 *     met la prime en E ; sans en-tête, la position du modèle (A, B, C, D, E, F, G, H, J, K) et les données dès la ligne 2 ;
 *   · le BAS DE FEUILLE se lit par ses libellés et sa FORMULE : « COMS JB Brut » = base × taux + primes − rétrocession, la
 *     base étant le CA (ancien modèle, 12,5 %), le CA net d'apporteurs, ou un CA net dont le fichier retire une ligne
 *     (`=C15-E8`, mars 2022 : « hors commission ») ;
 *   · un SECOND NÉGOCIATEUR dans le même onglet (bloc « Mélanie », colonnes K → R, sept.-oct. 2023) est lu à part et
 *     SIGNALÉ, jamais mêlé aux lignes de Jean-Baptiste ;
 *   · un onglet qui n'est pas un mois (« Feuil1 », « Feuil2 ») est signalé avec ce qu'il contient, jamais rattaché.
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

/** Une ligne « GESTION PERDU » (2025) : le propriétaire parti, ses loyers, le commentaire — sur la même ligne qu'un bail. */
export interface GestionPerdueExcel { mois: string; rang: number; proprietaire: string; loyersCc: number | null; commentaire: string }

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
  /** Lignes que la formule de commission RETIRE de sa base (`=C15-E8`) : comptées au CA, sans commission du négociateur. */
  horsCommission?: { rang: number; montant: number }[];
  /** TOUTES les rétrocessions de la formule (`-F36-F46`, août 2025) ; `retrocession` = la première (compatibilité). */
  retrocessions?: { libelle: string; montant: number }[];
  /**
   * Les ÉCARTS EXPLIQUÉS entre les totaux du fichier et ses lignes — une formule de total qui oublie des lignes (`SUM(H2:H9)`
   * sur 16 lignes), une commission de VENTE ajoutée à la commission de location (`+D31`). L'outil compte chaque ligne et la
   * location seule : il doit tomber sur « fichier + écart », au centime, et chaque écart est dit.
   */
  ecarts?: EcartExplique[];
}

export interface EcartExplique { libelle: string; ca: number; apporteurs: number; primes: number; commission: number }

export interface MoisExcel {
  mois: string;
  nomFeuille: string;
  negociateur: string;
  lignes: LigneExcel[];
  totaux: TotauxExcel;
  anomalies: string[];
  gestionsPerdues?: GestionPerdueExcel[];
  /** Un second négociateur dans l'onglet (bloc à droite) : lu, signalé, jamais importé avec les lignes du fichier. */
  autreBloc?: { negociateur: string; lignes: LigneExcel[]; caHt: number; commissionBrute: number; tauxNegociateur: number | null } | null;
}

/** Un onglet qui n'est pas un mois : ce qu'il contient, pour le dire. */
export interface FeuilleIgnoree { nom: string; lignes: number; caHt: number; apercu: string[] }

const sansAccents = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (t: string): string => sansAccents(t).toLowerCase().replace(/\s+/g, ' ').trim();

const MOIS: [RegExp, number][] = [
  [/^janv?/, 1], [/^fev/, 2], [/^mars?\b/, 3], [/^avr/, 4], [/^mai/, 5], [/^juin/, 6], [/^juil/, 7], [/^aou/, 8], [/^sep/, 9], [/^oct/, 10], [/^nov/, 11], [/^dec/, 12],
];
/** « Janv » → 1, « Avril  » → 4, « Aout » → 8, « Mar 23 » → 3 ; null si l'onglet n'est pas un mois. */
export function numeroMois(nomFeuille: string): number | null {
  const n = norm(nomFeuille);
  for (const [re, m] of MOIS) if (re.test(n)) return m;
  return null;
}

/** L'année d'un onglet : celle de son NOM (« Nov 19 » → 2019, « Juill 2023 » → 2023), sinon celle du fichier. */
export function anneeDeFeuille(nomFeuille: string, anneeFichier: number): number {
  const m = norm(nomFeuille).match(/(?:^|[^\d])(\d{2}|\d{4})$/);
  if (m === null) return anneeFichier;
  const a = Number(m[1]);
  return a < 100 ? 2000 + a : a;
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
/** `E8*10%` → 0,1 ; `C19*15%+F18` → 0,15 ; `B13*12.5%+E14` → 0,125. */
const tauxDeFormule = (formule: string | undefined): number | null => {
  const m = formule?.match(/\*\s*(\d+(?:[.,]\d+)?)\s*%/);
  return m ? Number(m[1].replace(',', '.')) / 100 : null;
};
const euros = (x: number): string => `${x.toFixed(2).replace('.', ',')} €`;
/** Toutes les cellules qu'une formule cite (`SUM(E3:E6)+B2` → E3, E4, E5, E6, B2 ; `Décembre!E6` → E6). PUR. */
const refsDe = (formule: string): Set<string> => {
  const out = new Set<string>();
  const sansPlages = formule.replace(/\b([A-Z])(\d+):([A-Z])(\d+)\b/g, (_, a: string, x: string, b: string, y: string) => {
    for (let k = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(a); k <= 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(b); k += 1) for (let r = Number(x); r <= Number(y); r += 1) out.add(`${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[k]}${r}`);
    return ' ';
  });
  for (const m of sansPlages.matchAll(/\b([A-Z])(\d+)\b/g)) out.add(`${m[1]}${m[2]}`);
  return out;
};
const LETTRES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const colonneDe = (adresse: string): string => adresse.replace(/\d+$/, '');
const decaler = (col: string, n: number): string => LETTRES[LETTRES.indexOf(col) + n] ?? col;

/** Les colonnes d'un bloc (un négociateur) : repérées par l'en-tête, sinon la position du modèle. */
interface Colonnes {
  prop: string; hp: string; loc: string; hl: string; ca: string | null; prime: string; apporteur: string | null; commission: string | null;
  perdu: string | null; loyers: string | null; commentaire: string | null;
}
const POSITION_MODELE: Colonnes = { prop: 'A', hp: 'B', loc: 'C', hl: 'D', ca: 'E', prime: 'F', apporteur: 'G', commission: 'H', perdu: 'J', loyers: 'K', commentaire: 'L' };

/** Les blocs d'en-tête d'une ligne : chaque « PROPRIETAIRES PROPRIETAIRES LOCATAIRES LOCATAIRES … » ouvre un bloc. PUR. */
function blocsEnTete(cellules: Record<string, CelluleLue>, rang: number): Colonnes[] {
  const enTete = Object.keys(cellules).filter((a) => Number(a.replace(/^[A-Z]+/, '')) === rang && /^[A-Z]$/.test(colonneDe(a)))
    .map((a) => ({ col: colonneDe(a), t: norm(texte(cellules[a])) })).sort((a, b) => LETTRES.indexOf(a.col) - LETTRES.indexOf(b.col));
  const debuts = enTete.filter((x, i) => /^proprietaires?$/.test(x.t) && !(i > 0 && /^proprietaires?$/.test(enTete[i - 1].t) && LETTRES.indexOf(enTete[i - 1].col) === LETTRES.indexOf(x.col) - 1));
  return debuts.map((d, k) => {
    const fin = k + 1 < debuts.length ? LETTRES.indexOf(debuts[k + 1].col) : 99;
    const du = enTete.filter((x) => LETTRES.indexOf(x.col) >= LETTRES.indexOf(d.col) && LETTRES.indexOf(x.col) < fin);
    const premiere = (re: RegExp, n = 0): string | null => du.filter((x) => re.test(x.t))[n]?.col ?? null;
    return {
      prop: d.col, hp: premiere(/^proprietaires?$/, 1) ?? decaler(d.col, 1), loc: premiere(/^locataires?$/) ?? decaler(d.col, 2),
      hl: premiere(/^locataires?$/, 1) ?? decaler(d.col, 3), ca: premiere(/^total ca/), prime: premiere(/^gestion$/) ?? decaler(d.col, 4),
      apporteur: premiere(/apporteurs? d.?affaire/) , commission: premiere(/^com(s|mission|missions)\b/),
      perdu: premiere(/^gestion perdu/), loyers: premiere(/^loyers? cc/), commentaire: premiere(/^commentaire/),
    };
  });
}

/**
 * Les DÉCISIONS d'Arno sur un onglet (23/10/2026) : `mois` — un onglet qui n'est pas nommé comme un mois est lu comme ce
 * mois de l'année du fichier (« Feuil2 » de 2024 → décembre 2024) ; `fusionnerSecondBloc` — les lignes d'un second
 * négociateur sont importées avec celles du fichier (au taux de son négociateur), l'effet sur la commission étant dit.
 */
export interface OptionsLecture { mois?: number; fusionnerSecondBloc?: boolean }

/** Lit UN onglet de mois. `annee` : l'année du fichier (2026 pour CA_JBP_2026) — celle du nom de l'onglet l'emporte. */
export function lireFeuille(f: FeuilleLue, annee: number, o: OptionsLecture = {}): MoisExcel | null {
  const m = o.mois ?? numeroMois(f.nom);
  if (m === null) return null;
  const mois = `${o.mois === undefined ? anneeDeFeuille(f.nom, annee) : annee}-${String(m).padStart(2, '0')}`;
  const c = (adresse: string): CelluleLue | undefined => f.cellules[adresse];
  const rangs = [...new Set(Object.keys(f.cellules).map((a) => Number(a.replace(/^[A-Z]+/, ''))))].sort((a, b) => a - b);
  const rangOu = (re: RegExp, col = 'A'): number | null => rangs.find((r) => re.test(norm(texte(c(`${col}${r}`))))) ?? null;
  const anomalies: string[] = [];
  const rEnTete = rangs.filter((r) => r <= 3).find((r) => /^proprietaires?$/.test(norm(texte(c(`A${r}`))))) ?? null;
  const blocs = rEnTete === null ? [] : blocsEnTete(f.cellules, rEnTete);
  const col: Colonnes = blocs[0] ?? POSITION_MODELE;
  if (rEnTete === null) anomalies.push('En-tête absente : colonnes lues à la position du modèle (A → K), données dès la ligne 2.');
  const debut = rEnTete === null ? 2 : rEnTete + 1;
  // Les colonnes « GESTION PERDU » / « Loyers cc » peuvent avoir leur en-tête plus bas (2025 : sur la 1re ligne de données).
  for (const r of rangs.filter((x) => x <= debut + 1)) for (const lettre of LETTRES.slice(8, 16)) {
    const t = norm(texte(c(`${lettre}${r}`)));
    if (/^gestion perdu/.test(t) && col.perdu === null) col.perdu = lettre;
    if (/^loyers? cc/.test(t) && col.loyers === null) col.loyers = lettre;
    if (/^commentaire/.test(t) && col.commentaire === null) col.commentaire = lettre;
  }
  const rTotal = rangOu(/^total (ca )?ht$/);
  const negociateur = rEnTete !== null && rEnTete > 1 ? texte(c('A1')) : '';
  if (rTotal === null) return { mois, nomFeuille: f.nom, negociateur, lignes: [], totaux: VIDES, anomalies: ['Ligne « TOTAL CA HT » introuvable : onglet ignoré.'] };
  const rComs = rangOu(/^coms/);
  const rFin = Math.min(rTotal, rComs ?? rTotal);
  const rAvec = rangOu(/^location avec gestion/);
  const rSans = rangOu(/^location sans gestion/);
  const avecF = rAvec === null ? undefined : c(`B${rAvec}`)?.f;
  const sansF = rSans === null ? undefined : c(`B${rSans}`)?.f;
  const estEnTete = (t: string): boolean => /^(proprietaires?|locataires?|gestion perdu|loyers? cc|commentaires?)$/.test(norm(t));

  const lireLignes = (k: Colonnes, depuis: number, jusque: number, cleDe: (r: number) => string, notes: string[]): LigneExcel[] => {
    const out: LigneExcel[] = [];
    for (const r of rangs.filter((x) => x >= depuis && x < jusque)) {
      const proprietaire = texte(c(`${k.prop}${r}`));
      const locataire = texte(c(`${k.loc}${r}`));
      if (estEnTete(proprietaire)) continue;
      if (proprietaire === '' && locataire === '') {
        const argent = [k.hp, k.hl, k.prime, k.commission].some((x) => x !== null && (nombre(c(`${x}${r}`)) ?? 0) !== 0);
        if (!argent) continue;
        notes.push(`Ligne ${r} : des montants sans propriétaire ni locataire${k.apporteur !== null && texte(c(`${k.apporteur}${r}`)) ? ` (« ${texte(c(`${k.apporteur}${r}`))} »)` : ''} — lue telle quelle (comptée dans les totaux).`);
      }
      const hp = nombre(c(`${k.hp}${r}`)) ?? 0;
      const hl = nombre(c(`${k.hl}${r}`)) ?? 0;
      const e = k.ca === null ? null : nombre(c(`${k.ca}${r}`));
      const caFichier = e ?? hp + hl;
      const refsE = k.ca === null ? undefined : c(`${k.ca}${r}`)?.f;
      const [cHp, cHl] = [k.hp, k.hl];
      if (refsE !== undefined && new RegExp(`[${cHp}${cHl}]\\d+`).test(refsE) && [...refsE.matchAll(new RegExp(`[${cHp}${cHl}](\\d+)`, 'g'))].some((x) => Number(x[1]) !== r)) {
        notes.push(`Ligne ${r} (${proprietaire}) : la formule du CA (=${refsE}) lit une autre ligne${Math.abs(caFichier - (hp + hl)) < 0.005 ? ' — même montant, sans effet' : ` — ${euros(caFichier)} au lieu de ${euros(hp + hl)}`}.`);
      } else if (Math.abs(caFichier - (hp + hl)) >= 0.005) {
        notes.push(`Ligne ${r} (${proprietaire}) : CA ${euros(caFichier)} ≠ honoraires ${euros(hp)} + ${euros(hl)}${refsE === undefined && e !== null ? ' (CA saisi à la main)' : ''} — le CA du fichier est gardé.`);
      }
      const h = k.commission === null ? undefined : c(`${k.commission}${r}`);
      const apporteurTexte = (k.apporteur === null ? '' : texte(c(`${k.apporteur}${r}`))) || null;
      const commission = nombre(h) ?? 0;
      const tauxCommission = tauxDeFormule(h?.f);
      if (commission > 0 && apporteurTexte === null) notes.push(`Ligne ${r} (${proprietaire}) : commission d’apporteur (${euros(commission)}) sans apporteur nommé.`);
      if (commission > 0 && h?.f === undefined) notes.push(`Ligne ${r} (${proprietaire}) : commission d’apporteur saisie à la main (${euros(commission)}, sans formule).`);
      const prime = nombre(c(`${k.prime}${r}`)) ?? 0;
      if (prime !== 0 && prime !== 150 && prime !== 15) notes.push(`Ligne ${r} (${proprietaire}) : prime de nouvelle gestion de ${euros(prime)} (ni 150 ni 15).`);
      const caK = k.ca ?? 'E';
      const avecGestion = lignesDe(avecF, caK).includes(r) ? true : lignesDe(sansF, caK).includes(r) ? false : null;
      out.push({
        cle: cleDe(r), mois, rang: r, proprietaire, locataire, honoProprietaireHt: hp, honoLocataireHt: hl, caFichier, prime,
        apporteurTexte, commission, tauxCommission, avenant: /\(avenant\)/i.test(proprietaire),
        parking: /\b(parking|park|box)\b/i.test(sansAccents(proprietaire)), avecGestion,
      });
    }
    return out;
  };

  const lignes = lireLignes(col, debut, rFin, (r) => `${mois}#${r}`, anomalies);
  const sansVentilation = lignes.filter((l) => l.avecGestion === null && l.caFichier !== 0);
  if (rAvec !== null && sansVentilation.length > 0) {
    anomalies.push(`Ventilation incomplète : ${sansVentilation.length} ligne(s) ni « avec » ni « sans » gestion (${sansVentilation.map((l) => `ligne ${l.rang}`).join(', ')}).`);
  }

  // Le bas de feuille : CA, commission (sa formule dit la base, le taux, la cellule des primes, la rétrocession).
  const enLigne = (r: number, cols: string[]): CelluleLue | undefined => cols.map((x) => c(`${x}${r}`)).find((x) => nombre(x) !== null);
  const cTotal = enLigne(rTotal, ['B', 'C', 'D']);
  const cComs = rComs === null ? undefined : enLigne(rComs, ['C', 'D', 'B']);
  const fComs = cComs?.f;
  // Les termes de la formule après la base (`C19*15%`) : le 1er « + » = les primes ; un autre « + » = un ajout hors location
  // (commission de vente) ; chaque « − » = une rétrocession, nommée par le texte au-dessus dans sa colonne (« Alex Commissions »).
  const termes = fComs === undefined ? [] : [...fComs.replace(/^[^%]*%/, '').matchAll(/([+-])\s*(?:'?[^'!]*'?!)?([A-Z])(\d+)/g)].map((x) => ({ signe: x[1], col: x[2], rang: Number(x[3]) }));
  const nomAuDessus = (lettre: string, r: number): string => {
    for (let k = r - 1; k >= Math.max(1, r - 15); k -= 1) { const t = texte(c(`${lettre}${k}`)); if (t !== '' && nombre(c(`${lettre}${k}`)) === null && !/^total/i.test(t)) return t; }
    return '';
  };
  const retros = termes.filter((t) => t.signe === '-').map((t) => ({ libelle: nomAuDessus(t.col, t.rang) || 'Rétrocession', montant: nombre(c(`${t.col}${t.rang}`)) ?? 0 }));
  const retro = retros[0] ?? null;
  const tPrimes = termes.find((t) => t.signe === '+');
  const primes = tPrimes ? nombre(c(`${tPrimes.col}${tPrimes.rang}`)) ?? 0 : nombre(c(`${col.prime}${rTotal}`)) ?? 0;
  const ajouts = termes.filter((t) => t.signe === '+' && t !== tPrimes).map((t) => ({ rang: t.rang, libelle: texte(c(`A${t.rang}`)) || nomAuDessus(t.col, t.rang), montant: nombre(c(`${t.col}${t.rang}`)) ?? 0 }));
  const rNet = rangOu(/^total ca ht ?- ?apporteu/);
  const apporteurs = col.commission === null ? 0 : nombre(c(`${col.commission}${rTotal}`)) ?? 0;
  const caHt = nombre(cTotal) ?? 0;
  const caNet = rNet === null ? caHt - apporteurs : nombre(c(`C${rNet}`)) ?? 0;
  // La base de la commission retire-t-elle une ligne ? (`=D15*15%`, D15 = `C15-E8` → la ligne 8 est hors commission.)
  const mBase = fComs?.match(/^\s*([A-Z])(\d+)\s*\*/);
  const fBase = mBase ? c(`${mBase[1]}${mBase[2]}`)?.f : undefined;
  const horsCommission = fBase !== undefined && /-\s*[A-Z]\d+/.test(fBase) && !/^\s*B\d+\s*-\s*H\d+\s*$/.test(fBase)
    ? [...fBase.matchAll(/-\s*([A-Z])(\d+)/g)].filter((x) => x[1] === (col.ca ?? 'E')).map((x) => ({ rang: Number(x[2]), montant: nombre(c(`${x[1]}${x[2]}`)) ?? 0 }))
    : [];
  for (const h of horsCommission) {
    const l = lignes.find((x) => x.rang === h.rang);
    anomalies.push(`Ligne ${h.rang}${l ? ` (${l.proprietaire})` : ''} : la formule de commission la retire de sa base (=${fBase}) — ${euros(h.montant)} comptés au CA, sans commission du négociateur.`);
  }
  // Un second négociateur (bloc à droite) : lu à part.
  let autreBloc: MoisExcel['autreBloc'] = null;
  let blocFusionne: { ca: string; lignes: LigneExcel[]; nom: string; commission: number; taux: number | null } | null = null;
  if (blocs.length > 1) {
    const b = blocs[1];
    const notes: string[] = [];
    const nom = texte(c(`${b.prop}1`)) || 'second négociateur';
    const lignesB = lireLignes(b, debut, rFin, (r) => `${mois}#${b.prop}${r}`, notes);
    const rT = rangOu(/^total (ca )?ht$/, b.prop);
    const rC = rangOu(/^coms/, b.prop);
    const cC = rC === null ? undefined : enLigne(rC, [decaler(b.prop, 2), decaler(b.prop, 1), decaler(b.prop, 3)]);
    autreBloc = { negociateur: nom, lignes: lignesB, caHt: rT === null ? 0 : nombre(enLigne(rT, [decaler(b.prop, 1), decaler(b.prop, 2)])) ?? 0,
      commissionBrute: nombre(cC) ?? 0, tauxNegociateur: tauxDeFormule(cC?.f) };
    anomalies.push(o.fusionnerSecondBloc
      ? `Second négociateur dans l’onglet (« ${nom} », colonnes ${b.prop} → ${decaler(b.prop, 7)}) : ${lignesB.length} ligne(s), CA ${euros(autreBloc.caHt)} — IMPORTÉES avec les lignes de ce fichier (décision d’Arno, 23/10/2026), au taux de son négociateur.`
      : `Second négociateur dans l’onglet (« ${nom} », colonnes ${b.prop} → ${decaler(b.prop, 7)}) : ${lignesB.length} ligne(s), CA ${euros(autreBloc.caHt)} — lues, NON importées avec les lignes de ce fichier.`);
    if (o.fusionnerSecondBloc) { blocFusionne = { ca: b.ca ?? 'O', lignes: lignesB, nom, commission: autreBloc.commissionBrute, taux: autreBloc.tauxNegociateur }; }
  }
  // La ventilation : la somme des lignes QUE CE BLOC cite (un second négociateur peut s'y mêler : il est retiré et dit,
  // sauf quand ses lignes sont importées avec celles du fichier — elles comptent alors dans la ventilation).
  const ventilation = (r: number | null, formule: string | undefined): number | null => {
    if (r === null) return null;
    const total = nombre(c(`B${r}`)) ?? 0;
    const refs = lignesDe(formule, col.ca ?? 'E');
    const autres = formule === undefined ? [] : [...formule.matchAll(/\b([A-Z])(\d+)\b/g)].filter((x) => x[1] !== (col.ca ?? 'E') && x[1] !== blocFusionne?.ca);
    if (autres.length === 0) return total;
    const propre = refs.reduce((s, x) => s + (nombre(c(`${col.ca ?? 'E'}${x}`)) ?? 0), 0);
    anomalies.push(`Ventilation (ligne ${r}) : cite aussi ${autres.map((x) => `${x[1]}${x[2]}`).join(', ')} (hors des lignes de ${negociateur || 'ce négociateur'}) — ${euros(total)} dans le fichier, ${euros(propre)} pour ce bloc.`);
    return propre;
  };
  // Les écarts expliqués : une ligne que la formule d'un total ne cite pas (sa valeur manque au total du fichier), un ajout hors location.
  const taux = tauxDeFormule(fComs) ?? 0;
  const citees = (cel: CelluleLue | undefined): Set<string> | null => (cel?.f === undefined ? null : refsDe(cel.f));
  const ecarts: EcartExplique[] = [];
  const oubli = (cel: CelluleLue | undefined, quoi: 'ca' | 'apporteurs' | 'primes', valeur: (l: LigneExcel) => number, cellules: (l: LigneExcel) => string[], mot: string): void => {
    const refs = citees(cel);
    if (refs === null) return;
    const manquantes = lignes.filter((l) => valeur(l) !== 0 && !cellules(l).some((x) => refs.has(x)));
    if (manquantes.length === 0) return;
    const d = manquantes.reduce((t, l) => t + valeur(l), 0);
    const e: EcartExplique = { libelle: `${mot} du fichier (=${cel!.f}) sans la/les ligne(s) ${manquantes.map((l) => `${l.rang}${l.proprietaire ? ` (${l.proprietaire})` : ''}`).join(', ')} : ${euros(d)} absents du total`, ca: 0, apporteurs: 0, primes: 0, commission: 0 };
    e[quoi] = d;
    e.commission = quoi === 'primes' ? d : quoi === 'ca' ? taux * d : -taux * d;
    ecarts.push(e);
  };
  oubli(cTotal, 'ca', (l) => l.caFichier, (l) => [col.ca === null ? `${col.hp}${l.rang}` : `${col.ca}${l.rang}`, `${col.hp}${l.rang}`, `${col.hl}${l.rang}`], 'Le TOTAL CA HT');
  if (col.commission !== null) oubli(c(`${col.commission}${rTotal}`), 'apporteurs', (l) => l.commission, (l) => [`${col.commission}${l.rang}`], 'Le total des apporteurs');
  if (tPrimes) oubli(c(`${tPrimes.col}${tPrimes.rang}`), 'primes', (l) => l.prime, (l) => [`${col.prime}${l.rang}`], 'Le total des primes');
  if (blocFusionne !== null && blocFusionne.lignes.length > 0) {
    const ls = blocFusionne.lignes;
    const ca = ls.reduce((t, l) => t + l.caFichier, 0);
    const app = ls.reduce((t, l) => t + l.commission, 0);
    const pr = ls.reduce((t, l) => t + l.prime, 0);
    const com = taux * (ca - app) + pr;
    ecarts.push({ libelle: `${ls.length} ligne(s) du second bloc (« ${blocFusionne.nom} ») importée(s) avec celles du fichier : CA ${euros(ca)} ; commission au taux de ce négociateur (${(taux * 100).toLocaleString('fr-FR')} %) : +${euros(com)} — le fichier lui comptait à part ${euros(blocFusionne.commission)}${blocFusionne.taux === null ? '' : ` (${(blocFusionne.taux * 100).toLocaleString('fr-FR')} %)`}, non ajoutés`,
      ca, apporteurs: app, primes: pr, commission: com });
    lignes.push(...ls);
  }
  for (const a of ajouts) ecarts.push({ libelle: `La commission du fichier AJOUTE ${euros(a.montant)} hors location (ligne ${a.rang}${a.libelle ? ` : « ${a.libelle} »` : ''}) — non compté par l’outil`, ca: 0, apporteurs: 0, primes: 0, commission: -a.montant });
  for (const e of ecarts) anomalies.push(`Écart expliqué — ${e.libelle}.`);
  const totaux: TotauxExcel = {
    caHt, primes, apporteurs, caNet,
    commissionBrute: nombre(cComs) ?? 0,
    tauxNegociateur: tauxDeFormule(fComs),
    retrocession: retro,
    ventilationAvec: ventilation(rAvec, avecF),
    ventilationSans: ventilation(rSans, sansF),
    ...(horsCommission.length > 0 ? { horsCommission } : {}),
    ...(retros.length > 1 ? { retrocessions: retros } : {}),
    ...(ecarts.length > 0 ? { ecarts } : {}),
  };
  if (rComs === null) anomalies.push('Ligne « COMS … Brut » introuvable : la commission du fichier est comptée 0.');
  if (totaux.ventilationAvec !== null && totaux.ventilationSans !== null && Math.abs(totaux.ventilationAvec + totaux.ventilationSans - totaux.caHt) >= 0.005) {
    anomalies.push(`Ventilation : avec ${euros(totaux.ventilationAvec)} + sans ${euros(totaux.ventilationSans)} = ${euros(totaux.ventilationAvec + totaux.ventilationSans)}, pour un CA de ${euros(totaux.caHt)}.`);
  }
  const sommeLignes = lignes.reduce((s, l) => s + l.caFichier, 0);
  if (Math.abs(sommeLignes - caHt - ecarts.reduce((t, e) => t + e.ca, 0)) >= 0.005) {
    const fT = cTotal?.f;
    const citees = fT === undefined ? [] : [...new Set([...lignesDe(fT, col.ca ?? 'E'), ...lignesDe(fT, col.hp), ...lignesDe(fT, col.hl)])];
    const oubliees = lignes.filter((l) => citees.length > 0 && !citees.includes(l.rang));
    anomalies.push(`TOTAL CA HT du fichier ${euros(caHt)} ≠ somme des lignes ${euros(sommeLignes)}${fT ? ` (=${fT})` : ''}${oubliees.length ? ` — lignes absentes du total : ${oubliees.map((l) => l.rang).join(', ')}` : ''}.`);
  }

  // Les gestions perdues (2025) : un nom en colonne « GESTION PERDU », sur une ligne de données.
  const gestionsPerdues: GestionPerdueExcel[] = col.perdu === null ? [] : rangs.filter((r) => r >= debut && r < rFin)
    .map((r) => ({ r, nom: texte(c(`${col.perdu}${r}`)) })).filter((x) => x.nom !== '' && !estEnTete(x.nom))
    .map((x) => ({ mois, rang: x.r, proprietaire: x.nom, loyersCc: col.loyers === null ? null : nombre(c(`${col.loyers}${x.r}`)), commentaire: col.commentaire === null ? '' : texte(c(`${col.commentaire}${x.r}`)) }));

  return { mois, nomFeuille: f.nom, negociateur, lignes, totaux, anomalies, gestionsPerdues, autreBloc };
}

const VIDES: TotauxExcel = { caHt: 0, primes: 0, apporteurs: 0, caNet: 0, commissionBrute: 0, tauxNegociateur: null, retrocession: null, ventilationAvec: null, ventilationSans: null };

/** Lit tout le classeur : les onglets de mois, dans l'ordre du calendrier. */
export function lireClasseur(classeur: ClasseurLu, annee: number): MoisExcel[] {
  return lireClasseurDetaille(classeur, annee).mois;
}

/** Le classeur, avec ce qui n'est PAS lu comme un mois : onglets ignorés (« Feuil1 », « Feuil2 ») et mois en double. */
export function lireClasseurDetaille(classeur: ClasseurLu, annee: number, o: { ongletsMois?: Readonly<Record<string, number>>; fusionnerSecondBloc?: boolean } = {}):
  { mois: MoisExcel[]; ignorees: FeuilleIgnoree[]; doublons: string[] } {
  const ignorees: FeuilleIgnoree[] = [];
  const lus: MoisExcel[] = [];
  for (const f of classeur.feuilles) {
    const force = o.ongletsMois?.[f.nom.trim()];
    const m = lireFeuille(f, annee, { ...(force === undefined ? {} : { mois: force }), fusionnerSecondBloc: o.fusionnerSecondBloc === true });
    if (m !== null && force !== undefined) m.anomalies.unshift(`Onglet « ${f.nom.trim()} » lu comme ${m.mois} (décision d’Arno, 23/10/2026).`);
    if (m !== null) { lus.push(m); continue; }
    // Pas un mois : on le lit COMME un mois (pour dire ce qu'il contient), sans jamais le rattacher.
    const essai = lireFeuille({ ...f, nom: 'Janv' }, annee);
    const lignes = essai?.lignes ?? [];
    ignorees.push({ nom: f.nom, lignes: lignes.length, caHt: lignes.reduce((s, l) => s + l.caFichier, 0),
      apercu: lignes.slice(0, 3).map((l) => `${l.proprietaire} / ${l.locataire} — ${euros(l.caFichier)}`) });
  }
  const vus = new Map<string, number>();
  for (const m of lus) vus.set(m.mois, (vus.get(m.mois) ?? 0) + 1);
  return { mois: lus.sort((a, b) => a.mois.localeCompare(b.mois)), ignorees, doublons: [...vus].filter(([, n]) => n > 1).map(([k]) => k) };
}
