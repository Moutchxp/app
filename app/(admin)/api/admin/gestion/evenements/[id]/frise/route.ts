import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../../lib/gestion/auteur';
import {
  ajouterEtapeManuelle, decompteConfirmations, friseDeLEvenement,
} from '../../../../../../../lib/gestion/mongaEtapeRepo';
import {
  proposerCloture, proposerPassageEnFiable, TYPES_AJOUTABLES, type TypeEtape,
} from '../../../../../../../lib/gestion/mongaEtape';
import { query } from '../../../../../../../lib/db/client';

/**
 * ══ 🔴🔴 LOT MONGA-2, POINT 3 — LA FRISE D'AVANCEMENT D'UN ÉVÉNEMENT ═════════════════════════════════════════════
 *
 * `GET`  → les étapes de l'événement, dans l'ordre, plus ce que l'écran doit savoir pour les afficher.
 * `POST` → « + Ajouter une étape » (Arno).
 *
 * 🔒 `exigerCompteActif` : une frise porte des dates de rendez-vous chez des locataires et des montants de devis.
 * `private, no-store`. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

export async function GET(
  request: Request, { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const { id } = await params;
  const evenementId = Number(id);
  if (!Number.isInteger(evenementId) || evenementId <= 0) {
    return Response.json({ erreur: 'Événement inconnu.' }, { status: 400 });
  }
  try {
    const etapes = await friseDeLEvenement(evenementId);
    const { rows } = await query<{ traite_le: string | null }>(
      'SELECT traite_le::text FROM gestion_evenement WHERE id = $1', [evenementId]);
    if (rows.length === 0) return Response.json({ erreur: 'Événement inconnu.' }, { status: 404 });
    const traite = rows[0].traite_le !== null;

    /**
     * 🔴 LA PROPOSITION DE PASSAGE EN FIABLE (Arno) : « quand une étape du même type a été confirmée 5 fois sans
     * être écartée, propose-moi (sans l'appliquer) ». Le décompte est GLOBAL — il porte sur le MOTIF, pas sur cet
     * événement : c'est la fiabilité du gabarit Monga qu'on juge, et elle ne dépend pas du dossier qu'on regarde.
     */
    const decompte = await decompteConfirmations();
    const aProposer = decompte
      .filter((d) => proposerPassageEnFiable(d))
      .map((d) => ({ type: d.type, confirmees: d.confirmees }));

    return Response.json({
      etat: 'ok',
      etapes,
      /* 🔴 PROPOSITION, JAMAIS AUTOMATIQUE (Arno) : l'écran affiche, et c'est un humain qui clôture. */
      proposerCloture: proposerCloture(etapes, traite),
      passagesEnFiableProposes: aProposer,
      typesAjoutables: TYPES_AJOUTABLES,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[gestion/frise] lecture impossible', e);
    return Response.json({ erreur: 'Frise indisponible : erreur interne du serveur.' }, { status: 503 });
  }
}

export async function POST(
  request: Request, { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const { id } = await params;
  const evenementId = Number(id);
  if (!Number.isInteger(evenementId) || evenementId <= 0) {
    return Response.json({ erreur: 'Événement inconnu.' }, { status: 400 });
  }
  const corps = (await request.json().catch(() => ({}))) as {
    type?: unknown; survenuLe?: unknown; heureConnue?: unknown;
    texte?: unknown; montantCents?: unknown; pieceNom?: unknown;
  };
  const type = String(corps.type ?? '') as TypeEtape;
  /**
   * ⚠️ LE TYPE EST VÉRIFIÉ CONTRE LA LISTE DU MODULE PUR, et non contre le `CHECK` de la base. Les deux listes
   * existent et ne disent pas la même chose : la base accepte `commentaire` (Monga en écrit), la main ne doit
   * pas pouvoir en poser. Se fier au `CHECK` aurait laissé passer un commentaire fabriqué.
   */
  if (!TYPES_AJOUTABLES.includes(type)) {
    return Response.json({ erreur: 'Type d’étape inconnu.' }, { status: 400 });
  }
  const survenuLe = String(corps.survenuLe ?? '');
  if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/.test(survenuLe)) {
    return Response.json({ erreur: 'Date d’étape attendue (AAAA-MM-JJ, heure facultative).' }, { status: 400 });
  }
  const montant = corps.montantCents === null || corps.montantCents === undefined
    ? null : Number(corps.montantCents);
  if (montant !== null && (!Number.isFinite(montant) || montant < 0)) {
    return Response.json({ erreur: 'Montant invalide.' }, { status: 400 });
  }
  try {
    const auteur = await auteurDeLaRequete(request);
    const idEtape = await ajouterEtapeManuelle({
      evenementId,
      type,
      survenuLe,
      heureConnue: corps.heureConnue === true,
      texte: typeof corps.texte === 'string' && corps.texte.trim() !== '' ? corps.texte.trim() : null,
      montantCents: montant,
      pieceNom: typeof corps.pieceNom === 'string' && corps.pieceNom !== '' ? corps.pieceNom : null,
      parId: auteur.id === null ? null : Number(auteur.id),
      parLibelle: auteur.libelle,
    });
    return Response.json({ etat: 'ok', id: idEtape, message: 'Étape ajoutée.' });
  } catch (e) {
    console.error('[gestion/frise] ajout impossible', e);
    return Response.json({ erreur: 'Ajout impossible : erreur interne du serveur.' }, { status: 503 });
  }
}
