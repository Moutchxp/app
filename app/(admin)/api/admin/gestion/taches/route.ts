import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import { tachesDisponibles } from '../../../../../lib/gestion/schema';
import { verifierSaisie, lireSaisie } from '../../../../../lib/gestion/taches';
import { creerTache, listerTaches } from '../../../../../lib/gestion/tachesRepo';
/* 🔴 LOT TACHES-PIECES-DRIVE — les pièces choisies sont RELUES dans le Drive (lecture seule) avant d'en garder la référence. */
import { jetonPourRequete } from '../../../../../lib/gestion/jetonCollaborateur';
import { relirePieces } from '../../../../../lib/gestion/tachesDrive';
import { piecesTacheDisponible } from '../../../../../lib/gestion/schema';
import type { PieceAjout } from '../../../../../lib/gestion/taches';
/* 🔴 LOT TACHES-ACCEPTATION — après la création, le mail de demande (envoi réel seulement si le réglage l'autorise). */
// AUDIT POINT 9 : le mail de demande part au nom de gestion@ → seulement avec le droit d'envoi (cf. acceptationAutorisee.ts).
import { envoyerAuxInvites, envoyerSiAutorise } from '../../../../../lib/gestion/acceptationAutorisee';
import { mentionMail, phraseInvitations } from '../../../../../lib/gestion/acceptationTache';
/* 🔴 LOT TACHES-AGENDA — après la création : l'agenda (réglage actif seulement) ; la lecture relance la reprise automatique. */
import { declencherReprise, synchroniserApresGeste } from '../../../../../lib/gestion/agendaSynchroRepo';

/**
 * ══ 🔴🔴 LOT TACHES-1 — LES TÂCHES : LIRE, CRÉER ════════════════════════════════════════════════════════════════
 *
 * `GET  ?bien=<id du lot>` → les tâches de ce bien ; sans `bien` → celles de TOUS les biens (récapitulatif
 *                            général). Rend aussi `moi` (l'identifiant du compte connecté) pour le filtre
 *                            « Les miennes » et le choix par défaut « confiée à moi ».
 * `POST { lotId, objet, jour, heure?, note?, confieeA, evenementId?, rappels }` → crée la tâche.
 *
 * ⚠️ SANS LA MIGRATION 346 : `{ etat: 'sans_schema' }`, et l'écran n'affiche rien — ni bouton, ni récapitulatif.
 * 🔒 `exigerCompteActif(…, 'gestion')`. Runtime Node (driver pg).
 * 🔴 LOT TACHES-AGENDA — après la création, l'envoi vers l'agenda Google (seulement si le réglage est actif ; faux
 * Google sous les tests). Un échec de Google n'annule pas la création : « Agenda : à resynchroniser ».
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  if (!await tachesDisponibles()) return Response.json({ etat: 'sans_schema' });
  const brut = (new URL(request.url).searchParams.get('bien') ?? '').trim();
  const lotId = brut === '' ? null : Number(brut);
  if (lotId !== null && (!Number.isInteger(lotId) || lotId <= 0)) {
    return Response.json({ erreur: 'Bien inconnu.' }, { status: 400 });
  }
  const auteur = await auteurDeLaRequete(request);
  declencherReprise();
  const { taches, tronque } = await listerTaches(lotId);
  return Response.json(
    { etat: 'ok', taches, tronque, moi: auteur.id === null ? null : Number(auteur.id) },
    { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  if (!await tachesDisponibles()) {
    return Response.json({ erreur: 'Les tâches ne sont pas encore installées (migration 346).' }, { status: 503 });
  }
  const corps = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  /* 🔴 LOT GESTION-TACHES-SANS-BIEN (décision d'Arno, 17/10/2026) — `lotId` absent ou `null` : une tâche SANS bien. Une
     valeur fournie mais illisible reste refusée (jamais une tâche « sans bien » par erreur de saisie). */
  const sansBien = corps.lotId === null || corps.lotId === undefined;
  const lotId = sansBien ? null : Number(corps.lotId);
  if (lotId !== null && (!Number.isInteger(lotId) || lotId <= 0)) return Response.json({ erreur: 'Bien inconnu.' }, { status: 400 });
  const saisie = lireSaisie(corps);
  const refusSaisie = verifierSaisie(saisie);
  if (refusSaisie !== null) return Response.json({ erreur: refusSaisie.message, champ: refusSaisie.champ }, { status: 400 });
  let pieces: PieceAjout[] = [];
  if ((saisie.pieces ?? []).length > 0 && await piecesTacheDisponible()) {
    const jeton = await jetonPourRequete(request);
    if (jeton.etat !== 'ok') return Response.json({ erreur: jeton.motif, champ: 'pieces' }, { status: 400 });
    const r = await relirePieces(jeton.jeton, saisie.pieces ?? []);
    if (!r.ok) return Response.json({ erreur: r.motif, champ: 'pieces' }, { status: 400 });
    pieces = r.valeur;
  }
  const issue = await creerTache(lotId, saisie, await auteurDeLaRequete(request), pieces);
  if (!issue.ok) return Response.json({ erreur: issue.motif, champ: issue.champ ?? null }, { status: issue.statut });
  /* 🔴 LOT GESTION-INVITATIONS-TACHES — plusieurs invités (migration 365) : un mail par invité en attente. */
  if (issue.demandes !== undefined) {
    const envois = await envoyerAuxInvites(request, issue.demandes);
    const agenda = await synchroniserApresGeste(issue.id);
    return Response.json({
      etat: 'ok', id: issue.id,
      message: `${envois.length > 0 ? 'Tâche créée, en attente d’acceptation.' : 'Tâche créée.'}${phraseInvitations(envois)}${agenda}`,
    });
  }
  const mail = await envoyerSiAutorise(request, issue.demande);
  const agenda = await synchroniserApresGeste(issue.id);
  const enAttente = issue.demande?.statut === 'en_attente';
  return Response.json({
    etat: 'ok', id: issue.id,
    message: `${enAttente ? `Tâche créée, en attente d’acceptation${mail && mentionMail(mail) ? ` — ${mentionMail(mail)}` : mail === 'envoye' ? ' — demande envoyée par mail' : ''}.` : 'Tâche créée.'}${agenda}`,
  });
}
