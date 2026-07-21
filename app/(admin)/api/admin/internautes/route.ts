import 'server-only';
import { exigerAdministrateur } from '../../../../lib/admin/garde';
import { lireFiltres, lireStatuts, lireFiltreCompte, lireModeConsentement } from '../../../../lib/internaute/extraction';
import { lireProfilsFiltres, lireBornesDates } from '../../../../lib/internaute/extractionRepo';

/**
 * GET /api/admin/internautes — LISTE FILTRÉE paginée des profils (module Internaute, LOT 3).
 *
 * PERMISSION : réservé au RÔLE ADMINISTRATEUR (`exigerAdministrateur`, relit role+actif en base). La route n'est
 * PAS déclarée dans `proxy.ts` → le défaut FAIL-CLOSED du proxy la réserve déjà à l'administrateur ; ce garde est
 * la seconde barrière (défense en profondeur, comme /api/admin/audit).
 *
 * GESTION (≠ EXTRACTION) : la liste lit la table `internaute` (non effacés) via `clauseStatutsGestion`. DEUX axes de
 * filtre INDÉPENDANTS, croisés (ET) : le CONSENTEMENT (`statuts` F1/F2/F3 — critère POSITIF : vide = « sans aucun
 * consentement actif », ≥1 combinées par `modeConsentement=et|ou` — défaut `et` = « a TOUTES les cochées », `ou` = « a
 * au moins une ») et le COMPTE (`compte=avec|sans`, `lireFiltreCompte`). Toute combinaison est une requête légitime.
 *
 * PARAM `base` (défaut `gestion`) : `base=commercial` sert le résultat du MOTEUR D'EXTRACTION dans le tableau — MÊME base
 * que l'export/compteur (`internaute_commercial`, consentants, fail-closed, mode ET/OU), en IGNORANT compte et nom (q),
 * mais paginé et avec `a_un_compte`. Les EXTRACTIONS elles-mêmes (export/comptage/bornes/communes) restent inchangées.
 * Lecture SEULE (moteur jamais rappelé → golden intact). Aucun pont M2. Seul GET (aucune méthode mutante). Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const garde = await exigerAdministrateur(request);
    if ('refus' in garde) return garde.refus;

    const url = new URL(request.url);
    const filtres = lireFiltres(url.searchParams);
    const statuts = lireStatuts(url.searchParams); // pastilles cochées (axe consentement)
    const filtreCompte = lireFiltreCompte(url.searchParams); // axe COMPTE, indépendant : avec | sans | null (indifférent)
    const modeConsentement = lireModeConsentement(url.searchParams); // combinaison des pastilles : 'et' (défaut) | 'ou'
    // BASE de lecture du tableau : 'commercial' (résultat du moteur d'extraction, consentants/fail-closed) sinon 'gestion'
    // (défaut, comportement INCHANGÉ). Liste blanche stricte : seule la valeur 'commercial' bascule.
    const base = url.searchParams.get('base') === 'commercial' ? 'commercial' : 'gestion';
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const taille = Math.min(100, Math.max(1, Number(url.searchParams.get('taille')) || 25));

    const { total, lignes } = await lireProfilsFiltres(filtres, page, taille, statuts, filtreCompte, modeConsentement, base);
    const bornes = await lireBornesDates(); // étendue temporelle de la base (bouton « depuis toujours »)
    return Response.json({ total, page, taille, lignes, bornes });
  } catch {
    return Response.json({ erreur: 'internautes indisponible' }, { status: 503 });
  }
}
