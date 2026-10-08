import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../lib/gestion/auteur';
import { lireCarte } from '../../../../../../lib/gestion/carteRepo';
/* 🔴 LOT MONGA-1, POINT 4 — le badge, la dernière étape et le lien « Vers Mission » d'une carte reliée. */
import { mongaDeLEvenement } from '../../../../../../lib/gestion/mongaRepo';
/* 🔴 LOT VIGNETTE-EVENEMENT, POINT 1 — les biens de l'événement, pour le bouton « Ouvrir la fiche du bien ». */
import { biensNommesDeLEvenement } from '../../../../../../lib/gestion/mongaEtapeRepo';
/**
 * 🔴🔴 LOT URGENCE-EVENEMENT, POINT 5 — LES PARTIES DU BIEN, PAR LE CALCUL QUI EXISTE DÉJÀ.
 *
 * Arno : « Réutilise le calcul du bloc Parties de la fiche bien (pas de seconde requête qui recalcule à sa
 * façon). » `personnesDesBiens` EST ce calcul — c'est lui que l'étape 2 du classement affiche, et c'est lui que
 * la création d'un événement depuis Monga emploie déjà pour POSER les parties de la carte neuve
 * (`mongaClassement.creerEvenementEtRelier`). `personnesEnVigueur` (module PUR) en retient les mêmes personnes
 * que là-bas : propriétaires en cours, et locataires OCCUPANTS du jour.
 *
 * ⚠️ DEUX REQUÊTES POUR TOUS LES BIENS, et non deux par bien : c'est la promesse de `personnesDesBiens`, écrite
 * dans son encadré. On ne paie donc pas une lecture par bien d'un événement multi-biens.
 */
import { personnesDesBiens } from '../../../../../../lib/gestion/contactExterneRepo';
import { personnesEnVigueur } from '../../../../../../lib/gestion/monga';
/* 🔴 « le jour de Paris », écrit une seule fois dans le dépôt (module PUR). */
import { jourCivilParis } from '../../../../../../lib/gestion/ecran';
import { chargerConfigGestion } from '../../../../../../lib/gestion/config';
import { lirePartenairesInternes } from '../../../../../../lib/gestion/partenaires';
import { deplacementsDeMailsDisponibles } from '../../../../../../lib/gestion/schema';
import { changerEtatEvenement, estEtat, modifierEvenement } from '../../../../../../lib/gestion/gestes';

