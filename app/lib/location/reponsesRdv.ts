/**
 * ══ 🔴🔴 LA RÉPONSE DES LOCATAIRES À UN RENDEZ-VOUS (pré-visite, état des lieux de sortie) — MODULE PUR (Arno, 18/11/2026) ══════════════════
 *
 * Arno : « Chaque locataire invité reçoit dans son mail deux boutons, « J'accepte le rendez-vous » et « Je refuse ». Ces boutons sont des liens
 * personnels sécurisés, sans connexion : un jeton fort par locataire et par rendez-vous, qui expire à la date du rendez-vous. […] Le choix n'est
 * enregistré qu'au clic sur ce bouton, jamais à la simple ouverture du lien. Le locataire peut changer d'avis jusqu'à l'heure du rendez-vous.
 * Chaque réponse est datée et journalisée, rien n'est jamais supprimé. Dès qu'AU MOINS UN locataire accepte, le cartouche « Confirmé » […]. Si
 * tous les locataires refusent : « Refusé » et l'équipe est prévenue par mail. Le statut du préavis ne change PAS automatiquement. Si le
 * rendez-vous est modifié, les réponses précédentes deviennent caduques. […] VALIDATION À LA MAIN […] réversible. »
 * Décisions du 18/11/2026 : A (deux cartouches côte à côte : celui du collègue reste tel quel, celui des LOCATAIRES s'ajoute à côté), l'invitation
 * des locataires à l'état des lieux est créée, le mail interne part à qui a fixé ou déplacé le rendez-vous en dernier et aux collaborateurs prévenus.
 *
 * 🔴 LES RÉPONSES CADUQUES NE S'EFFACENT PAS : chaque jeton et chaque réponse portent le CRÉNEAU (« AAAA-MM-JJTHH:MM ») pour lequel ils ont été
 * émis ; seuls ceux du créneau EN COURS de la tâche comptent. Un déplacement change le créneau : les réponses d'avant restent en base, au
 * journal, et ne comptent plus — aucune écriture, aucune suppression.
 * Module PUR : aucune base, aucun réseau. Lisible par l'écran comme par le serveur.
 */
import { dateFrPreavis } from './preavis';
import { heureFr } from './edls';
import { prenomNom, REPERE_NOM, type ParagrapheMail } from './mailsPreavisSortie';
import { partiesDuMail, type PartieTexte } from './texteModifiable';

export type SorteRdv = 'previsite' | 'edl';
/** 🔴 Arno (18/11/2026, 2e lot, migration 497) — + `non_invite` : « Envoyer l'invitation aux locataires : Non » pour CE créneau. */
export type NatureEvenementRdv = 'accepte' | 'refuse' | 'validation_main' | 'annulation_validation' | 'notifie_confirme' | 'notifie_refus' | 'non_invite';
export type Decision = 'accepter' | 'refuser';

/** Le nom d'un rendez-vous dans une phrase. */
export const LIBELLE_SORTE_RDV: Record<SorteRdv, string> = { previsite: 'pré-visite d’état des lieux de sortie', edl: 'état des lieux de sortie' };

/** Le créneau d'un rendez-vous, sa clé : « 2026-11-20T10:00 ». PUR. */
export function creneauDe(jour: string, heure: string | null): string {
  return `${jour.slice(0, 10)}T${(heure ?? '00:00').slice(0, 5)}`;
}

/** Un jeton : 32 octets aléatoires en base64url (43 caractères) — ni plus, ni moins. PUR. */
export const FORMAT_JETON_RDV = /^[A-Za-z0-9_-]{43}$/;
export const jetonRdvBienForme = (j: unknown): j is string => typeof j === 'string' && FORMAT_JETON_RDV.test(j);

// ══ L'ÉTAT DES RÉPONSES ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

