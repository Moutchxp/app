/**
 * ══ 🔴🔴 LOCATION — LE MAIL « NOUVELLE LOCATION » (ENVOI ADHOC & MONGA) (Arno, 21/10/2026). PUR : ni base, ni réseau. ════════
 *
 * Modèle visuel validé par Arno : `docs/modeles/modele-mail-nouveau-locataire.html` — mêmes couleurs, mêmes cartes, même ordre
 * des blocs, mêmes libellés. Ici : l'OBJET, le HTML (tables et styles en ligne, 640 px, aucune ressource externe — Gmail,
 * Outlook, Apple Mail) et la version TEXTE équivalente, plus les règles qui décident de ce qu'on y lit :
 *   · le STATUT du ou des propriétaires (nouveau / déjà en gestion — `statutProprietaires`) ;
 *   · le REGROUPEMENT des lots par adresse (`grouperParAdresse`, `cleAdresse`) ;
 *   · le BANDEAU de l'assurance loyers impayés (`bandeauGli`) ;
 *   · la LISTE des destinataires d'un envoi (`listeProposee`, `verifierDestinataires`).
 * 🔴 Toute information absente n'est PAS affichée (jamais « non renseigné »), sauf le bandeau GLI. Le mot « client » n'apparaît
 *    nulle part. Les données viennent de la base (`mailNouvelleLocationRepo.ts`) : rien n'est saisi en plus.
 */
import { LIBELLE_COMPTE, LIBELLE_DEPOT, LIBELLE_REGLEMENT, type ConditionsEntree } from './conditionsEntree';
import { eurosAffiches, LIBELLE_ZONE, lireDecimal, tarifAffiche, ZERO, type CalculHonoraires } from './honorairesProprietaire';

// ── LES COULEURS DU MODÈLE ────────────────────────────────────────────────────────────────────────────────────────────────
/** Arno (21/10/2026) — l'introduction et la formule de fin du mail. */
export const INTRODUCTION = ['Bonjour,', 'Nous avons le plaisir de vous informer qu’un bien que nous gérons vient d’être loué. Vous trouverez ci-dessous le dossier complet pour l’enregistrer de votre côté. N’hésitez pas à revenir vers nous si une information vous manque.'];
export const SIGNATURE = ['Merci et belle journée,', 'L’équipe gestion'];

const C = {
  bord: '#9b1c1c', bordL: '#fbeaea', ink: '#1d2433', mut: '#6b7280', line: '#e5e7eb', bg: '#f3f4f6', vert: '#2f7d4f', vertL: '#e8f4ec',
  bleu: '#2f5bb5', bleuL: '#e9effb', ambre: '#b7791f', ambreL: '#fdf3e1', gris: '#fafafa',
} as const;
const POLICE = '-apple-system,\'Helvetica Neue\',Inter,Arial,sans-serif';

// ── LES DONNÉES ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Une personne (propriétaire, locataire, garant) avec TOUTES les coordonnées de sa fiche. */
export interface PersonneMail {
  civilite: string | null; nom: string; prenom: string | null; qualite: string | null; adresse: string | null;
  mobiles: string[]; fixes: string[]; emails: string[]; note: string | null;
}
export interface GarantMail extends PersonneMail { garantit: string[] }

export interface LigneMail { mot: string; valeur: string; fort?: boolean }

export interface LotMail {
  id: number; principal: boolean;
  /** « Lot principal · Appartement 3 pièces », « Cave », « Parking · box simple ». */
  titre: string;
  /** « MEUBLÉ » / « NON MEUBLÉ » (lot principal seulement). */
  etiquette: string | null;
  /** L'adresse affichée et sa clé normalisée (numéro, voie, code postal, commune). */
  adresse: string; cleAdresse: string;
  lignes: LigneMail[];
}

export type EtatGli = 'oui' | 'non' | 'inconnue';
export interface BandeauGli {
  etat: EtatGli; titre: string; detail: string | null;
  /** Arno (21/10/2026) — la garantie saisie (GLI, Visale, Autre, Aucune) ; `null` : non renseignée. */
  sorte?: 'gli' | 'visale' | 'autre' | 'aucune' | null;
}

export interface StatutProprietaires {
  sorte: 'nouveau' | 'deja';
  /** Les deux lignes de la pastille, centrées. */
  pastille: [string, string];
  /** « NOUVEAU PROPRIÉTAIRE » … : le statut tel qu'il entre dans l'objet. */
  objet: string;
  phrase: string;
  /** Le mandat de gestion, s'il est renseigné. */
  mandat: string | null;
}

export interface MessageAccompagnement { auteur: string; texte: string }

export interface DonneesNouvelleLocation {
  bailId: number;
  /** « AAAA-MM-JJ ». */
  entree: string;
  /** L'adresse du bien loué : la voie (« 12 rue Victor Hugo »), le code postal et la commune. */
  bien: { voie: string | null; codePostal: string | null; commune: string | null };
  statut: StatutProprietaires;
  proprietaires: PersonneMail[];
  lots: LotMail[];
  gli: BandeauGli;
  locataires: PersonneMail[];
  garants: GarantMail[];
  bail: { loyer: { principal: number | null; provisions: number | null } | null; lignes: LigneMail[] };
  /** Arno (21/10/2026) — le message d'accompagnement saisi dans la fenêtre de confirmation ; absent ou vide : aucun encart. */
  message?: MessageAccompagnement | null;
  /** Le dossier N7 du bail sur le Drive ; `null` : pas encore créé. */
  driveUrl: string | null;
  expediteur: string;
}

// ── FORMATS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « 2026-11-01 » → « 01/11/2026 ». */
export function dateCourte(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m === null ? '' : `${m[3]}/${m[2]}/${m[1]}`;
}

/** « 2026-11-01 » → « 1er novembre 2026 ». */
export function dateEnLettres(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (m === null) return '';
  const j = Number(m[3]);
  return `${j === 1 ? '1er' : j} ${MOIS[Number(m[2]) - 1] ?? ''} ${m[1]}`;
}

/** Des centimes → « 1 240,00 € ». */
export function euros(centimes: number): string {
  const signe = centimes < 0 ? '−' : '';
  const a = Math.abs(Math.round(centimes));
  return `${signe}${String(Math.trunc(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${String(a % 100).padStart(2, '0')} €`;
}

const present = (s: string | null | undefined): s is string => typeof s === 'string' && s.trim() !== '';

/** « M. DUPONT Jean ». */
export function nomAffiche(p: Pick<PersonneMail, 'civilite' | 'nom' | 'prenom'>): string {
  return [p.civilite, p.nom.toLocaleUpperCase('fr-FR'), p.prenom].filter(present).map((x) => x.trim()).join(' ');
}

/** Un numéro de mobile français (06, 07, +33 6, +33 7, 0033 6…). PUR. */
export function estMobile(numero: string): boolean {
  const n = numero.replace(/[^\d+]/g, '');
  return /^(?:0|\+33|0033)[67]\d{8}$/.test(n);
}

