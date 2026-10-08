import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../lib/gestion/auteur';
import {
  completerMontant, dateDeLEtape, etapePourRetrait, modifierEtapeManuelle, retirerEtapeManuelle, trancherEtape,
} from '../../../../../../lib/gestion/mongaEtapeRepo';
/* 🔴🔴 LOT ETAT-PAR-LA-FRISE — retirer une carte de BORNE change l'état, et l'écran doit l'apprendre. */
import { etatApresCarteSelonLaFrise, sensDeLaBorne } from '../../../../../../lib/gestion/etatParLaFrise';
import { evenementOuvertParLaFrise } from '../../../../../../lib/gestion/evenementEtatRepo';
import { TYPES_AJOUTABLES, TYPES_INFORMATION, type TypeEtape } from '../../../../../../lib/gestion/mongaEtape';
/* 🔴 LOT FRISE-ORDRE-POSE-ET-GLISSER — `dateAuCentre` dit quelles cartes sont des BORNES : le crayon ne touche
   pas à leur date (point 5), et aucune date déjà enregistrée n'est modifiée (point 7). */
import { dateAuCentre } from '../../../../../../lib/gestion/frise';

/**
 * ══ 🔴🔴 LOT MONGA-2, POINT 3 — CE QU'ON FAIT D'UNE ÉTAPE ════════════════════════════════════════════════════════
 *
 * `PATCH`  → modifier une étape MANUELLE, compléter le MONTANT d'un devis, CONFIRMER ou ÉCARTER une étape
 *            « à confirmer ». Quatre gestes, une seule route : ils portent tous sur la même ligne, et séparer
 *            aurait donné quatre routes à tenir d'accord sur la même garde.
 * `DELETE` → retirer une étape manuelle (`statut = 'retire'`, jamais un vrai DELETE).
 *
 * 🔴 LES GARDES MÉTIER SONT DANS LE DÉPÔT, PAS ICI (« une étape Monga ne se modifie pas » — Arno). Cette route
 * valide la FORME de ce qu'on lui envoie ; c'est le `WHERE` de la requête qui refuse le fond. Une règle tenue par
 * la route seule serait contournée par la deuxième route qui l'oublie.
 *
 * 🔒 `exigerCompteActif`. `private, no-store`. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

export async function PATCH(
  request: Request, { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const { id } = await params;
  const etapeId = Number(id);
  if (!Number.isInteger(etapeId) || etapeId <= 0) {
    return Response.json({ erreur: 'Étape inconnue.' }, { status: 400 });
  }
  const corps = (await request.json().catch(() => ({}))) as {
    geste?: unknown; type?: unknown; survenuLe?: unknown; heureConnue?: unknown;
    texte?: unknown; montantCents?: unknown; titre?: unknown;
  };
  const geste = String(corps.geste ?? '');
  const auteur = await auteurDeLaRequete(request);

  try {
    /* ── CONFIRMER / ÉCARTER une étape « à confirmer » (Arno : deux boutons) ──────────────────────────────── */
    if (geste === 'confirmer' || geste === 'ecarter') {
      const fait = await trancherEtape(etapeId, geste, auteur.libelle);
      if (!fait) {
        return Response.json(
          { erreur: 'Cette étape n’attend plus de confirmation.' }, { status: 409 });
      }
      return Response.json({
        etat: 'ok',
        message: geste === 'confirmer' ? 'Étape confirmée.' : 'Étape écartée.',
      });
    }

    /**
     * ── LE MONTANT D'UN DEVIS ──────────────────────────────────────────────────────────────────────────────
     *
     * 🔴 LA SEULE CHOSE QU'UNE MAIN POSE SUR UNE ÉTAPE MONGA. L'audit a mesuré que le montant n'est jamais dans
     * le mail (2 sur 120, et ce sont des phrases humaines) ; décision d'Arno : « Devis automatique (numéro +
     * date), montant complété à la main. »
     *
     * ⚠️ `null` EST UNE VALEUR, PAS UNE ABSENCE : effacer un montant saisi par erreur doit être possible.
     */
    if (geste === 'montant') {
      const brut = corps.montantCents;
      const montant = brut === null || brut === undefined ? null : Number(brut);
      if (montant !== null && (!Number.isFinite(montant) || montant < 0)) {
        return Response.json({ erreur: 'Montant invalide.' }, { status: 400 });
      }
      const fait = await completerMontant(etapeId, montant, auteur.libelle);
      if (!fait) return Response.json({ erreur: 'Montant impossible sur cette étape.' }, { status: 409 });
      return Response.json({ etat: 'ok', message: montant === null ? 'Montant retiré.' : 'Montant enregistré.' });
    }

    /* ── MODIFIER une étape manuelle ──────────────────────────────────────────────────────────────────────── */
    if (geste === 'modifier') {
      const type = String(corps.type ?? '') as TypeEtape;
      /* 🔴 LOT FRISE-HORIZONTALE — une étape manuelle peut devenir une information, et l'inverse : ce sont deux
         formes d'une même ligne, et le type seul décide. Voir `TYPES_INFORMATION`. */
      if (!TYPES_AJOUTABLES.includes(type) && !TYPES_INFORMATION.includes(type)) {
        return Response.json({ erreur: 'Type d’étape inconnu.' }, { status: 400 });
      }
      const survenuLe = String(corps.survenuLe ?? '');
      if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/.test(survenuLe)) {
        return Response.json({ erreur: 'Date d’étape attendue (AAAA-MM-JJ, heure facultative).' }, { status: 400 });
      }
      /**
       * ══ 🔴🔴 LOT FRISE-ORDRE-POSE-ET-GLISSER, POINT 5 — LE CRAYON NE CHANGE PAS LA DATE D'UNE BORNE ═══════
       *
       * ARNO : « Dans le crayon d'édition de ces cartes, la date n'est pas modifiable ; tout le reste du crayon
       * et du menu “…” reste en place. »
       *
       * 🔴 LA DATE ENREGISTRÉE EST DONC RELUE ET RÉÉCRITE TELLE QUELLE — on ne refuse pas la modification, on
       * en retire la seule chose qui ne se modifie plus. Refuser aurait aussi bloqué le TEXTE, que le crayon
       * continue d'offrir.
       *
       * ⚠️ AUCUNE DATE DÉJÀ ENREGISTRÉE N'EST TOUCHÉE (Arno, point 7) : c'est exactement ce que fait cette
       * relecture — la carte repart avec la date qu'elle avait, à la seconde près.
       */
      const dateImposee = dateAuCentre(type) ? await dateDeLEtape(etapeId) : null;
      const brut = corps.montantCents;
      const montant = brut === null || brut === undefined ? null : Number(brut);
      if (montant !== null && (!Number.isFinite(montant) || montant < 0)) {
        return Response.json({ erreur: 'Montant invalide.' }, { status: 400 });
      }
      /* 🔴 LOT FRISE-CONSTRUCTIBLE — MÊME GARDE QU'À L'AJOUT : une carte libre sans titre n'est qu'une ligne
         muette sur la frise. Et le titre n'est gardé que sur `autre`, pour la raison écrite dans la route
         d'ajout : ailleurs, le mot vient du TYPE, écrit une seule fois. */
      const titreBrut = typeof corps.titre === 'string' ? corps.titre.trim() : '';
      if (type === 'autre' && titreBrut === '') {
        return Response.json({ erreur: 'Une carte libre demande un titre.' }, { status: 400 });
      }
      const fait = await modifierEtapeManuelle({
        id: etapeId, type,
        survenuLe: dateImposee ?? survenuLe,
        heureConnue: dateImposee === null ? corps.heureConnue === true : false,
        texte: typeof corps.texte === 'string' && corps.texte.trim() !== '' ? corps.texte.trim() : null,
        montantCents: montant, titre: type === 'autre' && titreBrut !== '' ? titreBrut : null,
        parLibelle: auteur.libelle,
      });
      if (!fait) {
        /* 🔴 LE MESSAGE DIT LA RÈGLE, et ne se contente pas d'un refus : c'est ainsi qu'on l'apprend. */
        return Response.json(
          { erreur: 'Modification impossible : une étape venue de Monga ne se modifie pas.' }, { status: 409 });
      }
      return Response.json({ etat: 'ok', message: 'Étape modifiée.' });
    }

    return Response.json({ erreur: 'Geste inconnu.' }, { status: 400 });
  } catch (e) {
    console.error('[gestion/etapes] geste impossible', e);
    return Response.json({ erreur: 'Geste impossible : erreur interne du serveur.' }, { status: 503 });
  }
}

