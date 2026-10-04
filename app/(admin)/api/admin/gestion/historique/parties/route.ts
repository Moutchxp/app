import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { cibleDepuisTexte } from '../../../../../../lib/gestion/historique';
import { lireCartesDuBien, lireCategoriesDuBien } from '../../../../../../lib/gestion/partieCategorieRepo';

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
 * adresses de personnes. **LECTURE SEULE** : deux SELECT, aucun chemin d'écriture. Les gestes (ranger une partie
 * à la main, marquer « Vérifié ») passeront par une route d'écriture distincte, qui n'existe pas encore.
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