// ── LE STATUT DES PROPRIÉTAIRES ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * L'historique d'UN propriétaire actif du bien. `dejaEnGestion` (calculé par le dépôt) : il a, à la date de l'envoi, au moins
 * UN AUTRE bien en gestion dans le portefeuille (hors les lots de ce bail), OU ce même bien a déjà eu un bail avant celui-ci.
 * `depuis` : la plus ancienne date connue de sa gestion (début de gestion d'un de ses biens, sinon début de la relation).
 */
export interface HistoriqueProprietaire { nom: string; dejaEnGestion: boolean; depuis: string | null }

/**
 * LA RÈGLE (Arno, 21/10/2026, proposée par ce lot) :
 *   · tous les propriétaires actifs sont nouveaux → NOUVEAU PROPRIÉTAIRE / NOUVEAUX PROPRIÉTAIRES, « Premier bien confié en
 *     gestion par … » ;
 *   · au moins un est déjà en gestion → PROPRIÉTAIRE DÉJÀ EN GESTION / PROPRIÉTAIRES DÉJÀ EN GESTION, « En gestion depuis le
 *     … · N biens en gestion » (la plus ancienne date des propriétaires déjà en gestion ; N = les biens en gestion de
 *     l'ensemble des propriétaires, celui-ci compris) ; un copropriétaire qui, lui, arrive est nommé à la suite
 *     (« · nouveau copropriétaire : … »).
 * Singulier ou pluriel selon le NOMBRE de propriétaires actifs. PUR.
 */
export function statutProprietaires(o: { proprietaires: readonly HistoriqueProprietaire[]; biensEnGestion: number; mandats: readonly string[];
  /** Arno (21/10/2026, 397) — les lignes du mandat DU BIEN (« Mandat de gestion n° …, signé le … »), quand on les connaît. */
  mandatLibelles?: readonly string[] }): StatutProprietaires {
  const n = o.proprietaires.length;
  const pluriel = n > 1;
  const deja = o.proprietaires.some((p) => p.dejaEnGestion);
  const mandats = [...new Set(o.mandats.filter(present).map((m) => m.trim()))];
  const libelles = [...new Set((o.mandatLibelles ?? []).filter(present))];
  const mandat = o.mandatLibelles !== undefined ? (libelles.length === 0 ? null : libelles.join(' · '))
    : mandats.length === 0 ? null : `Mandat de gestion n° ${mandats.join(' · n° ')}`;
  const noms = (l: readonly HistoriqueProprietaire[]): string => {
    const t = l.map((p) => p.nom);
    return t.length <= 1 ? (t[0] ?? '') : `${t.slice(0, -1).join(', ')} et ${t[t.length - 1]}`;
  };
  if (!deja) {
    const pastille: [string, string] = pluriel ? ['NOUVEAUX', 'PROPRIÉTAIRES'] : ['NOUVEAU', 'PROPRIÉTAIRE'];
    return { sorte: 'nouveau', pastille, objet: pastille.join(' '), mandat,
      phrase: n === 0 ? 'Premier bien confié en gestion' : `Premier bien confié en gestion par ${noms(o.proprietaires)}` };
  }
  const pastille: [string, string] = pluriel ? ['PROPRIÉTAIRES', 'DÉJÀ EN GESTION'] : ['PROPRIÉTAIRE', 'DÉJÀ EN GESTION'];
  const dates = o.proprietaires.filter((p) => p.dejaEnGestion && p.depuis !== null).map((p) => p.depuis as string).sort();
  const nouveaux = o.proprietaires.filter((p) => !p.dejaEnGestion);
  const morceaux = [
    dates[0] !== undefined ? `En gestion depuis le ${dateCourte(dates[0])}` : 'Déjà en gestion',
    o.biensEnGestion > 0 ? `${o.biensEnGestion} bien${o.biensEnGestion > 1 ? 's' : ''} en gestion` : null,
    nouveaux.length === 0 ? null : `${nouveaux.length > 1 ? 'nouveaux copropriétaires' : 'nouveau copropriétaire'} : ${noms(nouveaux)}`,
  ].filter((x): x is string => x !== null);
  return { sorte: 'deja', pastille, objet: pastille.join(' '), phrase: morceaux.join(' · '), mandat };
}

// ── LES ADRESSES ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const ABREVIATIONS: Record<string, string> = {
  bd: 'boulevard', bld: 'boulevard', bvd: 'boulevard', boul: 'boulevard', av: 'avenue', ave: 'avenue', avn: 'avenue', r: 'rue',
};

/** Casse, accents, ponctuation, espaces, abréviations (bd, av, r…) : la forme comparée. PUR. */
export function normaliserMorceau(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    .split(' ').filter((m) => m !== '').map((m) => ABREVIATIONS[m] ?? m).join(' ');
}

/**
 * Deux adresses sont IDENTIQUES quand le numéro, la voie, le code postal et la commune sont égaux après normalisation.
 * La clé les met bout à bout. PUR.
 */
export function cleAdresse(a: { voie: string | null; codePostal: string | null; commune: string | null }): string {
  return [normaliserMorceau(a.voie), (a.codePostal ?? '').replace(/\s/g, ''), normaliserMorceau(a.commune)].join('|');
}

/** « 12 rue Victor Hugo, 92400 Courbevoie ». */
export function adresseAffichee(a: { voie: string | null; codePostal: string | null; commune: string | null }): string {
  const ville = [a.codePostal, a.commune].filter(present).join(' ');
  return [a.voie, ville].filter(present).join(', ');
}

export interface GroupeAdresse { adresse: string; cle: string; lots: LotMail[]; autre: boolean }

/** Les lots REGROUPÉS par adresse ; le groupe du lot principal d'abord, les autres dans l'ordre d'arrivée. PUR. */
export function grouperParAdresse(lots: readonly LotMail[]): GroupeAdresse[] {
  const principal = lots.find((l) => l.principal) ?? lots[0];
  const groupes = new Map<string, GroupeAdresse>();
  const ordre = principal === undefined ? lots : [principal, ...lots.filter((l) => l !== principal)];
  for (const l of ordre) {
    const g = groupes.get(l.cleAdresse);
    if (g === undefined) groupes.set(l.cleAdresse, { adresse: l.adresse, cle: l.cleAdresse, lots: [l], autre: principal !== undefined && l.cleAdresse !== principal.cleAdresse });
    else g.lots.push(l);
  }
  return [...groupes.values()];
}

const nbLots = (n: number): string => `${n} lot${n > 1 ? 's' : ''}`;

