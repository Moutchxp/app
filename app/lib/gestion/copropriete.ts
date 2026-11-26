/**
 * ══ 🔴🔴 LA FICHE COPROPRIÉTÉ, SÉPARÉE DU SYNDIC (Arno, 16/11/2026, chantier « Fiche Copropriété », migration 476). MODULE PUR. ══════════════
 *
 * La COPROPRIÉTÉ (le syndicat des copropriétaires) porte ses adresses, ses digicodes (par l'immeuble de chaque adresse), ses AG, ses habitants et
 * gardiens ; le SYNDIC est la société payée pour la gérer : il y est seulement LIÉ. « Hors copropriété » vaut pour l'IMMEUBLE ENTIER : la fiche
 * garde adresses, digicodes, gardien et habitants, sans syndic ni AG. Des biens d'une même copropriété qui se contredisent (« oui » pour l'un,
 * « non » pour l'autre) : une ALERTE, rien n'est corrigé tout seul.
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
import type { ContactImmeubleLu } from './syndics';
import type { BatimentConnu, Nomenclature } from './batimentsCopropriete';

/**
 * 🔴🔴 (16/11/2026, « Digicodes unifiés », lot 3) L'ÉTAT d'une place (adresse × bâtiment) dans la base unique : connue (le code en vigueur, depuis
 * quand, d'où), les changements prévus, les valeurs d'avant À ARBITRER, l'historique (lignes de la base unique, annulées comprises). Absent sans
 * la 478 (la saisie d'avant, inchangée).
 */
export interface EtatPlaceDigicode {
  connu: boolean;
  /** la valeur EN VIGUEUR (base unique, sinon valeur d'avant) ; `null` : rien de connu, ou à arbitrer */
  valeur: { digicode: boolean | null; code: string | null } | null;
  depuis: string | null;
  source: 'unifie' | 'ancien' | null;
  aVenir: { id: number; digicode: boolean; code: string | null; appliqueLe: string;
    /** 🔴 (Arno, 17/11/2026) « Nouveau code prévu le … — saisi le … par Prénom NOM » */
    prevu?: string }[];
  /** 🔴 (Arno, 17/11/2026) « Enregistré le … par Prénom NOM » (« Corrigé le … », « … (auteur inconnu — reprise) ») ; `null` : rien d'enregistré */
  enregistre?: string | null;
  aArbitrer: { digicode: boolean | null; code: string | null; origines: string[]; lots: number[] }[];
  historique: { id: number; digicode: boolean; code: string | null; appliqueLe: string; nature: string; par: string; creeLe: string; annule: boolean }[];
}

/** 🔴 (Arno, 17/11/2026 : « Le mail à la Gestion est rangé dans l'historique de la copropriété et des biens concernés. ») un mail à la Gestion d'un
 *  changement de digicode, tel que l'historique des digicodes le dit (une fois, même s'il est rangé dans plusieurs biens) */
export interface MailGestionHisto { cle: string; objet: string; le: string | null; statut: string }

/** 🔴 (lot 3) Les digicodes d'UNE adresse de la copropriété : le commun (le « code général » de l'immeuble de l'adresse) et ceux des bâtiments. */
export interface DigicodesAdresseFiche {
  cle: string; voie: string; codePostal: string | null; commune: string | null;
  commun: { digicode: boolean | null; code: string | null; etat?: EtatPlaceDigicode; nbBiens?: number };
  /** 🔴 (Arno, 17/11/2026) les mails à la Gestion des changements de digicode de cette adresse (historique) */
  mailsGestion?: MailGestionHisto[];
  batiments: { cle: string; libelle: string; digicode: boolean | null; code: string | null; etat?: EtatPlaceDigicode; nbBiens?: number }[];
}

export interface AdresseCopropriete { cle: string; libelle: string; codePostal: string | null; commune: string | null; principale: boolean }
export interface GestionnaireSyndic { id: number; civilite: string | null; prenom: string | null; nom: string | null; titre: string | null;
  coordonnees: { sorte: 'email' | 'telephone'; libelle: string | null; valeur: string }[] }
