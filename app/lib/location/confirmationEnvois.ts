/**
 * ══ 🔴 Arno (05/11/2026) — LA MODALE DE CONFIRMATION APRÈS VALIDATION (nouvelle location, préavis, sortie). MODULE PUR. ══════
 * Elle dit ce qui est RÉELLEMENT parti, d'après la réponse du serveur (adresses effectivement utilisées) — jamais une liste
 * recalculée par l'écran :
 *   · avec envoi aux partenaires réussi : « Enregistré et transmis à nos partenaires » ;
 *   · sans envoi demandé : « Enregistré » + « Aucun mail n'a été envoyé à nos partenaires… » ;
 *   · un mail en échec : en rouge, avec l'adresse concernée ; « transmis » n'est alors JAMAIS annoncé.
 */

export type ActionLocation = 'nouvelle_location' | 'preavis' | 'sortie';

/** Un mail tel que le serveur dit l'avoir envoyé (ou tenté). */
export interface MailParti { sorte: string; objet: string | null; a: string[]; cc: string[]; envoye: boolean; motif: string | null }

export interface IssueEnvois {
  /** Le choix de la personne : « informer nos partenaires » (case cochée, ou « Enregistrer et envoyer »). */
  informer: boolean;
  mails: MailParti[];
  /** Les mails n'ont pas pu partir du tout (base à mettre à jour, erreur) : la raison. */
  motifGlobal: string | null;
}

export const TITRE_TRANSMIS = 'Enregistré et transmis à nos partenaires';
export const TITRE_ENREGISTRE = 'Enregistré';
export const MESSAGE_SANS_PARTENAIRES = 'Aucun mail n’a été envoyé à nos partenaires. L’information a été transmise uniquement en interne, à notre service gestion.';
export const AUCUN_MAIL_PARTENAIRES = 'Aucun mail n’a été envoyé à nos partenaires.';
export const AUCUN_MAIL_PARTI = 'Aucun mail n’est parti pour cette opération.';

const SORTES_PARTENAIRES = new Set(['preavis_adhoc', 'sortie_adhoc', 'nouvelle_location']);
export const estMailPartenaires = (m: Pick<MailParti, 'sorte'>): boolean => SORTES_PARTENAIRES.has(m.sorte);

export const LIBELLE_MAIL: Record<string, string> = {
  preavis_locataires: 'Accusé de réception aux locataires',
  preavis_adhoc: 'Mail à nos partenaires',
  sortie_adhoc: 'Mail à nos partenaires',
  sortie_interne: 'Récapitulatif de la sortie (interne)',
  sortie_locataires: 'Mail de départ aux locataires',
  nouvelle_location: 'Mail à nos partenaires',
};
export const libelleMail = (m: Pick<MailParti, 'sorte'>): string => LIBELLE_MAIL[m.sorte] ?? 'Mail';

/** Les mails du préavis / de la sortie (champ `mails` / `adhoc` de la réponse). PUR. */
export function mailsDepuisAvis(m: { etat: 'ok'; envois: readonly MailParti[] } | { etat: string; motif: string } | undefined): { mails: MailParti[]; motifGlobal: string | null } {
  if (m === undefined) return { mails: [], motifGlobal: null };
  if (m.etat === 'ok' && 'envois' in m) return { mails: m.envois.map((e) => ({ sorte: e.sorte, objet: e.objet, a: [...e.a], cc: [...e.cc], envoye: e.envoye, motif: e.motif })), motifGlobal: null };
  return { mails: [], motifGlobal: 'motif' in m ? m.motif : 'raison inconnue' };
}

/** Le récapitulatif interne de la sortie (champ `mail` de la réponse) ; rien à dire (ignoré, absent) : null. PUR. */
export function mailInterneSortie(m: { envoye: boolean; ignore?: boolean; motif: string | null; destinataires?: string[]; objet?: string | null } | undefined): MailParti | null {
  // Une réponse sans issue lisible (`envoye` absent) n'invente aucun mail.
  if (m === undefined || m.ignore === true || typeof m.envoye !== 'boolean') return null;
  return { sorte: 'sortie_interne', objet: m.objet ?? null, a: [...(m.destinataires ?? [])], cc: [], envoye: m.envoye, motif: m.motif };
}

/** Le titre : « transmis » seulement si un mail partenaires est parti et qu'aucun n'a échoué. PUR. */
export function titreConfirmation(i: IssueEnvois): string {
  const partis = i.mails.filter(estMailPartenaires);
  return i.informer && i.motifGlobal === null && partis.length > 0 && partis.every((m) => m.envoye) ? TITRE_TRANSMIS : TITRE_ENREGISTRE;
}

/** Les phrases sous le titre (`alerte` : en rouge). PUR. */
export function messagesConfirmation(i: IssueEnvois): { texte: string; alerte: boolean }[] {
  const out: { texte: string; alerte: boolean }[] = [];
  const echecsPartenaires = i.mails.filter((m) => estMailPartenaires(m) && !m.envoye);
  if (!i.informer) {
    out.push(i.mails.some((m) => m.envoye) ? { texte: MESSAGE_SANS_PARTENAIRES, alerte: false } : { texte: AUCUN_MAIL_PARTENAIRES, alerte: false });
  } else if (echecsPartenaires.length > 0) {
    const adresses = [...new Set(echecsPartenaires.flatMap((m) => m.a))].join(', ');
    out.push({ texte: `L’envoi à nos partenaires a échoué${adresses !== '' ? ` (${adresses})` : ''} : rien ne leur a été transmis.`, alerte: true });
  } else if (i.motifGlobal === null && !i.mails.some(estMailPartenaires)) {
    out.push({ texte: AUCUN_MAIL_PARTENAIRES, alerte: false });
  }
  if (i.motifGlobal !== null) out.push({ texte: `Les mails n’ont pas pu partir : ${i.motifGlobal}`, alerte: true });
  if (i.motifGlobal === null && i.mails.length === 0) out.push({ texte: AUCUN_MAIL_PARTI, alerte: false });
  return out;
}

/** Le lien vers la liste de « Paramètres Location » > « Destinataires mails » de ce type d'action. PUR. */
export function lienDestinataires(action: ActionLocation): string {
  return `/admin/location/outils/parametres?onglet=destinataires${action === 'preavis' ? '&liste=preavis' : action === 'sortie' ? '&liste=sorties' : ''}`;
}

/** Ce que la modale reçoit : l'issue des envois et le rappel de l'action (type, logement, locataire(s), date). */
export interface ConfirmationAction { issue: IssueEnvois; rappel: [string, string][] }