/** Le bandeau de « Le bien loué » : vert (une adresse) ou orange (plusieurs, avec le détail). PUR. */
export function bandeauAdresses(groupes: readonly GroupeAdresse[]): { ok: boolean; titre: string; detail: string | null } {
  if (groupes.length <= 1) return { ok: true, titre: '✓ Tous les lots sont à la même adresse', detail: null };
  return {
    ok: false, titre: `⚠ ATTENTION · lots à ${groupes.length} adresses différentes`,
    detail: groupes.map((g) => `${g.adresse.split(',')[0]} (${nbLots(g.lots.length)})`).join(' · '),
  };
}

// ── LES LOTS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Ce que la base sait d'un lot (le logement / local / parking principal, ou une annexe). */
export interface LotSource {
  id: number; principal: boolean;
  categorie: string | null; typeLibelle: string | null; nombrePieces: number | null; meuble: boolean | null;
  nomAnnexe: string | null; parkingSituation: string | null; parkingType: string | null;
  voie: string | null; codePostal: string | null; commune: string | null;
  porte: string | null; numLotCopro: string | null; batiment: string | null; escalier: string | null; etage: string | null;
  precisionAcces: string | null; ascenseur: boolean | null; digicode: boolean | null; digicodeCode: string | null;
  surfaceHabitable: string | null; surfaceCarrez: string | null; surfaceExterieure: string | null; surface: string | null;
  construction: string | null; chauffage: string | null;
  dpeClasse: string | null; dpeDate: string | null; dpeNonSoumis: boolean | null;
  syndic: string | null; derniereAg: string | null;
  assurancePno: boolean | null; pnoAnniversaire: string | null;
  entretiens: string[];
  annotation: string | null; commentaire: string | null;
  /** Arno (21/10/2026, migration 400) — qui règle les charges de copropriété au syndic (lot principal) ; absent = non renseigné. */
  chargesCopro?: 'proprietaire' | 'agence' | null;
}

const m2 = (s: string | null): string | null => (present(s) ? `${s.replace('.', ',')} m²` : null);
const ouiNon = (b: boolean | null): string | null => (b === null ? null : b ? 'Oui' : 'Non');

/** « 3ᵉ », « Rez-de-chaussée », « −1 » : l'étage lisible (le texte saisi tel quel s'il n'est pas un nombre). */
export function etageAffiche(e: string | null): string | null {
  if (!present(e)) return null;
  const t = e.trim();
  if (!/^-?\d+$/.test(t)) return t;
  const n = Number(t);
  return n === 0 ? 'Rez-de-chaussée' : n < 0 ? `−${-n}` : n === 1 ? '1er' : `${n}ᵉ`;
}

const LIBELLE_PARKING: Record<string, string> = { place_simple: 'place simple', place_double: 'place double', box_simple: 'box simple', box_double: 'box double' };
const LIBELLE_SITUATION: Record<string, string> = { interieur: 'Intérieur', exterieur: 'Extérieur' };
const LIBELLE_CAT: Record<string, string> = { logement: 'Logement', cave: 'Cave', parking: 'Parking', box: 'Box', local: 'Local', autre: 'Annexe' };

/** Les lignes d'un lot, une caractéristique par ligne ; rien d'absent. PUR. */
export function lignesDuLot(l: LotSource): LigneMail[] {
  const dpe = l.dpeNonSoumis === true ? 'Non soumis'
    : present(l.dpeClasse) ? `Classe ${l.dpeClasse.toUpperCase()}${present(l.dpeDate) ? `, du ${dateCourte(l.dpeDate)}` : ''}` : null;
  const pno = l.assurancePno === null ? null
    : l.assurancePno ? `Oui${present(l.pnoAnniversaire) ? ` · date anniversaire le ${dateCourte(l.pnoAnniversaire)}` : ''}` : 'Non';
  const digicode = l.digicode === null ? null : l.digicode ? (present(l.digicodeCode) ? l.digicodeCode.trim() : 'Oui') : 'Non';
  const lignes: (LigneMail | null)[] = [
    present(l.porte) ? { mot: 'N° affiché', valeur: l.porte.trim() } : null,
    present(l.numLotCopro) ? { mot: 'N° de lot', valeur: l.numLotCopro.trim() } : null,
    present(l.batiment) ? { mot: 'Bâtiment', valeur: l.batiment.trim() } : null,
    present(l.escalier) ? { mot: 'Escalier', valeur: l.escalier.trim() } : null,
    etageAffiche(l.etage) === null ? null : { mot: l.principal ? 'Étage' : 'Niveau', valeur: etageAffiche(l.etage) as string },
    present(l.precisionAcces) ? { mot: 'Précision', valeur: l.precisionAcces.trim() } : null,
    ouiNon(l.ascenseur) === null ? null : { mot: 'Ascenseur', valeur: ouiNon(l.ascenseur) as string },
    digicode === null ? null : { mot: 'Digicode', valeur: digicode, fort: true },
    l.nombrePieces === null ? null : { mot: 'Pièces', valeur: String(l.nombrePieces) },
    l.parkingSituation !== null && LIBELLE_SITUATION[l.parkingSituation] ? { mot: 'Situation', valeur: LIBELLE_SITUATION[l.parkingSituation] } : null,
    m2(l.surfaceHabitable) === null ? null : { mot: 'Surface habitable', valeur: m2(l.surfaceHabitable) as string },
    m2(l.surfaceCarrez) === null ? null : { mot: 'Surface Carrez/Boutin', valeur: m2(l.surfaceCarrez) as string },
    m2(l.surfaceExterieure) === null ? null : { mot: 'Surface extérieure', valeur: m2(l.surfaceExterieure) as string },
    m2(l.surface) === null ? null : { mot: 'Surface', valeur: m2(l.surface) as string },
    present(l.construction) ? { mot: 'Construction', valeur: l.construction.trim() } : null,
    present(l.chauffage) ? { mot: 'Chauffage', valeur: l.chauffage.trim() } : null,
    dpe === null ? null : { mot: 'DPE', valeur: dpe },
    present(l.syndic) ? { mot: 'Syndic', valeur: l.syndic.trim() } : null,
    // Arno (21/10/2026) : EN GRAS, juste après le syndic — information importante pour la comptabilité ; absente si non renseignée.
    l.chargesCopro === 'proprietaire' || l.chargesCopro === 'agence'
      ? { mot: 'Charges copro', valeur: l.chargesCopro === 'proprietaire' ? 'Payées par le propriétaire' : 'Payées par l’agence', fort: true } : null,
    present(l.derniereAg) ? { mot: 'Dernière AG', valeur: dateCourte(l.derniereAg) || l.derniereAg } : null,
    pno === null ? null : { mot: 'Assurance PNO', valeur: pno },
    l.entretiens.length === 0 ? null : { mot: 'Entretiens', valeur: l.entretiens.join(' · ') },
    present(l.annotation) ? { mot: 'Annotation', valeur: l.annotation.trim() } : null,
    present(l.commentaire) ? { mot: 'Commentaire', valeur: l.commentaire.trim() } : null,
  ];
  return lignes.filter((x): x is LigneMail => x !== null);
}