/**
 * /api/admin/gestion/evenements/[id] (lot 4c) — LE DÉTAIL D'UNE CARTE, et ses corrections.
 *
 * GET rend la carte et les échanges qui lui sont rattachés. Il n'est appelé qu'au DÉPLIAGE : une carte qu'on ne déplie
 * pas ne coûte aucune requête (patron `BlocRepliable`).
 *
 * PATCH fait DEUX choses distinctes, jamais mélangées dans un même appel implicite :
 *   · `{ etat }`   → change l'état (« traité » pose la date de traitement, la base l'exige) ;
 *   · les CHAMPS   → corrige ce que le pré-remplissage n'a pu que proposer (quoi / qui demande / adresse).
 * Les deux sont journalisés avec l'avant et l'après.
 *
 * 🔒 GARDE D'ÉCRITURE sur les DEUX verbes — y compris le GET : le détail d'une carte contient le texte de mails de
 * locataires. `exigerCompteActif` relit la base à chaque appel. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

type Contexte = { params: Promise<{ id: string }> };

function identifiant(brut: string): number | null {
  const n = Number(brut);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const id = identifiant((await ctx.params).id);
  if (id === null) return Response.json({ erreur: 'Événement inconnu.' }, { status: 400 });
  try {
    // Qui est « nous », qui est un partenaire interne : lu en base (migration 233), jamais en dur. Sans ce contexte,
    //   l'attente affichée sur la carte contredirait celle de la file.
    const [config, partenaires, deplacements] = await Promise.all([
      chargerConfigGestion(), lirePartenairesInternes(), deplacementsDeMailsDisponibles(),
    ]);
    const carte = await lireCarte(id, { partenaires, adresseGestion: config.adresseGestion, deplacements });
    if (!carte) return Response.json({ erreur: 'Cet événement n’existe pas.' }, { status: 404 });
    /**
     * 🔴🔴 LOT MONGA-1, POINT 4 — L'INTERVENTION MONGA DE CETTE CARTE, quand elle en porte une.
     *
     * ⚠️ `null` EST LE CAS ORDINAIRE, et de très loin : une carte sans Monga n'affiche aucun badge et reste
     * exactement celle d'avant ce lot. Sans la migration 311, c'est `null` pour toutes.
     */
    const monga = await mongaDeLEvenement(id);
    /**
     * 🔴 LOT VIGNETTE-EVENEMENT, POINT 1 — LES BIENS DE CET ÉVÉNEMENT, pour le bouton « Ouvrir la fiche du bien
     * sur cet événement → » (Arno). La liste vide est une réponse : l'événement n'est rattaché à aucun bien, le
     * bouton le dit plutôt que de mener nulle part.
     */
    const biens = await biensNommesDeLEvenement(id);
    /**
     * 🔴🔴 LOT URGENCE-EVENEMENT, POINT 5 — « Quand on déplie la carte, afficher les noms qui n'apparaissent pas
     * dans la carte repliée : le ou les locataires actuels, et le ou les propriétaires s'ils manquent. »
     *
     * 🔴 LA DATE EST CELLE D'AUJOURD'HUI, et c'est ce que « locataires ACTUELS » veut dire. `personnesDesBiens`
     * rend TOUT le monde (anciens compris) et ÉTIQUETTE chacun à la date donnée ; `personnesEnVigueur` ne garde
     * ensuite que l'occupant du jour et les propriétaires en cours. Donner la date du mail aurait répondu à une
     * autre question — qui habitait là à l'époque —, et c'est justement celle que l'étape 2 pose.
     *
     * ⚠️ LISTE VIDE SUR UN ÉVÉNEMENT SANS BIEN, et sans aucune requête : `personnesDesBiens` rend `[]` sur une
     * liste de clés vide. L'écran n'affiche alors rien de plus qu'avant ce lot.
     */
    const fiches = await personnesDesBiens(biens.map((b) => b.cle), jourCivilParis());
    const parties = fiches
      .flatMap((b) => personnesEnVigueur(b.personnes))
      .map((p) => ({ sorte: p.sorte, nom: p.nom }));
    return Response.json(
      { ...carte, monga, biens, parties }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[gestion/evenement] lecture impossible', e);
    return Response.json({ erreur: 'Lecture impossible : erreur interne du serveur.' }, { status: 503 });
  }
}

export async function PATCH(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const id = identifiant((await ctx.params).id);
  if (id === null) return Response.json({ erreur: 'Événement inconnu.' }, { status: 400 });

  /* 🔴 LOT CAPSULE-TYPE-EVENEMENT, POINT 1 — `categorie` entre ici : elle ne s'écrivait qu'à la CRÉATION, et une
     carte ouverte sans type ne pouvait donc plus jamais en recevoir un. `modifierEvenement` la valide.
     🔴 LOT URGENCE-EVENEMENT, POINT 3 — et `urgence` avec elle, pour exactement la même raison : le niveau ne se
     posait qu'à la création. Le sélecteur à trois boutons de la carte et celui de la fiche du bien passent tous
     les deux par CETTE porte, et par aucune autre : même garde, même journal. */
  let corps: { etat?: unknown; objet?: string | null; demandeurNom?: string | null; demandeurEmail?: string | null; adresseLibre?: string | null; categorie?: string | null; urgence?: string | null };
  try { corps = (await request.json()) as typeof corps; }
  catch { return Response.json({ erreur: 'Demande illisible.' }, { status: 422 }); }

  try {
    const auteur = await auteurDeLaRequete(request);
    if (corps.etat !== undefined) {
      if (!estEtat(corps.etat)) return Response.json({ erreur: 'État inconnu.' }, { status: 400 });
      const issue = await changerEtatEvenement(id, corps.etat, auteur);
      if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409 });
      return Response.json({ ok: true });
    }
    const { objet, demandeurNom, demandeurEmail, adresseLibre, categorie, urgence } = corps;
    const issue = await modifierEvenement(
      id, { objet, demandeurNom, demandeurEmail, adresseLibre, categorie, urgence }, auteur);
    if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409 });
    return Response.json({ ok: true });
  } catch (e) {
    console.error('[gestion/evenement] modification impossible', e);
    return Response.json({ erreur: 'Modification impossible : erreur interne du serveur.' }, { status: 503 });
  }
}
