import {
  baremeADate, collegueADate, DEPUIS_TOUJOURS, estInterne, LIBELLE_MODE_APPORTEUR, libelleDuree, remunerationADate,
  type Apporteur, type BaremeApporteur, type ModeApporteur, type RemunerationCollegue,
} from './suivi';
import {
  caLigne, honorairesGestionDuBail, ligneRemplacee, modeApporteurDe, moisDusApporteur, moisDusCollegue, partGestionMensuelleDe, partGestionSignatureDe,
  partLocationDe, regleApporteurDe, remunerationCollegueDe, tauxGestionApporteurDe, type ActiviteCalcul,
} from './tableauBord';

/**
 * ══ 🔴 Arno (24/10/2026) — LE DÉTAIL D'UN DOSSIER ET LES CONDITIONS D'UN APPORTEUR ═══════════════════════════════════════════════
 *
 * (1) Le bloc d'un dossier, décomposé location / gestion :
 *   Honoraires HT : Transaction locative · Gestion (les mois sur lesquels un dû de gestion est calculé) · Total (si les deux)
 *   − Dû à l'apporteur : sur la location (taux) · sur la gestion (taux, one shot 12 mois / récurrent) · Total (si les deux)
 *   − Dû au collègue : même décomposition — absent si aucune rémunération, pas de collègue, ou apporteur interne à la signature
 *   = Net agence HT
 * Une ligne n'existe QUE si son montant n'est pas nul (au centime). Chaque dû dit son taux et sa SOURCE : la version datée en vigueur
 * à la signature, ou le montant / le taux saisi à l'import du fichier. EXACT AU CENTIME : chaque montant est arrondi au centime UNE
 * fois, et les totaux et le net sont calculés EN CENTIMES à partir des montants affichés — l'addition tombe juste à l'écran.
 * Les mêmes règles que les totaux de l'annuaire (`totauxApporteurs`) : récurrents dus jusqu'au jour, dans la durée de la règle.
 *
 * (2) Les CONDITIONS d'un apporteur (carte de l'annuaire) : la version en vigueur aujourd'hui, et les dossiers dont le dû N'EST PAS
 * calculé à ces conditions (version antérieure, ou montant saisi à l'import) — l'écran ne laisse jamais croire qu'un dû suit le taux
 * « en vigueur » quand ce n'est pas le cas. PUR.
 */

const centimes = (x: number): number => Math.round((x + Number.EPSILON) * 100);
const dateFr = (iso: string): string => iso.split('-').reverse().join('/');
/** « 50 % », « 4,5 % » (fraction → texte). */
export const pctCourt = (x: number): string => `${String(Math.round(x * 1000000) / 10000).replace('.', ',')} %`;

/** D'où vient un taux : la version datée (ou « depuis toujours »), le montant saisi à l'import, le taux saisi à l'import. */
export type SourceDu = { sorte: 'version'; depuis: string; toujours: boolean } | { sorte: 'import_montant' } | { sorte: 'import_taux' } | { sorte: 'aucune' };
export function libelleSource(s: SourceDu): string {
  if (s.sorte === 'import_montant') return 'montant saisi à l’import';
  if (s.sorte === 'import_taux') return 'taux saisi à l’import';
  if (s.sorte === 'aucune') return 'aucune version';
  return s.toujours || s.depuis === DEPUIS_TOUJOURS ? 'version « depuis toujours »' : `version du ${dateFr(s.depuis)}`;
}
const sourceVersion = (v: { depuis: string; toujours?: boolean; toujoursLe?: string } | null): SourceDu =>
  (v === null ? { sorte: 'aucune' } : { sorte: 'version', depuis: v.depuis, toujours: v.toujours === true || v.depuis === DEPUIS_TOUJOURS });

/** Une ligne de dû : son montant AU CENTIME (en euros), le taux, le détail (« one shot 12 mois »…) et la source. */
export interface LigneDu { montant: number; taux: number; detail: string | null; source: SourceDu }
/** Un bloc de dû (apporteur ou collègue) : ses lignes non nulles, et le total (en euros, au centime). */
export interface BlocDu { nom: string; location: LigneDu | null; gestion: LigneDu | null; total: number }

