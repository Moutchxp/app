import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../../lib/gestion/auteur';
import {
  changerPresenceEtape, corrigerEtape, revenirAuClassementAutomatique, type IssueCorrection,
} from '../../../../../../../lib/gestion/etapeCorrectionRepo';
import { etatApresCarteSelonLaFrise } from '../../../../../../../lib/gestion/etatParLaFrise';
import type { TypeEtape } from '../../../../../../../lib/gestion/mongaEtape';

/**
 * ══ 🔴🔴 LOT FRISE-CORRECTION-MANUELLE (26/10/2026) — CORRIGER UNE CARTE OU UN POINT DE LA FRISE ══════════════════════════
 *
 * `PATCH` avec `geste` :
 *   · `corriger`    — `{ type, titre, jour }` : nature (dont point ↔ carte), titre, date (`AAAA-MM-JJ` ou `null` = sans date) ;
 *   · `retirer`     — « Retirer de la frise » (statut `retire`, réversible) ;
 *   · `remettre`    — « Remettre dans la frise » ;
 *   · `automatique` — « Revenir au classement automatique » (étape venue de Monga, déjà corrigée).
 *
 * S'applique à TOUTE étape : Monga, manuelle, ouverture de repli. Les règles (ce qui se corrige, ce qui ne se corrige pas) sont
 * dans le module pur `correctionEtape.ts`, partagé avec l'écran ; les gardes de fond sont dans le dépôt. Les gestes existants
 * (crayon des étapes manuelles, ✓ / ✕, montant, retrait) gardent leur route, inchangée.
 *
 * Sans la migration 429 : 409 avec le motif « disponible après la mise à jour » — rien n'est écrit.
 * 🔒 `exigerCompteActif`. `private, no-store`. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' };

function reponse(issue: IssueCorrection, message: string): Response {
  if (!issue.ok) {
    return Response.json({ erreur: issue.motif, sansSchema: issue.code === 'sans_schema' },
      { status: issue.code === 'inconnue' ? 404 : 409, headers: ENTETES });
  }
  const change = issue.ouvertAvant !== null && issue.ouvertApres !== null && issue.ouvertAvant !== issue.ouvertApres;
  return Response.json({
    etat: 'ok',
    message: change ? `${message} ${issue.ouvertApres ? 'L’événement est rouvert.' : 'L’événement est clôturé.'}` : message,
    etatEvenement: change ? etatApresCarteSelonLaFrise(issue.ouvertApres as boolean) : null,
  }, { headers: ENTETES });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const etapeId = Number((await params).id);
  if (!Number.isInteger(etapeId) || etapeId <= 0) {
    return Response.json({ erreur: 'Étape inconnue.' }, { status: 400, headers: ENTETES });
  }
  const corps = (await request.json().catch(() => ({}))) as { geste?: unknown; type?: unknown; titre?: unknown; jour?: unknown };
  const geste = String(corps.geste ?? '');
  try {
    const auteur = await auteurDeLaRequete(request);
    const qui = { id: auteur.id === null ? null : Number(auteur.id), libelle: auteur.libelle };
    if (geste === 'corriger') {
      if (typeof corps.type !== 'string' || corps.type.trim() === '') {
        return Response.json({ erreur: 'Nature d’étape attendue.' }, { status: 400, headers: ENTETES });
      }
      const issue = await corrigerEtape({
        id: etapeId, auteur: qui,
        voulu: {
          type: corps.type as TypeEtape,
          titre: typeof corps.titre === 'string' ? corps.titre : null,
          jour: typeof corps.jour === 'string' ? corps.jour : null,
        },
      });
      return reponse(issue, 'Correction enregistrée.');
    }
    if (geste === 'retirer') return reponse(await changerPresenceEtape(etapeId, 'retire', qui), 'Retiré de la frise.');
    if (geste === 'remettre') return reponse(await changerPresenceEtape(etapeId, 'vif', qui), 'Remis dans la frise.');
    if (geste === 'automatique') return reponse(await revenirAuClassementAutomatique(etapeId, qui), 'Classement automatique rétabli.');
    return Response.json({ erreur: 'Geste inconnu.' }, { status: 400, headers: ENTETES });
  } catch (e) {
    console.error('[gestion/etapes/correction] geste impossible', e);
    return Response.json({ erreur: 'Correction impossible : erreur interne du serveur.' }, { status: 503, headers: ENTETES });
  }
}
