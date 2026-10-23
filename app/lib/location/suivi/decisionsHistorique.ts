import { createHash } from 'node:crypto';
import type { GestionPerdueExcel, MoisExcel } from './lectureExcel';
import { mots, ressemblance } from './rapprochementImport';
import type { ControleMois } from './planImport';

/**
 * ══ LOCATION — « OUTILS DE SUIVI » : LES DÉCISIONS D'ARNO SUR L'HISTORIQUE 2019 → 2025 (23/10/2026) ════════════════════════════
 *   1. « Feuil2 » du fichier 2024 = DÉCEMBRE 2024 (« Feuil1 », vide, reste ignorée) ;
 *   2. les lignes du second négociateur (sept.-oct. 2023) sont importées sous le négociateur du fichier, à SA règle de
 *      commission — l'effet chiffré est un écart expliqué ;
 *   3. un écart avec le fichier (total tronqué, ligne oubliée, vente dans la commission) : l'outil garde le calcul JUSTE et
 *      montre une note dans la feuille du mois (le montant du fichier en info-bulle) ;
 *   4. TROIS NOMS de la colonne « apporteurs » ne sont PAS des apporteurs : jamais créés dans l'annuaire, leur nom gardé NULLE
 *      PART (ni ligne, ni commentaire, ni rapport) — la ligne garde son CA et sa commission, sans apporteur ni origine.
 *      🔒 Ils sont reconnus par l'EMPREINTE de leur nom (SHA-256 du nom normalisé) : le code ne les écrit pas en clair ;
 *   5. les « GESTION PERDU » du fichier 2025 entrent dans « Mandats de gestion perdus » (migration 408), avec le bien
 *      rapproché quand il l'est, et des honoraires mensuels = loyers cc du fichier × taux retenu (conditions du bail, sinon
 *      taux WIPPIMMO du bien, sinon réglage de l'agence — toujours dit, c'est une valeur DÉDUITE).
 * PUR (sauf l'empreinte, calcul local).
 */

/** Décision 1 : les onglets lus comme un mois, par fichier (source « CA_JBP_<année> »). */
export const ONGLETS_MOIS: Readonly<Record<string, Readonly<Record<string, number>>>> = { CA_JBP_2024: { Feuil2: 12 } };
/** Décision 2. */
export const FUSIONNER_SECOND_BLOC = true;

const CIVILITES = new Set(['m', 'mr', 'mme', 'mlle', 'madame', 'monsieur', 'mademoiselle']);
const normal = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(' ')
  .filter((m) => m !== '' && !CIVILITES.has(m)).join(' ');
export const empreinte = (t: string): string => createHash('sha256').update(normal(t)).digest('hex');
/** Décision 4 : les empreintes des trois noms écartés, et de leur prénom (une rétrocession nommée par le seul prénom). */
const ECARTES = new Set(['7e5d1ee1d680c4365f4f24f7c549be81a160c3595e0b5dca31272a2fb35a7b65', '141ec80cc534433a01542c30ef14063037e00c50b65ea5c590069ea22f7946ce',
  '916af29098dc06f94d9553b327f6ba0c86a64a9bea83fdd3fe68ddf4209ba090']);
const PRENOMS_ECARTES = new Set(['55579b557896d0ce1764c47fed644f9b35f58bad620674af23f356d80ed0c503', '960fc9af5c1caf82a61eecb51e926e1748f31265c34b1fcbb348de7bab375604']);
export const estEcarte = (nom: string): boolean => ECARTES.has(empreinte(nom));
export const estPrenomEcarte = (nom: string): boolean => PRENOMS_ECARTES.has(empreinte(nom));
export const MOT_ECARTE = 'apporteur écarté (décision d’Arno)';

/**
 * Décision 4, appliquée aux mois lus : la colonne « apporteurs » d'une ligne écartée est VIDÉE (sans apporteur, origine « à
 * renseigner » — sa commission reste, pour le contrôle au centime) ; le nom disparaît des anomalies, des écarts et des
 * rétrocessions (une rétrocession nommée par le seul prénom devient « Rétrocession (commissions) »). Rend des COPIES. PUR.
 */
export function ecarterApporteurs(mois: readonly MoisExcel[], ecarte: (nom: string) => boolean = estEcarte, prenomEcarte: (nom: string) => boolean = estPrenomEcarte):
  { mois: MoisExcel[]; lignes: number; commission: number } {
  let lignes = 0;
  let commission = 0;
  const out = mois.map((m) => {
    const textes = new Set<string>();
    const ls = m.lignes.map((l) => {
      if (l.apporteurTexte === null || !ecarte(l.apporteurTexte)) return l;
      textes.add(l.apporteurTexte); lignes += 1; commission += l.commission;
      return { ...l, apporteurTexte: null };
    });
    const effacer = (t: string): string => [...textes].reduce((x, n) => x.split(n).join(MOT_ECARTE), t);
    const retro = (r: { libelle: string; montant: number }) => ({ ...r, libelle: prenomEcarte(r.libelle) || ecarte(r.libelle) ? 'Rétrocession (commissions)' : effacer(r.libelle) });
    const t = m.totaux;
    return { ...m, lignes: ls, anomalies: m.anomalies.map(effacer).map((a) => (a.includes(MOT_ECARTE) ? a.replace(/sans propriétaire ni locataire \(« [^»]*»\)/, 'sans propriétaire ni locataire') : a)),
      totaux: { ...t, retrocession: t.retrocession === null ? null : retro(t.retrocession), ...(t.retrocessions ? { retrocessions: t.retrocessions.map(retro) } : {}),
        ...(t.ecarts ? { ecarts: t.ecarts.map((e) => ({ ...e, libelle: effacer(e.libelle) })) } : {}) } };
  });
  return { mois: out, lignes, commission };
}

