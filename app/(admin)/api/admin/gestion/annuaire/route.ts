import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { analyserTerme } from '../../../../../lib/gestion/annuaireRecherche';
import {
  dernierImport, ficheLocataire, ficheLot, ficheProprietaire, indicesParEmail, rechercher,
} from '../../../../../lib/gestion/annuaireRepo';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import type { Auteur } from '../../../../../lib/gestion/gestes';
import type { RepartitionCoordonnee } from '../../../../../lib/gestion/annuaireEdition';
import {
  ajouterOccupant, ajouterProprietaireAuLot, archiverPersonne, creerPersonne, enregistrerDepart,
  modifierPersonne, ordonnerPersonnes, remplacerProprietaireDuLot, separerPersonne,
} from '../../../../../lib/gestion/annuaireEditionRepo';

/**
 * /api/admin/gestion/annuaire — LOT ANNUAIRE-1 : LA SEULE PORTE DE LECTURE DE L'ANNUAIRE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔒 MÊME DROIT QUE LA TUILE GESTION (`exigerCompteActif(request, 'gestion')`), et c'est la seule barrière à tenir :
 * l'annuaire porte les coordonnées de 800 personnes. `private, no-store` : ces réponses ne se mettent en cache nulle
 * part, ni chez le navigateur, ni chez un intermédiaire.
 *
 * 🔴🔴 INVARIANT RÉÉCRIT LE 29/09/2026 — LOT FICHES-ANNUAIRE, ÉTAPE C. Il disait : « LECTURE SEULE,
 * INTÉGRALEMENT […] on n'écrit dans l'annuaire que par la commande d'import, jamais depuis un écran — c'est
 * WIPPIMMO qui fait foi, et une correction saisie ici serait écrasée au prochain import sans prévenir. »
 * Il était JUSTE tant que rien ne protégeait une saisie. Arno a tranché : « ces fiches SONT l'annuaire », elles
 * se modifient, et la migration 278 apporte ce qui rend la promesse tenable — un VERROU PAR CHAMP, que l'import
 * respecte, en signalant la divergence au lieu de l'appliquer. La phrase est donc remplacée, pas supprimée :
 *   · le GET reste strictement en lecture — aucune de ses fonctions n'émet autre chose qu'un SELECT ;
 *   · le POST écrit, et SEULEMENT par `annuaireEditionRepo`, qui journalise et verrouille dans la même
 *     transaction ;
 *   · sans la migration 278, chaque écriture rend `sans_schema` et l'écran grise « Modifier » avec son motif.
 *
 * QUATRE QUESTIONS EN LECTURE, UNE SEULE ROUTE, parce qu'elles partagent exactement le même droit et le même cache :
 *   · `?q=…`             la recherche (un seul champ, toutes les entrées)
 *   · `?proprietaire=N`  `?lot=N`  `?locataire=N`   une fiche
 *   · `?emails=a,b`      le pont avec la boîte mail : qui sont ces expéditeurs ?
 *
 * ⚠️ `sans_schema` (migration 253 non appliquée) n'est PAS une erreur : c'est un état, rendu en 200 avec
 * `etat: 'sans_schema'`. L'écran affiche alors « annuaire pas encore installé » — une erreur 500 laisserait croire
 * à une panne, et une réponse vide à un annuaire sans personne dedans.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

/** Un identifiant lu dans l'adresse. Refuse `0` et le non-numérique : inutile d'interroger pour rien. */
function identifiant(brut: string | null): number | null {
  if (brut === null || !/^[1-9]\d{0,15}$/.test(brut)) return null;
  const n = Number(brut);
  return Number.isSafeInteger(n) ? n : null;
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const url = new URL(request.url);
  try {
    const idProprietaire = identifiant(url.searchParams.get('proprietaire'));
    if (idProprietaire !== null) return Response.json(await ficheProprietaire(idProprietaire), { headers: ENTETES });

    const idLot = identifiant(url.searchParams.get('lot'));
    if (idLot !== null) return Response.json(await ficheLot(idLot), { headers: ENTETES });

    const idLocataire = identifiant(url.searchParams.get('locataire'));
    if (idLocataire !== null) return Response.json(await ficheLocataire(idLocataire), { headers: ENTETES });

    const emails = url.searchParams.get('emails');
    if (emails !== null) {
      // Borné : un fil ne porte jamais des centaines d'expéditeurs, et une liste sans borne serait un levier.
      const liste = emails.split(',').map((e) => e.trim()).filter((e) => e !== '').slice(0, 20);
      return Response.json(await indicesParEmail(liste), { headers: ENTETES });
    }

    const terme = analyserTerme(url.searchParams.get('q'));
    const [resultats, importe] = await Promise.all([rechercher(terme), dernierImport()]);
    return Response.json({ ...resultats, terme, importe }, { headers: ENTETES });
  } catch (e) {
    // Pas de catch muet : une liste vide se lirait « personne ne correspond », ce qui serait un mensonge.
    console.error('[api/admin/gestion/annuaire] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}

/**
 * ══ 🔴🔴 LES ÉCRITURES DE L'ANNUAIRE — LOT FICHES-ANNUAIRE, ÉTAPE C ═══════════════════════════════════════════════
 *
 * UNE SEULE PORTE, UN `action` PAR GESTE. Tous partagent le même droit (`gestion`), le même auteur et la même règle
 * de refus : ouvrir une route par geste aurait multiplié par dix l'endroit où oublier la garde.
 *
 * 🔒 L'AUTORISATION EST RELUE EN BASE par `exigerCompteActif` AVANT tout ; `auteurDeLaRequete` ne fait que LIRE
 * l'identité déjà validée, pour le journal. Confondre les deux donnerait un nom sans donner un droit.
 *
 * ⚠️ `sans_schema` N'EST PAS UNE ERREUR : c'est un état, rendu en 200. L'écran grise alors « Modifier » et écrit
 * son motif. Une 500 laisserait croire à une panne ; un succès silencieux serait un mensonge.
 *
 * 🔴 AUCUNE SUPPRESSION N'EST ATTEIGNABLE D'ICI. « Archiver » DATE une ligne et se défait ; il n'existe pas
 * d'action qui efface — ni pour une personne, ni pour une coordonnée, ni pour une occupation.
 */
export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const auteur = await auteurDeLaRequete(request);

  let corps: Record<string, unknown>;
  try {
    corps = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ etat: 'refus', motif: 'Demande illisible.' }, { status: 400, headers: ENTETES });
  }

  const action = typeof corps.action === 'string' ? corps.action : '';
  const sujet = corps.sujet === 'proprietaire' || corps.sujet === 'locataire' ? corps.sujet : null;
  const id = typeof corps.id === 'number' && Number.isSafeInteger(corps.id) && corps.id > 0 ? corps.id : null;

  try {
    if (action === 'modifier') {
      if (sujet === null || id === null) return mauvaiseDemande();
      const champs = (corps.champs ?? {}) as Parameters<typeof modifierPersonne>[2];
      return Response.json(await modifierPersonne(sujet, id, champs, auteur), { headers: ENTETES });
    }
    if (action === 'ordonner') {
      if (sujet === null || !Array.isArray(corps.ids)) return mauvaiseDemande();
      const ids = corps.ids.filter((x): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x > 0);
      return Response.json(await ordonnerPersonnes(sujet, ids, auteur), { headers: ENTETES });
    }
    if (action === 'archiver' || action === 'restaurer') {
      if (sujet === null || id === null) return mauvaiseDemande();
      return Response.json(
        await archiverPersonne(sujet, id, action === 'archiver', auteur), { headers: ENTETES });
    }
    if (action === 'separer') {
      if (sujet === null || id === null) return mauvaiseDemande();
      const premier = typeof corps.premier === 'string' ? corps.premier : '';
      const second = typeof corps.second === 'string' ? corps.second : '';
      const repartition = Array.isArray(corps.repartition) ? corps.repartition as RepartitionCoordonnee[] : [];
      return Response.json(
        await separerPersonne(sujet, id, { premier, second, repartition }, auteur), { headers: ENTETES });
    }
    if (action === 'creer') {
      if (sujet === null || typeof corps.nom !== 'string') return mauvaiseDemande();
      const civilite = typeof corps.civilite === 'string' ? corps.civilite : null;
      return Response.json(
        await creerPersonne(sujet, { civilite, nom: corps.nom }, auteur), { headers: ENTETES });
    }
    if (action === 'ajouter-proprietaire' || action === 'remplacer-proprietaire'
      || action === 'ajouter-occupant' || action === 'depart') {
      return Response.json(await gesteDeBien(action, corps, auteur), { headers: ENTETES });
    }
    return mauvaiseDemande();
  } catch (e) {
    console.error('[api/admin/gestion/annuaire] écriture impossible', e);
    return Response.json(
      { etat: 'erreur', message: 'Enregistrement impossible : la base n’a pas répondu. Rien n’a été modifié.' },
      { status: 503 });
  }
}

