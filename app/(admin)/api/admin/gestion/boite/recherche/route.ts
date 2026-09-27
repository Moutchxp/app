import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import type { CurseurBoite } from '../../../../../../lib/gestion/boiteRepo';
import { lirePartenairesInternes } from '../../../../../../lib/gestion/partenaires';
import {
  chercherDansLeCourrier, chercherDansLesBrouillons, rechercheUtile, PAGE_RECHERCHE,
} from '../../../../../../lib/gestion/rechercheBoite';
import {
  LISTES_TOUTES, type FiltrePiece, type SorteListe,
} from '../../../../../../lib/gestion/rechercheTermes';

/**
 * /api/admin/gestion/boite/recherche (lot 5c) — CHERCHER DANS TOUT LE COURRIER.
 *
 * 🔒 `exigerCompteActif(request, 'gestion')` — le MÊME garde que les autres lectures du module, relu en base à chaque
 * requête. La réponse contient des extraits de mails de locataires : `private, no-store`. Runtime Node (driver pg).
 *
 * 🔒 LECTURE SEULE, et TOUTE valeur saisie passe en PARAMÈTRE LIÉ (cf. `rechercheBoite`) : rien de ce que tape
 * l'utilisateur n'est concaténé dans le SQL, ni les mots, ni les dates, ni l'expéditeur.
 *
 * Une recherche VIDE ne lance aucune requête : elle rend une page vide en le disant. C'est aussi ce qui évite qu'un
 * champ effacé fasse balayer la table.
 */
export const runtime = 'nodejs';

/**
 * Une date de filtre n'est acceptée que si elle a la bonne FORME **et** si elle EXISTE. La forme seule ne suffit pas :
 * « 2026-13-99 » la respecte, et PostgreSQL la refuserait — l'écran verrait une panne là où il y a une faute de frappe.
 * Le reste est ignoré, jamais transmis à la base. PUR.
 */
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
export function date(v: string | null): string | null {
  if (v === null || !DATE_ISO.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  // `toISOString` renvoie la date NORMALISÉE : si elle diffère de la saisie, c'est que le mois ou le jour déborde.
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}

/**
 * LOT RECHERCHE-AVANCEE — LES LISTES DEMANDÉES, lues d'un paramètre `listes=reception,envoyes,…`.
 *
 * 🔴 ABSENT ≠ AUCUNE. Sans le paramètre on rend `undefined`, et le critère se comporte EXACTEMENT comme avant ce
 * lot — c'est ce qui laisse intacts les liens déjà envoyés et les appels d'avant. Une valeur inconnue est IGNORÉE
 * plutôt que rejetée : quelqu'un qui colle un vieux lien doit obtenir des résultats, pas une erreur 422.
 *
 * ⚠️ UNE LISTE VIDE EXPLICITE (`listes=`) EST RESPECTÉE : elle veut dire « nulle part », et la recherche rend zéro
 * résultat. Retomber sur « toutes » ferait le contraire de ce qui est demandé. PUR.
 */
export function listes(brut: string | null): readonly SorteListe[] | undefined {
  if (brut === null) return undefined;
  const connues = new Set<string>(LISTES_TOUTES);
  const vues = brut.split(',').map((x) => x.trim()).filter((x) => connues.has(x)) as SorteListe[];
  return [...new Set(vues)];
}

/** Le filtre de pièce jointe. Toute autre valeur vaut « indifférent » : un filtre qu'on ne comprend pas ne filtre pas. */
export function piece(brut: string | null): FiltrePiece {
  return brut === 'avec' || brut === 'sans' ? brut : 'indifferent';
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const p = new URL(request.url).searchParams;
  const critere = {
    saisie: (p.get('q') ?? '').slice(0, 200), // borne de sûreté : au-delà on n'affine plus, on fabrique du coût
    sansMots: (p.get('sans') ?? '').slice(0, 200),
    du: date(p.get('du')),
    au: date(p.get('au')),
    expediteur: (p.get('de') ?? '').slice(0, 200),
    piece: piece(p.get('pj')),
    listes: listes(p.get('listes')),
    inclureAutomatiques: p.get('auto') === '1',
  };

  const dernierLe = p.get('depuis');
  const filId = p.get('avant');
  if ((dernierLe !== null) !== (filId !== null)) {
    return Response.json({ erreur: 'Curseur incomplet : « depuis » et « avant » vont ensemble.' }, { status: 422 });
  }
  const curseur: CurseurBoite | null = dernierLe !== null && filId !== null && /^\d+$/.test(filId)
    ? { dernierLe, filId } : null;

  if (!rechercheUtile(critere)) {
    return Response.json(
      {
        lignes: [], suivant: null, total: null, pleinTexte: true, automatiquesMasques: null, vide: true,
        brouillons: { lignes: [], tronque: false },
      },
      { headers: { 'Cache-Control': 'private, no-store' } });
  }

  try {
    const partenaires = await lirePartenairesInternes();
    /**
     * LOT RECHERCHE-AVANCEE — LES BROUILLONS SONT CHERCHÉS À PART (voir `chercherDansLesBrouillons` : ils ne vivent
     * pas dans la même table et n'ont pas de date de réception). Ils ne sont rapportés qu'à la PREMIÈRE page : les
     * remettre à chaque « voir plus » les afficherait en double au-dessus d'une liste qui s'allonge.
     */
    const [page, brouillons] = await Promise.all([
      chercherDansLeCourrier(critere, curseur, partenaires, PAGE_RECHERCHE),
      curseur === null ? chercherDansLesBrouillons(critere) : Promise.resolve({ lignes: [], tronque: false }),
    ]);
    return Response.json({ ...page, brouillons, vide: false }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    // Pas de catch muet : une liste vide ferait croire qu'on n'a rien trouvé, ce qui est faux et trompeur.
    console.error('[api/admin/gestion/boite/recherche] recherche impossible', e);
    return Response.json({ erreur: 'Recherche impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}
