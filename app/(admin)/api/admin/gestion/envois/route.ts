import 'server-only';
// LOT REDACTION-GMAIL — module PUR, le MÊME que celui de l'écran : une seule liste blanche pour tout le module.
import { assainirHtml } from '../../../../../lib/gestion/htmlMail';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { query } from '../../../../../lib/db/client';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import { chargerConfigGestion } from '../../../../../lib/gestion/config';
import { envoyerMessage, type DepsEnvoiComplet } from '../../../../../lib/gestion/envoi';
// LOT ENVOI-ARRIERE-PLAN — l'ancrage dans le fil est PARTAGÉ avec le travailleur de fond : une seule lecture.
import { ancrageDuMessage } from '../../../../../lib/gestion/envoiReel';
import { envoyerViaGmail } from '../../../../../lib/gestion/envoiGmail';
import { depsPiecesEnvoi, piecesDeLEnvoi } from '../../../../../lib/gestion/piecesEnvoiReel';
import { peutEnvoyerAuNomDeGestion, refusEnvoi } from '../../../../../lib/gestion/gardeEnvoi';
import { COMPTE_GESTION, lireIdentifiants, rafraichirJeton } from '../../../../../lib/gestion/google';
import { lireJeton } from '../../../../../lib/gestion/googleJeton';
import {
  actionJournalEnvoi, cibleJournalEnvoi, commentaireJournalEnvoi,
} from '../../../../../lib/gestion/journalEnvoi';
import { motifLisible, phraseEchecEnvoi } from '../../../../../lib/gestion/motifEchec';
// LOT FICHE-RATTACHEMENT — la liste blanche des cibles vit à UN seul endroit, et c'est un module pur.
import { SORTES_RATTACHEMENT_PERMISES } from '../../../../../lib/gestion/rattachement';
import { decouperAdresses } from '../../../../../lib/gestion/redaction';
import {
  finaliserEnvoi, lireEnvoisDuFil, marquerBrouillonEnvoye, ouvrirEnvoi, type Auteur,
} from '../../../../../lib/gestion/redactionRepo';
import { fileEnvoiDisponible, journalEnvoiDisponible, redactionDisponible } from '../../../../../lib/gestion/schema';
// LOT ENVOI-ARRIERE-PLAN — la file d'envoi persistante, et le travailleur qui la vide.
import { mettreEnFile } from '../../../../../lib/gestion/fileEnvoiRepo';
import { lancerPasseEnFond } from '../../../../../lib/gestion/travailleurEnvoiReel';
import { pretAEnvoyer } from '../../../../../lib/gestion/redaction';

/**
 * /api/admin/gestion/envois (lot 5e) — ENVOYER un message au nom de gestion@criterimmo.fr.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LE SEUL CHEMIN D'ENVOI DE TOUTE L'APPLICATION. L'ordre des gestes (droit relu en base → validation → jeton →
 * ligne écrite AVANT l'appel → Gmail → finalisation) vit dans `envoi.ts`, en un seul endroit et entièrement éprouvé :
 * cette route ne fait que lui fournir le monde réel.
 *
 * 🔴 LA FENÊTRE « ANNULER » N'EST PAS ICI. Elle court DANS L'ÉCRAN, avant l'appel : tant qu'elle n'est pas écoulée,
 * aucune requête n'est partie. Un envoi différé côté serveur demanderait une file d'attente, un processus qui la
 * dépile et un moyen de l'annuler — trois choses de plus à surveiller pour un besoin que dix secondes d'attente à
 * l'écran résolvent exactement.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 🔒 Deux gardes, dans cet ordre : `exigerCompteActif(request,'gestion')` puis `peutEnvoyerAuNomDeGestion` — relue EN
 * BASE, jamais dans le jeton. L'auteur vient de la SESSION. Runtime Node.
 */
export const runtime = 'nodejs';

