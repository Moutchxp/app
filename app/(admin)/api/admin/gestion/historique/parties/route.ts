import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { cibleDepuisTexte } from '../../../../../../lib/gestion/historique';
import { auteurDeLaRequete } from '../../../../../../lib/gestion/auteur';
import { coteDeLaCategorie, type Categorie } from '../../../../../../lib/gestion/partieCategorie';
import {
  annulerGesteDeRangement, coordonneesDesParties, lireCartesDuBien, lireCategoriesDuBien,
  /* 🔴🔴 LOT HISTORIQUE-BIEN-7 — les trois gestes d'une carte de contact : verifier, modifier, retirer. */
  marquerCarteVerifiee, modifierCarte,
  poserCarteAlaMain, poserCategorieAlaMain,
  retirerCarte, type GesteDeRangement,
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
    const [parties, cartes, coordonnees] = await Promise.all([
      lireCategoriesDuBien(cible.cle ?? ''),
      lireCartesDuBien(cible.cle ?? ''),
      /* 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — le nom et le telephone a PRE-REMPLIR dans la carte du « + ».
         Ils arrivent AVEC la liste : le « + » n'a donc rien a demander au moment du clic, et aucune adresse
         personnelle ne voyage dans une chaine de requete. */
      coordonneesDesParties(cible.cle ?? ''),
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
        /**
         * 🔴🔴 LOT HISTORIQUE-BIEN-7 — LA PROJECTION S'ÉLARGIT À CE QU'UNE CARTE DU HAUT AFFICHE.
         *
         * 🔴 ET C'EST L'ESSAI À L'ÉCRAN QUI L'A DIT, PAS UNE RELECTURE. Les carrousels affichaient « Vérifiée
         * par undefined » : la réponse ne portait que `verifie` (un booléen), et ni `verifieLe`, ni
         * `verifiePar`, ni `note`. Le bloc du bas s'en contentait — il ne lit que la présence d'une carte et son
         * état de vérification. Une carte du HAUT, elle, montre la note et dit QUI a vérifié.
         *
         * ⚠️ `verifie` EST GARDÉ, et ce n'est pas un doublon de `verifieLe` : le bloc du bas le lit déjà, et le
         * retirer aurait cassé sa pastille orange pour un champ qu'il n'a jamais demandé. On AJOUTE.
         *
         * ⚠️ ON N'ENVOIE TOUJOURS QUE CE QUE L'ÉCRAN LIT : ni `lotCle` (l'appelant le connaît, il l'a demandé),
         * ni `creePar`, ni `creeLe` — aucun écran ne les affiche.
         */
        cartes: cartes.map((c) => ({
          id: c.id, cote: c.cote, adresse: c.adresse, nom: c.nom, telephone: c.telephone,
          origine: c.origine, verifie: c.verifieLe !== null,
          note: c.note, verifieLe: c.verifieLe, verifiePar: c.verifiePar,
        })),
        /**
         * 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — CE QUE LA CARTE DU « + » PRÉ-REMPLIT. Demande d'Arno : « Elle
         * est pré-remplie : nom, adresse, téléphone trouvé en signature. »
         *
         * ⚠️ RIEN D'AUTRE QUE CES TROIS CHAMPS NE SORT D'ICI : pas d'extrait de courrier, pas de date, pas
         * d'identifiant de message. Le corps des mails a été lu pour y chercher un numéro, et il n'en reste
         * rien dans la réponse.
         */
        coordonnees,
      },
    }, { headers: ENTETES });
  } catch (e) {
    /* Pas de catch muet : une liste vide se lirait « ce bien n'a aucune partie rangée », ce qui serait faux. */
    console.error('[api/admin/gestion/historique/parties] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' },
      { status: 503, headers: ENTETES });
  }
}

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-3 — LES QUATRE CATÉGORIES QU'UN HUMAIN PEUT POSER ══════════════════════════════════
 *
 * DEMANDE D'ARNO (05/10/2026) : « Les capsules des CONTACTS se glissent-déposent d'une catégorie à l'autre :
 * Propriétaire ⇄ Locataire ⇄ Tiers indépendant ⇄ Non affectés. » et « SYNCHRONISATION STRICTE : un déplacement
 * passe par la MÊME porte d'écriture que le choix de catégorie du “+” (aucun second chemin). »
 *
 * 🔴 « NON AFFECTÉS » DEVIENT POSABLE, ET C'EST UN CHANGEMENT DE SENS ASSUMÉ. Au lot 2, cette route la refusait :
 * « non affectée » y était l'ABSENCE de rangement, et la figer n'aurait eu aucun sens pour le bouton « + ».
 * Arno en fait maintenant une zone de DÉPÔT : y glisser un contact est une décision — « ce n'est ni l'un ni
 * l'autre, et je le dis ». Elle est donc posée `manuel`, comme les trois autres, et l'automatisation ne la
 * reprendra plus (« le choix manuel prime »).
 */
const CATEGORIES_POSABLES: readonly Categorie[] = ['proprietaire', 'locataire', 'independant', 'a_repartir'];

