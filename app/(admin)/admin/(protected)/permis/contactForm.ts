/**
 * Helpers PURS de l'éditeur de contact mairie (chantier S15) — construction du corps de la requête PATCH /contact et
 * pré-remplissage de la note. Sortis de `PermisVue` pour être testables en Node (aucun React, aucune I/O).
 */
export interface EditionContact {
  code: string; canal: string; email: string; urlFormulaire: string; adressePostale: string; note: string;
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
