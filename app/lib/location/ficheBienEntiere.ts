import { refusNomAnnexe } from './bienComplet';
import { resumeAnnexe } from './annexeLocation';
import { libelleEtage, type Categorie } from './locationBien';
import { LIBELLE_SITUATION_PARKING, LIBELLE_TYPE_PARKING } from './bienComplet';
import { LIBELLE_STATUT, type GesteStatut, type StatutBien } from '../gestion/statutBien';
import { LIBELLE_MANDAT, type SorteMandat } from './mandatBien';
import { changementsEncart, champsDuGroupe, GROUPES_FICHE, type ChangementEncart, type PorteeEncart, type ValeursEncart } from './encartBien';

/**
 * ══ 🔴🔴 LA FICHE DU BIEN MODIFIÉE EN ENTIER, DANS LE FORMULAIRE « NOUVEAU BIEN » (Arno, 23/10/2026). PUR. ═══════════════════════════
 *
 * « Remplacer les cinq “Modifier” par groupe par UN seul “Modifier” qui ouvre l'intégralité du formulaire “Nouveau bien”, pré-rempli
 * avec toutes les valeurs existantes. » Le MÊME écran dans la Gestion et dans la Location. Ce module dit :
 *   · ce que la saisie porte EN PLUS des valeurs de l'encart (`encartBien.ts`) : les ANNEXES (existantes et nouvelles) et le
 *     STATUT (une transition permise, avec sa date d'effet, son motif, son mandat) ;
 *   · « Champ : ancienne valeur → nouvelle valeur » pour toute la fiche (contre-validation, Historique) ;
 *   · les refus qu'aucune écriture ne doit précéder (l'adresse d'un bien importé, un parking nu avec des annexes, le nom d'une
 *     annexe « Autre », l'autre adresse d'une annexe) ;
 *   · L'EMPREINTE de la fiche (sa « version ») : deux lectures égales donnent la même ; elle sert au contrôle « Ce bien a été
 *     modifié par ailleurs — recharger ? » et à la mise à jour automatique de la fiche ouverte.
 */
/** Une ligne de changement (la clé d'une annexe ou du statut n'est pas un champ de l'encart). */
export type ChangementFiche = Omit<ChangementEncart, 'cle'> & { cle: string };

export const MOTIF_CONFLIT = 'Ce bien a été modifié par ailleurs — recharger ?';

/** Une annexe telle que la fiche la lit (une seule source : ses colonnes). */
export interface AnnexeLue {
  id: number; categorie: Categorie;
  etage: string; porte: string; numLotCopro: string; nomAnnexe: string; annotation: string; detachee: boolean;
  parkingSituation: string; parkingType: string;
  /** À une autre adresse que son bien principal ; son adresse (celle du bien principal sinon). */
  autreAdresse: boolean; adresse: string; codePostal: string; commune: string;
  /** Créée dans l'application : son adresse se modifie (celle d'une annexe importée est tenue par WIPPIMMO). */
  adresseModifiable: boolean;
}

/** Une annexe de la saisie : `id` = une annexe existante ; `null` = une annexe NOUVELLE. `sortir` : à sortir du portefeuille. */
export interface AnnexeSaisie extends Omit<AnnexeLue, 'id' | 'adresseModifiable'> { id: number | null; sortir?: boolean }

/** Le statut du bien, lu (migration 403) : ses gestes permis ; aucun pour une annexe rattachée (elle suit son bien principal). */
export interface StatutLu { statut: StatutBien; depuis: string | null; gestes: GesteStatut[]; disponible: boolean; suitLot: { id: number; adresse: string | null } | null }

/** La transition choisie dans le formulaire ; `null` = le statut ne change pas. */
export interface TransitionSaisie { vers: StatutBien; effetLe: string; motif: string; mandat: { sorte: SorteMandat; numero: string | null; signeLe: string | null } | null }

export interface SaisieFiche {
  /** L'empreinte de la fiche LUE à l'ouverture du formulaire : une autre en base = modifiée par ailleurs. */
  version: string;
  valeurs: ValeursEncart;
  annexes: AnnexeSaisie[];
  statut: TransitionSaisie | null;
  /** « Sortir » une annexe louée : l'avertissement a été lu et confirmé (la règle de la fiche). */
  confirmeOccupation?: boolean;
}

const LIBELLE_ANNEXE: Record<string, string> = { cave: 'Cave', parking: 'Parking', box: 'Box', autre: 'Autre annexe' };
const estParking = (c: string): boolean => c === 'parking' || c === 'box';

