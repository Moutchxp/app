/**
 * Résolution du DESTINATAIRE d'une demande (chantier S14d) — fonction PURE et UNIQUE, partagée par la sélection en amont
 * (proposerLots, via versCandidat) ET par le figement à la création (creerDemandes). Une seule fonction : deux endroits qui
 * décideraient « quel canal, quel destinataire » différemment produiraient des demandes incohérentes.
 *
 * RÈGLE DE PRÉCÉDENCE (le cœur du chantier) :
 *   - La PRADA l'emporte sur `mairie_contact` SEULEMENT si son courriel est NON VIDE ET `mairie_contact.statut = 'presume'`.
 *   - Si le contact est 'confirme' (posé/validé à la main — aujourd'hui Paris seul), il est CONSERVÉ : la PRADA ne
 *     s'applique pas (« le travail humain prime »). On le SIGNALE (`arbitragePrada`) pour que le rapport le liste — jamais
 *     de bascule silencieuse.
 *   - PRADA au courriel vide → repli `mairie_contact`, aucune bascule.
 * Effet clé : une commune en canal 'inconnu' mais porteuse d'une PRADA au courriel non vide (et 'presume') devient
 * adressable par e-mail → elle cesse d'être exclue par proposerLots.
 */
import type { CanalContact } from './mairieContact';

export type OrigineDestinataire = 'mairie_contact' | 'prada';

/** Champs BRUTS d'une commune : le contact générique (mairie_contact) et sa PRADA éventuelle (mairie_prada). */
export interface ContactCommune {
  contactCanal: CanalContact | null;
  contactStatut: 'presume' | 'confirme' | 'invalide' | null;
  contactEmail: string | null;
  contactUrlFormulaire: string | null;
  contactAdressePostale: string | null;
  pradaCourriel: string | null;
  pradaImportId: number | null;
  pradaNom: string | null; // « Prénom Nom » déjà composé, ou null
}

/** Destinataire résolu : ce qui sera figé dans `demande` (dest_*), plus l'origine et l'éventuel arbitrage à rendre. */
export interface Destination {
  canal: CanalContact | null;
  email: string | null;
  urlFormulaire: string | null;
  adressePostale: string | null;
  origine: OrigineDestinataire;
  pradaImportId: number | null;
  nom: string | null;
  /** true si une PRADA au courriel non vide existe MAIS le contact 'confirme' est conservé → arbitrage humain à rendre. */
  arbitragePrada: boolean;
}

const estVide = (s: string | null): boolean => (s ?? '').trim() === '';

export function resoudreDestination(c: ContactCommune): Destination {
  const pradaDisponible = !estVide(c.pradaCourriel);
  if (pradaDisponible && c.contactStatut === 'presume') {
    return {
      canal: 'email',
      email: (c.pradaCourriel ?? '').trim(),
      urlFormulaire: null,
      adressePostale: null,
      origine: 'prada',
      pradaImportId: c.pradaImportId,
      nom: (c.pradaNom ?? '').trim() === '' ? null : (c.pradaNom ?? '').trim(),
      arbitragePrada: false,
    };
  }
  // Repli sur le contact générique. Si une PRADA était disponible mais qu'un contact 'confirme' l'emporte, on le signale.
  return {
    canal: c.contactCanal,
    email: c.contactEmail,
    urlFormulaire: c.contactUrlFormulaire,
    adressePostale: c.contactAdressePostale,
    origine: 'mairie_contact',
    pradaImportId: null,
    nom: null,
    arbitragePrada: pradaDisponible && c.contactStatut === 'confirme',
  };
}
