import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../lib/gestion/auteur';
import { filAriane, listerDrivesAvecId, lireDossier } from '../../../../../../lib/gestion/drive';
import { creerDossier, voisinsDuNom } from '../../../../../../lib/gestion/driveCreation';
import { verdictCreer } from '../../../../../../lib/gestion/driveVerdict';
import { refusRegroupement, verifierCibleDepot } from '../../../../../../lib/gestion/cibleDepot';
import {
  MOTIF_SANS_JOURNAL, cheminComplet, homonymeParmi, motifHomonyme, nomPourDrive, phraseConfirmation,
} from '../../../../../../lib/gestion/dossierNouveau';
import { journaliserDossierCree } from '../../../../../../lib/gestion/dossierCreeRepo';
import { journalDossierDriveDisponible } from '../../../../../../lib/gestion/schema';
import { jetonPourRequete } from '../../../../../../lib/gestion/jetonCollaborateur';

/**
 * /api/admin/gestion/drive/dossier — LOT DRIVE-VISUALISER-ET-DOSSIERS : CRÉER UN DOSSIER DANS LE DRIVE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 C'EST LA PREMIÈRE ROUTE DE CE MODULE QUI ÉCRIT DANS LE DRIVE DU CABINET, et la seule. Elle ne sait faire
 * qu'une chose : `files.create` avec `mimeType = dossier`. Elle ne renomme pas, ne déplace pas, ne supprime pas, ne
 * met pas à la corbeille, ne partage pas, ne modifie aucun droit — aucune de ces fonctions n'est écrite, pas même
 * « pour annuler » (exigence d'Arno, mot pour mot).
 *
 * 🔴 DEUX TEMPS, ET C'EST VOULU :
 *   · GET  = PRÉPARER. Rend le CHEMIN COMPLET (« Mon Drive › … › <nom> »), le verdict, et le doublon s'il y en a un.
 *            C'est ce que la confirmation affiche AVANT d'écrire quoi que ce soit ;
 *   · POST = CRÉER. Il REFAIT toutes les vérifications, sans exception. Le GET est une COURTOISIE pour l'écran, pas
 *            une autorisation : entre les deux, une demande forgée pourrait arriver avec un autre parent.
 *
 * 🔴🔴 LE REFUS SOUS « DOCUMENTS CLIENTS SCANNÉS » EST PRONONCÉ ICI, EN REMONTANT TOUTE LA CHAÎNE DES PARENTS, à
 * n'importe quelle profondeur. L'écran n'affiche pas le bouton — c'est du confort, et un écran se modifie. Cette
 * route, elle, refuse même appelée directement, avec son motif en toutes lettres.
 *
 * 🔴 SANS LA MIGRATION 272, ELLE REFUSE TOUT. Le journal est la CONDITION de la création, pas sa trace : un dossier
 * apparu dans le Drive sans ligne de journal serait un dossier que personne ne pourrait expliquer.
 *
 * 🔒 LE JETON NE SORT JAMAIS D'ICI, et il est obtenu par DÉLÉGATION pour l'adresse de la personne connectée. Google
 * applique donc SES droits : quelqu'un qui n'a pas le droit d'écrire dans un dossier se le verra refuser par Google,
 * ce qui est le comportement juste, prononcé par la bonne autorité.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';

function json(corps: unknown, status = 200): Response {
  return Response.json(corps, { status, headers: { 'Cache-Control': SANS_CACHE } });
}

/**
 * TOUT CE QUI SE VÉRIFIE AVANT D'ÉCRIRE, EN UN SEUL ENDROIT — appelé par le GET *et* par le POST.
 *
 * 🔴 UNE SEULE COPIE, PARCE QUE DEUX DIVERGERAIENT. Si le GET vérifiait un peu moins que le POST, l'écran
 * proposerait de créer là où le serveur refuse (agaçant) ; s'il vérifiait un peu plus, l'écran interdirait ce que le
 * serveur accepte (une fonction perdue sans que personne ne sache pourquoi). La vraie raison est plus grave que les
 * deux : c'est que la RÈGLE du dossier interdit ne doit exister qu'à un seul endroit.
 */
type Preparation =
  | { ok: true; nom: string; parentId: string; chemin: string }
  | { ok: false; status: number; message: string };

