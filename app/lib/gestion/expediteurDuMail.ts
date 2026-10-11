/**
 * ══ 🔴🔴 LOT PILULE-ROUGE-MAISON-EXPEDITEUR-UNIQUE-TRAME-VERTE — LE CARTOUCHE « EXPÉDITEUR », SANS AMBIGUÏTÉ. Module PUR ══
 *
 * DEMANDE D'ARNO (11/10/2026), fenêtre « Bien(s) rattaché(s) à ce mail » : « Garder UN SEUL cartouche par bien, sur la
 * ligne de la partie concernée (propriétaire ou locataire). Ce cartouche nomme clairement la personne : “EXPÉDITEUR :
 * Valentin TALHOUARN”. Le nom vient du contact qui correspond à l'adresse De: du mail ; s'il n'y a pas de contact,
 * afficher l'adresse e-mail. Si l'expéditeur n'est aucune partie du bien : pas de cartouche sur ce bien. »
 *
 * 🔴 LE NOM est celui que l'en-tête De: du mail donne à cette adresse (« Valentin TALHOUARN »). L'annuaire, lui, range
 * souvent un couple sous un seul nom (« YOUENOU et TALHOUARN Marine et Valentin ») : c'est précisément l'ambiguïté que
 * le cartouche doit lever. Sans nom dans l'en-tête, l'adresse e-mail.
 * 🔴 LA PARTIE est celle dont l'annuaire porte l'adresse De: de CE mail — jamais « quelqu'un qui a écrit un jour dans
 * cette conversation ». Aucune ne la porte ⇒ pas de cartouche.
 */

export interface ExpediteurDuMail {
  /** L'adresse De:, en minuscules. */
  adresse: string;
  /** « Valentin TALHOUARN », ou l'adresse elle-même. */
  nom: string;
}

export const MOT_EXPEDITEUR = 'Expéditeur';

const normal = (s: string): string => s.trim().toLowerCase();

/** L'expéditeur du mail affiché, ou `null` sans adresse De:. PUR. */
export function expediteurDuMail(de: string | null | undefined, deNom: string | null | undefined): ExpediteurDuMail | null {
  const adresse = normal(de ?? '');
  if (adresse === '') return null;
  /* Un nom d'affichage peut arriver entre guillemets, ou n'être que l'adresse répétée. */
  const nom = (deNom ?? '').trim().replace(/^["'«\s]+|["'»\s]+$/g, '').trim();
  return { adresse, nom: nom === '' || normal(nom) === adresse ? adresse : nom };
}

/**
 * LA PARTIE DU BIEN QUI A ENVOYÉ CE MAIL : celle dont une adresse e-mail est l'adresse De:. Le propriétaire d'abord,
 * puis le locataire. `null` = l'expéditeur n'est aucune partie de ce bien. PUR.
 */
export function roleExpediteur(
  parties: readonly { role: string; emails?: readonly { valeur: string }[] }[] | null | undefined,
  expediteur: ExpediteurDuMail | null | undefined,
): 'proprietaire' | 'locataire' | null {
  if (expediteur == null || parties == null) return null;
  const porte = (role: string) => parties.some((p) => p.role === role
    && (p.emails ?? []).some((e) => normal(e.valeur) === expediteur.adresse));
  if (porte('proprietaire')) return 'proprietaire';
  if (porte('locataire')) return 'locataire';
  return null;
}