/** Le lot tel que le mail le montre (titre, étiquette, adresse, lignes). PUR. */
export function lotDuMail(l: LotSource, adresseRepli: { voie: string | null; codePostal: string | null; commune: string | null }): LotMail {
  const propre = present(l.voie) ? { voie: l.voie, codePostal: l.codePostal, commune: l.commune } : adresseRepli;
  let titre: string;
  if (l.principal) {
    const type = l.typeLibelle ?? (l.categorie ? LIBELLE_CAT[l.categorie] ?? null : null);
    const pieces = l.nombrePieces === null ? null : `${l.nombrePieces} pièce${l.nombrePieces > 1 ? 's' : ''}`;
    const quoi = [type, pieces].filter(present).join(' ');
    titre = quoi === '' ? 'Lot principal' : `Lot principal · ${quoi}`;
  } else {
    const nom = l.categorie === 'autre' && present(l.nomAnnexe) ? l.nomAnnexe.trim() : (l.categorie ? LIBELLE_CAT[l.categorie] ?? 'Annexe' : 'Annexe');
    const parking = l.parkingType !== null ? LIBELLE_PARKING[l.parkingType] ?? null : null;
    titre = parking === null ? nom : `${nom} · ${parking}`;
  }
  return {
    id: l.id, principal: l.principal, titre,
    etiquette: l.principal && l.meuble !== null ? (l.meuble ? 'MEUBLÉ' : 'NON MEUBLÉ') : null,
    adresse: adresseAffichee(propre), cleAdresse: cleAdresse(propre), lignes: lignesDuLot(l),
  };
}

// ── LE BAIL ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Les lignes du bloc « Le bail » : entrée, prélèvement, mode de règlement, proratas, dépôt de garantie (et qui le conserve),
 * honoraires locataire, honoraires propriétaire (le calcul ENREGISTRÉ à l'entrée et la version de barème utilisée — jamais
 * refait ici). Sans conditions d'entrée : la date seule. PUR.
 */
export function lignesBailMail(entree: string, c: ConditionsEntree | null, h: CalculHonoraires | null): LigneMail[] {
  const l: LigneMail[] = [];
  if (dateEnLettres(entree) !== '') l.push({ mot: 'Entrée', valeur: dateEnLettres(entree) });
  if (c === null) return l;
  l.push({ mot: 'Prélèvement', valeur: c.prelevement && c.jour !== null ? `Le ${c.jour === 1 ? '1er' : c.jour} de chaque mois` : 'Pas de prélèvement' });
  l.push({ mot: 'Mode de règlement', valeur: c.reglement === 'autre' && present(c.reglementPrecision) ? `Autre : ${c.reglementPrecision.trim()}` : LIBELLE_REGLEMENT[c.reglement] });
  const s = c.sommes;
  const proratas = [s.prorataLoyer === null ? null : `Loyer ${euros(s.prorataLoyer)}`, s.prorataCharges === null ? null : `charges ${euros(s.prorataCharges)}`].filter((x): x is string => x !== null);
  if (proratas.length > 0) l.push({ mot: 'Proratas d’entrée', valeur: proratas.join(' · ') });
  const minuscule = (t: string): string => t.charAt(0).toLowerCase() + t.slice(1);
  l.push({ mot: 'Dépôt de garantie', valeur: [s.depotGarantie === null ? null : euros(s.depotGarantie), s.depotGarantie === null ? LIBELLE_DEPOT[c.depot] : minuscule(LIBELLE_DEPOT[c.depot])].filter((x): x is string => x !== null).join(' · ') });
  l.push({ mot: 'Honoraires locataire', valeur: [s.honorairesAgence === null ? null : euros(s.honorairesAgence), minuscule(LIBELLE_COMPTE[c.honorairesLocataire])].filter((x): x is string => x !== null).join(' · ') });
  const compteProprio = minuscule(LIBELLE_COMPTE[c.honorairesProprietaire]);
  if (h !== null && h.etat === 'ok') {
    const tarif = (t: string): string => tarifAffiche(lireDecimal(t) ?? ZERO).replace('/m²', '');
    l.push({ mot: 'Honoraires propriétaire',
      valeur: `${eurosAffiches(lireDecimal(h.total) ?? ZERO)} · ${h.surface.replace('.', ',')} m² × (${tarif(h.tarifZone)} + ${tarif(h.tarifEdl)}) · barème du ${dateCourte(h.baremeDepuis)}, ${LIBELLE_ZONE[h.zone]} · ${compteProprio}` });
  } else {
    l.push({ mot: 'Honoraires propriétaire', valeur: compteProprio.charAt(0).toUpperCase() + compteProprio.slice(1) });
  }
  if (present(c.commentaire)) l.push({ mot: 'Commentaire', valeur: c.commentaire.trim() });
  return l;
}

// ── L'ASSURANCE LOYERS IMPAYÉS ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 LE BANDEAU GARANTIE (Arno, 21/10/2026), lu dans les conditions d'entrée du bail (migration 391) :
 *   · GLI    → VERT ✓ « ASSURANCE LOYERS IMPAYÉS (GLI) » + l'assureur / le n° de contrat saisis ;
 *   · Visale → VERT ✓ « GARANTIE VISALE » + le n° de visa s'il est saisi ;
 *   · Autre  → VERT ✓ « GARANTIE : <détail saisi> » (« AUTRE GARANTIE » sans détail) ;
 *   · Aucune → ROUGE ✕ « PAS D'ASSURANCE LOYERS IMPAYÉS » + la caution en place (les garants) ou « aucune garantie » ;
 *   · pas de conditions d'entrée → ORANGE « GARANTIE NON RENSEIGNÉE ».
 * L'objet porte « · SANS GLI » pour « Aucune » seulement, et « · GARANTIE À VÉRIFIER » pour « non renseignée ». PUR.
 */
export function bandeauGli(c: { assurance: string; precision: string | null; garantPhysique: boolean } | null, garants: readonly string[]): BandeauGli {
  if (c === null) {
    return { etat: 'inconnue', sorte: null, titre: 'GARANTIE NON RENSEIGNÉE', detail: 'À vérifier : les conditions d’entrée de ce bail ne disent pas quelle garantie le couvre.' };
  }
  const precision = present(c.precision) ? c.precision.trim() : null;
  if (c.assurance === 'gli') return { etat: 'oui', sorte: 'gli', titre: 'ASSURANCE LOYERS IMPAYÉS (GLI)', detail: precision };
  if (c.assurance === 'visale') return { etat: 'oui', sorte: 'visale', titre: 'GARANTIE VISALE', detail: precision === null ? null : `N° de visa : ${precision}` };
  if (c.assurance === 'autre') return { etat: 'oui', sorte: 'autre', titre: precision === null ? 'AUTRE GARANTIE' : `GARANTIE : ${precision}`, detail: null };
  const caution = c.garantPhysique ? (garants.length > 0 ? `Caution en place : ${garants.join(' et ')}` : 'Caution en place : garant personne physique') : null;
  return { etat: 'non', sorte: 'aucune', titre: 'PAS D’ASSURANCE LOYERS IMPAYÉS', detail: caution ?? 'Aucune garantie' };
}