export interface DetailDossier {
  id: number | string; dateSignature: string; libelle: string;
  /**
   * 🔴 Arno (24/10/2026) — le montant saisi à l'IMPORT que remplace, dans le calcul, une version « depuis toujours » : jamais effacé,
   * il reste dit (« montant importé : x € — remplacé depuis toujours le … par … »). null : aucun montant importé remplacé.
   */
  importRemplace: { montant: number; le: string; par: string | null } | null;
  honoraires: { location: number; gestion: number; baseGestion: string | null; total: number };
  apporteur: BlocDu;
  /** null : aucune rémunération du collègue, pas de collègue, ou apporteur interne à la signature. */
  collegue: BlocDu | null;
  net: number;
}

/** Le détail « gestion » d'un mode : « one shot 12 mois » / « récurrent pendant 3 ans — 7 mois dus ». */
const detailGestion = (mode: ModeApporteur, duree: number | null | undefined, moisDus: number): string =>
  (mode === 'one_shot' ? 'one shot 12 mois' : `récurrent ${libelleDuree(duree)} — ${moisDus} mois ${moisDus > 1 ? 'dus' : 'dû'}`);

const bloc = (nom: string, location: LigneDu | null, gestion: LigneDu | null): BlocDu => {
  const l = location !== null && centimes(location.montant) !== 0 ? location : null;
  const g = gestion !== null && centimes(gestion.montant) !== 0 ? gestion : null;
  return { nom, location: l, gestion: g, total: (centimes(l?.montant ?? 0) + centimes(g?.montant ?? 0)) / 100 };
};
const auCentime = (x: number): number => centimes(x) / 100;

/** Le détail d'UN dossier (l'apporteur du dossier ; null sans apporteur connu). PUR. */
export function detailDossier(d: ActiviteCalcul, apporteurs: readonly Apporteur[], aujourdhui: string, nomApporteur?: string): DetailDossier | null {
  if (d.apporteurId === null) return null;
  const ap = apporteurs.find((x) => x.id === d.apporteurId);
  const remplacee = ligneRemplacee(d, apporteurs);
  const regle = regleApporteurDe(d, apporteurs);
  const mensuels = (() => { const h = honorairesGestionDuBail(d); return 'montant' in h ? h.montant : 0; })();
  const ca = caLigne(d);

  // ── L'apporteur ──
  const partLoc = partLocationDe(d, apporteurs);
  const sourceLoc: SourceDu = d.commissionSaisie !== null && !remplacee ? { sorte: 'import_montant' }
    : d.apporteurTaux !== null && !remplacee ? { sorte: 'import_taux' } : sourceVersion(regle);
  const tauxLoc = sourceLoc.sorte === 'import_montant' ? (ca === 0 ? 0 : partLoc / ca) : (d.apporteurTaux !== null && !remplacee ? d.apporteurTaux : regle?.taux ?? 0);
  const mode = modeApporteurDe(d, apporteurs);
  const moisApp = mode === 'recurrent' ? moisDusApporteur(d, apporteurs, aujourdhui).length : 12;
  const partGes = mode === 'one_shot' ? partGestionSignatureDe(d, apporteurs) : partGestionMensuelleDe(d, apporteurs) * moisApp;
  const tauxGes = tauxGestionApporteurDe(d, apporteurs);
  const sourceGes: SourceDu = d.apporteurTauxGestion !== null && d.apporteurTauxGestion !== undefined && !remplacee ? { sorte: 'import_taux' } : sourceVersion(regle);
  const apporteur = bloc(nomApporteur ?? ap?.nom ?? d.apporteurNom ?? 'apporteur',
    { montant: auCentime(partLoc), taux: tauxLoc, detail: null, source: sourceLoc },
    { montant: auCentime(partGes), taux: tauxGes, detail: detailGestion(mode, regle?.dureeAnnees, moisApp), source: sourceGes });

  // ── Le collègue (externe à la signature, rémunéré) ──
  const r = remunerationCollegueDe(d, apporteurs);
  let collegue: BlocDu | null = null;
  let moisCol = 0;
  if (r !== null) {
    const v: RemunerationCollegue = r.regle;
    moisCol = v.mode === 'recurrent' ? moisDusCollegue(d, apporteurs, aujourdhui).length : 12;
    const ges = v.mode === 'one_shot' ? v.tauxGestion * mensuels * 12 : v.tauxGestion * mensuels * moisCol;
    collegue = bloc(r.collegue.libelle, { montant: auCentime(ca * v.taux), taux: v.taux, detail: null, source: sourceVersion(v) },
      { montant: auCentime(ges), taux: v.tauxGestion, detail: detailGestion(v.mode, v.dureeAnnees, moisCol), source: sourceVersion(v) });
  }

  // ── Les honoraires : la location ; la gestion sur les mois où un dû de gestion est calculé (12 en one shot, les mois dus en récurrent). ──
  const moisBase = Math.max(apporteur.gestion !== null ? moisApp : 0, collegue?.gestion ? moisCol : 0);
  const hLoc = centimes(ca);
  const hGes = centimes(mensuels * moisBase);
  const net = hLoc + hGes - centimes(apporteur.total) - centimes(collegue?.total ?? 0);
  // Le montant que l'import avait posé (montant, sinon taux × honoraires), remplacé par la version « depuis toujours ».
  const importe = d.commissionSaisie !== null ? d.commissionSaisie : d.apporteurTaux !== null ? ca * d.apporteurTaux : null;
  const importRemplace = remplacee && importe !== null && regle !== null
    ? { montant: auCentime(importe), le: regle.toujoursLe ?? regle.depuis, par: regle.saisiPar ?? null } : null;
  return {
    id: d.id, dateSignature: d.dateSignature, libelle: [d.libelleProprietaire, d.libelleLocataire].filter(Boolean).join(' / '), importRemplace,
    honoraires: { location: hLoc / 100, gestion: hGes / 100, baseGestion: hGes === 0 ? null : `${moisBase} mois × ${auCentime(mensuels).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € / mois`,
      total: (hLoc + hGes) / 100 },
    apporteur, collegue, net: net / 100,
  };
}