export interface LocataireInvite { occupationId: number; nom: string }
export interface EvenementRdv { nature: NatureEvenementRdv; occupationId: number | null; parLibelle: string; le: string }
export type EtatRdvLocataires = 'attente' | 'confirme' | 'refuse' | 'non_invites';
export interface EtatLocataires {
  etat: EtatRdvLocataires;
  /** Qui a confirmé : le locataire (« Paul ESSAIPREAVIS ») ou, à la main, le collaborateur. `null` hors « Confirmé ». */
  par: string | null;
  main: boolean;
  /**
   * 🔴 Arno (18/11/2026) — la validation à la main posée PAR LE CHOIX « Non » en fixant ou en déplaçant le rendez-vous (aucun locataire sollicité
   * pour ce créneau) : « Confirmé sans demande aux locataires (par X) ». Repéré par l'événement « non_invite » (497) ; sans la 497 : `false`.
   */
  sansDemande?: boolean;
  /** 🔴 (18/11/2026) — l'heure de la validation à la main en vigueur (ISO), ou `null`. */
  parLe?: string | null;
  /** La réponse COURANTE de chaque locataire invité pour ce créneau (`null` : pas encore répondu). */
  reponses: { occupationId: number; nom: string; reponse: 'accepte' | 'refuse' | null; le: string | null }[];
}

/**
 * L'état du rendez-vous côté LOCATAIRES, d'après les invités du créneau en cours et les événements de CE créneau (dans n'importe quel ordre).
 *   · une validation à la main en vigueur (la dernière des « validation » / « annulation ») → Confirmé à la main ;
 *   · sinon au moins un locataire dont la réponse courante est « accepte » → Confirmé (par le premier qui a accepté) ;
 *   · sinon tous les invités ont refusé → Refusé ;
 *   · sinon En attente ;
 *   · 🔴 (2e lot) aucun locataire invité par lien, mais « Non » choisi pour ce créneau → Locataires non invités (jamais « En attente »).
 * `null` : rien à montrer (aucun locataire invité par lien, aucun choix « Non », aucune validation à la main). PUR.
 */
export function etatReponsesRdv(invites: readonly LocataireInvite[], evenements: readonly EvenementRdv[]): EtatLocataires | null {
  const tries = [...evenements].sort((a, b) => a.le.localeCompare(b.le));
  const derniereValidation = [...tries].reverse().find((e) => e.nature === 'validation_main' || e.nature === 'annulation_validation');
  const main = derniereValidation?.nature === 'validation_main' ? derniereValidation : null;
  if (invites.length === 0 && main === null) {
    return tries.some((e) => e.nature === 'non_invite') ? { etat: 'non_invites', par: null, main: false, reponses: [] } : null;
  }
  const reponses = invites.map((i) => {
    const d = [...tries].reverse().find((e) => e.occupationId === i.occupationId && (e.nature === 'accepte' || e.nature === 'refuse'));
    return { occupationId: i.occupationId, nom: i.nom, reponse: d === undefined ? null : (d.nature as 'accepte' | 'refuse'), le: d?.le ?? null };
  });
  if (main !== null) {
    return { etat: 'confirme', par: main.parLibelle, main: true, reponses, sansDemande: invites.length === 0 && tries.some((e) => e.nature === 'non_invite'), parLe: main.le };
  }
  const acceptes = reponses.filter((r) => r.reponse === 'accepte').sort((a, b) => (a.le ?? '').localeCompare(b.le ?? ''));
  if (acceptes.length > 0) return { etat: 'confirme', par: acceptes[0].nom, main: false, reponses };
  if (reponses.length > 0 && reponses.every((r) => r.reponse === 'refuse')) return { etat: 'refuse', par: null, main: false, reponses };
  return { etat: 'attente', par: null, main: false, reponses };
}

/** Le MOT du cartouche des locataires (le mot est toujours écrit, jamais la seule couleur). PUR. */
export function motCartoucheLocataires(e: EtatLocataires): string {
  if (e.etat === 'confirme' && e.main && e.sansDemande === true) return `Confirmé sans demande aux locataires (par ${e.par ?? '—'})`;
  if (e.etat === 'confirme') return e.main ? `Locataires : Confirmé à la main par ${e.par ?? '—'}` : `Locataires : Confirmé (par ${e.par ?? '—'})`;
  if (e.etat === 'non_invites') return 'Locataires non invités';
  return e.etat === 'refuse' ? 'Locataires : Refusé' : 'Locataires : En attente';
}