export interface BienCopropriete { id: number; numero: string; adresse: string | null; copropriete: boolean | null }

export interface FicheCopropriete {
  /** la clé de la copropriété (son immeuble principal) */
  cle: string;
  /** déjà enregistrée (`gestion_copropriete`) ; sinon connue par ses biens seulement, créée au premier enregistrement */
  declaree: boolean;
  id: number | null;
  libelle: string;
  nom: string | null;
  horsCopropriete: boolean;
  nomenclature: 'lettres' | 'chiffres' | null;
  codePostal: string | null;
  commune: string | null;
  adresses: AdresseCopropriete[];
  syndic: { id: number; nom: string; ville: string | null; depuis: string } | null;
  /** 🔴 (20/11/2026, journal des syndics) l'historique du syndic : le journal, et le registre des liens pour ce qui précède — du plus récent */
  historiqueSyndic?: { quand: string; le: string; texte: string; par: string; source: 'journal' | 'registre' }[];
  /** 🔴 (Arno, 26/11/2026, 11h58) les clés des adresses secondaires CONFIRMÉES (« à vérifier » → « Confirmer cette adresse »), encore rattachées */
  adressesConfirmees?: string[];
  /** 🔴 (Arno, 26/11/2026, 11h58) l'historique des adresses (ajout, confirmation, retrait — journal de la copropriété), du plus récent */
  historiqueAdresses?: { le: string; texte: string; par: string }[];
  gestionnaires: GestionnaireSyndic[];
  contacts: ContactImmeubleLu[];
  biens: BienCopropriete[];
  /** des biens disent « en copropriété », d'autres « pas en copropriété » */
  desaccord: boolean;
  /** la migration 476 est en place (nom, hors copropriété, bâtiments, statut « Copropriétaire ») */
  avec476: boolean;
  /** 🔴 (lot 3) les digicodes de chaque adresse, les bâtiments connus de toute la copropriété, la règle effective, et si la saisie est possible (477) */
  digicodes: DigicodesAdresseFiche[];
  batimentsConnus: BatimentConnu[];
  /** 🔴 (Arno, 17/11/2026, « Adresses multiples d'une copropriété ») le registre s'écrit-il par adresse (490) ? — chaque bâtiment est alors sous SON adresse */
  batimentsParAdresse?: boolean;
  /** 🔴 (Arno, 17/11/2026) les bâtiments du registre dont l'adresse est « à préciser » (choix par Arno, jamais deviné) */
  batimentsAPreciser?: { id: number; libelle: string }[];
  nomenclatureEffective: Nomenclature | null;
  saisieDigicodes: boolean;
  /** 🔴 (16/11/2026, 478) la base unique est en place : un code connu se lit en vigueur, ne se change que par « Corriger une erreur » (ou « Modifier ») */
  digicodesUnifies?: boolean;
}

/**
 * 🔴 Arno (16/11/2026, lot A) — L'IMMEUBLE D'UN BIEN, UNE SEULE RÈGLE pour le bouton du syndic ET celui de la copropriété : son « Immeuble »,
 * sinon son adresse. Rien n'est réécrit : le champ « Immeuble » du bien n'est pas modifié. PUR.
 */
export const immeubleDuBien = (l: { immeuble?: string | null; adresse?: string | null }): string =>
  (l.immeuble ?? '').trim() || (l.adresse ?? '').trim();

export const TITRE_COPROPRIETE = 'Copropriété';
export const TITRE_HORS_COPROPRIETE = 'Bien hors copropriété';
export const ALERTE_DESACCORD = 'Les biens de cet immeuble se contredisent : certains sont notés « en copropriété », d’autres « pas en copropriété ». Vérifiez les fiches des biens (rien n’est corrigé tout seul).';

/** Le nom affiché : le nom donné, sinon le libellé de l'immeuble. PUR. */
export const nomAffiche = (f: Pick<FicheCopropriete, 'nom' | 'libelle'>): string => (f.nom ?? '').trim() || f.libelle;

