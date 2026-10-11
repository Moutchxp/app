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

type PartieAvecEmails = { role: string; emails?: readonly { valeur: string }[] };

/**
 * ══ 🔴🔴 LOT PILULE-TROIS-TRAITS-ET-EXPEDITEUR-PARTOUT — LA PERSONNE DU BIEN QUI A ENVOYÉ CE MAIL. PUR. ══════════════
 * Celle dont une adresse e-mail est l'adresse De: de CE mail ; le propriétaire d'abord, puis les locataires, dans
 * l'ordre reçu. UNE SEULE personne par bien (« un seul cartouche », Arno) : si plusieurs portent l'adresse, la
 * première. `-1` = l'expéditeur n'est aucune partie de ce bien. Plus jamais « a écrit un jour dans la conversation ».
 */
export function indexExpediteur(
  parties: readonly PartieAvecEmails[] | null | undefined,
  expediteur: ExpediteurDuMail | null | undefined,
): number {
  if (expediteur == null || parties == null) return -1;
  const porte = (p: PartieAvecEmails) => (p.emails ?? []).some((e) => normal(e.valeur) === expediteur.adresse);
  const proprio = parties.findIndex((p) => p.role === 'proprietaire' && porte(p));
  return proprio >= 0 ? proprio : parties.findIndex((p) => p.role === 'locataire' && porte(p));
}

/** Le rôle de cette personne, ou `null` : la ligne (PROPRIÉTAIRE / LOCATAIRE) qui porte le cartouche. PUR. */
export function roleExpediteur(
  parties: readonly PartieAvecEmails[] | null | undefined,
  expediteur: ExpediteurDuMail | null | undefined,
): 'proprietaire' | 'locataire' | null {
  const i = indexExpediteur(parties, expediteur);
  const r = i < 0 || parties == null ? null : parties[i].role;
  return r === 'proprietaire' || r === 'locataire' ? r : null;
}

/** Le texte du cartouche : « Expéditeur : Valentin TALHOUARN ». PUR. */
export function motCartoucheExpediteur(expediteur: ExpediteurDuMail): string {
  return `${MOT_EXPEDITEUR} : ${expediteur.nom}`;
}
