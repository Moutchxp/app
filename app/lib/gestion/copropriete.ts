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

/** 🔴 (lot 3) Les digicodes d'UNE adresse de la copropriété : le commun (le « code général » de l'immeuble de l'adresse) et ceux des bâtiments. */
export interface DigicodesAdresseFiche {
  cle: string; voie: string; codePostal: string | null; commune: string | null;
  commun: { digicode: boolean | null; code: string | null };
  batiments: { cle: string; libelle: string; digicode: boolean | null; code: string | null }[];
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
  nomenclatureEffective: Nomenclature | null;
  saisieDigicodes: boolean;
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