/**
 * « Hors copropriété » : la fiche le dit (l'immeuble entier), ou, tant qu'elle ne dit rien, le bien d'où l'on vient est noté « pas en
 * copropriété » (461) — le bouton et le titre le disent DÈS LE DÉPART. PUR.
 */
export function estHorsCopropriete(f: Pick<FicheCopropriete, 'horsCopropriete'> | null, coproprieteDuBien: boolean | null | undefined): boolean {
  return f?.horsCopropriete === true || coproprieteDuBien === false;
}
/** Le mot du bouton et le titre de la fiche. PUR. */
export const titreFicheCopropriete = (hors: boolean): string => (hors ? TITRE_HORS_COPROPRIETE : TITRE_COPROPRIETE);

/** Des biens qui se contredisent sur « en copropriété » (461) ? PUR. */
export function biensEnDesaccord(biens: readonly Pick<BienCopropriete, 'copropriete'>[]): boolean {
  return biens.some((b) => b.copropriete === true) && biens.some((b) => b.copropriete === false);
}

/* ══ 🔴🔴 LA LISTE « COPROPRIÉTÉS » (Arno, 16/11/2026, lot 4) ══════════════════════════════════════════════════════════════════════════════════
 * TOUS les immeubles du portefeuille (une copropriété encore non enregistrée y figure : sa fiche se crée au premier « Valider »), une ligne par
 * copropriété : nom, adresses, syndic, nombre de biens, « Bien hors copropriété » le cas échéant. */
export interface LigneCopropriete {
  /** l'immeuble à ouvrir (son libellé : la fiche se lit par lui) */
  immeuble: string;
  cle: string;
  nom: string;
  adresses: string[];
  syndic: { id: number; nom: string; ville: string | null } | null;
  nbBiens: number;
  hors: boolean;
  declaree: boolean;
  /** 🔴 (19/11/2026, copropriétés en double) le code postal et la commune de l'immeuble (fiche, sinon biens) : la détection des doublons les compare */
  codePostal?: string | null;
  commune?: string | null;
  /** ce qu'on peut chercher, normalisé : nom, adresses, syndic */
  cherchable: string;
}
/** « Hors copropriété » dans la liste : la fiche le dit, ou tous les biens notés le disent (des biens qui se contredisent : non). PUR. */
export function horsDansLaListe(fiche: boolean, biens: readonly (boolean | null)[]): boolean {
  return fiche || (biens.some((b) => b === false) && !biens.some((b) => b === true));
}
const plat = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** La recherche : chaque mot tapé doit se trouver (nom, adresses, syndic), sans accents ni casse. PUR. */
export function filtrerCoproprietes<T extends Pick<LigneCopropriete, 'cherchable'>>(lignes: readonly T[], q: string): T[] {
  const mots = plat(q).split(' ').filter((m) => m !== '');
  return mots.length === 0 ? [...lignes] : lignes.filter((l) => mots.every((m) => l.cherchable.includes(m)));
}
export const cherchableDe = (morceaux: readonly (string | null | undefined)[]): string => plat(morceaux.filter(Boolean).join(' '));

/**
 * 🔴 (Arno, 16/11/2026) UNE ADRESSE DE COPROPRIÉTÉ SANS NUMÉRO (la rue seule, que les suggestions de la Base Adresse Nationale proposent aussi)
 * n'est plus acceptée en silence : l'écran avertit (« Corriger » / « Confirmer ») et le serveur ne l'accepte qu'avec la confirmation. PUR.
 */
export const adresseSansNumero = (libelle: string): boolean => libelle.trim() !== '' && !/^\s*\d/.test(libelle);
export const TITRE_SANS_NUMERO = 'Adresse sans numéro';
export const texteSansNumero = (adresse: string): string[] => [
  `Cette adresse n’a pas de numéro : ${adresse}.`,
  'Une adresse de copropriété désigne d’ordinaire un immeuble précis (un numéro et une rue). Confirmez-vous cette adresse sans numéro ?',
];
export const motifSansNumero = (adresse: string): string =>
  `L’adresse ${adresse} n’a pas de numéro : confirmez-la à l’écran (« Confirmer ») ou choisissez une adresse numérotée. Rien n’est enregistré.`;
