import { randomBytes } from 'node:crypto';
import { query } from '../db/client';
import type { MessageAEnvoyer } from '../gestion/envoiGmail';
import type { IssueTransport } from '../gestion/envoiDemandeTache';
import { htmlVersTexte } from '../gestion/htmlMail';
import { adressesSignature, corpsPourEnvoi, signaturePourEcran } from '../gestion/signatureImages';
import { imagesSignaturePourEnvoi, signatureHtmlDeGestion } from '../gestion/signatureImagesReel';
import { dateFrPreavis } from './preavis';
import { plageFr } from './edls';
import { journaliserAvis } from './mailsPreavisSortieRepo';
import { mentionEnvoyePar } from './mentionEnvoyePar';
import { colonneExisteMemo } from './sondeLocation';
import { MENTION_AUTOMATIQUE, NOM_FICHIER_ICS, OBJET_TACHE_PREVISITE, invitationIcs, uidPrevisite } from './previsite';

/**
 * ══ 🔴🔴 LA PRÉ-VISITE — LES MAILS DU MODULE DE TÂCHES (Arno, 10/11/2026) ════════════════════════════════════════════════════════
 *
 * Les collègues reçoivent le mail du module de tâches (Accepter / Refuser, un statut par destinataire) : rien n'y change pour les autres
 * tâches. Pour une tâche de PRÉ-VISITE seulement (objet `OBJET_TACHE_PREVISITE`, liée à `gestion_location_previsite`) :
 *   · `habillerMailTachePrevisite` — son objet à elle, l'invitation d'agenda jointe (.ics, même UID que celle des locataires), « Mail
 *     envoyé par Prénom NOM (adresse) » (la personne qui a programmé ; un envoi automatique pour la confirmation d'une réponse) et la
 *     signature Gmail de gestion@, comme les autres mails de la Location ;
 *   · `journaliserMailTachePrevisite` — le mail parti (ou en échec) est rangé dans le journal des mails de la Location (historique du
 *     bien et des locataires du préavis).
 * Ne lèvent jamais : en cas de doute, le mail reste celui du module de tâches.
 */

const estPrevisite = (objet: string): boolean => objet.trim() === OBJET_TACHE_PREVISITE;

interface SuiviDeTache { id: number; lotId: number; occupationIds: number[]; sequence: number }

async function suiviDeLaTache(tacheId: number): Promise<SuiviDeTache | null> {
  if (!(await colonneExisteMemo('gestion_location_previsite', 'tache_id'))) return null;
  const { rows } = await query<{ id: string; lot_id: string; occupation_ids: string[]; n: number }>(
    `SELECT s.id::text, s.lot_id::text, s.occupation_ids::text[] AS occupation_ids,
            (SELECT count(*)::int FROM gestion_tache_action a WHERE a.tache_id = s.tache_id AND a.action = 'decalage') AS n
       FROM gestion_location_previsite s WHERE s.tache_id = $1 ORDER BY s.id DESC LIMIT 1`, [tacheId]);
  const r = rows[0];
  return r === undefined ? null : { id: Number(r.id), lotId: Number(r.lot_id), occupationIds: r.occupation_ids.map(Number), sequence: Number(r.n) };
}

/** L'objet d'un mail de tâche de pré-visite. PUR. */
export function objetMailTachePrevisite(o: { sorte: 'invitation' | 'recapitulatif' | 'confirmation'; adresse: string | null; jour: string; heure: string | null;
  dureeMinutes: number | null; deplace: boolean; par: string; refusee: boolean }): string | null {
  if (o.sorte === 'invitation') {
    return `${o.deplace ? 'Rendez-vous déplacé — ' : ''}${OBJET_TACHE_PREVISITE}${o.adresse ? ` — ${o.adresse}` : ''} — ${plageFr(o.jour, o.heure, o.dureeMinutes)}`;
  }
  if (o.sorte === 'confirmation') return `Pré-visite du ${dateFrPreavis(o.jour).slice(0, 5)}${o.adresse ? ` (${o.adresse})` : ''} ${o.refusee ? 'refusée' : 'acceptée'} par ${o.par}`;
  return null;
}

