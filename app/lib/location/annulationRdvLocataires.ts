import { query } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { adressesUniques, prenomNom } from './mailsPreavisSortie';
import { envoyerSerie, mailsAvisDisponibles, type DepsAvis, type EnvoiAvis } from './mailsPreavisSortieRepo';
import { avecPerimetreTest } from './perimetreTest';
import { perimetreDuGeste } from './preavisTestRepo';
import { creneauFr, invitationIcs, mailsAuxLocataires, uidPrevisite, type MailPrevisite, type RdvPrevisite } from './previsite';
import { contexte, sequenceTache, type Contexte } from './previsiteBase';
import { etatsDesRdv } from './reponsesRdvRepo';
import { NOM_FICHIER_ICS_EDLS, uidEdls, type SorteRdv } from './reponsesRdv';
import { NOM_FICHIER_ICS } from './previsite';

/**
 * ══ 🔴🔴 L'ANNULATION D'UN RENDEZ-VOUS DU PRÉAVIS AUX LOCATAIRES QUI L'AVAIENT CONFIRMÉ (Arno, 19/11/2026, choix A) ═══════════════════════════
 * « Un mail d'annulation part à chaque contact qui avait ACCEPTÉ ce rendez-vous (collaborateurs ; locataires ou tiers s'ils avaient été invités et
 * avaient accepté). » La tâche annulée porte une pré-visite ou un état des lieux de sortie : les locataires qui ont répondu « J'accepte » au créneau
 * en cours reçoivent, chacun, un mail d'annulation avec l'annulation d'agenda (.ics, même UID que l'invitation : leur agenda retire l'événement).
 * Les autres ne reçoivent rien. Préavis de TEST : son périmètre (le créateur du test, seul). Sans la migration 502 (sorte du journal) : rien ne
 * part, et c'est dit. Ne lève jamais : un échec n'annule pas l'annulation.
 */

export const SORTE_ANNULATION_LOCATAIRES = 'rdv_annulation_locataires' as const;
export const MOTIF_SANS_502 = 'le mail d’annulation aux locataires demande la migration 502 (non appliquée) : rien n’est parti.';

/** Le rendez-vous de préavis que porte la tâche (pré-visite ou état des lieux de sortie), ou `null`. LECTURE. */
export async function rdvPreavisDeLaTache(tacheId: number): Promise<{ sorte: SorteRdv; id: number; occupationIds: number[] } | null> {
  try {
    const { rows: t } = await query<{ p: boolean; e: boolean }>(
      `SELECT to_regclass('public.gestion_location_previsite') IS NOT NULL AS p, to_regclass('public.gestion_location_edls') IS NOT NULL AS e`);
    for (const [sorte, table, ok] of [['previsite', 'gestion_location_previsite', t[0]?.p], ['edl', 'gestion_location_edls', t[0]?.e]] as const) {
      if (!ok) continue;
      const { rows } = await query<{ id: string; occ: string[] }>(
        `SELECT id::text, occupation_ids::text[] AS occ FROM ${table} WHERE tache_id = $1 ORDER BY id DESC LIMIT 1`, [tacheId]);
      if (rows[0]) return { sorte, id: Number(rows[0].id), occupationIds: rows[0].occ.map(Number) };
    }
    return null;
  } catch { return null; }
}

/** Les occupations dont le locataire a ACCEPTÉ le créneau en cours. LECTURE. */
export async function locatairesAyantAccepte(sorte: SorteRdv, tacheId: number, jour: string, heure: string | null): Promise<number[]> {
  const e = (await etatsDesRdv([{ sorte, tacheId, jour, heure }])).get(`${sorte}:${tacheId}`) ?? null;
  return e === null ? [] : e.reponses.filter((r) => r.reponse === 'accepte').map((r) => r.occupationId);
}

/** Le texte du mail d'annulation à un locataire. PUR. */
export function paragraphesAnnulationLocataire(o: { sorte: SorteRdv; nom: string; adresse: string; rdv: RdvPrevisite }): string[] {
  const quoi = o.sorte === 'previsite' ? 'la pré-visite d’état des lieux de sortie' : 'l’état des lieux de sortie';
  return [
    `Bonjour ${o.nom},`,
    `Le rendez-vous pour ${quoi} du logement situé ${o.adresse}, prévu le ${creneauFr(o.rdv)}, est annulé.`,
    'L’invitation jointe le retire de votre agenda. Nous reviendrons vers vous si un nouveau rendez-vous est nécessaire.',
  ];
}
export const objetAnnulationLocataire = (sorte: SorteRdv, adresse: string): string =>
  `${sorte === 'previsite' ? 'Pré-visite' : 'État des lieux de sortie'} annulée — ${adresse}`.replace('État des lieux de sortie annulée', 'État des lieux de sortie annulé');

