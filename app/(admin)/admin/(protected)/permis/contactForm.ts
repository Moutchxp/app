/**
 * Helpers PURS de l'éditeur de contact mairie (chantier S15) — construction du corps de la requête PATCH /contact et
 * pré-remplissage de la note. Sortis de `PermisVue` pour être testables en Node (aucun React, aucune I/O).
 */
import { validerCanal, type CanalContact } from '../../../../lib/sitadel/mairieContact';

export interface EditionContact {
  code: string; canal: string; email: string; urlFormulaire: string; adressePostale: string; note: string;
  telephone: string; responsableNom: string;
}

/**
 * Canaux du sélecteur, par PRÉFÉRENCE DÉCROISSANTE (chantier « ergonomie du canal ») : téléservice → e-mail → courrier →
 * inconnu. ⚠️ 'formulaire' n'est JAMAIS un défaut « à l'aveugle » : il n'est présélectionné que si un téléservice est connu
 * (url_formulaire renseignée), sinon on ferait mentir l'écran.
 */
export const CANAUX_ORDONNES: readonly { value: CanalContact; label: string }[] = [
  { value: 'formulaire', label: 'formulaire web (téléservice)' },
  { value: 'email', label: 'e-mail' },
  { value: 'courrier', label: 'courrier' },
  { value: 'inconnu', label: 'inconnu (sans destinataire)' },
];

/** Aide contextuelle sous le sélecteur — rappelle la règle, dont la conséquence surprenante : courrier/inconnu = 0 demande. */
export const AIDE_CANAL = 'Le téléservice est à privilégier quand il existe ; l’e-mail est le canal par défaut ; le courrier et « inconnu » ne produisent aucune demande.';
/** Mention affichée quand un téléservice est connu et que « formulaire web » a été présélectionné (suggestion, pas verrou). */
export const MENTION_TELESERVICE = 'Un téléservice est connu pour cette commune : « formulaire web » est présélectionné (modifiable).';

export interface EtatEditionContact {
  code: string; nom: string; canal: CanalContact; email: string; urlFormulaire: string; adressePostale: string;
  note: string; telephone: string; responsableNom: string; protocoleVerifieLe: string | null;
  suggestionTeleservice: boolean; erreur: string;
}

/**
 * État initial de la modale d'édition de contact. PRÉSÉLECTION QUAND ON SAIT : si la commune a déjà une url_formulaire non
 * vide, on ouvre sur 'formulaire' (URL pré-remplie) même si le canal enregistré est autre, et on le SIGNALE
 * (`suggestionTeleservice`). Sinon on ouvre sur le canal enregistré, sans présélection (ne jamais deviner un téléservice).
 */
export function editionInitiale(d: {
  codeInsee: string; communeNom: string | null;
  destCanal: CanalContact | null; destEmail: string | null; destUrlFormulaire: string | null; destAdressePostale: string | null;
  destTelephone?: string | null; destResponsableNom?: string | null; destProtocoleVerifieLe?: string | null;
}): EtatEditionContact {
  const teleserviceConnu = (d.destUrlFormulaire ?? '').trim() !== '';
  return {
    code: d.codeInsee, nom: d.communeNom ?? d.codeInsee,
    canal: teleserviceConnu ? 'formulaire' : (d.destCanal ?? 'inconnu'),
    email: d.destEmail ?? '',
    urlFormulaire: d.destUrlFormulaire ?? '',
    adressePostale: d.destAdressePostale ?? '',
    note: '',
    telephone: d.destTelephone ?? '',
    responsableNom: d.destResponsableNom ?? '',
    protocoleVerifieLe: d.destProtocoleVerifieLe ?? null,
    suggestionTeleservice: teleserviceConnu,
    erreur: '',
  };
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
  telephone: string; responsableNom: string;
} {
  return {
    codeInsee: e.code, canal: e.canal,
    email: e.email.trim(), urlFormulaire: e.urlFormulaire.trim(), adressePostale: e.adressePostale.trim(),
    note: e.note.trim(), telephone: e.telephone.trim(), responsableNom: e.responsableNom.trim(),
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
