/**
 * ══ 🔴🔴 LE MAIL REÇU PAR UN CONTACT EXTÉRIEUR D'UNE TÂCHE (Arno, 10/11/2026, confidentialité SANS exception). MODULE PUR. ════════════
 *
 * Arno : « un contact extérieur reçoit UNIQUEMENT : titre, date / heure, durée, adresse du bien concerné le cas échéant, le texte libre des
 * notes, et la signature de l'agence. JAMAIS le nom, le téléphone ou l'e-mail d'un autre contact, client ou collaborateur, ni la liste des
 * invités. Un seul destinataire par mail (aucune copie visible). L'invitation d'agenda (.ics) envoyée à un extérieur ne contient pas la liste
 * des participants. Seul le texte libre des notes, écrit volontairement par le collaborateur, peut transmettre une information. »
 *
 * Ce module ne reçoit donc QUE ces champs : il ne peut pas, par construction, écrire un contact, un invité ou un collaborateur.
 */
import { dateFrPreavis } from '../location/preavis';
import { heureFr, plageFr } from '../location/edls';
import { invitationIcs } from '../location/previsite';

export type SorteMailExterne = 'invitation' | 'modification' | 'annulation';

/** Ce que le mail d'un extérieur peut dire — rien d'autre n'entre ici. */
export interface ContenuMailExterne {
  sorte: SorteMailExterne;
  titre: string;
  jour: string;
  heure: string | null;
  dureeMinutes: number | null;
  /** L'adresse du bien concerné ; `null` : tâche sans bien. */
  adresse: string | null;
  /** Le texte libre des notes, tel que le collaborateur l'a écrit. */
  notes: string | null;
  /** La date d'avant, pour une modification. */
  ancien?: { jour: string; heure: string | null; dureeMinutes: number | null } | null;
  signature: { texte: string; html: string };
}

const quand = (jour: string, heure: string | null, duree: number | null): string => (heure === null ? `le ${dateFrPreavis(jour)}` : `le ${plageFr(jour, heure, duree)}`);
const dureeFr = (heure: string | null, d: number | null): string | null => {
  if (heure === null) return null;
  const m = d ?? 60;
  return m % 60 === 0 ? `${m / 60} h` : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
};
const echapper = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function objetMailExterne(c: Pick<ContenuMailExterne, 'sorte' | 'titre' | 'jour' | 'heure'>): string {
  const date = `${dateFrPreavis(c.jour)}${c.heure === null ? '' : ` à ${heureFr(c.heure)}`}`;
  const tete = c.sorte === 'invitation' ? 'Rendez-vous' : c.sorte === 'modification' ? 'Rendez-vous modifié' : 'Rendez-vous annulé';
  return `${tete} : ${c.titre.trim()} — ${date}`;
}

/** Les paragraphes du mail : la phrase, puis les champs permis, puis les notes. PUR. */
export function paragraphesMailExterne(c: ContenuMailExterne): string[] {
  const phrase = c.sorte === 'invitation' ? 'Nous vous confirmons le rendez-vous suivant.'
    : c.sorte === 'modification' ? `Le rendez-vous ci-dessous a été déplacé${c.ancien ? ` (il était prévu ${quand(c.ancien.jour, c.ancien.heure, c.ancien.dureeMinutes)})` : ''}.`
      : 'Le rendez-vous ci-dessous est annulé.';
  const champs = [
    `Objet : ${c.titre.trim()}`,
    `Date : ${quand(c.jour, c.heure, c.dureeMinutes)}`,
    ...(dureeFr(c.heure, c.dureeMinutes) === null ? [] : [`Durée : ${dureeFr(c.heure, c.dureeMinutes)}`]),
    ...(c.adresse ? [`Adresse : ${c.adresse}`] : []),
  ];
  const notes = (c.notes ?? '').trim();
  return [
    'Bonjour,', phrase, champs.join('\n'),
    ...(notes === '' ? [] : [`Notes :\n${notes}`]),
    c.sorte === 'annulation' ? 'L’invitation jointe retire ce rendez-vous de votre agenda.' : 'Vous trouverez en pièce jointe une invitation à ajouter à votre agenda.',
  ];
}

/** Le mail complet (texte et HTML), signature de l'agence comprise. PUR. */
export function mailTacheExterne(c: ContenuMailExterne): { objet: string; texte: string; html: string } {
  const paras = paragraphesMailExterne(c);
  const sig = c.signature.texte.trim();
  return {
    objet: objetMailExterne(c),
    texte: `${paras.join('\n\n')}${sig === '' ? '' : `\n\n-- \n${sig}`}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:680px">${paras.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#1a1f26">${echapper(p).replace(/\n/g, '<br>')}</p>`).join('')}${c.signature.html.trim() === '' ? '' : `<div class="gmail_signature" style="margin-top:16px">${c.signature.html}</div>`}</div>`,
  };
}

/** L'invitation d'agenda d'un extérieur : SANS participants, sans organisateur ; même UID d'un envoi à l'autre. PUR. */
export function icsTacheExterne(c: ContenuMailExterne & { tacheId: number; domaine: string; sequence: number; maintenant: Date }): string | null {
  if (c.heure === null) return null;
  return invitationIcs({
    uid: `tache-${c.tacheId}@${c.domaine.replace(/^@/, '') || 'criterimmo.fr'}`, sequence: c.sequence, maintenant: c.maintenant,
    rdv: { jour: c.jour, heure: c.heure, dureeMinutes: c.dureeMinutes ?? 60 }, titre: c.titre.trim(), lieu: c.adresse ?? '',
    description: (c.notes ?? '').trim(), annule: c.sorte === 'annulation',
  });
}
