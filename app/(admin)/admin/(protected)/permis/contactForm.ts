/**
 * Helpers PURS de l'éditeur de contact mairie (chantier S15) — construction du corps de la requête PATCH /contact et
 * pré-remplissage de la note. Sortis de `PermisVue` pour être testables en Node (aucun React, aucune I/O).
 */
import { validerCanal, type CanalContact } from '../../../../lib/sitadel/mairieContact';

export interface EditionContact {
  code: string; canal: string; email: string; urlFormulaire: string; adressePostale: string; note: string;
}

/**
 * Problème de cohérence à ENREGISTRER, côté UI (S16) — miroir de la contrainte DB (051:28-32) et de `validerCanal` : un
 * canal 'formulaire' SANS URL (ou 'email' sans e-mail, 'courrier' sans adresse) est refusé AVANT l'appel réseau, pour un
 * message clair plutôt qu'un 400 de la route. Retourne le motif, ou `null` si cohérent.
 */
export function problemeContactUI(e: EditionContact): string | null {
  return validerCanal(e.canal as CanalContact, { email: e.email, urlFormulaire: e.urlFormulaire, adressePostale: e.adressePostale });
}

/** Corps EXACT envoyé à PATCH /api/admin/permis/contact — `note` INCLUSE (la route et ecrireContact l'acceptent déjà). */
export function corpsPatchContact(e: EditionContact): {
  codeInsee: string; canal: string; email: string; urlFormulaire: string; adressePostale: string; note: string;
} {
  return {
    codeInsee: e.code, canal: e.canal,
    email: e.email.trim(), urlFormulaire: e.urlFormulaire.trim(), adressePostale: e.adressePostale.trim(),
    note: e.note.trim(),
  };
}

/**
 * Au changement de canal : si l'on QUITTE 'courrier' pour un autre canal et que la note est encore vide, on la pré-remplit
 * avec l'adresse postale actuelle — l'utilisateur voit ce qu'il s'apprête à perdre (l'adresse_postale est écrasée à NULL et
 * n'est PAS journalisée) et peut la conserver en note. Sinon on garde la note telle quelle (jamais d'écrasement).
 */
export function noteAuChangementCanal(ancienCanal: string, nouveauCanal: string, adressePostale: string, noteActuelle: string): string {
  if (ancienCanal === 'courrier' && nouveauCanal !== 'courrier' && noteActuelle.trim() === '' && adressePostale.trim() !== '') {
    return `Ancienne adresse courrier : ${adressePostale.trim()}`;
  }
  return noteActuelle;
}
