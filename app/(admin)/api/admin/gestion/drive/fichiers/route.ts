import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import {
  chercherDossiers, chercherFichiers, listerContenu, listerDrivesAvecId, listerPartagesAvecMoi, lireContenuFichier,
  lireMetadonnees, MIME_DOSSIER,
} from '../../../../../../lib/gestion/drive';
import { jetonPourRequete } from '../../../../../../lib/gestion/jetonCollaborateur';
import { verdictJoindre, verdictsDossier } from '../../../../../../lib/gestion/driveVerdict';
import {
  RACINE_DRIVES_PARTAGES, RACINE_MON_DRIVE, RACINE_PARTAGES_AVEC_MOI,
} from '../../../../../../lib/gestion/cibleDepot';
import { journalDossierDriveDisponible } from '../../../../../../lib/gestion/schema';
import { MOTIF_SANS_JOURNAL } from '../../../../../../lib/gestion/dossierNouveau';

/**
 * /api/admin/gestion/drive/fichiers — LOT REDACTION-GMAIL : CHOISIR UN FICHIER DU DRIVE POUR UN MAIL.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LA RÈGLE QUI COMMANDE TOUT LE RESTE : « DOCUMENTS CLIENTS SCANNÉS » NE SE LIT JAMAIS.
 *
 * Ce dossier est l'archive historique du cabinet : pièces d'identité, avis d'imposition, relevés bancaires. Deux
 * gestes, deux régimes, et la différence n'est pas une nuance :
 *   · « Insérer un lien » ne lit RIEN — il pose dans le message l'adresse Drive et le nom du fichier. Le
 *     destinataire devra s'authentifier chez Google, qui appliquera SES droits. → permis partout ;
 *   · « Joindre » télécharge les OCTETS et les met dans un mail qui part sur l'Internet ouvert, sans
 *     authentification, vers une adresse tapée à la main. → INTERDIT sous « Documents clients scannés ».
 *
 * 🔴 LE REFUS EST PRONONCÉ ICI, AVANT TOUTE LECTURE DE CONTENU, et il ne dépend PAS de l'écran. L'écran n'affiche
 * pas le bouton « Joindre » — c'est du confort, et un écran se modifie. Cette route, elle, remonte la chaîne des
 * parents et refuse : c'est la seule barrière qui compte.
 *
 * 🔒 AUCUNE ÉCRITURE DRIVE, D'AUCUNE SORTE : `files.list`, `files.get` et `alt=media`. Pas un `files.create`, pas un
 * `files.update`, pas un `permissions.create`. Un test statique le vérifie sur le SOURCE de ce fichier.
 *
 * 🔒 LE JETON NE SORT JAMAIS D'ICI, et il est obtenu par DÉLÉGATION pour l'adresse de la personne connectée : c'est
 * donc Google qui applique ses droits, dossier par dossier, exactement comme dans drive.google.com. Aucune liste de
 * droits n'est recopiée chez nous — elle serait fausse dès le lendemain.
 *
 * LES QUESTIONS :
 *   · `?dossier=<id>`            le contenu d'un dossier (sous-dossiers + fichiers), et si l'on peut y joindre
 *   · `?fichier=<id>`            les métadonnées d'un fichier, et le VERDICT « joindre » le concernant
 *   · `?fichier=<id>&contenu=1`  les OCTETS — refusés si le verdict dit non
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';

/**
 * La taille maximale d'une pièce venue du Drive. Alignée sur la limite d'envoi de Gmail (25 Mo, pièces encodées
 * comprises) : au-delà, le message serait refusé après le téléchargement — on refuse donc avant.
 */
const TAILLE_MAX = 20 * 1024 * 1024;

function json(corps: unknown, status = 200): Response {
  return Response.json(corps, { status, headers: { 'Cache-Control': SANS_CACHE } });
}

/**
 * LE VERDICT POUR UN ÉLÉMENT, obtenu en REMONTANT ses parents.
 *
 * ⚠️ DÉPLACÉ DANS `driveVerdict.ts` AU LOT ENVOI-ARRIERE-PLAN : deux routes le prononcent désormais (celle-ci, et
 * celle qui inscrit une pièce dans un brouillon). Deux copies de la règle divergeraient un jour — et ce jour-là,
 * c'est un avis d'imposition qui part chez un artisan. Une seule copie, partagée.
 */
const verdict = verdictJoindre;

