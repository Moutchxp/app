/**
 * Résolution du DESTINATAIRE d'une demande (chantier S14d) — fonction PURE et UNIQUE, partagée par la sélection en amont
 * (proposerLots, via versCandidat) ET par le figement à la création (creerDemandes). Une seule fonction : deux endroits qui
 * décideraient « quel canal, quel destinataire » différemment produiraient des demandes incohérentes.
 *
 * CANAL = celui de `mairie_contact`, SANS forçage par la PRADA. 🔴 OVERRIDE PRADA RETIRÉ (décision Arno, cf. recon PRADA) :
 * l'ancienne règle « PRADA courriel non vide ET statut='presume' → canal forcé email » déduisait le canal d'un contact CADA
 * (accès aux documents administratifs), rapproché AUTOMATIQUEMENT depuis l'annuaire et JAMAIS vérifié — avoir une PRADA
 * n'implique pas que la commune se traite par e-mail (Paris/Montreuil ont une PRADA et fonctionnent en téléservice). La
 * déduction produisait des envois réels vers des boîtes CADA devinées ; elle est supprimée.
 *
 * La PRADA reste une DONNÉE utile : affichée en fiche commune, ADOPTABLE À LA MAIN par le bouton existant (qui écrit alors
 * `mairie_contact.canal='email'`), et `arbitragePrada` SIGNALE toujours qu'une PRADA au courriel non vide existe sur un contact
 * 'confirme' (rapport « PRADA non adoptée » — jamais de bascule silencieuse). Seule la DÉDUCTION AUTOMATIQUE du canal disparaît.
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
  // CANAL = `mairie_contact`, jamais forcé par la PRADA (override retiré). `origine` est donc TOUJOURS 'mairie_contact' — la valeur
  //   'prada' ne subsiste que dans les demandes HISTORIQUES (colonne `dest_origine`), plus jamais produite ici.
  const pradaDisponible = !estVide(c.pradaCourriel);
  return {
    canal: c.contactCanal,
    email: c.contactEmail,
    urlFormulaire: c.contactUrlFormulaire,
    adressePostale: c.contactAdressePostale,
    origine: 'mairie_contact',
    pradaImportId: null,
    nom: null,
    // SIGNAL inchangé : une PRADA existe MAIS le contact 'confirme' est conservé → à arbitrer (rapport « PRADA non adoptée »).
    arbitragePrada: pradaDisponible && c.contactStatut === 'confirme',
  };
}
