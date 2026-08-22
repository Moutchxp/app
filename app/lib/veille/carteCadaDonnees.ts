/**
 * CADA lot A — CHARGEMENT (serveur) des données de la carte de saisine CADA pour UNE saisine (demande_relance type='saisine_cada').
 * Assemble l'entrée de la composition PURE (carteCadaChamps) à partir des sources existantes (chargerContexteRelance +
 * chargerLotRelance + méta de la demande), et fournit de quoi produire le PDF de copie de la demande initiale (générateur existant).
 * LECTURE SEULE : n'écrit rien, ne décide aucun verdict.
 */
import { query } from '../db/client';
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import { dateEnFrancais } from '../sitadel/demande';
import { fenetreCada } from './echeance';
import { chargerContexteRelance, chargerLotRelance } from './relanceAuto';
import { champsCarteCada, type ChampCada } from './carteCadaChamps';

export interface DonneesCarteCada {
  saisineId: number;
  demandeId: number;
  reference: string;
  communeNom: string;
  champs: ChampCada[];
  urlFormulaire: string;
  cadaEmailVide: boolean;   // true → dépôt formulaire (la carte est pertinente)
  // Données de la pièce jointe obligatoire (copie de la demande initiale) — pour le générateur PDF existant.
  pdf: { reference: string; destinataire: string | null; dateEnvoi: string; corps: string };
}

interface MetaSaisineCada {
  demande_id: number; reference: string; profil: string; commune_nom: string | null;
  dest_email: string | null; dest_nom: string | null; corps_demande: string | null;
  envoye_le: Date | null; mairie_adresse: string | null;
}

/** Charge tout ce qu'il faut pour la carte. `null` si la saisine n'existe pas, n'est pas une saisine CADA, ou n'a pas d'envoi connu. */
export async function chargerDonneesCarteCada(saisineId: number): Promise<DonneesCarteCada | null> {
  const { rows } = await query<MetaSaisineCada>(
    `SELECT dr.demande_id::int AS demande_id, d.reference, d.profil_demandeur AS profil, c.nom AS commune_nom,
            d.dest_email, d.dest_nom, d.corps AS corps_demande,
            (SELECT min(a.envoye_le) FROM demande_acheminement a WHERE a.demande_id = d.id AND a.statut = 'envoye') AS envoye_le,
            (SELECT mc.adresse_postale FROM mairie_contact mc WHERE mc.code_insee = d.code_insee) AS mairie_adresse
       FROM demande_relance dr
       JOIN demande d ON d.id = dr.demande_id
       LEFT JOIN commune c ON c.code_insee = d.code_insee
      WHERE dr.id = $1 AND dr.type = 'saisine_cada'`, [saisineId]);
  const m = rows[0];
  if (!m || m.envoye_le === null) return null;

  const profil = m.profil === 'personne' ? 'personne' : 'entreprise';
  const [ctx, lot, config] = await Promise.all([
    chargerContexteRelance(profil), chargerLotRelance(m.demande_id), chargerConfigVeille(),
  ]);
  if (lot === null) return null;

  const satisfaits = new Set(lot.satisfaitsIds);
  const dossiersDus = lot.lot.dossiers.filter((d) => !satisfaits.has(d.dossierId));
  const communeNom = m.commune_nom ?? lot.lot.communeNom;
  const refusTaciteLe = fenetreCada(m.envoye_le, new Date()).refusTaciteLe;

  const champs = champsCarteCada({
    representantNom: ctx.config.representantNom, representantQualite: ctx.config.representantQualite,
    emailContact: ctx.config.emailContact, raisonSociale: ctx.config.raisonSociale, formeJuridique: ctx.config.formeJuridique,
    siegeAdresse: ctx.config.siegeAdresse, communeNom, destNom: m.dest_nom, mairieAdressePostale: m.mairie_adresse,
    pieces: ctx.pieces, dossiersDus, envoyeeLe: m.envoye_le, refusTaciteLe,
  });

  return {
    saisineId, demandeId: m.demande_id, reference: m.reference, communeNom,
    champs, urlFormulaire: config.cadaUrlFormulaire, cadaEmailVide: config.cadaEmail.trim() === '',
    pdf: { reference: m.reference, destinataire: m.dest_email, dateEnvoi: dateEnFrancais(m.envoye_le.toISOString().slice(0, 10)), corps: m.corps_demande ?? '' },
  };
}