/** Le titre d'une annexe dans les phrases : « Cave · lot 12 », « Cellier ». PUR. */
export function titreAnnexeSaisie(a: Pick<AnnexeLue, 'categorie' | 'nomAnnexe' | 'parkingSituation' | 'parkingType' | 'numLotCopro' | 'porte'>): string {
  return resumeAnnexe({ ...a, parkingSituation: a.parkingSituation || null, parkingType: a.parkingType || null })
    || (a.categorie === 'autre' && a.nomAnnexe.trim() !== '' ? a.nomAnnexe.trim() : LIBELLE_ANNEXE[a.categorie] ?? 'Annexe');
}

const egal = (a: string, b: string): boolean => a.trim().replace(/\s+/g, ' ') === b.trim().replace(/\s+/g, ' ');
const mot = (v: string, vide = 'non renseigné'): string => (v.trim() === '' ? vide : v.trim());
const adresseEnMots = (a: Pick<AnnexeLue, 'autreAdresse' | 'adresse' | 'codePostal' | 'commune'>): string =>
  (a.autreAdresse ? [a.adresse, [a.codePostal, a.commune].filter((x) => x.trim() !== '').join(' ')].filter((x) => x.trim() !== '').join(', ') || 'autre adresse (à renseigner)' : 'même adresse que le bien');

/** Les champs d'une annexe, en mots, dans l'ordre du formulaire. */
function champsAnnexe(a: Omit<AnnexeLue, 'id' | 'adresseModifiable'>): { cle: string; champ: string; valeur: string }[] {
  const parking = estParking(a.categorie);
  return [
    ...(a.categorie === 'autre' ? [{ cle: 'nomAnnexe', champ: 'nom', valeur: mot(a.nomAnnexe) }] : []),
    { cle: 'adresse', champ: 'adresse', valeur: adresseEnMots(a) },
    ...(parking ? [{ cle: 'parkingSituation', champ: 'intérieur ou extérieur', valeur: LIBELLE_SITUATION_PARKING[a.parkingSituation as keyof typeof LIBELLE_SITUATION_PARKING] ?? mot(a.parkingSituation) },
      { cle: 'parkingType', champ: 'type de parking', valeur: LIBELLE_TYPE_PARKING[a.parkingType as keyof typeof LIBELLE_TYPE_PARKING] ?? mot(a.parkingType) }] : []),
    { cle: 'etage', champ: 'étage', valeur: libelleEtage(a.etage.trim() === '' ? null : a.etage) ?? 'non renseigné' },
    { cle: 'numLotCopro', champ: 'n° de lot', valeur: mot(a.numLotCopro) },
    { cle: 'porte', champ: parking ? 'n° de place' : 'n° de porte', valeur: mot(a.porte) },
    { cle: 'annotation', champ: 'annotation', valeur: mot(a.annotation, 'aucune') },
    { cle: 'detachee', champ: 'détachée', valeur: a.detachee ? 'oui' : 'non' },
  ];
}

/** LES CHANGEMENTS DES ANNEXES : modifiées, ajoutées, sorties du portefeuille. PUR. */
export function changementsAnnexes(avant: readonly AnnexeLue[], apres: readonly AnnexeSaisie[]): ChangementFiche[] {
  const l: ChangementFiche[] = [];
  apres.forEach((a, i) => {
    if (a.id === null) {
      if (a.sortir === true) return;   // ajoutée puis retirée du formulaire : rien
      const details = champsAnnexe(a).filter((c) => !['nom', 'détachée'].includes(c.champ) && !/^(non renseigné|aucune)$/.test(c.valeur) && c.valeur !== 'même adresse que le bien');
      l.push({ cle: `annexe-nouvelle-${i}`, champ: `Annexe ajoutée (${titreAnnexeSaisie(a)})`, avant: 'aucune',
        apres: [...details.map((c) => `${c.champ} ${c.valeur}`), ...(a.detachee ? ['détachée'] : [])].join(', ') || 'à l’adresse du bien' });
      return;
    }
    const lue = avant.find((x) => x.id === a.id);
    if (lue === undefined) return;
    const titre = titreAnnexeSaisie(lue);
    if (a.sortir === true) {
      l.push({ cle: `annexe-${a.id}-sortie`, champ: `Annexe ${titre}`, avant: 'dans le portefeuille', apres: 'sortie du portefeuille (rien n’est effacé)' });
      return;
    }
    const av = champsAnnexe(lue);
    const ap = champsAnnexe(a);
    for (const c of ap) {
      const x = av.find((y) => y.cle === c.cle);
      if (x !== undefined && !egal(x.valeur, c.valeur)) l.push({ cle: `annexe-${a.id}-${c.cle}`, champ: `Annexe ${titre} — ${c.champ}`, avant: x.valeur, apres: c.valeur });
    }
  });
  return l;
}

const dateFr = (iso: string): string => iso.slice(0, 10).split('-').reverse().join('/');