/** Un bien candidat pour une gestion perdue (lecture de la base). */
export interface BienPerte {
  lotId: number; proprietaire: string; adresse: string; statut: string | null;
  /** Le taux des conditions du dernier bail du bien (%, HT), s'il y en a. */
  tauxConditions: number | null;
  /** Le taux WIPPIMMO du bien (%, HT), s'il y en a. */
  tauxWippimmo: number | null;
}

export interface PerteRapprochee {
  perte: GestionPerdueExcel; importCle: string; lotId: number | null; libelleBien: string | null; proprietaire: string | null;
  tauxHt: number; tauxSource: 'conditions' | 'wippimmo' | 'reglage'; honorairesMensuels: number | null; notes: string[];
}

/**
 * Décision 5 : chaque « GESTION PERDU » du fichier → son bien (le propriétaire nommé, et l'adresse du fichier pour choisir
 * entre plusieurs biens du même propriétaire ; sinon « non rattaché ») et ses honoraires mensuels perdus = loyers cc × taux
 * retenu. Toute valeur déduite est DITE dans `notes`. PUR.
 */
export function rapprocherGestionsPerdues(pertes: readonly GestionPerdueExcel[], biens: readonly BienPerte[], reglage: { tauxHt: number }, source: string): PerteRapprochee[] {
  return pertes.map((p) => {
    const notes: string[] = [];
    // Le NOM du fichier (son premier mot : « MORTEVEILLE 4 allée… », « BONNET ») retrouvé dans le nom du propriétaire du bien.
    const nom = mots(p.proprietaire)[0];
    const memeProprio = nom === undefined ? [] : biens.filter((b) => b.proprietaire !== '' && ressemblance(nom, b.proprietaire) === 1);
    let bien: BienPerte | null = memeProprio.length === 1 ? memeProprio[0] : null;
    if (memeProprio.length > 1) {
      const mp = new Set(mots(p.proprietaire));
      const scores = memeProprio.map((b) => ({ b, s: mots(b.adresse).filter((m) => mp.has(m)).length }));
      const max = Math.max(...scores.map((x) => x.s));
      const meilleurs = scores.filter((x) => x.s === max);
      bien = max > 0 && meilleurs.length === 1 ? meilleurs[0].b : null;
      if (bien === null) notes.push(`${memeProprio.length} biens à ce propriétaire, l’adresse du fichier ne les départage pas : non rattachée`);
    }
    if (memeProprio.length === 0) notes.push('aucun bien de ce propriétaire dans l’outil : non rattachée');
    const tauxSource: PerteRapprochee['tauxSource'] = bien?.tauxConditions != null ? 'conditions' : bien?.tauxWippimmo != null ? 'wippimmo' : 'reglage';
    const tauxHt = tauxSource === 'conditions' ? bien!.tauxConditions! : tauxSource === 'wippimmo' ? bien!.tauxWippimmo! : reglage.tauxHt;
    notes.push(`taux DÉDUIT : ${String(tauxHt).replace('.', ',')} % HT (${tauxSource === 'conditions' ? 'conditions du dernier bail du bien' : tauxSource === 'wippimmo' ? 'taux WIPPIMMO du bien' : 'réglage de l’agence, faute de taux du bien'})`);
    if (p.loyersCc === null) notes.push('loyers cc absents du fichier : honoraires non calculables');
    else notes.push(`honoraires mensuels DÉDUITS : ${p.loyersCc.toFixed(2).replace('.', ',')} € cc × ${String(tauxHt).replace('.', ',')} %`);
    return {
      perte: p, importCle: `${source}#perdue#${p.mois}#${p.rang}`, lotId: bien?.lotId ?? null, libelleBien: bien?.adresse ?? null, proprietaire: bien?.proprietaire ?? null,
      tauxHt, tauxSource, honorairesMensuels: p.loyersCc === null ? null : p.loyersCc * tauxHt / 100, notes,
    };
  });
}

export interface NoteEcart { importCle: string; mois: string; champ: 'ca' | 'apporteurs' | 'primes' | 'commission'; fichier: number; outil: number; libelle: string }

/**
 * Décision 3 : la note de chaque écart expliqué d'un mois, pour la feuille du mois — le total qu'il touche (CA, apporteurs,
 * primes, sinon la commission), le montant du FICHIER et celui de l'OUTIL (le calcul juste). PUR.
 */
export function notesEcarts(mois: readonly MoisExcel[], controle: readonly ControleMois[], source: string): NoteEcart[] {
  return mois.flatMap((m) => {
    const c = controle.find((x) => x.mois === m.mois);
    if (c === undefined) return [];
    return (m.totaux.ecarts ?? []).map((e, i) => {
      const champ: NoteEcart['champ'] = e.ca !== 0 ? 'ca' : e.apporteurs !== 0 ? 'apporteurs' : e.primes !== 0 ? 'primes' : 'commission';
      const [fichier, outil] = champ === 'ca' ? [c.caFichier, c.caOutil] : champ === 'apporteurs' ? [c.apporteursFichier, c.apporteursOutil]
        : champ === 'primes' ? [c.primesFichier, c.primesOutil] : [c.commissionFichier, c.commissionOutil];
      return { importCle: `${source}#ecart#${m.mois}#${i + 1}`, mois: m.mois, champ, fichier, outil, libelle: e.libelle };
    });
  });
}
