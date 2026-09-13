/**
 * Lot A — LECTURE SEULE du contact d'UNE commune par code INSEE (chantier « fiche commune sur la carte »). N'écrit RIEN :
 * l'écriture reste le chemin UNIQUE `PATCH /api/admin/permis/contact` → `ecrireContact`. Ce module ne fait QUE lire.
 *
 * Renvoie une `BaseCommune` — le MÊME contrat que l'éditeur de contact existant (`contactForm.ts`) — pour que l'éditeur
 * commune-scopé (Lot B) branche directement `editionInitiale()` / `construireFiche()` sans re-toucher cette lecture. C'est
 * pourquoi on lit la fiche COMPLÈTE (contact + PRADA + protocole + nom), et pas seulement `mairie_contact`.
 *
 * ⚠️ Le bloc de colonnes contact/PRADA/protocole ci-dessous est le MIROIR du `SELECTION` de `priorite.ts` (source de vérité
 * du DossierAffiche) : toute évolution des colonnes affichées par l'éditeur doit être répercutée AUX DEUX endroits. On ne
 * réutilise pas `SELECTION` tel quel car il part de `sitadel_dossier d` (lecture par dossier) ; ici la lecture part de la
 * table `commune` (lecture par code INSEE). Le mapping (dont la composition du nom PRADA) reflète `versAffiche` de veilleRepo.
 */
import { query } from '../db/client';
// import TYPE seulement (effacé à la compilation → aucune dépendance runtime lib→admin ; précédent : lib/permis/coherenceConfig.ts).
import type { BaseCommune } from '../../(admin)/admin/(protected)/permis/contactForm';

// Type littéral (jamais une `interface` : sans index signature elle ne satisfait pas `QueryResultRow` de pg — cf. carteRepo.ts).
type LigneContactCommune = {
  code_insee: string; commune_nom: string | null;
  dest_email: string | null; dest_statut: 'presume' | 'confirme' | 'invalide' | null; dest_source: string | null;
  dest_canal: 'email' | 'formulaire' | 'courrier' | 'inconnu' | null; dest_url_formulaire: string | null; dest_adresse_postale: string | null;
  dest_telephone: string | null; dest_responsable_nom: string | null; dest_protocole_verifie_le: string | null;
  dest_telephone_standard: string | null; dest_email_type: string | null; dest_protocole_source: string | null; dest_note: string | null;
  dest_email_direct: string | null; // 221 : e-mail direct (informatif)
  prada_courriel: string | null; prada_nom: string | null; prada_prenom: string | null;
  prada_adresse: string | null; prada_millesime: string | null; prada_statut: string | null; prada_origine: string | null; prada_rapprochement: string | null;
};

/**
 * Lit la fiche d'une commune (contact + PRADA + protocole + nom) par code INSEE, ou `null` si la commune est inconnue
 * (aucune ligne dans `commune`). LEFT JOIN : une commune SANS contact (cas des « communes sans adresse ») renvoie une
 * `BaseCommune` avec `communeNom` renseigné et tous les `dest*` à `null` — c'est un résultat VALIDE, pas une absence.
 */
export async function lireBaseCommune(codeInsee: string): Promise<BaseCommune | null> {
  const r = await query<LigneContactCommune>(
    `SELECT c.code_insee, c.nom AS commune_nom,
            mc.email AS dest_email, mc.statut AS dest_statut, mc.source AS dest_source,
            mc.canal AS dest_canal, mc.url_formulaire AS dest_url_formulaire, mc.adresse_postale AS dest_adresse_postale,
            mc.telephone AS dest_telephone, mc.responsable_nom AS dest_responsable_nom, mc.protocole_verifie_le::text AS dest_protocole_verifie_le,
            mc.telephone_standard AS dest_telephone_standard, mc.email_type AS dest_email_type, mc.protocole_source AS dest_protocole_source,
            mc.note AS dest_note, mc.email_direct AS dest_email_direct,
            mp.courriel AS prada_courriel, mp.nom AS prada_nom, mp.prenom AS prada_prenom,
            mp.adresse_formatee AS prada_adresse, mp.millesime AS prada_millesime, mp.statut AS prada_statut, mp.origine AS prada_origine,
            pi.rapprochement AS prada_rapprochement
       FROM commune c
       LEFT JOIN mairie_contact mc ON mc.code_insee = c.code_insee
       LEFT JOIN mairie_prada mp ON mp.code_insee = c.code_insee
       LEFT JOIN prada_import pi ON pi.id = mp.import_id
      WHERE c.code_insee = $1`,
    [codeInsee],
  );
  const x = r.rows[0];
  if (!x) return null;
  return {
    codeInsee: x.code_insee, communeNom: x.commune_nom,
    destCanal: x.dest_canal, destEmail: x.dest_email, destUrlFormulaire: x.dest_url_formulaire, destAdressePostale: x.dest_adresse_postale,
    destTelephone: x.dest_telephone, destResponsableNom: x.dest_responsable_nom, destProtocoleVerifieLe: x.dest_protocole_verifie_le,
    destTelephoneStandard: x.dest_telephone_standard, destEmailType: x.dest_email_type, destNote: x.dest_note,
    destEmailDirect: x.dest_email_direct, // 221 : e-mail direct (informatif)
    destStatut: x.dest_statut, destSource: x.dest_source, destProtocoleSource: x.dest_protocole_source,
    destPradaCourriel: x.prada_courriel,
    // Nom PRADA composé « Prénom Nom » (miroir versAffiche) ; null si les deux sont vides.
    destPradaNom: [x.prada_prenom, x.prada_nom].map((v) => (v ?? '').trim()).filter((v) => v !== '').join(' ') || null,
    destPradaAdresse: x.prada_adresse, destPradaMillesime: x.prada_millesime,
    destPradaStatut: x.prada_statut, destPradaOrigine: x.prada_origine, destPradaRapprochement: x.prada_rapprochement,
  };
}
