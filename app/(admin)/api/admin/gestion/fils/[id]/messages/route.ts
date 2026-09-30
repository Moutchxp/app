import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { lireMessagesDuFil } from '../../../../../../../lib/gestion/carteRepo';
import { lirePartenairesInternes } from '../../../../../../../lib/gestion/partenaires';
// 🔴 LOT RANGER-INSTANTANE-ET-NOM — à l'ouverture d'un fil, on confronte les noms Drive des pièces affichées.
//   Voir l'encadré ci-dessous : le balayage de fond met jusqu'à trois jours, ce chemin-ci quelques centaines
//   de millisecondes, et seulement pour les copies dont on sait ce qu'on y a écrit.
import { relireNomsDesPieces } from '../../../../../../../lib/gestion/relectureNomsDrive';
import { etatAccesDrive } from '../../../../../../../lib/gestion/jetonCollaborateur';
import { deplacementsDeMailsDisponibles } from '../../../../../../../lib/gestion/schema';

/**
 * /api/admin/gestion/fils/[id]/messages (lot 4c) — LE CONTENU D'UN ÉCHANGE : ses messages dans l'ordre où la
 * conversation s'est déroulée, et la liste de ses pièces jointes.
 *
 * Appelé au DÉPLIAGE d'un échange, jamais avant : c'est ce qui permet à une carte de six fils de ne rien coûter tant
 * qu'on ne l'ouvre pas.
 *
 * ⚠️ AUCUNE CLÉ DE STOCKAGE dans la réponse. Une pièce est désignée par son identifiant ; ses octets sont servis par
 * `/api/admin/gestion/pieces/[id]`, qui revérifie le droit à CHAQUE ouverture.
 *
 * 🔒 `exigerCompteActif` : cette réponse contient le texte de mails de locataires. `private, no-store` : ni cache
 * partagé, ni disque. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

type Contexte = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const brut = Number((await ctx.params).id);
  if (!Number.isInteger(brut) || brut <= 0) return Response.json({ erreur: 'Échange inconnu.' }, { status: 400 });
  try {
    // Le libellé d'un partenaire interne remplace le nom d'expéditeur du mail (« Comptabilité (ADHOC Gestion) »).
    const [partenaires, deplacements] = await Promise.all([lirePartenairesInternes(), deplacementsDeMailsDisponibles()]);
    const lu = await lireMessagesDuFil(brut, partenaires, deplacements);
    if (!lu) return Response.json({ erreur: 'Cet échange n’existe pas.' }, { status: 404 });

    /**
     * ══ 🔴🔴 LOT RANGER-INSTANTANE-ET-NOM — LE NOM RENOMMÉ DANS DRIVE ARRIVE AVEC LE FIL ═══════════════════
     *
     * Demande d'Arno : « à l'ouverture d'un fil, d'une modale de pièces ou de la visionneuse, relis en
     * métadonnées le nom des copies Drive des pièces affichées […]. Si le nom a changé, le nom d'usage est mis
     * à jour et l'écran se rafraîchit. »
     *
     * 🔴 ICI, ET NULLE PART AILLEURS. Les trois écrans qu'Arno nomme lisent LA MÊME réponse : le fil, le
     * récapitulatif « pièces jointes de la conversation » et la visionneuse sont trois vues de cette charge.
     * Brancher la relecture aux trois endroits l'aurait déclenchée trois fois pour un seul regard.
     *
     * ⚠️ CE QUE ÇA COÛTE, ET QUAND. `relireNomsDesPieces` n'interroge Google que pour les copies dont on SAIT ce
     * qu'on y a écrit (`nom_drive` renseigné) — les autres sont écartées avant le moindre appel. Un fil de
     * pièces jamais rangées depuis l'application ne coûte donc RIEN de plus qu'avant ce lot. Et une mémoire de
     * 30 s absorbe la rafale « j'ouvre, je clique, je reviens ».
     *
     * ⚠️ ON NE RELIT LE FIL QUE SI QUELQUE CHOSE A CHANGÉ. Une seconde requête systématique doublerait le coût
     * de l'écran le plus ouvert de l'application pour un cas qui se produit une fois par semaine.
     *
     * ⚠️ ET ELLE NE PEUT PAS FAIRE ÉCHOUER L'OUVERTURE : `relireNomsDesPieces` ne lève jamais. Un nom périmé se
     * corrige au geste suivant ; un fil qui refuse de s'ouvrir, non.
     */
    const idsPieces = lu.messages.flatMap((m) => m.pieces.map((p) => p.pieceId));
    /**
     * 🔴🔴 AU NOM DE LA PERSONNE QUI OUVRE L'ÉCRAN, et non du compte de la relève. Éprouvé en vrai le
     * 30/09/2026 : le fichier était dans un Drive partagé dont `gestion@criterimmo.fr` n'est pas membre, Google
     * répondait 404, et le renommage n'était jamais repris — sans qu'aucune erreur ne s'affiche. C'est Google
     * qui applique les droits, dossier par dossier, exactement comme pour le dépôt (lot 5-PJ-C).
     *
     * ⚠️ UN COLLABORATEUR SANS ACCÈS DRIVE NE FAIT PAS ÉCHOUER L'OUVERTURE : on passe l'adresse, et la relecture
     * rend un bilan vide si le jeton n'est pas obtenu. Un fil doit s'ouvrir, jeton ou pas.
     */
    const acces = await etatAccesDrive(request);
    const bilan = await relireNomsDesPieces(idsPieces, acces.etat === 'ok' ? acces.adresse : null);
    const frais = bilan.reprises.length === 0
      ? lu
      : (await lireMessagesDuFil(brut, partenaires, deplacements)) ?? lu;

    // `partis` : les mails sortis de cet échange. L'écran les annonce, il ne les efface pas.
    return Response.json(frais, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[gestion/messages] lecture impossible', e);
    return Response.json({ erreur: 'Lecture impossible : erreur interne du serveur.' }, { status: 503 });
  }
}
