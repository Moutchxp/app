import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../../lib/gestion/auteur';
import {
  ajouterEtapeManuelle, decompteConfirmations, friseDeLEvenement, reordonnerCartes,
} from '../../../../../../../lib/gestion/mongaEtapeRepo';
/* 🔴 LOT FRISE-ORDRE-POSE-ET-GLISSER — `dateAuCentre` dit quelles cartes sont des BORNES : leur date est
   imposée (point 5) et elles ne se déplacent pas (point 9). La même liste que la frise peint au centre. */
import { dateAuCentre } from '../../../../../../../lib/gestion/frise';
import {
  cartesDuReservoir, etatApresCarte, informationsDuReservoir,
  proposerPassageEnFiable, TYPES_AJOUTABLES, TYPES_INFORMATION,
  type TypeEtape,
} from '../../../../../../../lib/gestion/mongaEtape';
/**
 * ══ 🔴🔴 LOT ETAT-PAR-LA-FRISE — `changerEtatEvenement` N'EST PLUS APPELÉE ICI ═══════════════════════════════
 *
 * Au lot CLOTURE-REOUVERTURE, poser une carte « Clôture » posait la carte PUIS écrivait l'état par cette
 * fonction. Deux écritures pour un fait, et c'est précisément ce que le constat d'Arno du 08/10/2026 a pris en
 * défaut : il a retiré la carte, et l'état est resté.
 *
 * 🔴 IL N'Y A PLUS QU'UNE ÉCRITURE : LA CARTE. L'état se DÉDUIT des cartes de borne à chaque lecture
 * (`etatParLaFrise`), et il n'y a donc plus rien à tenir d'accord — poser la carte, la retirer, ou corriger sa
 * date produit le bon état, sans qu'aucun code ne pense à le recalculer.
 */
