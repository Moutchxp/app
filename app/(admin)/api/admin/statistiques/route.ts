import 'server-only';
import { exigerCompteActif } from '../../../../lib/admin/garde';
import { validerFenetre } from '../../../../lib/analytics/lecture/fenetre';
import { statistiques } from '../../../../lib/analytics/lecture/metriques';

/**
 * M2 — LOT 4. GET /api/admin/statistiques?debut=YYYY-MM-DD&fin=YYYY-MM-DD&grain=jour|semaine|mois
 *
 * LECTURE SEULE du grand livre agrégé (`analytics_compteur_jour`). N'AFFICHE RIEN (pas de page — c'est le
 * Lot 5) : renvoie du JSON. Aucune écriture (la couche de lecture ouvre une transaction READ ONLY). Ne lit
 * JAMAIS les sessions brutes (`analytics_session`). k-anonymat appliqué à la restitution (communes /
 * provenance < k masquées + suppression secondaire), seuil lu au runtime depuis la config (020).
 *
 * LOT 6 — paramètre optionnel `commune` (code INSEE, filtre carte). Présent → la lecture ajoute
 * `filtreCommune` (verdicts de cette commune, RE-passés en k côté serveur) ; les métriques de session
 * (trafic/entonnoir/provenance) restent globales (non ventilables par commune, anti-fingerprint).
 *
 * PERMISSION : `perm_statistiques`, vérifiée CÔTÉ SERVEUR par `exigerCompteActif` (relit actif + perm en
 * base → révocation IMMÉDIATE, indépendante du proxy et de l'UI). Seul GET est exporté (aucune méthode
 * mutante). Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    // Garde SERVEUR (defense in depth + révocation) : un compte sans perm_statistiques (ou désactivé) → 403.
    // Dans le try : si la relecture DB de la permission échoue, on renvoie un 503 maîtrisé (fail-closed),
    // jamais un 500 nu ni de détail.
    const refus = await exigerCompteActif(request, 'statistiques');
    if (refus) return refus;

    const url = new URL(request.url);
    const v = validerFenetre(
      url.searchParams.get('debut'),
      url.searchParams.get('fin'),
      url.searchParams.get('grain'),
    );
    if (!v.ok) return Response.json({ erreur: v.erreur }, { status: 400 });

    // Filtre carte optionnel : code INSEE 5 car (2 chiffres dept ou 2A/2B Corse + 3). Présent mais malformé
    // → 400 (on ne devine pas) ; absent → null (vue globale). Validé ici AVANT d'atteindre le SQL (param lié).
    const communeRaw = url.searchParams.get('commune');
    if (communeRaw !== null && !/^(2[AB]|[0-9]{2})[0-9]{3}$/.test(communeRaw)) {
      return Response.json({ erreur: 'commune invalide' }, { status: 400 });
    }

    return Response.json(await statistiques(v.fenetre, communeRaw));
  } catch {
    // Accès base en échec (permission ou lecture) → erreur maîtrisée, jamais de fuite de détail.
    return Response.json({ erreur: 'statistiques indisponibles' }, { status: 503 });
  }
}