/** Les mails (un par adresse des seuls locataires qui avaient accepté). PUR (contexte lu). */
export function mailsAnnulationLocataires(c: Contexte, o: { sorte: SorteRdv; rdvId: number; tacheId: number; rdv: RdvPrevisite; acceptes: readonly number[];
  sequence: number; maintenant: Date }): MailPrevisite[] {
  const domaine = c.expediteur.split('@')[1] ?? '';
  const titre = o.sorte === 'previsite' ? `Pré-visite d’état des lieux de sortie — ${c.adresse}` : `État des lieux de sortie — ${c.adresse}`;
  const ics = invitationIcs({ uid: o.sorte === 'previsite' ? uidPrevisite(o.rdvId, domaine) : uidEdls(o.tacheId, domaine), sequence: o.sequence, rdv: o.rdv,
    maintenant: o.maintenant, titre, lieu: c.adresse, description: `${titre.split(' — ')[0]} du logement situé ${c.adresse}.` });
  return mailsAuxLocataires({ sorte: SORTE_ANNULATION_LOCATAIRES, de: c.expediteur, locataires: c.locataires.filter((l) => o.acceptes.includes(l.occupationId)),
    objet: objetAnnulationLocataire(o.sorte, c.adresse), qui: c.qui, signature: c.signature,
    paragraphesDe: (l) => paragraphesAnnulationLocataire({ sorte: o.sorte, nom: prenomNom(l), adresse: c.adresse, rdv: o.rdv }),
    ics: { nom: o.sorte === 'previsite' ? NOM_FICHIER_ICS : NOM_FICHIER_ICS_EDLS,
      contenu: ics.replace('METHOD:PUBLISH', 'METHOD:CANCEL').replace('STATUS:CONFIRMED', 'STATUS:CANCELLED') } });
}

/** La 502 est-elle appliquée (la sorte est-elle acceptée par le journal des mails) ? LECTURE. */
export async function annulationLocatairesDisponible(): Promise<boolean> {
  try {
    const { rows } = await query<{ ok: boolean }>(
      `SELECT coalesce(bool_or(pg_get_constraintdef(oid) LIKE '%rdv_annulation_locataires%'), false) AS ok
         FROM pg_constraint WHERE conname = 'gestion_location_mail_avis_sorte_check'`);
    return rows[0]?.ok === true;
  } catch { return false; }
}

/** Qui recevra l'annulation (les noms des locataires qui avaient accepté et ont une adresse), pour le récapitulatif. LECTURE. */
export async function apercuAnnulationLocataires(tacheId: number, quand: { jour: string; heure: string | null }, auteur: Auteur, deps: DepsAvis = {}): Promise<string[]> {
  try {
    const r = await rdvPreavisDeLaTache(tacheId);
    if (r === null || quand.heure === null) return [];
    const acceptes = await locatairesAyantAccepte(r.sorte, tacheId, quand.jour, quand.heure);
    if (acceptes.length === 0) return [];
    const c = await contexte(r.occupationIds, auteur, deps);
    return c === null ? [] : c.locataires.filter((l) => acceptes.includes(l.occupationId) && adressesUniques(l.emails).length > 0).map((l) => prenomNom(l));
  } catch { return []; }
}

/** APRÈS l'annulation : le mail aux locataires qui avaient accepté (lu AVANT l'annulation : `quand`). Rend ce qui est parti (ou non). */
export async function prevenirLocatairesAnnulation(tacheId: number, quand: { jour: string; heure: string | null; dureeMinutes: number | null }, auteur: Auteur,
  deps: DepsAvis & { maintenant?: Date } = {}): Promise<EnvoiAvis[]> {
  try {
    const r = await rdvPreavisDeLaTache(tacheId);
    if (r === null || quand.heure === null) return [];
    const acceptes = await locatairesAyantAccepte(r.sorte, tacheId, quand.jour, quand.heure);
    if (acceptes.length === 0) return [];
    if (!(await mailsAvisDisponibles()) || !(await annulationLocatairesDisponible())) {
      return [{ sorte: SORTE_ANNULATION_LOCATAIRES, objet: 'Mail d’annulation aux locataires', a: [], cc: [], texte: '', envoye: false, motif: MOTIF_SANS_502 }];
    }
    const c = await contexte(r.occupationIds, auteur, deps);
    if (c === null) return [];
    const rdv: RdvPrevisite = { jour: quand.jour, heure: quand.heure, dureeMinutes: quand.dureeMinutes ?? 60 };
    const mails = mailsAnnulationLocataires(c, { sorte: r.sorte, rdvId: r.id, tacheId, rdv, acceptes, sequence: (await sequenceTache(tacheId)) + 1, maintenant: deps.maintenant ?? new Date() });
    if (mails.length === 0) return [];
    const p = await perimetreDuGeste({ occupationIds: r.occupationIds });
    if (!p.ok) return [];
    return await avecPerimetreTest(p.perimetre, () => envoyerSerie(mails, c.brute, { lotId: c.lotId, occupationIds: r.occupationIds, auteur }, deps));
  } catch (e) {
    return [{ sorte: SORTE_ANNULATION_LOCATAIRES, objet: 'Mail d’annulation aux locataires', a: [], cc: [], texte: '', envoye: false, motif: (e as Error)?.message || 'erreur inattendue' }];
  }
}