/** Le mail interne à envoyer après un changement d'état : en devenant Confirmé, ou Refusé ; sinon rien. PUR. */
export function notificationApres(avant: EtatLocataires | null, apres: EtatLocataires | null): 'confirme' | 'refuse' | null {
  if (apres === null || apres.etat === avant?.etat) return null;
  return apres.etat === 'confirme' ? 'confirme' : apres.etat === 'refuse' ? 'refuse' : null;
}

// ══ LE LIEN PERSONNEL ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

export type CauseRefusJeton = 'inconnu' | 'caduc' | 'expire' | 'termine';
export const MESSAGES_JETON_RDV: Record<CauseRefusJeton, string> = {
  inconnu: 'Ce lien n’est pas valable. Vérifiez que vous l’avez ouvert en entier depuis le mail reçu.',
  caduc: 'Ce rendez-vous a été déplacé : un nouveau mail vous a été envoyé avec la nouvelle date. Merci de répondre depuis ce nouveau mail.',
  expire: 'L’heure de ce rendez-vous est passée : il n’est plus possible d’y répondre en ligne.',
  termine: 'Ce rendez-vous n’est plus d’actualité (annulé ou déjà effectué).',
};

/**
 * Le lien peut-il encore agir ? Jeton connu, tâche du rendez-vous toujours « à faire », MÊME créneau que celui pour lequel il a été émis (sinon
 * caduc), et avant l'heure du rendez-vous (son expiration). PUR.
 */
export function verdictJetonRdv(o: { jeton: { creneau: string; expireLe: string } | null; tache: { etat: string; jour: string | null; heure: string | null } | null; maintenant: Date }):
  { ok: true } | { ok: false; cause: CauseRefusJeton; message: string } {
  const non = (cause: CauseRefusJeton) => ({ ok: false as const, cause, message: MESSAGES_JETON_RDV[cause] });
  if (o.jeton === null || o.tache === null) return non('inconnu');
  if (o.tache.etat !== 'a_faire' || o.tache.jour === null) return non('termine');
  if (creneauDe(o.tache.jour, o.tache.heure) !== o.jeton.creneau) return non('caduc');
  if (o.maintenant.getTime() >= new Date(o.jeton.expireLe).getTime()) return non('expire');
  return { ok: true };
}

/** Les deux liens personnels d'un locataire. */
export interface LiensReponse { accepter: string; refuser: string }
/** Le chemin de la page de réponse (publique, sans connexion). */
export const CHEMIN_REPONSE_RDV = '/rdv/reponse';
export function liensReponseRdv(base: string, jeton: string): LiensReponse {
  const b = `${base.replace(/\/+$/, '')}${CHEMIN_REPONSE_RDV}?j=${encodeURIComponent(jeton)}`;
  return { accepter: `${b}&d=accepter`, refuser: `${b}&d=refuser` };
}
/** Ce que l'aperçu montre à la place d'un lien qui n'existe pas encore (il est créé à l'envoi). */
export const LIENS_APERCU: LiensReponse = { accepter: '[lien personnel créé à l’envoi]', refuser: '[lien personnel créé à l’envoi]' };

export const BOUTON_ACCEPTER = 'J’accepte le rendez-vous';
export const BOUTON_REFUSER = 'Je refuse';

/** Les paragraphes des deux boutons, sous le texte du mail d'un locataire (la version texte garde le lien en clair). PUR. */
export function paragraphesBoutonsRdv(l: LiensReponse): ParagrapheMail[] {
  return [
    'Merci de nous indiquer si ce rendez-vous vous convient :',
    { texte: `${BOUTON_ACCEPTER} : ${l.accepter}`, bouton: BOUTON_ACCEPTER, lien: l.accepter },
    { texte: `${BOUTON_REFUSER} : ${l.refuser}`, bouton: BOUTON_REFUSER, lien: l.refuser },
    'Vous pourrez changer d’avis jusqu’à l’heure du rendez-vous.',
  ];
}

// ══ L'INVITATION DES LOCATAIRES À L'ÉTAT DES LIEUX DE SORTIE (nouvelle, 18/11/2026) ════════════════════════════════════════════════════