export async function DELETE(
  request: Request, { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const { id } = await params;
  const etapeId = Number(id);
  if (!Number.isInteger(etapeId) || etapeId <= 0) {
    return Response.json({ erreur: 'Étape inconnue.' }, { status: 400 });
  }
  try {
    const auteur = await auteurDeLaRequete(request);
    /**
     * ══ 🔴🔴 LOT ETAT-PAR-LA-FRISE, POINT 2 — RETIRER LA CLÔTURE ROUVRE LE DOSSIER ══════════════════════════
     *
     * ARNO : « Supprimer la carte Clôture d'un événement clos le ROUVRE, sans carte Réouverture. »
     *
     * 🔴 IL N'Y A RIEN À ÉCRIRE POUR CELA, ET C'EST TOUT L'INTÉRÊT DU LOT : l'état se DÉDUIT des cartes de
     * borne à chaque lecture. Retirer la carte suffit ; aucune ligne de code ne « pense » à rouvrir, donc
     * aucune ne peut l'oublier. C'est exactement ce qui manquait au constat d'Arno sur GES-2026-000001.
     *
     * 🔴 CE QUE LA ROUTE FAIT EN PLUS : elle RELIT l'état avant et après, et le dit à l'écran. Sans ce signal,
     * la bande orange de la fiche du bien ne reviendrait qu'au rechargement suivant (lot
     * MARQUES-EVENEMENT-EN-COURS). Deux lectures de plus, et seulement sur une carte de borne.
     */
    const avant = await etapePourRetrait(etapeId);
    const evenementId = avant?.evenementId ?? null;
    const borne = avant !== null && sensDeLaBorne(avant.type) !== null;
    const ouvertAvant = borne && evenementId !== null ? await evenementOuvertParLaFrise(evenementId) : null;

    const fait = await retirerEtapeManuelle(etapeId, auteur.libelle);
    if (!fait) {
      return Response.json(
        { erreur: 'Retrait impossible : une étape venue de Monga ne se retire pas.' }, { status: 409 });
    }

    const ouvertApres = ouvertAvant === null || evenementId === null
      ? null : await evenementOuvertParLaFrise(evenementId);
    const change = ouvertAvant !== null && ouvertApres !== null && ouvertAvant !== ouvertApres;
    /* ⚠️ « RETIRÉE », ET LE MOT LE DIT : elle n'est pas supprimée, elle quitte la frise. */
    return Response.json({
      etat: 'ok',
      message: change
        ? (ouvertApres === true ? 'Clôture retirée : l’événement est rouvert.' : 'Étape retirée : l’événement est clos.')
        : 'Étape retirée.',
      etatEvenement: change ? etatApresCarteSelonLaFrise(ouvertApres as boolean) : null,
    });
  } catch (e) {
    console.error('[gestion/etapes] retrait impossible', e);
    return Response.json({ erreur: 'Retrait impossible : erreur interne du serveur.' }, { status: 503 });
  }
}
