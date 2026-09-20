import 'server-only';
import { exigerAdministrateur, exigerCapaciteModif } from '../../../../../lib/admin/garde';
import { listerSuivi, rechercherSuivi, construireFiltreSuivi, lireDetailSuivi, ouvrirRattachementManuel, cloreRattachementAcheve, type CriteresSuivi } from '../../../../../lib/permis/rattachementSuiviRepo';
import { lireComparaison, affecterPolygone } from '../../../../../lib/permis/affectationRepo';
import { validerRattachement, refuserRattachement, retourLidar, revaliderRattachement } from '../../../../../lib/permis/actionsRattachement';
import { restaurerVersionGel } from '../../../../../lib/permis/restaurationGel'; // RATT-EDIT (lot C1) — restauration d'une version de gel
import { lireDaactDeclencheurActif, ecrireDaactDeclencheurActif } from '../../../../../lib/permis/rattachementConfig';

/**
 * /api/admin/permis/rattachement — SUIVI du rattachement des permis à leur parcelle / polygones futurs.
 * GET (sans param) → la LISTE (univers = permis avec empreinte) + compteurs par état.
 * GET ?dossierId=N → le DÉTAIL d'un dossier + l'AFFECTATION des polygones BD TOPO aux corps (FUS-3d).
 * POST { action, dossierId, … } :
 *   'ouvrir_manuel' {motif}           → ouvre l'arbitrage À LA MAIN (aucun delta BD TOPO), dossier tracé 'manuelle' (M5) ;
 *   'affecter' {corpsId, cleabs, operation:'ajout'|'retrait'} → ajoute/retire UN polygone d'un bâtiment (FUS-3d / M2, additif) ;
 *   'valider' {cotes}                 → injecte UNE COTE PAR POLYGONE (cotes[cleabs], origine 'permis') + dossier 'valide' ; retourne `injections` (M3/M8, sans motif) ;
 *   'refuser' {motif}                 → dossier 'refuse' (motif obligatoire) ;
 *   'retour_lidar'                    → restaure les altitudes LiDAR refigées (origine 'lidar').
 * RÉSERVÉ ADMINISTRATEUR. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const sp = new URL(request.url).searchParams;
    const dossierId = sp.get('dossierId');
    if (dossierId) {
      const [detail, comparaison] = await Promise.all([lireDetailSuivi(Number(dossierId)), lireComparaison(Number(dossierId)).catch(() => null)]);
      if (!detail) return Response.json({ erreur: 'dossier inconnu' }, { status: 404 });
      return Response.json({ detail, comparaison });
    }
    // RECHERCHE (les 6 critères, combinables) — FILTRAGE EN BASE + PAGINATION. Un filtre actif → liste filtrée + total du filtre en cours.
    const interneBrut = (sp.get('interne') ?? '').trim();
    const criteres: CriteresSuivi = {
      numDau: sp.get('num') ?? undefined,
      dossierId: interneBrut !== '' && /^\d+$/.test(interneBrut) ? Number(interneBrut) : null,
      commune: sp.get('commune') ?? undefined,
      type: sp.get('type') ?? undefined,
      autorisationDe: sp.get('autorDe') ?? undefined, autorisationA: sp.get('autorA') ?? undefined,
      entreeDe: sp.get('entreeDe') ?? undefined, entreeA: sp.get('entreeA') ?? undefined,
    };
    if (construireFiltreSuivi(criteres).actif) {
      const page = Number(sp.get('page') ?? '1');
      const r = await rechercherSuivi(criteres, page);
      return Response.json({ recherche: true, ...r });
    }
    const [suivi, daactActif] = await Promise.all([listerSuivi(), lireDaactDeclencheurActif()]);
    return Response.json({ ...suivi, daactActif });
  } catch (e) {
    console.error('[permis/rattachement] GET indisponible', e);
    return Response.json({ erreur: 'suivi indisponible' }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const body = (await request.json().catch(() => ({}))) as { action?: string; dossierId?: number | string; corpsId?: number; cleabs?: string; operation?: 'ajout' | 'retrait'; cotes?: Record<string, number | null>; motif?: string; actif?: boolean; gelId?: number | string };

    // RATTACHEMENT — réglage GLOBAL (pas un dossier) : la DAACT comme déclencheur. Traité AVANT la garde `dossierId`.
    if (body.action === 'reglage_daact') {
      if (typeof body.actif !== 'boolean') return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      return Response.json({ ok: true, daactActif: await ecrireDaactDeclencheurActif(body.actif) });
    }

    // dossierId : ACCEPTE un nombre OU une chaîne numérique. Les identifiants viennent d'un `bigint` PostgreSQL, que le pilote `pg`
    // renvoie en CHAÎNE — le front les relaie tels quels. Le GET coerce déjà via Number(...) ; on aligne le POST (même tolérance),
    // sinon toute action à dossier (affecter, valider, refuser, retour_lidar, ouvrir_manuel) est rejetée « requête invalide ».
    const dossierId = typeof body.dossierId === 'number' ? body.dossierId : Number(body.dossierId);
    if (!Number.isInteger(dossierId)) return Response.json({ erreur: 'requête invalide' }, { status: 400 });

    // M5 — OUVRIR l'arbitrage À LA MAIN (aucun delta BD TOPO requis). Motif obligatoire ; dossier tracé 'manuelle'.
    if (body.action === 'ouvrir_manuel') {
      const res = await ouvrirRattachementManuel(dossierId, body.motif ?? '', 'admin:ouverture-manuelle');
      if (!res.ok) return Response.json({ erreur: res.motif }, { status: 409 });
      const [detail, comparaison] = await Promise.all([lireDetailSuivi(dossierId), lireComparaison(dossierId).catch(() => null)]);
      return Response.json({ ok: true, detail, comparaison });
    }

    // ÉTAGE 1 — CLÔTURER un dossier « achevé, à confirmer » (surélévation / surface constante). Aucune injection : constat de workflow.
    if (body.action === 'clore') {
      const res = await cloreRattachementAcheve(dossierId, 'admin:cloture');
      if (!res.ok) return Response.json({ erreur: res.motif }, { status: 409 });
      const [detail, comparaison] = await Promise.all([lireDetailSuivi(dossierId), lireComparaison(dossierId).catch(() => null)]);
      return Response.json({ ok: true, detail, comparaison });
    }

    // FUS-3d / M2 — affectation INCRÉMENTALE d'un polygone à un bâtiment : 'ajout' ou 'retrait' d'UN polygone précis.
    if (body.action === 'affecter') {
      if (typeof body.corpsId !== 'number' || typeof body.cleabs !== 'string' || (body.operation !== 'ajout' && body.operation !== 'retrait')) {
        return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      }
      const res = await affecterPolygone(dossierId, body.corpsId, body.cleabs, body.operation, 'admin:affectation');
      if (!res.ok) return Response.json({ erreur: res.motif }, { status: 409 });
      return Response.json({ ok: true, comparaison: await lireComparaison(dossierId) });
    }

    // FUS-3e — décisions (aucun autre bouton : ni Street View, ni e-mail).
    if (body.action === 'valider' || body.action === 'refuser' || body.action === 'retour_lidar') {
      // M3 — cotes saisies par polygone (clé cleabs). Objet sûr uniquement ; validerRattachement ignore toute valeur non finie.
      const cotes = (body.cotes && typeof body.cotes === 'object' && !Array.isArray(body.cotes)) ? body.cotes : {};
      const res = body.action === 'valider' ? await validerRattachement(dossierId, 'admin:decision', cotes) // M8 — plus de motif de validation
        : body.action === 'refuser' ? await refuserRattachement(dossierId, 'admin:decision', body.motif ?? '')
          : await retourLidar(dossierId, 'admin:decision');
      if (!res.ok) return Response.json({ erreur: res.motif ?? 'action impossible' }, { status: 409 });
      // Rafraîchit détail + affectation (état du dossier / altitudes à jour). M8 — `injections` : détail RÉELLEMENT écrit, pour l'accusé.
      const [detail, comparaison] = await Promise.all([lireDetailSuivi(dossierId), lireComparaison(dossierId).catch(() => null)]);
      return Response.json({ ok: true, nbInjectes: res.nbInjectes, injections: res.injections, nbRestaures: res.nbRestaures, detail, comparaison });
    }

    // RATT-EDIT (lot B3) — REVALIDER un permis modifié après validation. Sous-droit « modifier après validation » requis (exigerCapaciteModif,
    //   défense en profondeur : la route est déjà admin-only → un non-administrateur est refusé plus haut, URL directe comprise). La garde du
    //   Lot 1 (corps non enregistré) est appliquée DANS revaliderRattachement. Aucune injection, aucun changement d'état : le permis reste ici.
    if (body.action === 'revalider') {
      const refusModif = await exigerCapaciteModif(request);
      if (refusModif) return refusModif;
      const res = await revaliderRattachement(dossierId, 'admin:decision');
      if (!res.ok) return Response.json({ erreur: res.motif ?? 'revalidation impossible', manque: res.manque }, { status: 409 });
      const [detail, comparaison] = await Promise.all([lireDetailSuivi(dossierId), lireComparaison(dossierId).catch(() => null)]);
      return Response.json({ ok: true, versionGel: res.versionGel, detail, comparaison });
    }

    // RATT-EDIT (lot C1) — RESTAURER une version de gel choisie (validation d'origine / revalidation / restauration antérieure). MÊME garde de
    //   capacité que la modif/revalidation (exigerCapaciteModif, URL directe comprise). La restauration recrée les corps/emprises supprimés,
    //   n'efface aucune version (append-only) et laisse le permis « à revalider » (marqueur B3). Le permis reste dans Rattachement.
    if (body.action === 'restaurer') {
      const refusModif = await exigerCapaciteModif(request);
      if (refusModif) return refusModif;
      const gelId = typeof body.gelId === 'number' ? body.gelId : Number(body.gelId);
      if (!Number.isInteger(gelId)) return Response.json({ erreur: 'version à restaurer invalide' }, { status: 400 });
      // Auteur = id du compte (résolu en nom dans la liste des versions) ; repli générique en voie de secours (auteur inconnu).
      const par = ('auteurId' in garde && garde.auteurId != null) ? String(garde.auteurId) : 'admin:decision';
      const res = await restaurerVersionGel(dossierId, gelId, par);
      if (!res.ok) return Response.json({ erreur: res.motif ?? 'restauration impossible' }, { status: 409 });
      const [detail, comparaison] = await Promise.all([lireDetailSuivi(dossierId), lireComparaison(dossierId).catch(() => null)]);
      return Response.json({ ok: true, versionGel: res.versionGel, nbCorps: res.nbCorps, nbEmprises: res.nbEmprises, detail, comparaison });
    }

    return Response.json({ erreur: 'action inconnue' }, { status: 400 });
  } catch (e) {
    console.error('[permis/rattachement] POST indisponible', e);
    return Response.json({ erreur: 'action indisponible' }, { status: 503 });
  }
}