async function preparer(jeton: string, parentBrut: string, nomBrut: string): Promise<Preparation> {
  const parentId = parentBrut.trim();
  if (parentId === '') {
    return { ok: false, status: 400, message: 'Aucun dossier n’est indiqué : ouvrez d’abord le dossier où créer.' };
  }

  // ① LES REGROUPEMENTS — « Drives partagés », « Partagés avec moi » : des mots à nous, aucun dossier chez Google.
  //    Refusés SANS le moindre appel réseau : on ne demande pas à Google de trancher ce qu'on sait déjà.
  const regroupement = refusRegroupement(parentId);
  if (regroupement !== null) return { ok: false, status: 409, message: regroupement };

  // ② 🔴🔴 LA RÈGLE QUI COMMANDE — toute la chaîne des parents, à n'importe quelle profondeur.
  const v = await verdictCreer(jeton, parentId);
  if (!v.creer) {
    return { ok: false, status: 403, message: v.motif ?? 'Aucun dossier ne peut être créé à cet endroit.' };
  }

  // ③ LE PARENT EST-IL UN VRAI DOSSIER, pas à la corbeille ? Même vérification que pour un dépôt : un seul endroit
  //    décide de ce qui est un parent valable (`cibleDepot`, lot 5-PJ-D).
  const cible = await verifierCibleDepot(parentId, (id) => lireDossier(jeton, id, { fetch }));
  if (!cible.ok) return { ok: false, status: 409, message: cible.motif };

  // ④ LE NOM.
  const n = nomPourDrive(nomBrut);
  if (!n.ok) return { ok: false, status: 400, message: n.motif };

  // ⑤ LE DOUBLON. Google ne répond que sur le nom exact ; la comparaison normalisée (accents, casse) est la nôtre.
  const voisins = await voisinsDuNom(jeton, { parentId, nom: n.nom }, { fetch });
  if (!voisins.ok) return { ok: false, status: 502, message: voisins.motif };
  const deja = homonymeParmi(n.nom, voisins.valeur);
  if (deja !== null) return { ok: false, status: 409, message: motifHomonyme(deja) };

  /**
   * ⑥ LE CHEMIN COMPLET, lu chez Google — jamais recomposé depuis le fil d'Ariane du navigateur. C'est ce que la
   * confirmation affiche, et c'est la seule protection contre la faute la plus probable du lot : le bon nom, au
   * mauvais endroit. Un chemin fourni par l'écran ne prouverait rien, puisque l'écran est ce qu'on vérifie.
   *
   * ⚠️ AU MIEUX-EFFORT : si le fil d'Ariane ne remonte pas, on affiche le nom du dossier parent seul plutôt que de
   * refuser la création pour un défaut d'affichage.
   */
  const ariane = await filAriane(jeton, parentId, { fetch });
  const etapes = ariane.ok && ariane.valeur.length > 0
    ? await nommerLaRacine(jeton, ariane.valeur)
    : [{ nom: 'Mon Drive' }];
  return { ok: true, nom: n.nom, parentId, chemin: cheminComplet(etapes, n.nom) };
}

/**
 * ══ 🔴 RENDRE SON VRAI NOM À LA RACINE D'UN DRIVE PARTAGÉ. ═══════════════════════════════════════════════════════
 *
 * 🔴 LE DÉFAUT CORRIGÉ, CONSTATÉ À L'ÉCRAN LE 28/09/2026. `files.get` appelle « Drive » la racine de TOUS les Drive
 * partagés — le cabinet en a dix. La confirmation annonçait donc « Drive › Base de données locative › … », c'est-à-
 * dire qu'elle ne disait PAS dans lequel on allait créer. Or ce chemin est la seule protection contre la faute la
 * plus probable de ce lot : le bon nom, au mauvais endroit. Un chemin qui ne distingue pas dix destinations ne
 * protège de rien. (Le même défaut avait été trouvé et corrigé pour le fil d'Ariane du sélecteur, lot 5-PJ-D.)
 *
 * ⚠️ UN SEUL APPEL DE PLUS, ET SEULEMENT QUAND IL Y A UNE RACINE DE DRIVE PARTAGÉ À NOMMER — jamais dans Mon Drive.
 * ⚠️ AU MIEUX-EFFORT : si la liste des Drive ne répond pas, on garde « Drive ». Un chemin imparfait vaut mieux
 *    qu'une création refusée pour un défaut d'affichage.
 */