function texteCourt(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t.slice(0, max);
}

/** Les identifiants d'un geste, relus du corps de la requête — jamais faits confiance au-delà de leur forme. */
function identifiants(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x > 0).slice(0, 50);
}

/**
 * ══ 🔴🔴 LA CARTE DE CONTACT SUIT LA CATÉGORIE : CRÉÉE, DÉPLACÉE, OU RETIRÉE ════════════════════════════════════
 *
 * DEMANDE D'ARNO, mot pour mot : « La carte de contact suit la catégorie : créée, déplacée ou retirée (statut
 * 'retire', jamais supprimée) côté propriétaire / locataire. […] Glisser vers Tiers ne crée aucune carte côté
 * propriétaire ou locataire. »
 *
 * 🔴 TROIS CAS, ET UN SEUL ENDROIT OÙ ILS SONT DÉCIDÉS :
 *   · vers Propriétaire ou Locataire → la carte existe du BON côté (créée si elle manquait, déplacée sinon) ;
 *   · vers Tiers indépendant ou Non affectés → aucune carte ne subsiste pour cette adresse sur ce bien.
 * Le côté vient de `coteDeLaCategorie` — le juge du rangement — et non d'une condition écrite ici. C'est ce
 * `null` qui interdit la carte d'un tiers, sans qu'aucun `if` ne le répète.
 *
 * 🔴 « DÉPLACÉE » = L'ANCIENNE EST RETIRÉE, LA NOUVELLE EST POSÉE AVEC LE NOM ET LE TÉLÉPHONE DE L'ANCIENNE.
 * Sans ce report, déplacer un contact d'un côté à l'autre lui faisait perdre son nom et son numéro — c'est-à-dire
 * le travail de vérification déjà fait. La clé de la table est (bien, côté, adresse) : changer de côté EST donc
 * une autre ligne, et il n'y a pas d'`UPDATE` possible.
 *
 * ⚠️ ON NE REPOSE PAS UNE CARTE QUI EST DÉJÀ DU BON CÔTÉ, sauf si le geste apporte un nom ou un téléphone.
 * `poserCarteAlaMain` est un `ON CONFLICT DO UPDATE` : reposer aurait rendu l'identifiant d'une carte
 * PRÉEXISTANTE, et « Annuler » l'aurait alors retirée — en détruisant une carte que le geste n'avait pas créée.
 */