const mauvaiseDemande = (): Response =>
  Response.json({ etat: 'refus', motif: 'Demande incomplète.' }, { status: 400, headers: ENTETES });

/**
 * LES GESTES QUI PORTENT SUR UN BIEN plutôt que sur une personne : ajouter ou remplacer un propriétaire, ajouter
 * un occupant, enregistrer un départ. Rangés à part parce qu'ils lisent d'autres identifiants — un lot, une
 * occupation — et qu'un `if` de plus dans la porte l'aurait rendue illisible.
 */
async function gesteDeBien(
  action: string, corps: Record<string, unknown>, auteur: Auteur,
): Promise<unknown> {
  const nombre = (v: unknown): number | null =>
    typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : null;
  const date = (v: unknown): string | null =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

  if (action === 'ajouter-proprietaire') {
    const lotId = nombre(corps.lotId); const pid = nombre(corps.proprietaireId);
    if (lotId === null || pid === null) return { etat: 'refus', motif: 'Demande incomplète.' };
    return ajouterProprietaireAuLot(lotId, pid, date(corps.depuis), auteur);
  }
  if (action === 'remplacer-proprietaire') {
    const lotId = nombre(corps.lotId);
    const ancienId = nombre(corps.ancienId); const nouveauId = nombre(corps.nouveauId);
    if (lotId === null || ancienId === null || nouveauId === null) {
      return { etat: 'refus', motif: 'Demande incomplète.' };
    }
    return remplacerProprietaireDuLot(lotId, { ancienId, nouveauId, date: date(corps.date) }, auteur);
  }
  if (action === 'ajouter-occupant') {
    const lotId = nombre(corps.lotId); const lid = nombre(corps.locataireId);
    if (lotId === null || lid === null) return { etat: 'refus', motif: 'Demande incomplète.' };
    return ajouterOccupant(lotId, lid, date(corps.entree), auteur);
  }
  const occupationId = nombre(corps.occupationId);
  if (occupationId === null) return { etat: 'refus', motif: 'Demande incomplète.' };
  return enregistrerDepart(occupationId, date(corps.sortie), auteur);
}