/** La ligne du statut : « Statut du bien : En gestion → Location seule (au 23/10/2026) ». PUR. */
export function changementStatut(lu: StatutLu | null, t: TransitionSaisie | null): ChangementFiche[] {
  if (lu === null || t === null) return [];
  const m = t.mandat !== null && ((t.mandat.numero ?? '').trim() !== '' || (t.mandat.signeLe ?? '') !== '')
    ? `, ${LIBELLE_MANDAT[t.mandat.sorte].toLowerCase()}${t.mandat.numero ? ` n° ${t.mandat.numero.trim()}` : ''}${t.mandat.signeLe ? ` signé le ${dateFr(t.mandat.signeLe)}` : ''}` : '';
  return [{ cle: 'statut', champ: 'Statut du bien', avant: LIBELLE_STATUT[lu.statut],
    apres: `${LIBELLE_STATUT[t.vers]} (au ${dateFr(t.effetLe)}${t.motif.trim() !== '' ? `, motif : ${t.motif.trim()}` : ''}${m})` }];
}

/** TOUS les changements de la fiche, dans l'ordre du formulaire : le bien, ses annexes, son statut. PUR. */
export function changementsFiche(lu: { encart: PorteeEncart & { valeurs: ValeursEncart }; annexes: readonly AnnexeLue[]; statut: StatutLu | null }, s: SaisieFiche): ChangementFiche[] {
  const vus = new Set<string>();
  const champs = GROUPES_FICHE.flatMap((g) => champsDuGroupe(g, lu.encart)).filter((ch) => (vus.has(ch.cle) ? false : (vus.add(ch.cle), true)));
  return [...changementsEncart(champs, lu.encart.valeurs, s.valeurs), ...changementsAnnexes(lu.annexes, s.annexes), ...changementStatut(lu.statut, s.statut)];
}

/**
 * Ce qu'aucune écriture ne doit précéder (le serveur le redit ; l'écran le montre avant). `null` = rien à refuser. PUR.
 * Une fiche existante n'est jamais bloquée par les obligatoires de la CRÉATION (DPE, entretien…) : la règle de `bienComplet.ts`.
 */
export function refusFiche(lu: { encart: PorteeEncart & { valeurs: ValeursEncart }; annexes: readonly AnnexeLue[]; statut: StatutLu | null }, s: SaisieFiche): string | null {
  const v = lu.encart.valeurs;
  if (!lu.encart.adresseModifiable && (!egal(v.adresse, s.valeurs.adresse) || !egal(v.codePostal, s.valeurs.codePostal) || !egal(v.commune, s.valeurs.commune))) {
    return 'L’adresse de ce bien est tenue par l’import WIPPIMMO : elle ne se modifie pas ici.';
  }
  if (!lu.encart.annexe && s.valeurs.adresse.trim() === '') return 'L’adresse du bien est obligatoire.';
  const gardees = s.annexes.filter((a) => a.sortir !== true);
  if ((s.valeurs.categorie === 'parking' || s.valeurs.categorie === 'box') && gardees.length > 0) {
    return 'Un parking nu n’a pas d’annexes : sortez-les du portefeuille, ou gardez la famille « Logement » ou « Local ».';
  }
  for (const [i, a] of gardees.entries()) {
    const nom = refusNomAnnexe(a.categorie, a.nomAnnexe);
    if (nom !== null) return `Annexe ${i + 1} : ${nom}`;
    if (a.autreAdresse && a.adresse.trim() === '') return `Annexe ${i + 1} : l’autre adresse est à renseigner.`;
    const lue = a.id === null ? undefined : lu.annexes.find((x) => x.id === a.id);
    if (lue !== undefined && !lue.adresseModifiable && adresseEnMots(lue) !== adresseEnMots(a)) {
      return `Annexe ${titreAnnexeSaisie(lue)} : son adresse est tenue par l’import WIPPIMMO, elle ne se modifie pas ici.`;
    }
  }
  if (s.statut !== null) {
    if (lu.statut === null || !lu.statut.disponible) return 'Le statut du bien ne peut pas encore changer (la mise à jour de la base n’est pas appliquée).';
    if (!lu.statut.gestes.some((g) => g.vers.includes(s.statut!.vers))) return 'Ce changement de statut n’est pas permis pour ce bien.';
  }
  return null;
}

/** L'EMPREINTE (version) d'une lecture : JSON aux clés triées, puis FNV-1a sur 2 × 32 bits. Deux lectures égales → même empreinte. PUR. */
export function empreinte(x: unknown): string {
  const stable = (v: unknown): string => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
  };
  const t = stable(x);
  let a = 0x811c9dc5; let b = 0x01000193 ^ t.length;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}