// ── L'OBJET ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Les noms de famille des locataires, en majuscules, sans doublon, dans l'ordre. */
export function nomsLocataires(l: readonly PersonneMail[]): string {
  return [...new Set(l.map((p) => p.nom.trim().toLocaleUpperCase('fr-FR')).filter((x) => x !== ''))].join(' – ');
}

/** « Nouvelle location · NOUVEAU PROPRIÉTAIRE · 12 rue Victor Hugo, Courbevoie · MARTIN · 01/11/2026 · SANS GLI ». PUR. */
export function objetNouvelleLocation(d: DonneesNouvelleLocation): string {
  const adresse = [d.bien.voie, d.bien.commune].filter(present).join(', ');
  // Arno (21/10/2026) : « SANS GLI » pour « Aucune » seulement ; Visale et Autre n'ajoutent rien.
  const suffixe = d.gli.etat === 'non' ? 'SANS GLI' : d.gli.etat === 'inconnue' ? 'GARANTIE À VÉRIFIER' : null;
  return ['Nouvelle location', d.statut.objet, adresse, nomsLocataires(d.locataires), dateCourte(d.entree), suffixe]
    .filter((x): x is string => present(x)).join(' · ');
}

// ── LE HTML ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

export function echapper(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const lienMail = (e: string): string => `<a href="mailto:${echapper(e)}" style="color:${C.bord};">${echapper(e)}</a>`;
const lienTel = (t: string): string => `<a href="tel:${echapper(t.replace(/[^\d+]/g, ''))}" style="color:${C.ink};text-decoration:none;">${echapper(t)}</a>`;

/** Une grille « libellé / valeur » (table à deux colonnes ; empilée au téléphone par la feuille de style). */
function grille(lignes: readonly { mot: string; html: string }[], largeur = 150): string {
  if (lignes.length === 0) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="g" style="border-collapse:collapse;">${lignes.map((l) => `
<tr><td class="g-l" width="${largeur}" valign="top" style="width:${largeur}px;padding:3px 14px 4px 0;color:${C.mut};font-size:11.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;font-family:${POLICE};">${echapper(l.mot)}</td><td class="g-v" valign="top" style="word-break:break-word;overflow-wrap:anywhere;padding:2px 0 4px;font-size:14.5px;line-height:1.45;color:${C.ink};font-family:${POLICE};">${l.html}</td></tr>`).join('')}</table>`;
}

const lignesGrille = (l: readonly LigneMail[]): { mot: string; html: string }[] =>
  l.map((x) => ({ mot: x.mot, html: x.fort ? `<b>${echapper(x.valeur)}</b>` : echapper(x.valeur) }));

/** Les coordonnées COMPLÈTES d'une personne, une par ligne. */
function lignesPersonne(p: PersonneMail, avant: { mot: string; html: string }[] = []): { mot: string; html: string }[] {
  return [
    ...avant,
    ...(present(p.qualite) ? [{ mot: 'Qualité', html: echapper(p.qualite.trim()) }] : []),
    ...(present(p.adresse) ? [{ mot: 'Adresse', html: echapper(p.adresse.trim()) }] : []),
    ...p.mobiles.map((t) => ({ mot: 'Mobile', html: lienTel(t) })),
    ...p.fixes.map((t) => ({ mot: 'Téléphone fixe', html: lienTel(t) })),
    ...p.emails.map((e) => ({ mot: 'E-mail', html: lienMail(e) })),
    ...(present(p.note) ? [{ mot: 'Note', html: echapper(p.note.trim()) }] : []),
  ];
}

/**
 * 🔴 COMPATIBLE GMAIL (Arno, 21/10/2026) : Gmail efface la couleur de fond d'un <div> (et le raccourci `background:`). TOUTE
 * couleur de fond est donc portée par une CASE DE TABLEAU, deux fois : l'attribut `bgcolor` et `background-color` ; jamais
 * par un <div> ni un <span>. Un texte blanc n'existe que dans une case qui porte elle-même son fond.
 */
export function caseColoree(fond: string, style: string, contenu: string, attributs = ''): string {
  return `<td bgcolor="${fond}"${attributs === '' ? '' : ` ${attributs}`} style="background-color:${fond};${style}">${contenu}</td>`;
}

/** Une petite pastille (« PROPRIÉTAIRE », « MEUBLÉ », « 2 lots ») : une case colorée dans son propre tableau. */
function pastille(texte: string, couleur: string, fond: string, bord?: string, arrondi = '6px'): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr>${caseColoree(fond,
    `${bord ? `border:1px solid ${bord};` : ''}border-radius:${arrondi};padding:3px 8px;font-size:12px;font-weight:700;letter-spacing:.4px;color:${couleur};white-space:nowrap;font-family:${POLICE};`,
    echapper(texte))}</tr></table>`;
}

/** Un titre suivi d'une pastille, sur une ligne (deux cases : aucun <span> coloré). */
function titreAvecPastille(titreHtml: string, styleTitre: string, pastilleHtml: string | null, marge = '0 0 8px'): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:${marge};"><tr><td valign="middle" style="${styleTitre}font-family:${POLICE};">${titreHtml}</td>${pastilleHtml === null ? '' : `<td valign="middle" style="padding-left:8px;">${pastilleHtml}</td>`}</tr></table>`;
}

function carte(o: { nom: string; etiquette: string; contenu: string; fond: string; bord: string; pointille?: boolean; couleurEtiquette: string; fondEtiquette: string; bordEtiquette?: string }): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:0 0 10px;"><tr>${caseColoree(o.fond, `border:1px ${o.pointille ? 'dashed' : 'solid'} ${o.bord};border-radius:12px;padding:14px 16px;`,
    `\n${titreAvecPastille(echapper(o.nom), `font-size:15.5px;font-weight:700;color:${C.ink};`, pastille(o.etiquette, o.couleurEtiquette, o.fondEtiquette, o.bordEtiquette))}\n${o.contenu}`)}</tr></table>`;
}

function bloc(titre: string, nb: number | null, contenu: string, couleur: string = C.bord, bordure: string = C.line): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:0 0 16px;"><tr><td style="border:1px solid ${bordure};border-radius:16px;padding:18px 20px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;"><tr>${caseColoree(couleur, 'width:4px;border-radius:2px;font-size:0;line-height:0;', '&nbsp;', 'width="4"')}<td style="padding-left:10px;font-size:13px;font-weight:800;letter-spacing:.9px;text-transform:uppercase;color:${C.ink};font-family:${POLICE};">${echapper(titre)}${nb === null ? '' : ` <span style="color:${C.mut};font-weight:700;">${nb}</span>`}</td></tr></table>
${contenu}</td></tr></table>`;
}