export const NOM_FICHIER_ICS_EDLS = 'etat-des-lieux.ics';
export const uidEdls = (tacheId: number, domaine: string): string => `edls-${tacheId}@${domaine.replace(/^@/, '') || 'criterimmo.fr'}`;

export function objetEdlsLocataires(adresse: string, r: { jour: string; heure: string }): string {
  return `Rendez-vous d’état des lieux de sortie — ${dateFrPreavis(r.jour)} à ${heureFr(r.heure)} — ${adresse}`;
}
export function objetEdlsLocatairesModif(adresse: string, r: { jour: string; heure: string }): string {
  return `Modification de votre rendez-vous d’état des lieux de sortie — nouvelle date : ${dateFrPreavis(r.jour)} à ${heureFr(r.heure)} — ${adresse}`;
}

/** Les parties de l'invitation à l'état des lieux (sur le modèle de la pré-visite ; repères `{adresse}`, `{rendez-vous}`). PUR. */
export function partiesEdlsLocataires(): PartieTexte[] {
  return partiesDuMail({
    appel: `Bonjour {${REPERE_NOM}},`,
    intro: 'Nous vous confirmons le rendez-vous d’état des lieux de sortie de votre logement situé {adresse}, le {rendez-vous}.',
    proteges: [
      { libelle: 'État des lieux de sortie', texte: 'Ce rendez-vous permet d’établir l’état des lieux de sortie de votre logement, en le comparant avec l’état des lieux d’entrée.' },
      { libelle: 'Invitation d’agenda jointe', texte: 'Vous trouverez en pièce jointe une invitation à ajouter à votre agenda. Si ce créneau ne vous convient pas, il vous suffit de répondre à ce message.' },
    ],
    politesse: 'Nous restons à votre disposition pour toute question.',
  });
}
/** Les parties du mail de MODIFICATION de l'état des lieux (l'ancien et le nouveau créneau). PUR. */
export function partiesEdlsLocatairesModif(): PartieTexte[] {
  return partiesDuMail({
    appel: `Bonjour {${REPERE_NOM}},`,
    intro: 'Le rendez-vous d’état des lieux de sortie de votre logement situé {adresse}, prévu le {ancien rendez-vous}, est déplacé au {rendez-vous}.',
    proteges: [{ libelle: 'Invitation d’agenda jointe', texte: 'Vous trouverez en pièce jointe l’invitation mise à jour pour votre agenda. Si ce nouveau créneau ne vous convient pas, il vous suffit de répondre à ce message.' }],
    politesse: 'Nous restons à votre disposition pour toute question.',
  });
}

// ══ LE MAIL INTERNE (confirmé, ou refusé par tous) ══════════════════════════════════════════════════════════════════════════════════════

const TITRE_SORTE: Record<SorteRdv, { confirme: string; refuse: string }> = {
  previsite: { confirme: 'Pré-visite confirmée', refuse: 'Pré-visite refusée par les locataires' },
  edl: { confirme: 'État des lieux de sortie confirmé', refuse: 'État des lieux de sortie refusé par les locataires' },
};

/** « [Copie interne] Pré-visite confirmée — 12 rue … — 20/11/2026 à 10h00 ». PUR. */
export function objetInterneRdv(sorte: SorteRdv, quoi: 'confirme' | 'refuse', adresse: string, r: { jour: string; heure: string | null }): string {
  return `[Copie interne] ${TITRE_SORTE[sorte][quoi]} — ${adresse} — ${dateFrPreavis(r.jour)} à ${heureFr(r.heure)}`;
}

