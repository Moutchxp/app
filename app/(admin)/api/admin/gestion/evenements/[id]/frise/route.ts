import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../../lib/gestion/auteur';
import {
  ajouterEtapeManuelle, decompteConfirmations, friseDeLEvenement,
} from '../../../../../../../lib/gestion/mongaEtapeRepo';
import {
  proposerCloture, proposerPassageEnFiable, TYPES_AJOUTABLES, TYPES_INFORMATION, TYPES_RESERVOIR,
  type TypeEtape,
} from '../../../../../../../lib/gestion/mongaEtape';
import { deplacerOuvertureEvenement } from '../../../../../../../lib/gestion/gestes';
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
    /**
     * 🔴 LOT FRISE-CONSTRUCTIBLE — `ouvert_le` VOYAGE AVEC LA FRISE. Arno, point 1 : la première carte est
     * l'ouverture de l'ÉVÉNEMENT, et sa date est celle-ci. Elle était déjà lue ici (pour `traite_le`) : c'est
     * la même requête, une colonne de plus, aucune lecture ajoutée.
     */
    const { rows } = await query<{ traite_le: string | null; ouvert_le: string }>(
      'SELECT traite_le::text, ouvert_le::text FROM gestion_evenement WHERE id = $1', [evenementId]);
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
      /* 🔴 LOT FRISE-CONSTRUCTIBLE — la date d'ouverture de l'événement, et les cartes du réservoir (Arno). */
      ouvertLe: rows[0].ouvert_le,
      typesReservoir: TYPES_RESERVOIR,
      typesInformation: TYPES_INFORMATION,
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
    texte?: unknown; montantCents?: unknown; pieceNom?: unknown; titre?: unknown;
  };
  const type = String(corps.type ?? '') as TypeEtape;
  /**
   * 🔴🔴 LOT FRISE-HORIZONTALE — DEUX LISTES, ET LA RÉUNION DES DEUX EST CE QU'UNE MAIN PEUT POSER.
   *
   * Arno : « le choix “Étape” ou “Simple information”. Une étape s'affiche en carré, une information en point. »
   * Les deux passent par la même route et la même table — c'est le TYPE qui décide de la forme, et `estRepere`
   * tranche à l'affichage. Une troisième route aurait donné deux portes d'écriture pour une seule chose.
   *
   * ⚠️ `commentaire` N'EST DANS NI L'UNE NI L'AUTRE : un commentaire est ce que MONGA dit. Se fier au `CHECK` de
   * la base (qui l'accepte, puisque Monga en écrit) aurait laissé fabriquer un faux commentaire Monga.
   */
  if (!TYPES_AJOUTABLES.includes(type) && !TYPES_INFORMATION.includes(type)) {
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
  /**
   * 🔴🔴 LOT FRISE-CONSTRUCTIBLE — LE TITRE D'UNE CARTE LIBRE, EXIGÉ ICI AUTANT QU'À L'ÉCRAN.
   *
   * Arno : « plus un carré LIBRE (titre à saisir) ». Une carte libre sans titre s'afficherait « Carte libre »
   * sur la frise — une ligne qui ne dit rien de ce qu'elle raconte, et qu'on ne peut plus distinguer de la
   * suivante. La garde est donc dans la route, et pas seulement dans le formulaire : une règle tenue par
   * l'écran seul est contournée par le premier appel qui l'oublie.
   *
   * ⚠️ ET IL EST IGNORÉ SUR TOUT AUTRE TYPE : le mot d'une carte vient du TYPE, écrit une seule fois dans
   * `motEtape`. Un titre recopié sur une « Clôture » aurait fini par la contredire.
   */
  const titreBrut = typeof corps.titre === 'string' ? corps.titre.trim() : '';
  if (type === 'autre' && titreBrut === '') {
    return Response.json({ erreur: 'Une carte libre demande un titre.' }, { status: 400 });
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
      titre: type === 'autre' && titreBrut !== '' ? titreBrut : null,
      parId: auteur.id === null ? null : Number(auteur.id),
      parLibelle: auteur.libelle,
    });
    return Response.json({ etat: 'ok', id: idEtape, message: 'Étape ajoutée.' });
  } catch (e) {
    console.error('[gestion/frise] ajout impossible', e);
    return Response.json({ erreur: 'Ajout impossible : erreur interne du serveur.' }, { status: 503 });
  }
}

/**
 * ══ 🔴🔴 LOT FRISE-CONSTRUCTIBLE — CORRIGER LA DATE D'OUVERTURE DE L'ÉVÉNEMENT ═══════════════════════════════════
 *
 * Arno, point 1 : la carte « Ouverture » porte « la date d'ouverture de l'événement, MODIFIABLE ».
 *
 * 🔴 ELLE EST SUR LA ROUTE DE LA FRISE, et c'est voulu : c'est la frise qui l'affiche, c'est par elle qu'on la
 * corrige. Le geste écrit `gestion_evenement.ouvert_le` — une seule vérité, journalisée — et non une étape
 * d'ouverture copiée à côté, qui aurait pu diverger de l'événement qu'elle prétend dater.
 *
 * 🔒 `exigerCompteActif`, comme les deux autres verbes.
 */
export async function PATCH(
  request: Request, { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const { id } = await params;
  const evenementId = Number(id);
  if (!Number.isInteger(evenementId) || evenementId <= 0) {
    return Response.json({ erreur: 'Événement inconnu.' }, { status: 400 });
  }
  const corps = (await request.json().catch(() => ({}))) as { geste?: unknown; survenuLe?: unknown };
  if (String(corps.geste ?? '') !== 'ouverture') {
    return Response.json({ erreur: 'Geste inconnu.' }, { status: 400 });
  }
  /* ⚠️ UN JOUR, PAS UN INSTANT : une ouverture d'événement n'a pas d'heure, et prétendre le contraire
     inventerait une précision que personne n'a saisie. Le dépôt l'ancre à midi, voir `deplacerOuvertureEvenement`. */
  const jour = String(corps.survenuLe ?? '').slice(0, 10);
  try {
    const auteur = await auteurDeLaRequete(request);
    const issue = await deplacerOuvertureEvenement(evenementId, jour, auteur);
    if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409 });
    return Response.json({ etat: 'ok', message: 'Date d’ouverture enregistrée.' });
  } catch (e) {
    console.error('[gestion/frise] ouverture impossible', e);
    return Response.json({ erreur: 'Enregistrement impossible : erreur interne du serveur.' }, { status: 503 });
  }
}
