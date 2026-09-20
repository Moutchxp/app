import 'server-only';
import { exigerModule } from '../../../../../../lib/admin/garde';
import { chargerConfigVeille } from '../../../../../../lib/sitadel/veilleConfig';
import { chargerVivier, communesBloqueesTeleservice, plafondsTeleservice, idsDossiersCartesVirtuelles } from '../../../../../../lib/sitadel/demandeRepo';
import { rechercherDansVivier, parseTriVivier } from '../../../../../../lib/sitadel/rechercheVivier';

/**
 * D3 — GET /api/admin/permis/demandes/vivier-recherche?q=…&process=email|formulaire — RECHERCHE dans le VIVIER (permis encore
 * demandables) par n° de permis (num_dau) OU par ville, SCOPÉE au process. Renvoie les correspondances du process actif (capées),
 * leur total, et le nombre de correspondances dans l'AUTRE process (mention non silencieuse « N résultats dans X — basculer »).
 *
 * 🔑 Scoping = filtre d'AFFICHAGE en aval (dans `rechercherDansVivier`, pur) ; aucun WHERE `dest_canal` ajouté à une requête de
 * surveillance. Le vivier réutilise la MÊME éligibilité que le stock/la proposition. LECTURE SEULE. RÉSERVÉ ADMINISTRATEUR. Node.
 */
export const runtime = 'nodejs';

const CAP = 50; // résultats renvoyés au plus (le total réel est indiqué pour signaler une troncature)

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerModule(request, 'permis');
  if ('refus' in garde) return garde.refus;
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const p = url.searchParams.get('process');
  const process = p === 'email' || p === 'formulaire' ? p : null;
  if (process === null) return Response.json({ erreur: 'process invalide (email|formulaire)' }, { status: 422 });
  // MOTEUR COMPLET (téléservice) — paramètres OPTIONNELS. Absents (cas du rail e-mail, qui ne les envoie jamais) → recherche
  //   historique à l'identique. `types` = clés de catégorie séparées par des virgules ; `tri` = « colonne:sens » (validé par
  //   parseTriVivier, ignoré si invalide). Aucun WHERE SQL ajouté : le filtrage/tri restent en aval, purs (rechercherDansVivier).
  const typesParam = url.searchParams.get('types');
  const typesCategories = typesParam ? typesParam.split(',').map((s) => s.trim()).filter((s) => s !== '') : undefined;
  const tri = parseTriVivier(url.searchParams.get('tri'));
  const aFiltre = !!(typesCategories && typesCategories.length > 0);
  // q FACULTATIF dès qu'un CRITÈRE est fourni : un FILTRE (type) OU un TRI explicite (parseTriVivier ≠ undefined). Sans q NI critère
  //   → comportement HISTORIQUE : vide, SANS charger le vivier (cas exact du rail e-mail — test de non-régression clé).
  const aCritere = aFiltre || tri !== undefined;
  if (q === '' && !aCritere) return Response.json({ resultats: [], total: 0, autreProcess: 0, tronque: false });
  try {
    const cfg = await chargerConfigVeille();
    // §B — le vivier ET les cartes VIRTUELLES du carrousel (proposition) sont chargés EN PARALLÈLE : le surcoût du marquage « carte en
    //   attente » est masqué (temps mur ≈ le plus lent, pas la somme). TÉLÉSERVICE uniquement (le carrousel n'existe pas côté e-mail →
    //   Set undefined, aucun marquage, comportement e-mail inchangé). LECTURE SEULE ; ne change ni la proposition ni le carrousel.
    const [{ vivier, tronque }, enAttente] = await Promise.all([
      chargerVivier(cfg),
      process === 'formulaire' ? idsDossiersCartesVirtuelles(cfg) : Promise.resolve<Set<number> | undefined>(undefined),
    ]);
    const r = rechercherDansVivier(vivier, q, process, CAP, { typesCategories, tri, enAttente });
    // Lot C (point 3) — le blocage « en attente d'accusé » est TÉLÉSERVICE uniquement : on ne le calcule que pour le process
    //   'formulaire' (aucun blocage côté e-mail). Une commune bloquée → ses permis s'affichent « bloqué », jamais « demandable ».
    const bloquees = process === 'formulaire' ? await communesBloqueesTeleservice() : {};
    // MODE MANUEL — état du PLAFOND MENSUEL par commune (téléservice), pour l'AFFICHER dans le vivier manuel : au plafond, le
    //   mode manuel PRÉVIENT mais laisse passer (garde-fou anti-spam, c'est Arno qui juge). Additif : le champ `plafonds` est
    //   IGNORÉ par la recherche existante (RechercheVivier), qui reste inchangée. Calculé pour le seul process 'formulaire'.
    const plafonds = process === 'formulaire' ? await plafondsTeleservice(cfg) : {};
    // `tronque` = plafond de chargement du vivier atteint OU plus de CAP correspondances (dans les deux cas l'affichage est incomplet).
    return Response.json({ ...r, bloquees, plafonds, tronque: tronque || r.total > CAP });
  } catch {
    return Response.json({ erreur: 'recherche indisponible' }, { status: 503 });
  }
}