import { deplacerOuvertureEvenement } from '../../../../../../../lib/gestion/gestes';
import {
  etatApresCarteSelonLaFrise, motCarteDeBorne, sqlEvenementOuvertParLaFrise,
} from '../../../../../../../lib/gestion/etatParLaFrise';
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
    /**
     * 🔴🔴 LOT ETAT-PAR-LA-FRISE — « OUVERT ? » SE DEMANDE À LA FRISE, PAS À `traite_le`.
     *
     * C'est cette réponse qui décide de la grille (Arno, point 4 : « Quand l'événement est clos, la grille ne
     * propose QUE “Réouverture” »). La demander à la colonne, c'était offrir « Réouverture » sur un dossier dont
     * la carte Clôture n'existe plus — le cas exact d'Arno sur GES-2026-000001.
     */
    const { rows } = await query<{ ouvert: boolean; ouvert_le: string }>(
      `SELECT ${sqlEvenementOuvertParLaFrise('e')} AS ouvert, e.ouvert_le::text
         FROM gestion_evenement e WHERE e.id = $1`, [evenementId]);
    if (rows.length === 0) return Response.json({ erreur: 'Événement inconnu.' }, { status: 404 });
    const ouvertParLaFrise = rows[0].ouvert;

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
      /**
       * ══ 🔴🔴 LOT CLOTURE-REOUVERTURE — `proposerCloture` A ÉTÉ RETIRÉ D'ICI ════════════════════════════════
       *
       * Ce champ portait la ligne « Clôturer cet événement ? » de la frise, qui fermait le dossier EN UN CLIC.
       * ARNO : « Retire la ligne ou le bouton qui permettait de fermer un événement en un seul clic. » On ferme
       * désormais en POSANT une carte « Clôture » — qui passe par le POST ci-dessous.
       *
       * 🔴 À SA PLACE, CE QUE LA GRILLE A BESOIN DE SAVOIR : l'événement est-il ouvert ? C'est ce qui décide
       * laquelle des deux cartes elle propose (`cartesDuReservoir`), et c'est la MÊME donnée que `traite`, déjà
       * lue deux lignes plus haut — aucune requête de plus.
       */
      ouvert: ouvertParLaFrise,
      passagesEnFiableProposes: aProposer,
      typesAjoutables: TYPES_AJOUTABLES,
      /* 🔴 LOT FRISE-CONSTRUCTIBLE — la date d'ouverture de l'événement, et les cartes du réservoir (Arno).
         🔴 LOT CLOTURE-REOUVERTURE — le réservoir DÉPEND désormais de l'état : « Clôture » si l'événement est
         ouvert, « Réouverture » s'il est clos, jamais les deux. C'est le module pur qui tranche. */
      ouvertLe: rows[0].ouvert_le,
      typesReservoir: cartesDuReservoir(ouvertParLaFrise),
      /* 🔴 LOT ETAT-PAR-LA-FRISE, POINT 4 — LA ROUTE ANNONCE CE QUE LA GRILLE PROPOSE, des DEUX côtés : « aucune
         autre carte ne peut être posée après une Clôture », et un point n'est pas une exception. Annoncer la
         liste entière pendant que l'écran n'en montre aucune aurait été deux réponses à la même question. */
      typesInformation: informationsDuReservoir(ouvertParLaFrise),
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
  /**
   * ══ 🔴🔴 LOT FRISE-ORDRE-POSE-ET-GLISSER, POINT 5 — UNE BORNE EST DATÉE DU JOUR DE SA POSE ════════════════
   *
   * ARNO : « Aucune date saisissable à la main pour ces cartes : la date inscrite dans la carte est celle du
   * jour de leur pose, FIXÉE AUTOMATIQUEMENT. »
   *
   * 🔴 LE SERVEUR L'IMPOSE, et ne se contente pas de la cacher à l'écran. Depuis le lot ETAT-PAR-LA-FRISE,
   * l'état « ouvert / clos » se lit sur l'ordre des bornes : une date d'antidate envoyée par un appel qui
   * oublierait le formulaire pourrait raconter une fermeture qui n'a pas eu lieu ce jour-là. La garde est donc
   * ici, et ce que le client envoie dans `survenuLe` est simplement IGNORÉ pour ces trois types.
   *
   * ⚠️ MIDI, ET NON MINUIT : une carte de borne n'a pas d'heure, et l'ancrer à minuit la fait basculer la veille
   * pour un lecteur dans un fuseau en retard. Convention du dépôt, déjà retenue pour `ouvert_le`.
   */
  const jourDePose = `${new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })}T12:00`;
  const survenuLe = dateAuCentre(type) ? jourDePose : String(corps.survenuLe ?? '');
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

    /**
     * ══ 🔴🔴 LOT ETAT-PAR-LA-FRISE, POINT 4 — RIEN NE SE POSE APRÈS UNE CLÔTURE, SAUF UNE RÉOUVERTURE ═══════
     *
     * ARNO : « Quand l'événement est clos, la grille “Ajouter une carte” ne propose QUE “Réouverture” : aucune
     * autre carte ne peut être posée après une Clôture. »
     *
     * 🔴 LA GARDE EST ICI, ET PAS SEULEMENT DANS LA GRILLE. Une règle tenue par l'écran seul est contournée par
     * le premier appel qui l'oublie — deux onglets ouverts suffisent : l'un clôture, l'autre pose encore un
     * devis sur la grille qu'il affichait avant. C'est la même raison qui met déjà le titre d'une carte libre
     * ici plutôt que dans le formulaire.
     *
     * 🔴 ET C'EST LA **FRISE** QU'ON INTERROGE, jamais la colonne : la grille et la garde répondent donc à la
     * même question, par la même règle.
     */
    const { rows: etatLu } = await query<{ ouvert: boolean }>(
      `SELECT ${sqlEvenementOuvertParLaFrise('e')} AS ouvert FROM gestion_evenement e WHERE e.id = $1`,
      [evenementId]);
    if (etatLu.length === 0) return Response.json({ erreur: 'Événement inconnu.' }, { status: 404 });
    const ouvertAvant = etatLu[0].ouvert;
    if (!ouvertAvant && type !== 'reouverture') {
      return Response.json({
        erreur: 'Cet événement est clos : posez d’abord une carte « Réouverture » pour le reprendre.',
      }, { status: 409 });
    }

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

    /**
     * ══ 🔴🔴 LOT ETAT-PAR-LA-FRISE — LA CARTE EST LA SEULE ÉCRITURE. IL N'Y EN A PLUS DE SECONDE. ═══════════
     *
     * Au lot CLOTURE-REOUVERTURE, on posait la carte PUIS on écrivait l'état par `changerEtatEvenement`. Deux
     * écritures pour un fait — et le constat d'Arno du 08/10/2026 a montré ce qu'elles coûtent : il a retiré la
     * carte, et l'état est resté. Il n'y a donc plus qu'une écriture, la carte ; l'état se DÉDUIT.
     *
     * 🔴 ON RELIT L'ÉTAT APRÈS LA CARTE, et on ne le DEVINE pas depuis le type posé. Une Clôture datée AVANT
     * une Réouverture déjà présente ne ferme rien — c'est la suite des bornes qui tranche, pas la dernière
     * carte saisie. Deviner ici aurait réintroduit la contradiction par la porte du message.
     *
     * ⚠️ `etatEvenement` SERT À PRÉVENIR LA FICHE (lot MARQUES-EVENEMENT-EN-COURS) : la bande orange, le bloc
     * « Événements » et les lignes de mail se relisent du même geste. Il n'est rendu que si l'état a VRAIMENT
     * changé — une carte ordinaire ne doit rien faire relire.
     */
    const etatVoulu = etatApresCarte(type);
    if (etatVoulu !== null) {
      const { rows: apres } = await query<{ ouvert: boolean }>(
        `SELECT ${sqlEvenementOuvertParLaFrise('e')} AS ouvert FROM gestion_evenement e WHERE e.id = $1`,
        [evenementId]);
      const ouvertApres = apres[0]?.ouvert ?? ouvertAvant;
      const change = ouvertApres !== ouvertAvant;
      return Response.json({
        etat: 'ok', id: idEtape,
        message: motCarteDeBorne(ouvertAvant, ouvertApres),
        etatEvenement: change ? etatApresCarteSelonLaFrise(ouvertApres) : null,
      });
    }
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
  const corps = (await request.json().catch(() => ({}))) as {
    geste?: unknown; survenuLe?: unknown; cartes?: unknown;
  };
  const geste = String(corps.geste ?? '');

  /**
   * ══ 🔴🔴 LOT FRISE-ORDRE-POSE-ET-GLISSER, POINT 8 — ENREGISTRER L'ORDRE APRÈS UN GLISSER ══════════════════
   *
   * ARNO : « Une carte posée peut être saisie par clic maintenu et glissée à une autre place dans la frise ; au
   * relâchement, sa nouvelle place est enregistrée. »
   *
   * 🔴 LES DEUX GARDES DU POINT 9 SONT ICI, ET PAS SEULEMENT À L'ÉCRAN : « Ouverture, Clôture, Réouverture et
   * Clôture Monga NE se déplacent PAS […] aucune carte ne peut être glissée avant l'Ouverture. » Une règle
   * tenue par le seul navigateur est contournée par le premier appel qui l'oublie — et celle-ci garde l'ÉTAT de
   * l'événement, qui se lit sur l'ordre des bornes depuis le lot ETAT-PAR-LA-FRISE.
   *
   * 🔴 LA VÉRIFICATION COMPARE LES BORNES AVANT ET APRÈS : leur suite doit être la MÊME, au rang près. C'est la
   * formulation exacte de « elles ne se déplacent pas », et elle couvre les deux interdits d'un coup — une
   * borne qui bouge, ou une carte qui passe devant l'Ouverture (l'Ouverture changerait alors de rang).
   */
  if (geste === 'ordre') {
    const brut = Array.isArray(corps.cartes) ? corps.cartes : null;
    if (brut === null) return Response.json({ erreur: 'Ordre attendu.' }, { status: 400 });
    const cartes = brut.map((x) => Number(x));
    if (cartes.some((x) => !Number.isInteger(x) || x <= 0)) {
      return Response.json({ erreur: 'Ordre illisible.' }, { status: 400 });
    }
    try {
      const auteur = await auteurDeLaRequete(request);
      const avant = await friseDeLEvenement(evenementId);
      const parId = new Map(avant.map((e) => [e.id, e]));
      /**
       * ══ 🔴🔴 CHAQUE BORNE GARDE SON **RANG EXACT**, et non son ordre relatif ════════════════════════════
       *
       * 🔴 DÉFAUT MESURÉ À L'ÉCRAN AVANT DE LIVRER, ET IL FAUT LE DIRE. Le premier jet comparait la SUITE des
       * bornes (« 465 » avant, « 465 » après) : sur une frise qui n'en porte QU'UNE — le cas ordinaire, une
       * Clôture et une ouverture dérivée — la suite ne change jamais, quelle que soit la place où on la met.
       * L'appel de contrôle a donc ramené une Clôture en tête de frise, et la route a répondu « ok ».
       *
       * 🔴 ON COMPARE DONC L'INDICE, borne par borne. Cela dit les deux interdits d'Arno d'un seul trait :
       *   · une borne déplacée change forcément d'indice ;
       *   · une carte qui TRAVERSE une borne décale cette borne d'un cran — donc change son indice aussi.
       * Et « rien avant l'Ouverture » en découle : l'Ouverture enregistrée est à l'indice 0 et doit y rester ;
       * l'Ouverture DÉRIVÉE, elle, n'est pas dans la liste et `construireFrise` la met toujours en tête.
       *
       * ⚠️ L'ÉCRAN NE PRODUIT JAMAIS CE CAS (`placesPermises` borne le dépôt entre les deux bornes voisines) :
       * cette garde ne sert qu'aux appels qui contournent le formulaire. C'est précisément pour eux qu'Arno la
       * demande côté serveur — l'état de l'événement se lit sur l'ordre des bornes.
       */
      const indiceAvant = new Map(avant.map((e, i) => [e.id, i]));
      const borneDeplacee = cartes.findIndex((id, i) => {
        const e = parId.get(id);
        return e !== undefined && dateAuCentre(e.type) && indiceAvant.get(id) !== i;
      });
      if (borneDeplacee !== -1) {
        return Response.json({
          erreur: 'Ouverture, Clôture et Réouverture ne se déplacent pas : l’état de l’événement se lit sur la frise.',
        }, { status: 409 });
      }
      const issue = await reordonnerCartes(evenementId, cartes, auteur.libelle);
      if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409 });
      return Response.json({ etat: 'ok', message: 'Nouvelle place enregistrée.' });
    } catch (e) {
      console.error('[gestion/frise] ordre impossible', e);
      return Response.json({ erreur: 'Enregistrement impossible : erreur interne du serveur.' }, { status: 503 });
    }
  }

  if (geste !== 'ouverture') {
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