/** « One shot 50 % » / « Récurrent 10 % · gestion 20 % » : les conditions en peu de mots. PUR. */
export function libelleConditionsCourt(b: Pick<BaremeApporteur, 'mode' | 'taux' | 'tauxGestion'>): string {
  const g = b.tauxGestion ?? 0;
  return `${LIBELLE_MODE_APPORTEUR[b.mode ?? 'one_shot']} ${pctCourt(b.taux)}${g !== 0 ? ` · gestion ${pctCourt(g)}` : ''}`;
}

/** Les dossiers dont le dû n'est PAS calculé aux conditions en vigueur aujourd'hui (une ligne par groupe). */
export interface AutresConditions { sorte: 'anterieure' | 'import'; nb: number; libelle: string }

/**
 * Les dossiers d'un apporteur calculés à d'AUTRES conditions que celles en vigueur aujourd'hui :
 *   · « import » : un montant / un taux / un mode saisi sur le dossier par l'import fait le calcul (il l'emporte sur la version) ;
 *     le libellé dit le taux effectif s'il est le même partout, et s'il correspond à la version en vigueur à la signature ;
 *   · « anterieure » : la version en vigueur à la signature n'est pas celle d'aujourd'hui (groupés par conditions).
 * PUR.
 */
export function autresConditions(dossiers: readonly ActiviteCalcul[], apporteurs: readonly Apporteur[], apporteurId: number, aujourdhui: string): AutresConditions[] {
  const ap = apporteurs.find((x) => x.id === apporteurId);
  if (ap === undefined) return [];
  const courante = baremeADate(ap, aujourdhui);
  const memeVersion = (v: BaremeApporteur | null): boolean =>
    v !== null && courante !== null && v.depuis === courante.depuis && (v.ordre ?? null) === (courante.ordre ?? null) && v.taux === courante.taux;
  const imports: { taux: number; conforme: BaremeApporteur | null }[] = [];
  const anterieures = new Map<string, number>();
  for (const d of dossiers.filter((x) => x.apporteurId === apporteurId)) {
    const remplacee = ligneRemplacee(d, apporteurs);
    const saisi = !remplacee && (d.commissionSaisie !== null || d.apporteurTaux !== null || (d.apporteurMode ?? null) !== null || (d.apporteurTauxGestion ?? null) !== null);
    const v = regleApporteurDe(d, apporteurs);
    if (saisi) {
      const ca = caLigne(d);
      const taux = ca === 0 ? 0 : partLocationDe(d, apporteurs) / ca;
      const conforme = v !== null && Math.abs(ca * v.taux - partLocationDe(d, apporteurs)) < 0.005 ? v : null;
      // Saisi, mais exactement aux conditions d'aujourd'hui (même version, même taux, même mode, même gestion) : rien à signaler.
      if (conforme !== null && memeVersion(conforme) && ((d.apporteurMode ?? null) === null || d.apporteurMode === (conforme.mode ?? 'one_shot'))
        && ((d.apporteurTauxGestion ?? null) === null || d.apporteurTauxGestion === (conforme.tauxGestion ?? 0))) continue;
      imports.push({ taux, conforme });
      continue;
    }
    if (v === null || memeVersion(v)) continue;
    const cle = libelleConditionsCourt(v);
    anterieures.set(cle, (anterieures.get(cle) ?? 0) + 1);
  }
  const sortie: AutresConditions[] = [...anterieures].map(([libelle, nb]) => ({ sorte: 'anterieure' as const, nb, libelle }));
  if (imports.length > 0) {
    const t0 = imports[0].taux;
    const uniforme = imports.every((x) => Math.abs(x.taux - t0) < 0.00005);
    const conformes = imports.every((x) => x.conforme !== null && x.conforme.depuis === imports[0].conforme?.depuis);
    const precision = uniforme
      ? `location ${pctCourt(t0)}${conformes && imports[0].conforme ? `, conformes à la version du ${dateFr(imports[0].conforme.depuis)}` : ''}`
      : 'taux variables';
    sortie.push({ sorte: 'import', nb: imports.length, libelle: precision });
  }
  return sortie;
}