function htmlStatut(s: StatutProprietaires): string {
  const vert = s.sorte === 'nouveau';
  const fond = vert ? C.vertL : C.bleuL; const bord = vert ? '#b9dcc6' : '#c3d3f2'; const pastille = vert ? C.vert : C.bleu;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:0 0 22px;"><tr>${caseColoree(fond, `border:1.5px solid ${bord};border-radius:16px;padding:16px 18px;`, `
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
${caseColoree(pastille, `color:#ffffff;border-radius:12px;padding:8px 12px;text-align:center;font-size:12.5px;font-weight:800;letter-spacing:.6px;line-height:1.25;white-space:nowrap;font-family:${POLICE};`, `${echapper(s.pastille[0])}<br>${echapper(s.pastille[1])}`, 'valign="middle" align="center"')}
<td valign="middle" style="padding-left:14px;font-size:14.5px;line-height:1.45;color:${C.ink};font-family:${POLICE};"><b style="font-size:16px;">${echapper(s.phrase)}</b>${s.mandat === null ? '' : `<br>${echapper(s.mandat)}`}</td>
</tr></table>`)}</tr></table>`;
}

function htmlGli(g: BandeauGli): string {
  const st = g.etat === 'oui' ? { fond: C.vertL, bord: C.vert, texte: '#1f5a37', ic: C.vert, signe: '✓' }
    : g.etat === 'non' ? { fond: '#fdecec', bord: '#d64545', texte: '#8f1d1d', ic: '#d64545', signe: '✕' }
      : { fond: C.ambreL, bord: '#e8b65c', texte: '#7a4e0a', ic: C.ambre, signe: '!' };
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:0 0 14px;"><tr>${caseColoree(st.fond, `border:2px solid ${st.bord};border-radius:14px;padding:14px 16px;`, `
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" width="36" style="width:36px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr>${caseColoree(st.ic, `width:36px;height:36px;border-radius:18px;color:#ffffff;text-align:center;font-size:18px;font-weight:800;line-height:36px;font-family:${POLICE};`, st.signe, 'valign="middle" align="center" width="36" height="36"')}</tr></table></td>
<td valign="middle" style="padding-left:14px;color:${st.texte};font-family:${POLICE};"><b style="font-size:16px;letter-spacing:.3px;">${echapper(g.titre)}</b>${g.detail === null ? '' : `<br><span style="font-size:13.5px;color:${st.texte};">${echapper(g.detail)}</span>`}</td>
</tr></table>`)}</tr></table>`;
}

function htmlLot(l: LotMail): string {
  if (l.principal) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:0 0 12px;"><tr>${caseColoree(C.gris, 'border:1.5px solid #d9dce1;border-radius:14px;padding:18px 20px;',
      `\n${titreAvecPastille(echapper(l.titre), `font-size:17px;font-weight:700;color:${C.ink};`, l.etiquette === null ? null : pastille(l.etiquette, C.bord, C.bordL), '0 0 12px')}\n${grille(lignesGrille(l.lignes))}`)}</tr></table>`;
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:0 0 10px;"><tr>${caseColoree(C.gris, `border:1px solid ${C.line};border-radius:12px;padding:14px 16px;`,
    `\n${titreAvecPastille(echapper(l.titre), `font-size:15.5px;font-weight:700;color:${C.ink};`, null, '0 0 6px')}\n${grille(lignesGrille(l.lignes), 110)}`)}</tr></table>`;
}

function htmlBien(lots: readonly LotMail[]): string {
  const groupes = grouperParAdresse(lots);
  const b = bandeauAdresses(groupes);
  const bandeau = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:0 0 16px;"><tr>${b.ok
    ? caseColoree(C.vertL, `border:1.5px solid #b9dcc6;border-radius:12px;padding:12px 16px;font-size:15px;font-weight:700;color:${C.vert};font-family:${POLICE};`, echapper(b.titre))
    : caseColoree(C.ambreL, `border:1.5px solid #e8b65c;border-radius:12px;padding:12px 16px;font-size:13.5px;color:#7a4e0a;font-family:${POLICE};`,
      `<b style="font-size:15px;color:#8a4b00;letter-spacing:.2px;">${echapper(b.titre)}</b>${b.detail === null ? '' : `<br>${echapper(b.detail)}`}`)}</tr></table>`;
  const html = groupes.map((g) => {
    const etiquette = pastille(`${nbLots(g.lots.length)}${g.autre ? ' · autre adresse' : ''}`, g.autre ? '#8a4b00' : C.mut, g.autre ? C.ambreL : C.bg, undefined, '999px');
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 18px;"><tr><td style="border-left:4px solid ${g.autre ? '#e8b65c' : C.line};padding-left:14px;">
${titreAvecPastille(`📍 ${echapper(g.adresse)}`, `font-size:15.5px;font-weight:700;color:${C.ink};`, etiquette, '0 0 12px')}
${g.lots.map(htmlLot).join('\n')}</td></tr></table>`;
  }).join('\n');
  return bloc('Le bien loué', null, bandeau + html);
}

function htmlBail(d: DonneesNouvelleLocation): string {
  const l = d.bail.loyer;
  let loyer = '';
  if (l !== null && (l.principal !== null || l.provisions !== null)) {
    const ligne = (mot: string, v: string, total = false) => `<tr><td style="padding:3px 0;font-size:${total ? '18px' : '15px'};${total ? `font-weight:800;color:${C.bord};` : `color:${C.ink};`}font-family:${POLICE};">${mot}</td><td align="right" style="padding:3px 0;font-size:${total ? '18px' : '15px'};${total ? `font-weight:800;color:${C.bord};` : `color:${C.ink};`}white-space:nowrap;font-family:${POLICE};">${v}</td></tr>`;
    loyer = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:0 0 12px;"><tr>${caseColoree(C.bordL, 'border:1.5px solid #efc4c4;border-radius:16px;padding:16px 20px;', `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${l.principal === null ? '' : ligne('Loyer principal', euros(l.principal))}${l.provisions === null ? '' : ligne('Provision pour charges', euros(l.provisions))}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1.5px solid #e9b8b8;margin-top:8px;">${ligne('Total charges comprises', euros((l.principal ?? 0) + (l.provisions ?? 0)), true)}</table>
`)}</tr></table>`;
  }
  return bloc('Le bail', null, loyer + grille(lignesGrille(d.bail.lignes)));
}

