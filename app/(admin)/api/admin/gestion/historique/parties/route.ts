import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { cibleDepuisTexte } from '../../../../../../lib/gestion/historique';
import { auteurDeLaRequete } from '../../../../../../lib/gestion/auteur';
import { coteDeLaCategorie, type Categorie } from '../../../../../../lib/gestion/partieCategorie';
import {
  lireCartesDuBien, lireCategoriesDuBien, poserCarteAlaMain, poserCategorieAlaMain,
} from '../../../../../../lib/gestion/partieCategorieRepo';

/**
 * /api/admin/gestion/historique/parties — LOT HISTORIQUE-BIEN-1 : LA CATÉGORIE DE CHAQUE ADRESSE D'UN BIEN.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'ELLE RÉPARE, ET POURQUOI ELLE EXISTE.
 *
 * Le bloc « Historique » range les parties en TROIS groupes — Propriétaire, Locataire, **Indépendant** — plus
 * « À répartir ». Les deux premiers se déduisent de la fiche elle-même (ses propriétaires, ses occupants passés et
 * présents). Le troisième, non : **un indépendant est rangé une fois pour TOUS les biens** (décision d'Arno), et
 * cette information ne vit que dans `gestion_partie_categorie` (migration 304).
 *
 * Sans cette route, le groupe « Indépendant » restait VIDE et les 640 adresses rangées par la reprise — dont
 * **65 indépendants proposés** — retombaient toutes dans « À répartir ». C'est-à-dire que le travail de la reprise
 * ne se voyait nulle part.
 *
 * 🔴 LA RÉSOLUTION N'EST PAS REFAITE ICI. `lireCategoriesDuBien` rend déjà, pour chaque adresse, la catégorie
 * RETENUE — le choix manuel l'emportant sur la proposition, et le plus spécifique (posé sur ce bien) sur le
 * global. Cette route ne fait que transporter. Une seconde résolution, écrite ici, aurait divergé de la première
 * au premier ajustement : c'est le défaut que ce dépôt a déjà payé plusieurs fois.
 *
 * 🔴 ELLE REND AUSSI LES CARTES DE CONTACT du bien, et pour une raison d'écran : au-delà de **six**, elles sont
 * repliées derrière leur nombre (« N contacts créés automatiquement — à vérifier », décision d'Arno sur le cas du
 * lot 155 et de ses 55 cartes). Pour écrire ce nombre, il faut les avoir comptées. Les demander par une seconde
 * route aurait fait deux allers-retours pour une seule ligne de texte.
 *
 * ⚠️ POURQUOI PAS UN CHAMP DE PLUS SUR `/historique`. Cette réponse-là est demandée à CHAQUE changement de
 * filtre, de page et de frappe. Les catégories d'un bien, elles, ne changent pas quand on coche une case :
 * les demander une fois, à part, évite de les recalculer à chaque frappe. Même raisonnement que la route
 * sœur `/historique/evenements`.
 *
 * ⚠️ SEULE UNE CIBLE `lot-…` EST ACCEPTÉE : le bloc vit dans la fiche d'un BIEN, et une catégorie est posée sur un
 * bien ou sur personne.
 *
 * ⚠️ SANS LA MIGRATION 304, LES DEUX LECTURES RENDENT UNE LISTE VIDE sans nommer la moindre table neuve (sonde de
 * schéma dans le dépôt). La réponse est alors `{ parties: [], cartes: [] }`, l'écran ne montre aucun groupe
 * « Indépendant », et il se comporte exactement comme avant ce lot. Un 500 ferait croire à une panne.
 *
 * 🔒 MÊME DROIT QUE LA TUILE GESTION, relu en base à chaque appel. `private, no-store` : la réponse porte des
 * adresses de personnes.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LOT HISTORIQUE-BIEN-2 — LE **POST** : RANGER UNE PARTIE À LA MAIN, ET LUI FAIRE SA CARTE.
 *
 * DEMANDE D'ARNO (04/10/2026) : « Pour chaque partie NON encore affectée à une catégorie : un bouton “+” qui
 * ouvre une petite carte de création de contact (nom, adresse mail pré-remplie, téléphone, et un choix de
 * catégorie Propriétaire / Locataire / Tiers indépendant). […] Valider range la partie dans le bon groupe en
 * direct. »
 *
 * 🔴 IL N'ÉCRIT AUCUNE RÈGLE : il appelle `poserCategorieAlaMain` et `poserCarteAlaMain`, les deux portes que la
 * reprise employait déjà. Elles tiennent, entre autres : l'auteur doit être identifié (un rangement « à la main »
 * sans main est un rangement automatique déguisé) ; un indépendant est GLOBAL, les deux autres se rangent sur un
 * bien ; une adresse illisible est refusée. En réécrire une seule ici aurait fait deux juges pour un rangement.
 *
 * 🔴 UN TIERS INDÉPENDANT NE REÇOIT **AUCUNE CARTE**, et c'est la règle du lot précédent, inchangée : il n'est
 * pas un contact de ce bien, il travaille pour nous sur beaucoup de biens. `coteDeLaCategorie` rend `null` pour
 * lui — c'est ce `null`, et non un `if` écrit ici, qui empêche la carte.
 *
 * ⚠️ LA CATÉGORIE EST POSÉE D'ABORD, LA CARTE ENSUITE, ET UN ÉCHEC DE LA CARTE N'ANNULE PAS LA CATÉGORIE. Les
 * deux tables sont indépendantes et le rangement est ce qui compte : rendre une erreur sèche aurait laissé
 * croire que rien n'a été fait alors que la partie a bien changé de groupe. L'écran relit ensuite, et voit l'état
 * RÉEL plutôt qu'un état deviné.
 *
 * ⚠️ L'AUTEUR EST LU DANS LA SESSION, JAMAIS ENVOYÉ PAR LE NAVIGATEUR : un corps de requête qui nommerait son
 * auteur permettrait de signer un rangement au nom d'un collègue.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const cible = cibleDepuisTexte(new URL(request.url).searchParams.get('cible'));
  if (cible === null || cible.sorte !== 'lot' || (cible.cle ?? '') === '') {
    return Response.json({ etat: 'cible_invalide' }, { status: 400, headers: ENTETES });
  }

  try {
    /* ⚠️ LES DEUX EN PARALLÈLE : elles ne dépendent pas l'une de l'autre, et l'écran les veut ensemble. */
    const [parties, cartes] = await Promise.all([
      lireCategoriesDuBien(cible.cle ?? ''),
      lireCartesDuBien(cible.cle ?? ''),
    ]);
    return Response.json({
      etat: 'ok',
      data: {
        /* 🔴 ON NE REND QUE CE QUE L'ÉCRAN LIT : l'adresse, la catégorie retenue, et de quoi dessiner la trame
           orange (une proposition non vérifiée). Les lignes brutes — par bien et globale — restent au dépôt. */
        parties: parties.map((p) => ({
          adresse: p.adresse,
          categorie: p.retenue?.categorie ?? null,
          origine: p.retenue?.origine ?? null,
          /* « Indépendant proposé — à vérifier » : proposé ET pas encore vérifié. */
          aVerifier: p.retenue?.origine === 'propose'
            && (p.globale?.verifieLe ?? null) === null && (p.parBien?.verifieLe ?? null) === null,
        })),
        cartes: cartes.map((c) => ({
          id: c.id, cote: c.cote, adresse: c.adresse, nom: c.nom, telephone: c.telephone,
          origine: c.origine, verifie: c.verifieLe !== null,
        })),
      },
    }, { headers: ENTETES });
  } catch (e) {
    /* Pas de catch muet : une liste vide se lirait « ce bien n'a aucune partie rangée », ce qui serait faux. */
    console.error('[api/admin/gestion/historique/parties] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' },
      { status: 503, headers: ENTETES });
  }
}