/** La phrase d'un groupe : « 8 dossiers calculés aux conditions antérieures (One shot 50 %) » / « 8 dossiers : montants saisis à l'import (…) ». */
export function phraseAutresConditions(x: AutresConditions): string {
  const n = `${x.nb} dossier${x.nb > 1 ? 's' : ''}`;
  return x.sorte === 'anterieure' ? `${n} calculé${x.nb > 1 ? 's' : ''} aux conditions antérieures (${x.libelle})` : `${n} : montants saisis à l’import (${x.libelle})`;
}

/** Les conditions du COLLÈGUE (carte, externe) : « Paul : aucune rémunération » / « Paul : One shot — location 3 %, gestion 0 % (depuis le …) ». */
export function conditionsCollegue(a: Apporteur, aujourdhui: string): { collegue: string | null; texte: string } | null {
  if (estInterne(a)) return null;
  const c = collegueADate(a, aujourdhui);
  if (c === null) return { collegue: null, texte: 'À rattacher : aucun collègue' };
  const r = remunerationADate(a, aujourdhui);
  if (r === null || !r.remunere) return { collegue: c.collegueLibelle, texte: `${c.collegueLibelle} : aucune rémunération` };
  const duree = r.mode === 'recurrent' ? `, ${libelleDuree(r.dureeAnnees)}` : '';
  const depuis = r.toujours === true || r.depuis === DEPUIS_TOUJOURS ? 'depuis toujours' : `depuis le ${dateFr(r.depuis)}`;
  return { collegue: c.collegueLibelle, texte: `${c.collegueLibelle} : ${LIBELLE_MODE_APPORTEUR[r.mode]} — location ${pctCourt(r.taux)}, gestion ${pctCourt(r.tauxGestion)}${duree} (${depuis})` };
}
