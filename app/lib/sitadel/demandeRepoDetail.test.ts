import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * T2-C — lireDemande scinde les dossiers du DÉTAIL : le compte (nbDossiers / dossiers) ne porte que sur les ATTACHÉS (actif) ;
 * les RETIRÉS (actif=false) sont renvoyés À PART (dossiersRetires), jamais comptés ni filtrés (pas de disparition muette). On
 * mocke ../db/client et on route par fragment de SQL, on PROUVE le comportement (retour) et le SQL par fragments sémantiques.
 */
const { appels, queryMock } = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    if (sql.includes('WHERE d.id = $1')) return { rows: [{ id: 1, reference: 'SVAV-DEM-2026-000119', code_insee: '75056', commune_nom: 'Paris', statut: 'envoyee', profil_demandeur: 'entreprise', objet: 'o', corps: 'c', dest_canal: 'email', dest_email: 'x@y', dest_url_formulaire: null, dest_adresse_postale: null, dest_origine: 'mairie_contact', dest_nom: null, cree_le: '2026-01-01' }] };
    if (sql.includes('FROM demande_dossier dd JOIN sitadel_dossier s')) return { rows: [
      { num_dau: 'PC-A', date: null, actif: true },   // attaché
      { num_dau: 'PC-B', date: null, actif: false },  // retiré
      { num_dau: 'PC-C', date: null, actif: false },  // retiré
      { num_dau: 'PC-D', date: null, actif: false },  // retiré
    ] };
    if (sql.includes('FROM demande_reference_externe')) return { rows: [] };
    return { rows: [] };
  };
  return { appels, queryMock };
});
vi.mock('../db/client', () => ({ query: queryMock, withTransaction: async () => undefined, pool: {}, closePool: async () => undefined }));

import { lireDemande } from './demandeRepo';

beforeEach(() => { appels.length = 0; });

describe('T2-C — lireDemande : compte les attachés, liste les retirés à part', () => {
  it('4 dossiers dont 3 retirés → nbDossiers = 1, dossiers = [attaché], dossiersRetires = [les 3 retirés]', async () => {
    const d = await lireDemande(1);
    expect(d).not.toBeNull();
    expect(d!.nbDossiers).toBe(1);                                        // « Dossiers (1) »
    expect(d!.dossiers.map((x) => x.numDau)).toEqual(['PC-A']);           // seuls les attachés
    expect(d!.dossiersRetires.map((x) => x.numDau)).toEqual(['PC-B', 'PC-C', 'PC-D']); // les retirés, à part
  });

  it('la requête détail LIT dd.actif mais ne le FILTRE pas (les retirés restent lus → jamais une disparition muette)', async () => {
    await lireDemande(1);
    const q = appels.find((a) => a.sql.includes('FROM demande_dossier dd JOIN sitadel_dossier s'));
    expect(q).toBeDefined();
    const norm = q!.sql.replace(/\s+/g, ' ');
    expect(norm).toContain('dd.actif');          // sélectionné pour scinder attachés/retirés
    expect(norm).not.toContain('AND dd.actif');  // PAS de filtre WHERE → les retirés ne disparaissent pas
  });
});