/** Les trois catégories qu'un humain peut poser depuis ce bloc. « Non affectée » n'en est pas une : c'est l'absence. */
const CATEGORIES_POSABLES: readonly Categorie[] = ['proprietaire', 'locataire', 'independant'];

function texteCourt(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t.slice(0, max);
}

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  let corps: unknown;
  try { corps = await request.json(); } catch { corps = null; }
  const c = (corps ?? {}) as Record<string, unknown>;

  const cible = cibleDepuisTexte(typeof c.cible === 'string' ? c.cible : null);
  if (cible === null || cible.sorte !== 'lot' || (cible.cle ?? '') === '') {
    return Response.json({ etat: 'cible_invalide' }, { status: 400, headers: ENTETES });
  }
  const lotCle = cible.cle ?? '';

  const adresse = texteCourt(c.adresse, 320);
  if (adresse === null) {
    return Response.json({ etat: 'refus', motif: 'Aucune adresse à ranger.' }, { status: 400, headers: ENTETES });
  }
  const categorie = CATEGORIES_POSABLES.find((x) => x === c.categorie);
  if (categorie === undefined) {
    return Response.json(
      { etat: 'refus', motif: 'Choisissez une catégorie : Propriétaire, Locataire ou Tiers indépendant.' },
      { status: 400, headers: ENTETES });
  }

  try {
    const auteur = await auteurDeLaRequete(request);
    /* 🔴 LE RANGEMENT D'ABORD : c'est lui qui fait changer la partie de groupe, et c'est ce qu'Arno a demandé. */
    const range = await poserCategorieAlaMain({ adresse, lotCle, categorie, auteur });
    if (!range.ok) {
      return Response.json({ etat: 'refus', motif: range.motif }, { status: 409, headers: ENTETES });
    }

    /* ⚠️ `coteDeLaCategorie` REND `null` POUR UN INDÉPENDANT : pas de carte, et aucun `if` de plus à tenir ici. */
    const cote = coteDeLaCategorie(categorie);
    const nom = texteCourt(c.nom, 200);
    const telephone = texteCourt(c.telephone, 40);
    let carte: string | null = null;
    if (cote !== null) {
      const posee = await poserCarteAlaMain({ lotCle, cote, adresse, nom, telephone, auteur });
      /* ⚠️ UN ÉCHEC DE LA CARTE NE DÉFAIT PAS LE RANGEMENT : il est DIT, et la partie reste rangée. */
      if (!posee.ok) carte = posee.motif;
    }
    return Response.json({ etat: 'ok', carteRefusee: carte }, { headers: ENTETES });
  } catch (e) {
    console.error('[api/admin/gestion/historique/parties] écriture impossible', e);
    return Response.json(
      { etat: 'refus', motif: 'Le rangement n’a pas pu être enregistré : la base n’a pas répondu.' },
      { status: 503, headers: ENTETES });
  }
}