export async function habillerMailTachePrevisite(o: {
  tacheId: number; objetTache: string; sorte: 'invitation' | 'recapitulatif' | 'confirmation'; adresse: string | null;
  jour: string; heure: string | null; dureeMinutes: number | null; deplace: boolean; par: string; refusee: boolean; demandeurEmail: string | null;
}, message: MessageAEnvoyer, deps: { signatureBrute?: () => Promise<string>; maintenant?: Date } = {}): Promise<MessageAEnvoyer> {
  if (!estPrevisite(o.objetTache)) return message;
  try {
    const suivi = await suiviDeLaTache(o.tacheId);
    if (suivi === null) return message;
    const objet = objetMailTachePrevisite(o) ?? message.objet;
    // « Mail envoyé par » : la personne qui a programmé (invitation, récapitulatif) ; la confirmation d'une réponse part toute seule.
    let mention = MENTION_AUTOMATIQUE;
    if (o.sorte !== 'confirmation' && o.demandeurEmail) {
      const { rows } = await query<{ prenom: string | null; nom: string | null }>('SELECT prenom, nom FROM admin_utilisateur WHERE lower(identifiant) = lower($1)', [o.demandeurEmail]);
      mention = mentionEnvoyePar({ prenom: rows[0]?.prenom, nomFamille: rows[0]?.nom, email: o.demandeurEmail }) ?? MENTION_AUTOMATIQUE;
    }
    const brute = await (deps.signatureBrute ?? signatureHtmlDeGestion)().catch(() => '');
    const domaine = message.de.split('@')[1] ?? 'criterimmo.fr';
    const rangs = adressesSignature(brute).map((_, i) => i);
    const images = rangs.length === 0 ? [] : (await imagesSignaturePourEnvoi(rangs, domaine, randomBytes(12).toString('hex')).catch(() => ({ images: [] }))).images;
    const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Le mail du module de tâches est une page HTML complète : la mention et la signature se glissent avant `</body>`.
    const bloc = `<div style="max-width:600px;margin:12px auto;font-family:Arial,Helvetica,sans-serif"><p style="margin:12px 0;font-size:14px;color:#1a1f26">${echapper(mention)}</p>${brute.trim() === '' ? ''
      : `<div class="gmail_signature" style="margin-top:16px">${signaturePourEcran(brute)}</div>`}</div>`;
    const brut = message.corpsHtml ?? '';
    const html = brut.trim() === '' ? null
      : corpsPourEnvoi(/<\/body>/i.test(brut) ? brut.replace(/<\/body>/i, `${bloc}</body>`) : `${brut}${bloc}`, images).html;
    const texte = `${message.corps}\n\n${mention}${brute.trim() === '' ? '' : `\n\n-- \n${htmlVersTexte(brute).trim()}`}`;
    const ics = o.sorte === 'confirmation' || o.heure === null ? [] : [{
      nom: NOM_FICHIER_ICS, typeMime: 'text/calendar; charset=UTF-8; method=PUBLISH',
      octets: Buffer.from(invitationIcs({
        uid: uidPrevisite(suivi.id, domaine), sequence: suivi.sequence, maintenant: deps.maintenant ?? new Date(),
        rdv: { jour: o.jour, heure: o.heure, dureeMinutes: o.dureeMinutes ?? 60 },
        titre: `Pré-visite d’état des lieux de sortie${o.adresse ? ` — ${o.adresse}` : ''}`, lieu: o.adresse ?? '',
        description: 'Pré-visite d’état des lieux de sortie. Répondez par les boutons Accepter / Refuser du mail.',
      }), 'utf8'),
    }];
    return {
      ...message, objet, corps: texte, ...(html !== null ? { corpsHtml: html } : {}),
      ...(images.length > 0 && html !== null ? { imagesIntegrees: images.map(({ cid, nom, typeMime, octets }) => ({ cid, nom, typeMime, octets })) } : {}),
      ...(ics.length > 0 ? { pieces: [...(message.pieces ?? []), ...ics] } : {}),
    };
  } catch (e) {
    console.error('[pré-visite] habillage du mail de tâche impossible', (e as Error)?.message);
    return message;
  }
}

/** Le mail d'une tâche de pré-visite, parti ou en échec, rangé au journal des mails de la Location (historique du bien et des locataires). */
export async function journaliserMailTachePrevisite(
  demandeId: number, sorte: 'previsite_invitation' | 'previsite_reponse', message: MessageAEnvoyer, r: IssueTransport,
): Promise<void> {
  try {
    // Reconnue à son OBJET (posé par l'habillage ci-dessus) : aucune requête de plus pour les autres tâches.
    if (!message.objet.includes(OBJET_TACHE_PREVISITE) && !message.objet.startsWith('Pré-visite du ')) return;
    const { rows } = await query<{ tache_id: string; demandeur_id: string | null; demandeur_libelle: string; destinataire_libelle: string; repondu: boolean }>(
      `SELECT tache_id::text, demandeur_id::text, demandeur_libelle, destinataire_libelle, (statut IN ('acceptee', 'refusee') AND NOT automatique) AS repondu
         FROM gestion_tache_demande WHERE id = $1`, [demandeId]);
    const d = rows[0];
    if (d === undefined) return;
    const suivi = await suiviDeLaTache(Number(d.tache_id));
    if (suivi === null) return;
    const auteur = sorte === 'previsite_invitation' ? { id: d.demandeur_id === null ? null : Number(d.demandeur_id), libelle: d.demandeur_libelle || 'Pré-visite' }
      : { id: null, libelle: d.destinataire_libelle || 'Pré-visite' };
    await journaliserAvis({ sorte, de: message.de, a: [...message.a], cc: [...message.cc], objet: message.objet, texte: message.corps, html: message.corpsHtml ?? '' },
      { lotId: suivi.lotId, occupationIds: suivi.occupationIds, auteur, statut: r.ok ? 'envoye' : 'echec', erreur: r.ok ? null : r.motif, messageId: r.ok ? message.messageId : null });
  } catch (e) {
    console.error('[pré-visite] journal du mail de tâche impossible', (e as Error)?.message);
  }
}
