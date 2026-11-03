import { exigerMonEspace } from '../../../../../lib/mon-espace/garde';
import { peutVoirCouts } from '../../../../../lib/mon-espace/compteRepo';
import { lireDonneesGlobal } from '../../../../../lib/transaction/donneesGlobal';
import { aujourdhuiParis } from '../../../../../lib/location/suivi/suivi';
import { lireGesteCout, MOTIF_COUTS } from '../../../../../lib/mon-espace/couts';
import { ajouterCoutLigne, empreinteCouts, lireValidationsCouts, lireVersionsGestion, modifierCoutLigne, modifierPosteGestion, validerPosteCout, type Issue } from '../../../../../lib/transaction/repo';
import { coutsSaisisDisponible, mongaDisponible } from '../../../../../lib/admin/schemaDroits';
import { rappelMois } from '../../../../../lib/mon-espace/saisieMois';
import { estAgence } from '../../../../../lib/mon-espace/agence';
import { lireProfilsCouts } from '../../../../../lib/admin/fonctionsCompte';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';

/**
 * 🔴 MON ESPACE « LES COÛTS » (Arno, 03/11/2026) — /api/admin/mon-espace/couts. Gardée trois fois : `proxy.ts` (préfixe /api/admin/mon-espace,
 * droit « mon_espace »), `exigerMonEspace` (droit relu en base), puis `peutVoirCouts` : statut « Associé » (C1) ET administrateur (l'onglet suit
 * « Voir », C2) — 403 sinon, rien n'est lu ni écrit. Jamais mise en cache.
 *   GET            les données de « Coûts globaux » (`lireDonneesGlobal`, la même lecture que le Suivi CA), plus, pour la saisie (lot 2) : les profils
 *                  et leurs fonctions, la version de chaque mois de la Gestion, la migration 451 appliquée ou non ;
 *   GET ?empreinte=1  l'empreinte des coûts (rafraîchissement des écrans ouverts, toutes les 15 s) ;
 *   GET ?rappel=1&agence=…  lot 3 (C17) : le mois précédent est-il à compléter dans les structures vues (« Coûts d'octobre à saisir ») ;
 *   POST           une saisie (lot 2, C15) : `ligne-ajouter` | `ligne-modifier` | `ligne-retirer` (salaires par salarié, « Autres »), `gestion-poste`
 *                  (ADHOC, facture MONGA) — LES MÊMES enregistrements que le Suivi CA, journalisés ; 409 si la ligne a changé depuis sa lecture.
 */
export const runtime = 'nodejs';
const ENTETES = { 'Cache-Control': 'private, no-store' } as const;
const json = (corps: unknown, status = 200): Response => Response.json(corps, { status, headers: ENTETES });

async function garder(request: Request): Promise<{ refus: Response } | { auteurId: number }> {
  const garde = await exigerMonEspace(request);
  if ('refus' in garde) return garde;
  if (garde.auteurId === null) return { refus: json({ erreur: 'ACCES_REVOQUE' }, 403) };
  if (!(await peutVoirCouts(garde.auteurId))) return { refus: json({ etat: 'refus', motif: MOTIF_COUTS }, 403) };
  return { auteurId: garde.auteurId };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const g = await garder(request);
    if ('refus' in g) return g.refus;
    const url = new URL(request.url);
    if (url.searchParams.get('empreinte') === '1') return json({ etat: 'ok', data: { empreinte: await empreinteCouts() } });
    if (url.searchParams.get('rappel') === '1') {
      const agence = url.searchParams.get('agence');
      if (!estAgence(agence)) return json({ etat: 'refus', motif: 'Structure inconnue.' }, 400);
      const [validations, versions, monga, saisie] = await Promise.all([lireValidationsCouts(), lireVersionsGestion(), mongaDisponible(), coutsSaisisDisponible()]);
      if (validations === null || !saisie) return json({ etat: 'ok', data: { rappel: null } });
      const jour = aujourdhuiParis(); const m = `${jour.slice(0, 4)}-${jour.slice(5, 7)}`;
      const precedent = (() => { const a = Number(m.slice(0, 4)); const x = Number(m.slice(5, 7)); return x === 1 ? `${a - 1}-12` : `${a}-${String(x - 1).padStart(2, '0')}`; })();
      const rappel = rappelMois(agence === 'tous' ? ['criterimmo', 'macj'] : [agence], validations, jour, { adhocImporte: versions[precedent]?.origine === 'import', monga });
      return json({ etat: 'ok', data: { rappel } });
    }
    const [donnees, profils, versionsGestion, saisie, validations] = await Promise.all([lireDonneesGlobal(aujourdhuiParis(), { compromis: false }), lireProfilsCouts(),
      lireVersionsGestion(), coutsSaisisDisponible(), lireValidationsCouts()]);
    return json({ etat: 'ok', data: { ...donnees, profils, versionsGestion, saisie, validations } });
  } catch (e) {
    console.error('[mon-espace] coûts', e);
    return json({ etat: 'erreur', message: 'Lecture impossible.' }, 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const g = await garder(request);
    if ('refus' in g) return g.refus;
    let body: unknown;
    try { body = await request.json(); } catch { return json({ etat: 'refus', motif: 'Requête invalide.' }, 422); }
    const lu = lireGesteCout(body);
    if (!lu.ok) return json({ etat: 'refus', motif: lu.motif }, 422);
    const auteur = await auteurDeLaRequete(request);
    const x = lu.geste;
    const r: Issue<number> = x.action === 'ligne-ajouter' ? await ajouterCoutLigne(x.ligne, auteur)
      : x.action === 'ligne-retirer' ? await modifierCoutLigne(x.id, x.version, { retirer: true }, auteur)
      : x.action === 'ligne-modifier' ? await modifierCoutLigne(x.id, x.version, { montantHt: x.montantHt, compteId: x.compteId, libelle: x.libelle }, auteur)
      : x.action === 'valider' ? await validerPosteCout(x.validation, x.valide, auteur)
      : await modifierPosteGestion(x.annee, x.mois, x.poste, x.montantHt, x.version, auteur);
    if (r.ok) return json({ etat: 'ok', data: { id: r.valeur ?? null } });
    return json({ etat: 'refus', motif: r.motif }, r.conflit === true ? 409 : 422);
  } catch (e) {
    console.error('[mon-espace] coûts — saisie', e);
    return json({ etat: 'erreur', message: 'Enregistrement impossible.' }, 500);
  }
}