/** Le texte du mail interne. PUR. */
export function paragraphesInterneRdv(o: { sorte: SorteRdv; quoi: 'confirme' | 'refuse'; adresse: string; rdv: { jour: string; heure: string | null }; etat: EtatLocataires; lien: string }): ParagrapheMail[] {
  const quand = `le ${dateFrPreavis(o.rdv.jour)} à ${heureFr(o.rdv.heure)}`;
  const nom = LIBELLE_SORTE_RDV[o.sorte];
  const lignes = o.etat.reponses.map((r) => `· ${r.nom} : ${r.reponse === 'accepte' ? 'accepte' : r.reponse === 'refuse' ? 'refuse' : 'pas encore répondu'}`);
  const tete = o.quoi === 'confirme'
    ? (o.etat.main
      ? `Le rendez-vous de ${nom} du logement situé ${o.adresse}, ${quand}, a été confirmé à la main par ${o.etat.par ?? '—'}, sans prévenir les locataires.`
      : `Le rendez-vous de ${nom} du logement situé ${o.adresse}, ${quand}, est confirmé par ${o.etat.par ?? '—'}.`)
    : `Tous les locataires invités ont refusé le rendez-vous de ${nom} du logement situé ${o.adresse}, ${quand}. Le statut du préavis n’a pas changé : à vous de décider de la suite.`;
  return [
    'Bonjour,', tete,
    ...(lignes.length > 0 ? [`Réponses des locataires :\n${lignes.join('\n')}`] : []),
    { texte: `Ouvrir la ligne de ce préavis : ${o.lien}`, bouton: 'Ouvrir la ligne de ce préavis', lien: o.lien },
  ];
}

/** Le nom affiché d'un locataire invité (« Paul ESSAIPREAVIS »). PUR. */
export const nomInvite = (l: { nom: string; prenom: string | null }): string => prenomNom(l);

// ══ 🔴🔴 LE CHOIX « ENVOYER L'INVITATION AUX LOCATAIRES : OUI / NON » (Arno, 18/11/2026, 2e lot) ═══════════════════════════════════════════════
// Obligatoire en fixant ou en déplaçant un rendez-vous (pré-visite comme état des lieux), AUCUNE réponse pré-cochée ; « Non » : aucun mail aux
// locataires, le rendez-vous est planifié quand même. Le serveur refuse un geste sans choix (le formulaire aussi).
export type ChoixLocataires = 'oui' | 'non';
/** 🔴 Arno (18/11/2026) — le libellé de la question (remplace « Envoyer l'invitation aux locataires »). */
export const QUESTION_INVITER_LOCATAIRES = 'Envoyer une demande de confirmation au(x) locataire(s)';
export const MOTIF_CHOIX_LOCATAIRES = `Choisissez « Oui » ou « Non » pour « ${QUESTION_INVITER_LOCATAIRES} ».`;
export const lireChoixLocataires = (x: unknown): ChoixLocataires | null => (x === 'oui' || x === 'non' ? x : null);

/** Ce que le récapitulatif dit des locataires (avant « Confirmer et envoyer »). */
export interface ApercuLocataires {
  choix: ChoixLocataires;
  /** Les locataires qui recevront l'invitation (« Oui ») ; vide pour « Non ». */
  invites: string[];
  /** Ceux qui n'ont pas d'adresse e-mail (« Oui ») : ils ne recevront rien. */
  sansEmail: string[];
  /** « Oui » mais l'envoi est impossible sur ce serveur (la raison) ; `null` sinon. */
  impossible: string | null;
  /** Le texte reçu par le premier locataire (« Oui »), ou `null`. */
  texte: string | null;
}

/** La phrase du récapitulatif sur les locataires. PUR. */
export function phraseRecapLocataires(a: ApercuLocataires): string {
  // 🔴 Arno (18/11/2026) — « Non » = le rendez-vous est CONFIRMÉ côté locataires, sans les solliciter
  if (a.choix === 'non') return 'Les locataires ne seront pas sollicités : le rendez-vous sera considéré comme confirmé.';
  if (a.impossible !== null) return `Les locataires ne pourront pas être invités : ${a.impossible}`;
  if (a.invites.length === 0) return 'Aucun locataire n’a d’adresse e-mail : aucune invitation ne leur partira.';
  return `Les locataires seront invités (${a.invites.length}) : ${a.invites.join(', ')} — avec « ${BOUTON_ACCEPTER} » / « ${BOUTON_REFUSER} ».`;
}

// ══ 🔴🔴 LA LIGNE REPLIÉE ET L'ENCART « ① LOCATAIRE » (Arno, 18/11/2026) ═══════════════════════════════════════════════════════════════════
// Même calcul que le cartouche de la frise (`etatReponsesRdv`) : rien n'est recalculé à part, seul le MOT change selon l'endroit.