async function faireSuivreLaCarte(o: {
  lotCle: string; adresse: string; categorie: Categorie; nom: string | null; telephone: string | null;
  auteur: Awaited<ReturnType<typeof auteurDeLaRequete>>;
}): Promise<{ posees: number[]; retirees: number[]; refus: string | null }> {
  const posees: number[] = [];
  const retirees: number[] = [];
  const cle = o.adresse.trim().toLowerCase();
  const cote = coteDeLaCategorie(o.categorie);

  const cartes = (await lireCartesDuBien(o.lotCle)).filter((c) => c.adresse.trim().toLowerCase() === cle);
  const aDeplacer = cartes.filter((c) => c.cote !== cote);
  const dejaBonCote = cote === null ? undefined : cartes.find((c) => c.cote === cote);

  for (const c of aDeplacer) {
    const r = await retirerCarte({
      id: c.id,
      auteur: o.auteur,
      motif: cote === null
        ? `la partie est désormais rangée « ${o.categorie} » : elle n’est pas un contact de ce bien`
        : `contact déplacé côté ${cote}`,
    });
    if (r.ok && r.id !== null) retirees.push(r.id);
  }

  if (cote !== null) {
    const nom = o.nom ?? aDeplacer[0]?.nom ?? null;
    const telephone = o.telephone ?? aDeplacer[0]?.telephone ?? null;
    const aCreer = dejaBonCote === undefined;
    if (aCreer || o.nom !== null || o.telephone !== null) {
      const r = await poserCarteAlaMain({ lotCle: o.lotCle, cote, adresse: o.adresse, nom, telephone, auteur: o.auteur });
      if (!r.ok) return { posees, retirees, refus: r.motif };
      /* ⚠️ SEULE UNE CARTE RÉELLEMENT CRÉÉE ENTRE DANS « posées » : voir l'encadré ci-dessus. */
      if (aCreer && r.id !== null) posees.push(r.id);
    }
  }
  return { posees, retirees, refus: null };
}

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  let corps: unknown;
  try { corps = await request.json(); } catch { corps = null; }
  const c = (corps ?? {}) as Record<string, unknown>;

  const auteur = await auteurDeLaRequete(request);

  /* ══ 🔴 « ANNULER » — LE GESTE SE DÉFAIT PAR SES IDENTIFIANTS, PAS EN DEVINANT L'ÉTAT D'AVANT ════════════════
     Voir l'encadré de `annulerGesteDeRangement` : reposer la catégorie d'avant aurait figé une PROPOSITION en
     décision humaine, que l'automatisation ne reprendrait plus jamais. */
  if (c.action === 'annuler') {
    const g = (c.geste ?? {}) as Record<string, unknown>;
    const geste: GesteDeRangement = {
      categoriesPosees: identifiants(g.categoriesPosees),
      categoriesRetirees: identifiants(g.categoriesRetirees),
      cartesPosees: identifiants(g.cartesPosees),
      cartesRetirees: identifiants(g.cartesRetirees),
    };
    try {
      const r = await annulerGesteDeRangement({ geste, auteur });
      return r.ok
        ? Response.json({ etat: 'ok', nb: r.nb }, { headers: ENTETES })
        : Response.json({ etat: 'refus', motif: r.motif }, { status: 409, headers: ENTETES });
    } catch (e) {
      console.error('[api/admin/gestion/historique/parties] annulation impossible', e);
      return Response.json(
        { etat: 'refus', motif: 'L’annulation n’a pas pu être enregistrée : la base n’a pas répondu.' },
        { status: 503, headers: ENTETES });
    }
  }

  /* ══ 🔴🔴 LOT HISTORIQUE-BIEN-7 — LES TROIS GESTES D'UNE CARTE DE CONTACT ══════════════════════════════════════
     DEMANDE D'ARNO : le gabarit d'une carte porte un bouton « Vérifié », un crayon pour modifier, et un « … »
     avec « Retirer » (statut 'retire', jamais supprimée). « Changer de côté » et « Passer en tiers indépendant »
     n'ont rien à ajouter ici : ce sont des RANGEMENTS, et le geste « ranger » ci-dessous les fait déjà — c'est
     même tout l'intérêt d'avoir une seule porte d'écriture.

     🔴 ILS SE DÉSIGNENT PAR L'IDENTIFIANT DE LA CARTE, et non par (bien, côté, adresse) : la carte est l'objet
     du geste, et trois champs à faire correspondre seraient trois occasions de se tromper de carte. */
  if (c.action === 'verifier' || c.action === 'modifier' || c.action === 'retirer') {
    const id = typeof c.id === 'number' ? c.id : Number.NaN;
    if (!Number.isSafeInteger(id) || id <= 0) {
      return Response.json({ etat: 'refus', motif: 'Aucune carte désignée.' },
        { status: 400, headers: ENTETES });
    }
    try {
      const r = c.action === 'verifier'
        ? await marquerCarteVerifiee({ id, auteur })
        : c.action === 'retirer'
          ? await retirerCarte({ id, auteur, motif: texteCourt(c.motif, 300) ?? 'retirée à la main' })
          : await modifierCarte({
            id, auteur,
            nom: texteCourt(c.nom, 200), telephone: texteCourt(c.telephone, 60),
            note: texteCourt(c.note, 2000),
          });
      if (!r.ok) return Response.json({ etat: 'refus', motif: r.motif }, { status: 409, headers: ENTETES });
      /**
       * ⚠️ `nb === 0` N'EST PAS UNE ERREUR, ET C'EST POURQUOI LE NOMBRE EST RENDU : la carte a pu être retirée
       * entre-temps par l'autre endroit de l'écran. L'appelant relit, et la carte a simplement disparu — dire
       * « refus » ferait croire à une panne là où deux gestes se sont croisés.
       */
      return Response.json({ etat: 'ok', nb: r.nb }, { headers: ENTETES });
    } catch (e) {
      console.error('[api/admin/gestion/historique/parties] geste de carte impossible', e);
      return Response.json(
        { etat: 'refus', motif: 'Le geste n’a pas pu être enregistré : la base n’a pas répondu.' },
        { status: 503, headers: ENTETES });
    }
  }

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
      { etat: 'refus', motif: 'Choisissez une catégorie : Propriétaire, Locataire, Tiers indépendant ou Non affectés.' },
      { status: 400, headers: ENTETES });
  }

  try {
    /* 🔴 LE RANGEMENT D'ABORD : c'est lui qui fait changer la partie de groupe, et c'est ce qu'Arno a demandé. */
    const range = await poserCategorieAlaMain({ adresse, lotCle, categorie, auteur });
    if (!range.ok) {
      return Response.json({ etat: 'refus', motif: range.motif }, { status: 409, headers: ENTETES });
    }

    const carte = await faireSuivreLaCarte({
      lotCle, adresse, categorie,
      nom: texteCourt(c.nom, 200), telephone: texteCourt(c.telephone, 40), auteur,
    });

    /* 🔴 LE GESTE EST RENDU : c'est ce que l'écran garde quelques secondes derrière « Annuler ». */
    const geste: GesteDeRangement = {
      categoriesPosees: range.id === null ? [] : [range.id],
      categoriesRetirees: range.retires ?? [],
      cartesPosees: carte.posees,
      cartesRetirees: carte.retirees,
    };
    return Response.json({ etat: 'ok', carteRefusee: carte.refus, geste }, { headers: ENTETES });
  } catch (e) {
    console.error('[api/admin/gestion/historique/parties] écriture impossible', e);
    return Response.json(
      { etat: 'refus', motif: 'Le rangement n’a pas pu être enregistré : la base n’a pas répondu.' },
      { status: 503, headers: ENTETES });
  }
}