/** Le mail HTML complet (640 px, styles en ligne, tables). PUR. */
export function htmlNouvelleLocation(d: DonneesNouvelleLocation): string {
  const adresse = adresseAffichee(d.bien);
  const proprietaires = d.proprietaires.length === 0 ? '' : bloc('Propriétaire', d.proprietaires.length, d.proprietaires.map((p, i) => carte({
    nom: nomAffiche(p), etiquette: i === 0 ? 'PROPRIÉTAIRE' : 'COPROPRIÉTAIRE', contenu: grille(lignesPersonne(p)),
    fond: C.gris, bord: C.line, couleurEtiquette: C.bord, fondEtiquette: C.bordL,
  })).join('\n'));
  const locataires = bloc('Locataires', d.locataires.length, [
    htmlGli(d.gli),
    ...d.locataires.map((p, i) => carte({
      nom: nomAffiche(p), etiquette: i === 0 ? 'LOCATAIRE' : 'COLOCATAIRE', contenu: grille(lignesPersonne(p)),
      fond: C.vertL, bord: '#b9dcc6', couleurEtiquette: C.vert, fondEtiquette: '#ffffff', bordEtiquette: '#b9dcc6',
    })),
    ...d.garants.map((g) => carte({
      nom: nomAffiche(g), etiquette: 'GARANT', pointille: true,
      contenu: grille(lignesPersonne(g, g.garantit.length === 0 ? [] : [{ mot: 'Garantit', html: echapper(g.garantit.join(' · ')) }])),
      fond: '#ffffff', bord: '#b9dcc6', couleurEtiquette: C.vert, fondEtiquette: '#ffffff', bordEtiquette: '#b9dcc6',
    })),
  ].join('\n'), C.vert, '#b9dcc6');
  const bouton = d.driveUrl !== null
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px;"><tr>${caseColoree(C.bord, `border-radius:14px;padding:15px;color:#ffffff;font-weight:700;font-size:15.5px;font-family:${POLICE};`,
      `<a href="${echapper(d.driveUrl)}" style="color:#ffffff;text-decoration:none;font-weight:700;font-size:15.5px;font-family:${POLICE};">Ouvrir le dossier Drive du bail</a>`, 'align="center"')}</tr></table>`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px;"><tr>${caseColoree(C.bg, `border:1.5px dashed #d1d5db;border-radius:14px;padding:15px;color:${C.mut};font-weight:700;font-size:15.5px;font-family:${POLICE};`, 'Dossier Drive en cours de création', 'align="center"')}</tr></table>`;
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${echapper(objetNouvelleLocation(d))}</title>
<style>@media only screen and (max-width:560px){.corps{padding:20px 16px 6px !important}.haut{padding:20px 16px !important}.pied{padding:16px 16px 20px !important}.g-l,.g-v{display:block !important;width:auto !important}.g-l{padding:6px 0 0 !important}}</style>
</head>
<body bgcolor="${C.bg}" style="margin:0;padding:0;background-color:${C.bg};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background-color:${C.bg};"><tr>${caseColoree(C.bg, 'padding:24px 8px 40px;', `
<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:640px;background-color:#ffffff;border-radius:20px;border-collapse:separate;overflow:hidden;">
<tr>${caseColoree(C.ink, `color:#ffffff;padding:22px 28px;border-radius:20px 20px 0 0;font-family:${POLICE};`, `
<div style="font-size:13px;letter-spacing:.4px;color:#c9ccd3;"><span style="color:#f2a3a3;font-weight:700;">Sans Vis-à-Vis®</span> · Gestion locative</div>
<div style="font-size:24px;line-height:1.25;margin-top:8px;font-weight:700;color:#ffffff;">Nouvelle location</div>
<div style="margin-top:6px;font-size:15px;color:#e3e5ea;">${echapper(adresse)}${d.entree ? ` · entrée le ${echapper(dateEnLettres(d.entree))}` : ''}</div>
`, 'class="haut"')}</tr>
<tr><td class="corps" style="word-break:break-word;overflow-wrap:anywhere;padding:24px 28px 8px;font-family:${POLICE};color:${C.ink};">
<p style="font-size:15.5px;line-height:1.6;margin:0 0 18px;">${INTRODUCTION.map(echapper).join('<br>')}</p>
${htmlMessage(d.message ?? null)}
${htmlStatut(d.statut)}
${proprietaires}
${htmlBien(d.lots)}
${locataires}
${htmlBail(d)}
${bouton}
<p style="font-size:15.5px;line-height:1.6;margin:0 0 18px;">${SIGNATURE.map(echapper).join('<br>')}</p>
</td></tr>
<tr><td class="pied" style="border-top:1px solid ${C.line};padding:18px 28px 24px;font-size:13.5px;color:${C.mut};line-height:1.6;font-family:${POLICE};">Pour toute question, répondez simplement à ce mail.<br><b style="color:${C.ink};">L’équipe gestion</b> · Sans Vis-à-Vis® · SARL CRITERIMMO<br>${lienMail(d.expediteur)}</td></tr>
</table>`, 'align="center"')}</tr></table>
</body></html>`;
}

/**
 * Arno (21/10/2026) — LE MESSAGE D'ACCOMPAGNEMENT (facultatif) : juste après l'introduction, avant la pastille de statut, dans
 * un encart gris clair à trait vertical gauche, « Message de <Prénom Nom> ». Texte ÉCHAPPÉ (aucun HTML interprété), retours à la
 * ligne conservés. Vide : aucun encart.
 */
function htmlMessage(m: MessageAccompagnement | null): string {
  if (m === null || m.texte.trim() === '') return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:0 0 18px;"><tr>${caseColoree(C.line, 'width:4px;font-size:0;line-height:0;', '&nbsp;', 'width="4"')}${caseColoree(C.gris,
    `padding:14px 16px;font-size:14.5px;line-height:1.55;color:${C.ink};font-family:${POLICE};`,
    `<b style="font-size:13px;letter-spacing:.4px;color:${C.mut};">${echapper(`Message de ${m.auteur}`)}</b><br>${echapper(m.texte.replace(/\r\n?/g, '\n')).replace(/\n/g, '<br>')}`)}</tr></table>`;
}

// ── LE TEXTE BRUT ────────────────────────────────────────────────────────────────────────────────────────────────────────

function textePersonne(p: PersonneMail, role: string, avant: string[] = []): string[] {
  return [
    `${nomAffiche(p)} — ${role}`,
    ...avant,
    ...(present(p.qualite) ? [`  Qualité : ${p.qualite.trim()}`] : []),
    ...(present(p.adresse) ? [`  Adresse : ${p.adresse.trim()}`] : []),
    ...p.mobiles.map((t) => `  Mobile : ${t}`),
    ...p.fixes.map((t) => `  Téléphone fixe : ${t}`),
    ...p.emails.map((e) => `  E-mail : ${e}`),
    ...(present(p.note) ? [`  Note : ${p.note.trim()}`] : []),
  ];
}