/**
 * Le cartouche de la LIGNE REPLIÉE : « Locataires : En attente / Confirmé / Refusé » — AUCUN NOM. « Non » (confirmé sans demande) et la
 * validation à la main donnent « Locataires : Confirmé ». 🔴 Arno (18/11/2026) — non sollicités et non confirmés (après « Annuler la validation à
 * la main ») : « Locataires : Non sollicités » (gris). Aucun état : `null`. PUR.
 */
export function motCourtLocataires(e: EtatLocataires | null | undefined): string | null {
  if (e === null || e === undefined) return null;
  if (e.etat === 'confirme') return 'Locataires : Confirmé';
  if (e.etat === 'refuse') return 'Locataires : Refusé';
  if (e.etat === 'attente') return 'Locataires : En attente';
  if (e.etat === 'non_invites') return 'Locataires : Non sollicités';
  return null;
}

/** « 18/11 à 22h40 », à l'heure de Paris, d'un instant ISO. PUR. */
export function jourHeureParis(iso: string): string {
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${v('day')}/${v('month')} à ${v('hour')}h${v('minute')}`;
}

/** Un rendez-vous en cours de la ligne, et l'état côté locataires de SON créneau (les réponses d'un ancien créneau n'y sont pas). */
export interface RdvEnCours { sorte: SorteRdv; jour: string; heure: string | null; etat: EtatLocataires | null }
export const ETAT_REPONSE_LOCATAIRE = {
  attente: 'En attente de réponse', accepte: 'A accepté le rendez-vous', refuse: 'A refusé le rendez-vous', non: 'Non sollicité',
} as const;

/** « Pré-visite du 16/11 à 09h53 ». PUR. */
export function libelleRdvEnCours(r: Pick<RdvEnCours, 'sorte' | 'jour' | 'heure'>): string {
  const [, m, j] = r.jour.slice(0, 10).split('-');
  return `${r.sorte === 'previsite' ? 'Pré-visite' : 'État des lieux de sortie'} du ${j}/${m}${r.heure ? ` à ${heureFr(r.heure)}` : ''}`;
}

/**
 * L'encart « ① LOCATAIRE » : pour CHAQUE locataire, sa réponse à chaque rendez-vous en cours (avec la date et l'heure de la réponse) ; et UNE
 * fois pour l'encart, ce qui vaut pour tous : « locataires non sollicités » et/ou « confirmé à la main par X le … ». Un locataire de la ligne
 * qui n'a pas été sollicité alors que d'autres l'ont été : « Non sollicité ». Un rendez-vous sans aucun état : rien. PUR.
 */
export function reponsesDeLEncart(rdvs: readonly RdvEnCours[], occupationIds: readonly number[]): { parLocataire: Map<number, string[]>; mentions: string[] } {
  const parLocataire = new Map<number, string[]>(occupationIds.map((o) => [o, []]));
  const mentions: string[] = [];
  for (const r of rdvs) {
    const e = r.etat;
    if (e === null) continue;
    const quoi = libelleRdvEnCours(r);
    const confirmeMain = e.etat === 'confirme' && e.main ? `confirmé à la main par ${e.par ?? '—'}${e.parLe ? ` le ${jourHeureParis(e.parLe)}` : ''}` : null;
    if (e.reponses.length === 0) {
      mentions.push(`${quoi} : locataires non sollicités${confirmeMain ? ` — ${confirmeMain.replace('à la main ', '')}` : ''}`);
      continue;
    }
    if (confirmeMain) mentions.push(`${quoi} : ${confirmeMain}`);
    for (const o of occupationIds) {
      const x = e.reponses.find((y) => y.occupationId === o);
      const t = x === undefined ? ETAT_REPONSE_LOCATAIRE.non
        : x.reponse === null ? ETAT_REPONSE_LOCATAIRE.attente
          : `${x.reponse === 'accepte' ? ETAT_REPONSE_LOCATAIRE.accepte : ETAT_REPONSE_LOCATAIRE.refuse}${x.le ? ` — le ${jourHeureParis(x.le)}` : ''}`;
      parLocataire.get(o)?.push(`${quoi} : ${t}`);
    }
  }
  return { parLocataire, mentions };
}

