import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import {
  chaineParents, listerContenu, listerDrivesAvecId, listerPartagesAvecMoi, lireContenuFichier, lireMetadonnees,
  MIME_DOSSIER,
} from '../../../../../../lib/gestion/drive';
import { jetonPourRequete } from '../../../../../../lib/gestion/jetonCollaborateur';
import { indexerMaillons, peutJoindre } from '../../../../../../lib/gestion/driveLectureFichier';
import {
  RACINE_DRIVES_PARTAGES, RACINE_MON_DRIVE, RACINE_PARTAGES_AVEC_MOI,
} from '../../../../../../lib/gestion/cibleDepot';

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
 * LE VERDICT POUR UN ÉLÉMENT, obtenu en REMONTANT ses parents. Le module qui tranche est PUR et sans réseau
 * (`driveLectureFichier`) : c'est ce qui permet de l'éprouver exhaustivement, ce que fait son test.
 */
async function verdict(jeton: string, id: string): Promise<{ joindre: boolean; motif: string | null }> {
  const chaine = await chaineParents(jeton, id, { fetch });
  const v = peutJoindre(id, indexerMaillons(chaine));
  return v.joindre ? { joindre: true, motif: null } : { joindre: false, motif: v.motif };
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const jeton = await jetonPourRequete(request);
  if (jeton.etat !== 'ok') return json({ etat: 'indisponible', message: jeton.motif }, 200);

  const url = new URL(request.url);
  const fichier = (url.searchParams.get('fichier') ?? '').trim();
  const dossier = (url.searchParams.get('dossier') ?? '').trim();
  const veutContenu = url.searchParams.get('contenu') === '1';

  try {
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
        etat: 'ok', joindreAutorise: true, motifRefus: null,
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
        etat: 'ok', joindreAutorise: true, motifRefus: null,
        fichiers: r.valeur.map((d) => ({
          id: d.id, nom: d.nom, driveId: d.driveId ?? null, typeMime: MIME_DOSSIER,
          tailleOctets: null, modifieLe: null, lien: null, dossier: true,
        })),
      });
    }

    // ── ① LE CONTENU D'UN DOSSIER ────────────────────────────────────────────────────────────────────────────
    if (fichier === '') {
      const parent = dossier === '' ? RACINE_MON_DRIVE : dossier;
      const liste = await listerContenu(jeton.jeton, { parentId: parent }, { fetch });
      if (!liste.ok) return json({ etat: 'indisponible', message: liste.motif }, 200);
      /**
       * ⚠️ LE VERDICT EST RENDU POUR LE DOSSIER COURANT, pas pour chacun de ses fichiers. Un fichier hérite de
       * l'emplacement de son dossier : demander la chaîne de parents de chaque ligne ferait deux cents appels
       * Drive pour afficher une page. L'écran s'en sert pour n'afficher « Joindre » que là où c'est permis ; la
       * lecture de contenu, elle, revérifie TOUJOURS sur le fichier lui-même (② ci-dessous).
       */
      const v = await verdict(jeton.jeton, parent);
      return json({ etat: 'ok', fichiers: liste.valeur, joindreAutorise: v.joindre, motifRefus: v.motif });
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
