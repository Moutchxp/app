/**
 * Lot 5b (C) — CONTENU PUR de l'alerte interne « une saisine CADA est partie ». NOUVELLE et DISTINCTE de la PROPOSITION
 * (propositionAuto, qui demande un avis AVANT) : celle-ci CONSTATE APRÈS l'envoi. Aucune I/O, aucun envoi ici — juste le texte.
 *
 * ⚠️ Destinée à l'adresse d'ALERTE interne (config_veille.alerte_email). JAMAIS à la mairie, JAMAIS à la CADA.
 */
import { dateEnFrancais } from '../sitadel/demande';

/** Faits d'une saisine partie, pour composer l'alerte. `canal` : 'email' = e-mail parti à la CADA ; 'formulaire' = dépôt manuel à faire. */
export interface InfoAlerteSaisine {
  communeNom: string | null;
  reference: string;             // référence interne de la demande (traçabilité)
  numeros: string[];             // num_dau des dossiers concernés (les permis)
  envoyeeLe: Date;               // date d'envoi (e-mail) ou de dépôt (formulaire) de la saisine
  canal: 'email' | 'formulaire';
  forclusionLe: Date;            // fin du délai de saisine (2 mois après le refus)
}

const jour = (d: Date): string => dateEnFrancais(d.toISOString().slice(0, 10));

/** Objet de l'alerte : dit le fait (envoyée / à déposer) et la commune. */
export function sujetAlerteSaisine(i: InfoAlerteSaisine): string {
  return `Saisine CADA ${i.canal === 'email' ? 'envoyée' : 'à déposer sur le formulaire'} — ${i.communeNom ?? 'commune inconnue'}`;
}

/** Corps de l'alerte : commune, numéro(s) de permis, date, canal, dossiers concernés, date de forclusion. */
export function corpsAlerteSaisine(i: InfoAlerteSaisine): string {
  const permis = i.numeros.length > 0 ? i.numeros.join(', ') : '(aucun numéro)';
  const canalTxt = i.canal === 'email'
    ? 'envoyée par e-mail à la CADA (avec la copie de la demande initiale en pièce jointe)'
    : 'à DÉPOSER À LA MAIN sur le formulaire en ligne de la CADA (aucune adresse e-mail CADA configurée)';
  return [
    `Une saisine CADA vient d'être ${i.canal === 'email' ? 'envoyée' : 'préparée pour dépôt'}.`,
    '',
    `Commune : ${i.communeNom ?? 'inconnue'}`,
    `Permis concerné(s) : ${permis}`,
    `Référence interne : ${i.reference}`,
    `Date : ${jour(i.envoyeeLe)}`,
    `Canal : ${canalTxt}`,
    `Dossiers concernés : ${permis}`,
    `Date de forclusion (dernier jour pour saisir) : ${jour(i.forclusionLe)}`,
    '',
    'Ceci est une information interne (aucun envoi supplémentaire n’en découle).',
  ].join('\n');
}