/** Le nom affiché par défaut, quand Gmail ne nous en donne pas — décision d'Arno. */
const NOM_PAR_DEFAUT = 'CRITERIMMO';

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  if (!await redactionDisponible()) return Response.json({ envois: [] });
  const filId = Number(new URL(request.url).searchParams.get('fil'));
  if (!Number.isInteger(filId) || filId <= 0) return Response.json({ erreur: 'Échange inconnu.' }, { status: 400 });
  try {
    return Response.json({ envois: await lireEnvoisDuFil(filId) },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[gestion/envois] lecture impossible', e);
    return Response.json({ erreur: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}

/**
 * LES CIBLES DE CLASSEMENT DEMANDÉES, bornées et normalisées. PUR.
 *
 * ⚠️ ON REFUSE CE QU'ON NE RECONNAÎT PAS plutôt que de le transmettre : une sorte inconnue produirait une ligne de
 * rattachement que rien ne saurait lire ensuite. Et on BORNE le nombre — un écran modifié ne doit pas pouvoir
 * demander cinq cents rattachements en un envoi.
 */
/**
 * 🔴🔴 LOT FICHE-RATTACHEMENT — `proprietaire` ET `locataire` SONT SORTIES DE CETTE LISTE.
 *
 * Elles y figuraient depuis le lot REDACTION-GMAIL : une cible choisie dans « Classer ce mail » pendant l'écriture
 * devient, à l'envoi, un rattachement du message parti. C'était donc une voie de création de liens « personne » —
 * muette, parce qu'elle ne s'ouvre qu'au moment de l'envoi, et qu'on n'y pense pas en relisant le moteur.
 *
 * La liste vient du module PUR : une seconde copie ici dirait un jour autre chose que la première.
 */
const SORTES_CLASSEMENT: readonly string[] = SORTES_RATTACHEMENT_PERMISES;
const CIBLES_MAX = 20;

export function ciblesDemandees(brut: unknown): { sorte: string; cle: string | null; id: number | null; libelle: string }[] {
  if (!Array.isArray(brut)) return [];
  return brut
    .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
    .map((c) => ({
      sorte: typeof c.sorte === 'string' ? c.sorte : '',
      cle: typeof c.cle === 'string' && c.cle.trim() !== '' ? c.cle.trim().slice(0, 200) : null,
      id: Number.isSafeInteger(c.id) && (c.id as number) > 0 ? (c.id as number) : null,
      libelle: typeof c.libelle === 'string' ? c.libelle.slice(0, 300) : '',
    }))
    .filter((c) => SORTES_CLASSEMENT.includes(c.sorte) && (c.cle !== null || c.id !== null))
    .slice(0, CIBLES_MAX);
}

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  if (!await peutEnvoyerAuNomDeGestion(request)) return refusEnvoi();
  if (!await redactionDisponible()) {
    return Response.json({ erreur: 'Mise à jour de la base à appliquer avant d’envoyer.' }, { status: 503 });
  }

  let corps: Record<string, unknown>;
  try { corps = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ erreur: 'Requête invalide.' }, { status: 422 }); }

  // 🔴 LA CLÉ D'IDEMPOTENCE VIENT DE L'ÉCRAN, mais c'est la BASE qui tranche (contrainte UNIQUE). Sans clé, on refuse :
  //   accepter un envoi non identifié, c'est accepter de l'envoyer deux fois.
  const cle = typeof corps.cleIdempotence === 'string' ? corps.cleIdempotence.trim().slice(0, 100) : '';
  if (cle.length < 8) return Response.json({ erreur: 'Demande d’envoi sans clé : refusée.' }, { status: 422 });

  const entier = (x: unknown): number | null => (typeof x === 'number' && Number.isInteger(x) && x > 0 ? x : null);
  const liste = (x: unknown): string[] =>
    Array.isArray(x) ? decouperAdresses(x.filter((v): v is string => typeof v === 'string').join(',')) : [];

  const auteur: Auteur = await auteurDeLaRequete(request);

  const demande = {
    cleIdempotence: cle,
    brouillonId: entier(corps.brouillonId),
    filId: entier(corps.filId),
    repondAMessageId: entier(corps.repondAMessageId),
    a: liste(corps.a), cc: liste(corps.cc), cci: liste(corps.cci),
    objet: typeof corps.objet === 'string' ? corps.objet.slice(0, 500) : '',
    corpsTexte: typeof corps.corps === 'string' ? corps.corps.slice(0, 200_000) : '',
    voie: typeof corps.voie === 'string' ? corps.voie : null,
    /**
     * ══ 🔴 LOT REDACTION-GMAIL — LE HTML EST ASSAINI ICI, ET C'EST L'ASSAINISSEMENT QUI COMPTE ══════════════════
     * L'écran nettoie déjà au collage, pour que la personne VOIE ce qu'elle envoie. Mais un écran se modifie :
     * cette ligne-ci est la seule qu'un navigateur ne puisse pas contourner, et c'est elle qui décide de ce qui
     * part réellement chez le destinataire. Le MÊME module pur (`htmlMail`) dans les deux cas.
     */
    corpsHtml: typeof corps.corpsHtml === 'string' && corps.corpsHtml.trim() !== ''
      ? assainirHtml(corps.corpsHtml.slice(0, 500_000))
      : null,
    cibles: ciblesDemandees(corps.cibles),
    /**
     * 🔴 LOT RATTACHER-EN-ECRIVANT — « Interne » coché dans la modale, pour un message NEUF. Le booléen est LU
     * STRICTEMENT (`=== true`) : une valeur floue venue du navigateur ne doit jamais marquer un échange.
     */
    interne: corps.interne === true,
  };

  /**
   * ══ 🔴🔴 LOT ENVOI-ARRIERE-PLAN — LA FILE, QUAND LA BASE SAIT LA TENIR ═══════════════════════════════════════
   *
   * On MET EN FILE et l'on rend la main tout de suite. Le mail quitte les Brouillons, la fenêtre se ferme, et le
   * serveur fait le reste : récupérer les pièces encore en route, puis remettre le message à Gmail.
   *
   * 🔴 CE QUI EST DIFFÉRÉ, C'EST L'ATTENTE — PAS LA DÉCISION. Le droit vient d'être relu en base, et la validité du
   * brouillon est tranchée ICI, pendant que la personne est là pour l'entendre. On ne met jamais en file un envoi
   * qu'on sait déjà impossible : ce serait transformer un refus immédiat en alerte différée.
   *
   * 🔴 LE BROUILLON EST MARQUÉ ENVOYÉ AVANT LA RÉPONSE. Sans cela, il resterait dans les Brouillons quelques
   * secondes de plus, et l'on croirait que le clic n'a rien fait. En cas d'échec, le travailleur l'y remet —
   * c'est la seule façon de rendre l'attente invisible sans mentir sur le résultat.
   *
   * ⚠️ SANS LA MIGRATION 271, RIEN DE TOUT CELA : on tombe dans l'envoi synchrone ci-dessous, c'est-à-dire
   * exactement le comportement d'avant ce lot, attente visible comprise.
   */
  if (await fileEnvoiDisponible()) {
    const pret = pretAEnvoyer({
      a: demande.a, cc: demande.cc, cci: demande.cci, objet: demande.objet, corps: demande.corpsTexte,
    } as never);
    if (!pret.pret) return Response.json({ erreur: pret.motif, code: 'invalide' }, { status: 422 });
    try {
      const id = await mettreEnFile({
        cleIdempotence: demande.cleIdempotence,
        brouillonId: demande.brouillonId, filId: demande.filId,
        repondAMessageId: demande.repondAMessageId, voie: demande.voie,
        a: demande.a, cc: demande.cc, cci: demande.cci,
        objet: demande.objet, corps: demande.corpsTexte, corpsHtml: demande.corpsHtml,
        cibles: demande.cibles, interne: demande.interne,
      }, auteur);
      // `null` = la clé existait déjà : c'est un doublon (double-clic, requête rejouée), et c'est le bon résultat.
      if (demande.brouillonId !== null) {
        try { await marquerBrouillonEnvoye(demande.brouillonId); }
        catch (e) { console.error('[gestion/envois] brouillon non marqué', e); }
      }
      // 🔴 SANS ATTENDRE : la réponse part maintenant, la passe tourne derrière. Si le processus meurt avant la
      //   fin, la ligne reste en base et la relève la reprendra — c'est ce contre quoi la file existe.
      lancerPasseEnFond();
      return Response.json({ ok: true, enFile: true, fileId: id, deja: id === null },
        { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (e) {
      // La mise en file a échoué : on NE tombe PAS dans l'envoi synchrone, qui pourrait doubler un envoi déjà mis
      //   en file par une requête concurrente. On le DIT, et le brouillon reste où il est.
      const m = phraseEchecEnvoi(e);
      console.error('[gestion/envois] mise en file impossible (%s)', m.etiquette, e);
      return Response.json({ erreur: m.phrase, code: 'interne' }, { status: 503 });
    }
  }

  const config = await chargerConfigGestion();
  const identifiants = lireIdentifiants();

  const deps: DepsEnvoiComplet = {
    // Le droit est DÉJÀ vérifié ci-dessus ; on le redemande ici parce que `envoi.ts` en fait sa première étape, et
    //   qu'un jour cette fonction pourra être appelée d'ailleurs. Deux lectures valent mieux qu'un trou.
    peutEnvoyer: () => peutEnvoyerAuNomDeGestion(request),
    jetonAcces: async () => {
      const jeton = lireJeton();
      if (identifiants === null || jeton === null) return null;
      try {
        const acces = await rafraichirJeton({ identifiants, refreshToken: jeton.refreshToken }, { fetch });
        return acces.ok ? acces.valeur : null;
      } catch {
        return null; // Google injoignable : on ne prétend pas envoyer, et le brouillon reste où il est
      }
    },
    expediteur: async () => ({ adresse: config.adresseGestion || COMPTE_GESTION, nom: NOM_PAR_DEFAUT }),
    // LOT 5-PJ-ENVOI — LES PIÈCES, lues au dernier moment (voir `envoi.ts`). `deps.jetonAcces` est réemployé tel
    //   quel : un seul endroit sait rafraîchir le jeton de gestion@, et il n'y en aura jamais deux.
    pieces: (d) => piecesDeLEnvoi(d, depsPiecesEnvoi(() => deps.jetonAcces())),
    ancrage: ancrageDuMessage,
    ouvrirEnvoi,
    envoyer: (o) => envoyerViaGmail(o, { fetch }),
    finaliser: finaliserEnvoi,
    marquerBrouillonEnvoye,
    // LE JOURNAL MÉTIER, celui qu'Arno a demandé : qui, à qui, quand, quel objet. Rien du corps du message.
    // 🔴 L'ENTITÉ EST DÉCIDÉE, PAS DEVINÉE. Écrire `'envoi'` en dur a fait rendre un échec pour un message parti le
    //   23/09 : la règle de la table ne connaissait pas ce mot. Voir `journalEnvoi.ts` pour la mesure et le choix.
    journaliser: async (l) => {
      const cible = cibleJournalEnvoi({
        envoiId: l.envoiId, filId: entier(corps.filId), repondAMessageId: entier(corps.repondAMessageId),
        envoiPermis: await journalEnvoiDisponible(),
      });
      if (cible === null) {
        // Aucun rangement à la fois VRAI et permis : on ne fabrique pas une ligne fausse, on le DIT au serveur.
        console.warn('[gestion/envois] journal métier non écrit : aucune entité permise '
          + '(applique la migration 243 pour journaliser les messages neufs). envoi=%d', l.envoiId);
        return;
      }
      await query(
        `INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_id, auteur_libelle)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [cible.entite, cible.entiteId, actionJournalEnvoi(l.issue),
         commentaireJournalEnvoi(l), l.auteur.id, l.auteur.libelle]);
    },
    // 🔴 LE JOURNAL DU SERVEUR, jamais l'écran. Un geste d'après-envoi manqué est une comptabilité en retard, pas un
    //   mail perdu : Arno n'a rien à refaire, et c'est nous qui devons le voir.
    incident: (etape, e) => {
      const m = motifLisible(e);
      console.error('[gestion/envois] LE MESSAGE EST PARTI mais « %s » a échoué (%s) — à rattraper à la main : %s',
        etape, m.etiquette, e instanceof Error ? e.message : String(e));
    },
    maintenant: () => new Date(),
    alea: () => crypto.randomUUID().replace(/-/g, ''),
  };

  try {
    // ⚠️ LA MÊME `demande` QUE LA FILE : une seule normalisation des entrées, donc un seul comportement. La voie
    //   ne sert qu'à savoir s'il faut joindre l'original complet ; une voie inconnue ne fait pas échouer l'envoi.
    const issue = await envoyerMessage({
      cleIdempotence: demande.cleIdempotence,
      brouillonId: demande.brouillonId,
      filId: demande.filId,
      repondAMessageId: demande.repondAMessageId,
      a: demande.a, cc: demande.cc, cci: demande.cci,
      objet: demande.objet,
      corps: demande.corpsTexte,
      voie: demande.voie,
      corpsHtml: demande.corpsHtml,
      cibles: demande.cibles,
      interne: demande.interne,
    }, auteur, deps);

    if (!issue.ok) {
      const statut = issue.code === 'droit' ? 403 : issue.code === 'invalide' ? 422 : 503;
      return Response.json({ erreur: issue.motif, code: issue.code }, { status: statut });
    }
    return Response.json({ ok: true, envoi: issue.envoi, deja: issue.deja },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    // Pas de catch muet : un envoi dont on ne sait rien est pire qu'un envoi refusé. La ligne, elle, est déjà en base.
    // 🔴 ET PAS DE « ERREUR INTERNE » NON PLUS quand la cause est connue : c'est la phrase qu'Arno a lue le 23/09 pour
    //   un message qui était parti, et elle ne lui a rien appris. Le détail technique va au journal du serveur ; ce
    //   qui va à l'écran est une raison en français, sur laquelle on peut agir. Voir `motifEchec.ts`.
    const m = phraseEchecEnvoi(e);
    console.error('[gestion/envois] envoi impossible (%s)', m.etiquette, e);
    return Response.json({ erreur: m.phrase, code: 'interne' }, { status: 503 });
  }
}