/** La version texte, équivalente au HTML (mêmes blocs, même ordre, mêmes absences). PUR. */
export function texteNouvelleLocation(d: DonneesNouvelleLocation): string {
  const l: string[] = [];
  const titre = (t: string) => { l.push('', `━━ ${t.toLocaleUpperCase('fr-FR')} ━━`); };
  l.push('Sans Vis-à-Vis® · Gestion locative', 'NOUVELLE LOCATION', `${adresseAffichee(d.bien)}${d.entree ? ` · entrée le ${dateEnLettres(d.entree)}` : ''}`, '',
    ...INTRODUCTION, '',
    ...(d.message && d.message.texte.trim() !== '' ? [`── Message de ${d.message.auteur} ──`, ...d.message.texte.replace(/\r\n?/g, '\n').split('\n'), ''] : []),
    `[${d.statut.pastille.join(' ')}] ${d.statut.phrase}`);
  if (d.statut.mandat !== null) l.push(d.statut.mandat);
  if (d.proprietaires.length > 0) {
    titre(`Propriétaire (${d.proprietaires.length})`);
    d.proprietaires.forEach((p, i) => { l.push(...textePersonne(p, i === 0 ? 'PROPRIÉTAIRE' : 'COPROPRIÉTAIRE'), ''); });
  }
  titre('Le bien loué');
  const groupes = grouperParAdresse(d.lots);
  const b = bandeauAdresses(groupes);
  l.push(b.titre);
  if (b.detail !== null) l.push(b.detail);
  for (const g of groupes) {
    l.push('', `📍 ${g.adresse} (${nbLots(g.lots.length)}${g.autre ? ' · autre adresse' : ''})`);
    for (const lot of g.lots) {
      l.push(`  ${lot.titre}${lot.etiquette === null ? '' : ` — ${lot.etiquette}`}`);
      for (const x of lot.lignes) l.push(`    ${x.mot} : ${x.valeur}`);
    }
  }
  titre(`Locataires (${d.locataires.length})`);
  l.push(`${d.gli.etat === 'oui' ? '✓' : d.gli.etat === 'non' ? '✕' : '!'} ${d.gli.titre}${d.gli.detail === null ? '' : ` — ${d.gli.detail}`}`, '');
  d.locataires.forEach((p, i) => { l.push(...textePersonne(p, i === 0 ? 'LOCATAIRE' : 'COLOCATAIRE'), ''); });
  d.garants.forEach((g) => { l.push(...textePersonne(g, 'GARANT', g.garantit.length === 0 ? [] : [`  Garantit : ${g.garantit.join(' · ')}`]), ''); });
  titre('Le bail');
  const loyer = d.bail.loyer;
  if (loyer !== null && (loyer.principal !== null || loyer.provisions !== null)) {
    if (loyer.principal !== null) l.push(`Loyer principal : ${euros(loyer.principal)}`);
    if (loyer.provisions !== null) l.push(`Provision pour charges : ${euros(loyer.provisions)}`);
    l.push(`Total charges comprises : ${euros((loyer.principal ?? 0) + (loyer.provisions ?? 0))}`);
  }
  for (const x of d.bail.lignes) l.push(`${x.mot} : ${x.valeur}`);
  l.push('', d.driveUrl !== null ? `Ouvrir le dossier Drive du bail : ${d.driveUrl}` : 'Dossier Drive en cours de création', '', ...SIGNATURE, '',
    'Pour toute question, répondez simplement à ce mail.', 'L’équipe gestion · Sans Vis-à-Vis® · SARL CRITERIMMO', d.expediteur);
  return l.join('\n');
}

// ── LES DESTINATAIRES ────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Destinataire { adresse: string; libelle: string }
/** Une ligne de la fenêtre de confirmation : `personnelle` = la copie de la personne connectée, posée d'office. */
export interface DestinatairePropose extends Destinataire { personnelle?: boolean }

export const FORMAT_ADRESSE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
export const MAX_DESTINATAIRES = 30;

/** « Vous (Arno JOREL) · copie personnelle ». */
export const libelleCopiePersonnelle = (nom: string): string => `Vous (${nom}) · copie personnelle`;

/**
 * La liste proposée pour UN envoi : EN TÊTE la personne connectée (l'e-mail de son compte), puis la liste configurée. Son
 * adresse déjà dans la liste n'est pas ajoutée une seconde fois. PUR.
 */
export function listeProposee(config: readonly Destinataire[], session: { email: string | null; nom: string }): DestinatairePropose[] {
  const e = (session.email ?? '').trim();
  const deja = config.some((d) => d.adresse.trim().toLowerCase() === e.toLowerCase());
  return [
    ...(FORMAT_ADRESSE.test(e) && !deja ? [{ adresse: e, libelle: libelleCopiePersonnelle(session.nom), personnelle: true }] : []),
    ...config.map((d) => ({ adresse: d.adresse, libelle: d.libelle })),
  ];
}

/** Vérifie une liste (format, doublon, au moins une adresse) — la même règle à l'écran et au serveur. PUR. */
export function verifierDestinataires(brut: unknown): { ok: true; liste: Destinataire[] } | { ok: false; motif: string } {
  if (!Array.isArray(brut)) return { ok: false, motif: 'La liste des destinataires est illisible.' };
  if (brut.length === 0) return { ok: false, motif: 'Ajoutez au moins un destinataire.' };
  if (brut.length > MAX_DESTINATAIRES) return { ok: false, motif: `Au plus ${MAX_DESTINATAIRES} destinataires.` };
  const vus = new Set<string>();
  const liste: Destinataire[] = [];
  for (const [i, x] of brut.entries()) {
    const o = x !== null && typeof x === 'object' ? x as Record<string, unknown> : {};
    const adresse = typeof o.adresse === 'string' ? o.adresse.trim() : '';
    const libelle = typeof o.libelle === 'string' ? o.libelle.trim().slice(0, 120) : '';
    if (adresse === '') return { ok: false, motif: `Ligne ${i + 1} : l’adresse e-mail est vide.` };
    if (!FORMAT_ADRESSE.test(adresse) || adresse.length > 254) return { ok: false, motif: `Ligne ${i + 1} : « ${adresse} » n’est pas une adresse e-mail valide.` };
    const cle = adresse.toLowerCase();
    if (vus.has(cle)) return { ok: false, motif: `« ${adresse} » figure deux fois dans la liste.` };
    vus.add(cle);
    liste.push({ adresse, libelle });
  }
  return { ok: true, liste };
}

/** « Envoyé le 21/10/2026 à 14:32 par Arno JOREL à a@x, b@y ». `quand` : un instant ISO ; l'heure est celle de Paris. PUR. */
export function mentionEnvoi(e: { quand: string; par: string; destinataires: readonly string[] }): string {
  const d = new Date(e.quand);
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', ...o }).format(d);
  return `Envoyé le ${f({ day: '2-digit', month: '2-digit', year: 'numeric' })} à ${f({ hour: '2-digit', minute: '2-digit' })} par ${e.par} à ${e.destinataires.join(', ')}`;
}