/**
 * ══ 🔴 LOT DRIVE-VISUALISER-ET-DOSSIERS — LE DROIT DE CRÉER VOYAGE AVEC LE CONTENU DU DOSSIER ════════════════════
 *
 * Trois champs s'ajoutent à la réponse : `creerAutorise`, `motifCreation`, `journalDisponible`.
 *
 * 🔴 POURQUOI DANS CETTE RÉPONSE, ET PAS DANS UN APPEL À PART. Règle tirée d'un défaut de ce module (lot
 * COULEUR-ROUGE, 28/09/2026) : une SONDE DE SCHÉMA VOYAGE AVEC LA DONNÉE QU'ELLE CONDITIONNE, dans la même réponse.
 * Un appel séparé arrive plus tard, parfois jamais, et l'écran prend alors sa valeur par défaut — ce jour-là, un
 * `false` par défaut avait fait disparaître une fonction pourtant en place, sans qu'aucune erreur ne s'affiche.
 *
 * 🔴🔴 ET `motifCreation` N'EST RENSEIGNÉ QUE DANS UN SEUL CAS : la migration 272 manque, LÀ OÙ LA RÈGLE AURAIT
 * PERMIS DE CRÉER. Partout ailleurs il vaut `null`, et l'écran n'affiche alors AUCUN bouton — ni actif, ni grisé.
 *
 * Les deux absences ne disent pas la même chose, et c'est tout l'objet de cette distinction :
 *   · sous « Documents clients scannés », « le bouton n'y est pas affiché » (demande d'Arno, mot pour mot) : un
 *     bouton grisé y laisserait croire qu'un réglage pourrait un jour l'activer, alors que c'est une règle ;
 *   · à la racine du sélecteur ou dans des résultats de recherche, il n'y a pas d'endroit où créer : annoncer une
 *     fonction indisponible à chaque ouverture du Drive serait du bruit permanent ;
 *   · sans la migration, en revanche, la fonction EXISTE et attend quelque chose. Là, et là seulement, on montre
 *     le bouton désactivé avec son motif — sinon on la croirait disparue.
 */

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const jeton = await jetonPourRequete(request);
  if (jeton.etat !== 'ok') return json({ etat: 'indisponible', message: jeton.motif }, 200);

  const url = new URL(request.url);
  const fichier = (url.searchParams.get('fichier') ?? '').trim();
  const dossier = (url.searchParams.get('dossier') ?? '').trim();
  const recherche = (url.searchParams.get('recherche') ?? '').trim();
  const veutContenu = url.searchParams.get('contenu') === '1';
  /**
   * ⚠️ LA SONDE EST LUE UNE FOIS, ICI, pour toutes les branches — et elle ne coûte rien (mémoïsée par processus,
   * et le « non » n'est jamais retenu : correctif du 24/09/2026, `sondeSchema.ts`).
   */
  const journalDisponible = await journalDossierDriveDisponible();
  /**
   * Ce que dit toute réponse où la création N'A PAS D'ENDROIT : la racine du sélecteur, les deux regroupements,
   * des résultats de recherche. Aucun motif : il n'y a rien à expliquer, et répéter une indisponibilité à chaque
   * ouverture du Drive serait du bruit permanent.
   */
  const sansCreation = { creerAutorise: false, motifCreation: null, journalDisponible };

  try {
    /**
     * ── 🔴 LOT EDITEUR-PJ — LA RECHERCHE PAR NOM, dans tout le Drive ──────────────────────────────────────────
     *
     * 🔴🔴 LE VERDICT N'EST PAS RENDU POUR LA LISTE, ET C'EST ASSUMÉ. Ailleurs, il est calculé une fois pour le
     * DOSSIER courant (voir ① ci-dessous) et vaut pour ses fichiers. Des résultats venus de tout le Drive n'ont
     * aucun dossier commun : il faudrait remonter la chaîne des parents de quarante fichiers, soit des centaines
     * d'appels Google pour afficher une liste.
     *
     * 🔴 CE N'EST PAS UN TROU, PARCE QUE LA BARRIÈRE N'A JAMAIS ÉTÉ LÀ. Le refus se prononce en ②, sur le fichier
     * lui-même, au moment de lire les octets — et il vaut pour cette liste comme pour toutes les autres. Un
     * fichier de « Documents clients scannés » peut donc apparaître dans une recherche (son NOM est déjà visible
     * en navigation) ; ses octets, eux, ne sortiront pas. L'écran le dit d'avance, plutôt que de le laisser
     * découvrir au clic.
     */
    if (recherche !== '' && fichier === '') {
      /**
       * 🔴 LOT ENVOI-ARRIERE-PLAN — LES DOSSIERS AUSSI, ET D'ABORD (demande d'Arno).
       *
       * Chercher « tagavi » et ne trouver que des fichiers oblige à savoir d'avance dans quel dossier ranger son
       * regard. Or ce qu'on cherche, neuf fois sur dix, c'est LE DOSSIER d'un lot ou d'un locataire — pour y
       * prendre ensuite deux ou trois pièces. Les deux recherches partent ENSEMBLE (`Promise.all`) : les faire
       * l'une après l'autre doublerait l'attente pour un résultat identique.
       *
       * ⚠️ UN GROUPE VIDE N'EST PAS RENDU VIDE ICI : c'est l'écran qui ne l'affiche pas. La route dit ce qu'elle a
       * trouvé ; décider de ce qui se montre est le travail de l'écran.
       */
      const [dossiers, fichiers] = await Promise.all([
        chercherDossiers(jeton.jeton, recherche, { fetch }, 30),
        chercherFichiers(jeton.jeton, recherche, { fetch }),
      ]);
      if (!fichiers.ok) return json({ etat: 'indisponible', message: fichiers.motif }, 200);
      return json({
        etat: 'ok', recherche: true, joindreAutorise: true, motifRefus: null,
        /**
         * ⚠️ PAS DE CRÉATION DANS DES RÉSULTATS DE RECHERCHE : ils ne sont PAS un endroit. Quarante lignes venues de
         * quarante dossiers différents — « créer ici » n'aurait aucun sens, et ce serait la meilleure façon de créer
         * un dossier ailleurs qu'où l'on croit. On entre dans un dossier trouvé, PUIS on y crée.
         */
        ...sansCreation,
        // Les DOSSIERS d'abord dans la charge utile : l'écran les groupe, mais l'ordre de la route est déjà le bon.
        dossiers: dossiers.ok
          ? dossiers.valeur.map((d) => ({
            id: d.id, nom: d.nom, driveId: d.driveId ?? null, typeMime: MIME_DOSSIER,
            tailleOctets: null, modifieLe: null, lien: null, dossier: true,
          }))
          : [],
        fichiers: fichiers.valeur,
      });
    }

    /**
     * ── ⓪ LA RACINE : LES TROIS ENTRÉES DE GOOGLE DRIVE ───────────────────────────────────────────────────────
     * « Mon Drive », les « Drives partagés », « Partagés avec moi ». Les mêmes que le sélecteur de DOSSIER (lot
     * 5-PJ-D), et pour la même raison : sans elles, tout ce qui vit dans un Drive d'équipe est INVISIBLE — c'est
     * dire la quasi-totalité des documents du cabinet, « GESTION LOCATIVE » compris. Rien n'échoue dans ce cas :
     * les fichiers n'existent tout simplement pas, ce qui est pire, parce qu'on ne cherche pas ce qu'on ne voit
     * pas manquer.
     */
    if (fichier === '' && dossier === '') {
      return json({
        etat: 'ok', joindreAutorise: true, motifRefus: null, ...sansCreation,
        fichiers: [
          { id: RACINE_MON_DRIVE, nom: 'Mon Drive', driveId: null, typeMime: MIME_DOSSIER, tailleOctets: null, modifieLe: null, lien: null, dossier: true },
          { id: RACINE_DRIVES_PARTAGES, nom: 'Drives partagés', driveId: null, typeMime: MIME_DOSSIER, tailleOctets: null, modifieLe: null, lien: null, dossier: true },
          { id: RACINE_PARTAGES_AVEC_MOI, nom: 'Partagés avec moi', driveId: null, typeMime: MIME_DOSSIER, tailleOctets: null, modifieLe: null, lien: null, dossier: true },
        ],
      });
    }

    // ── LES DEUX REGROUPEMENTS : ce ne sont pas des dossiers, ils se listent autrement ────────────────────────
    if (fichier === '' && (dossier === RACINE_DRIVES_PARTAGES || dossier === RACINE_PARTAGES_AVEC_MOI)) {
      const r = dossier === RACINE_DRIVES_PARTAGES
        ? await listerDrivesAvecId(jeton.jeton, { fetch })
        : await listerPartagesAvecMoi(jeton.jeton, { fetch });
      if (!r.ok) return json({ etat: 'indisponible', message: r.motif }, 200);
      return json({
        etat: 'ok', joindreAutorise: true, motifRefus: null, ...sansCreation,
        fichiers: r.valeur.map((d) => ({
          id: d.id, nom: d.nom, driveId: d.driveId ?? null, typeMime: MIME_DOSSIER,
          tailleOctets: null, modifieLe: null, lien: null, dossier: true,
        })),
      });
    }

    // ── ① LE CONTENU D'UN DOSSIER ────────────────────────────────────────────────────────────────────────────
    if (fichier === '') {
      const parent = dossier === '' ? RACINE_MON_DRIVE : dossier;
      /**
       * ══ 🔴🔴 LOT DRIVE-LOUPE-MENU-VITESSE — LE CHRONOMÈTRE DE LA ROUTE ═══════════════════════════════════════
       *
       * Arno : « mesure d'abord […] répartition client / serveur / appel Google ». On ne répare pas une lenteur
       * qu'on n'a pas mesurée, et on ne prouve pas une amélioration sans le chiffre d'avant.
       *
       * 🔴 IL RESTE DANS LE CODE, comme celui de la route de déplacement, et pour la même raison : il coûte deux
       * `Date.now()` et une poignée d'octets, et il permet de rejouer la mesure n'importe quand, depuis la console
       * du navigateur, sur le VRAI Drive — ce qu'aucun test ne saura faire, parce que la lenteur vient du réseau
       * de Google, pas de notre code.
       *
       * ⚠️ IL NE MESURE QUE LE SERVEUR. Le temps « clic → liste à l'écran » se mesure dans la page, et c'est lui
       * qui compte pour la main qui tient la souris.
       */
      const t0 = Date.now();
      const liste = await listerContenu(jeton.jeton, { parentId: parent }, { fetch });
      const tListe = Date.now() - t0;
      if (!liste.ok) return json({ etat: 'indisponible', message: liste.motif }, 200);
      /**
       * ⚠️ LE VERDICT EST RENDU POUR LE DOSSIER COURANT, pas pour chacun de ses fichiers. Un fichier hérite de
       * l'emplacement de son dossier : demander la chaîne de parents de chaque ligne ferait deux cents appels
       * Drive pour afficher une page. L'écran s'en sert pour n'afficher « Joindre » que là où c'est permis ; la
       * lecture de contenu, elle, revérifie TOUJOURS sur le fichier lui-même (② ci-dessous).
       */
      /**
       * ⚠️ UNE SEULE REMONTÉE POUR LES DEUX VERDICTS (`verdictsDossier`). Les demander séparément relirait DEUX FOIS
       * la même chaîne de parents — jusqu'à vingt-six `files.get` au lieu de treize pour afficher une page, sur une
       * arborescence qui fait treize niveaux (mesuré le 25/09/2026). La règle, elle, est la même dans les deux cas.
       */
      const t1 = Date.now();
      const { joindre: v, creer: c, chaine } = await verdictsDossier(jeton.compteGoogle, jeton.jeton, parent);
      const tVerdict = Date.now() - t1;
      /**
       * ══ 🔴🔴 LOT EMPREINTE-PIECES-DEJA-DANS-LE-DRIVE, NIVEAU 2 — L'INDEX S'ALIMENTE ICI, GRATUITEMENT ════════
       *
       * Arno : « alimenté à chaque dossier ouvert ». L'empreinte de chaque ligne est DÉJÀ dans la réponse qu'on
       * vient de recevoir — elle voyage dans le même appel que les noms. La ranger ne coûte pas un octet de
       * réseau, et elle couvre exactement les endroits où l'on travaille.
       *
       * ⚠️ AU MIEUX-EFFORT, ET SANS FAIRE ATTENDRE LA LISTE. Un index qui ne se remplit pas est un index moins
       * complet ; une liste qui n'arrive pas est un écran cassé. On ne mélange pas les deux enjeux : la réponse
       * part, le rangement se fait à côté, et son échec n'est que journalisé.
       *
       * 🔴🔴 « Documents clients scannés » Y ENTRE EN MÉTADONNÉES, ET SEULEMENT EN MÉTADONNÉES — ce que cette
       * route lisait déjà pour afficher la liste. Aucune écriture Drive n'est faite ni possible d'ici.
       */
      void (async () => {
        try {
          const { ligneDepuisEntreeAffichee } = await import('../../../../../../lib/gestion/indexEmpreintesDrive');
          const { noterFichiersVus } = await import('../../../../../../lib/gestion/empreinteDriveRepo');
          const lignes = liste.valeur.fichiers
            .map((f) => ligneDepuisEntreeAffichee(f, parent))
            .filter((l): l is NonNullable<typeof l> => l !== null);
          if (lignes.length > 0) await noterFichiersVus(lignes);
        } catch (e) {
          console.error('[api/admin/gestion/drive/fichiers] index des empreintes non alimenté', e);
        }
      })();
      return json({
        /**
         * 🔴 LES DEUX TEMPS, SÉPARÉS : `liste` est l'appel `files.list` (le contenu), `verdict` la remontée des
         * parents (mémoïsée 60 s par dossier). C'est cette séparation qui dit où va le temps — et elle a montré
         * que la remontée coûte la moitié d'un affichage à froid, et rien du tout à chaud.
         */
        temps: { liste: tListe, verdict: tVerdict, total: Date.now() - t0 },
        etat: 'ok', fichiers: liste.valeur.fichiers, joindreAutorise: v.joindre, motifRefus: v.motif,
        /**
         * 🔴 LOT RANGER-ARBRE-2 — LE VRAI CHEMIN DU DOSSIER AFFICHÉ, du haut jusqu'à lui. Il vient de la remontée
         * que le verdict faisait DÉJÀ : aucun appel Drive de plus. L'écran s'en sert pour reconstruire le fil
         * d'Ariane et la ligne « ↑ Remonter » quand on est entré par un raccourci (Récents, Dossier du bien, un
         * résultat de recherche), qui ne connaît qu'un identifiant et ne savait donc pas remonter.
         */
        chaine,
        /**
         * 🔴 LOT DRIVE-FACON-FINDER — ON DIT QUAND LA LISTE EST INCOMPLÈTE. Jusqu'à ce lot, un dossier de plus de
         * 200 entrées était tronqué EN SILENCE : « 1 Propriétaires » en compte plus de 300, on en voyait 200, et
         * l'on en concluait que les autres n'avaient pas de dossier. Le contenu est maintenant lu par pages ; si
         * la borne est quand même atteinte, l'écran l'annonce au lieu de laisser croire à une liste complète.
         */
        tronque: liste.valeur.tronque,
        // 🔴 LE JOURNAL D'ABORD : sans la migration 272, on ne crée rien, même là où la règle du Drive le permettrait.
        creerAutorise: journalDisponible && c.creer,
        /**
         * 🔴🔴 UN MOTIF DANS UN SEUL CAS : la règle permettrait, et c'est la migration qui manque. Sous
         * « Documents clients scannés », `c.creer` est faux et le motif reste `null` — « le bouton n'y est pas
         * affiché » (demande d'Arno). Un bouton grisé y laisserait croire qu'un réglage pourrait l'activer.
         */
        motifCreation: !journalDisponible && c.creer ? MOTIF_SANS_JOURNAL : null,
        journalDisponible,
      });
    }

    // ── ② UN FICHIER : métadonnées, verdict, et éventuellement les octets ─────────────────────────────────────
    const meta = await lireMetadonnees(jeton.jeton, fichier, { fetch });
    if (!meta.ok) return json({ etat: 'indisponible', message: meta.motif }, 200);
    const v = await verdict(jeton.jeton, fichier);

    if (!veutContenu) {
      return json({ etat: 'ok', fichier: meta.valeur, joindreAutorise: v.joindre, motifRefus: v.motif });
    }

    /**
     * 🔴🔴 LE REFUS, ICI. C'est le seul endroit qui compte : l'écran peut être modifié, cette ligne non. On rend
     * 403 avec le motif EN TOUTES LETTRES — un refus muet enverrait chercher une panne.
     */
    if (!v.joindre) {
      return json({ etat: 'refus', message: v.motif ?? 'Le contenu de ce fichier ne peut pas être lu.' }, 403);
    }
    /**
     * ⚠️ UN DOCUMENT GOOGLE NATIF (Docs, Sheets) N'A PAS D'OCTETS À TÉLÉCHARGER : `alt=media` le refuse. On le DIT
     * et on propose le lien, plutôt que de rendre un fichier vide que le destinataire ne saurait pas ouvrir.
     */
    if (meta.valeur.typeMime.startsWith('application/vnd.google-apps')) {
      return json({
        etat: 'refus',
        message: 'C’est un document Google (Docs, Sheets…) : il n’a pas de fichier à joindre. Insérez plutôt son lien.',
      }, 409);
    }
    if ((meta.valeur.tailleOctets ?? 0) > TAILLE_MAX) {
      return json({ etat: 'refus', message: 'Ce fichier dépasse la taille autorisée pour une pièce jointe.' }, 413);
    }

    const contenu = await lireContenuFichier(jeton.jeton, fichier, { fetch }, TAILLE_MAX);
    if (!contenu.ok) return json({ etat: 'indisponible', message: contenu.motif }, 200);
    return json({
      etat: 'ok',
      fichier: meta.valeur,
      // Le contenu repart en base64 vers l'écran, qui le dépose comme une pièce jointe ordinaire du brouillon.
      contenuBase64: contenu.valeur.toString('base64'),
    });
  } catch (e) {
    console.error('[api/admin/gestion/drive/fichiers] lecture impossible', e);
    return json({ etat: 'indisponible', message: 'Le Drive n’a pas répondu.' }, 200);
  }
}