async function nommerLaRacine(
  jeton: string, etapes: readonly { id: string; nom: string; driveId?: string }[],
): Promise<{ nom: string }[]> {
  if (!etapes.some((e) => e.driveId !== undefined)) return etapes.map((e) => ({ nom: e.nom }));
  const drives = await listerDrivesAvecId(jeton, { fetch });
  if (!drives.ok) return etapes.map((e) => ({ nom: e.nom }));
  const parId = new Map(drives.valeur.map((d) => [d.id, d.nom]));
  return etapes.map((e) => ({ nom: (e.driveId !== undefined ? parId.get(e.driveId) : undefined) ?? e.nom }));
}

/** GET — PRÉPARER la confirmation. Aucune écriture, d'aucune sorte. */
export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  if (!(await journalDossierDriveDisponible())) {
    return json({ etat: 'indisponible', message: MOTIF_SANS_JOURNAL, journalDisponible: false }, 200);
  }

  const jeton = await jetonPourRequete(request);
  if (jeton.etat !== 'ok') return json({ etat: 'indisponible', message: jeton.motif }, 200);

  const url = new URL(request.url);
  try {
    const p = await preparer(jeton.jeton, url.searchParams.get('parent') ?? '', url.searchParams.get('nom') ?? '');
    if (!p.ok) return json({ etat: 'refus', message: p.message }, p.status);
    return json({ etat: 'ok', nom: p.nom, chemin: p.chemin, phrase: phraseConfirmation(p.chemin) });
  } catch (e) {
    console.error('[api/admin/gestion/drive/dossier] préparation impossible', e);
    return json({ etat: 'indisponible', message: 'Le Drive n’a pas répondu.' }, 200);
  }
}

/**
 * POST — CRÉER. Il refait TOUTES les vérifications du GET, puis écrit, puis journalise.
 *
 * ⚠️ L'ORDRE EST : vérifier, créer, journaliser. Journaliser avant de créer inscrirait des dossiers qui n'existent
 * pas ; et l'on n'a pas le choix inverse, puisque l'identifiant du dossier n'existe qu'après la création.
 */
export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  if (!(await journalDossierDriveDisponible())) {
    return json({ etat: 'refus', message: MOTIF_SANS_JOURNAL, journalDisponible: false }, 503);
  }

  const jeton = await jetonPourRequete(request);
  if (jeton.etat !== 'ok') return json({ etat: 'indisponible', message: jeton.motif }, 200);

  let corps: { parent?: unknown; nom?: unknown };
  try {
    corps = (await request.json()) as { parent?: unknown; nom?: unknown };
  } catch {
    return json({ etat: 'refus', message: 'Demande illisible.' }, 400);
  }

  try {
    const p = await preparer(
      jeton.jeton,
      typeof corps.parent === 'string' ? corps.parent : '',
      typeof corps.nom === 'string' ? corps.nom : '');
    if (!p.ok) return json({ etat: 'refus', message: p.message }, p.status);

    const cree = await creerDossier(jeton.jeton, { parentId: p.parentId, nom: p.nom }, { fetch });
    if (!cree.ok) return json({ etat: 'refus', message: cree.motif }, 502);

    const auteur = await auteurDeLaRequete(request);
    const journalise = await journaliserDossierCree({
      driveId: cree.valeur.id,
      parentId: p.parentId,
      nom: cree.valeur.nom,
      chemin: p.chemin,
      auteurId: auteur.id,
      auteurLibelle: auteur.libelle,
      compteGoogle: jeton.compteGoogle,
    });

    /**
     * ⚠️ LE DOSSIER EXISTE, MÊME SI LE JOURNAL A ÉCHOUÉ — et on le DIT. Rendre une erreur ferait recommencer, donc
     * créerait un doublon ; et supprimer pour « rattraper » est interdit dans ce lot. La seule conduite honnête est
     * d'annoncer le dossier ET le défaut de journal, pour qu'on sache où il est et pourquoi il n'est pas consigné.
     */
    return json({
      etat: 'ok',
      dossier: { id: cree.valeur.id, nom: cree.valeur.nom, lien: cree.valeur.lien },
      chemin: p.chemin,
      journalise,
      message: journalise
        ? null
        : 'Le dossier est créé, mais la ligne de journal n’a pas pu être écrite. Signalez-le : une création qui '
          + 'n’est pas consignée ne pourra pas être expliquée plus tard.',
    });
  } catch (e) {
    console.error('[api/admin/gestion/drive/dossier] création impossible', e);
    return json({ etat: 'indisponible', message: 'Le Drive n’a pas répondu.' }, 200);
  }
}
