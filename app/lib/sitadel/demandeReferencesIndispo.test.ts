import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * P2 — la lecture des références (liste + détail) ne doit plus être un catch MUET : un échec est JOURNALISÉ complètement et
 * marqué « indisponible » (DISTINCT d'un résultat vide), SANS propager un 503 qui viderait l'onglet. On mocke ../db/client et
 * on route par fragment de SQL ; un drapeau fait échouer sélectivement la requête des références.
 */
const { etat, queryMock } = vi.hoisted(() => {
  const etat = { echecListe: false, echecDetail: false };
  const pgErr = () => Object.assign(new Error('relation manquante'), { code: '42P01', detail: 'd', constraint: 'c', table: 't', column: 'col' });
  const DEMANDE_LISTE = { id: 1, reference: 'SVAV-DEM-2026-000001', code_insee: '92004', commune_nom: 'Asnières', dest_canal: 'formulaire', dest_origine: 'mairie_contact', dest_nom: null, nb: 1, statut: 'envoyee', profil_demandeur: 'entreprise', cree_le: '2026-01-01' };
  const DEMANDE_DETAIL = { id: 1, reference: 'SVAV-DEM-2026-000001', code_insee: '92004', commune_nom: 'Asnières', statut: 'envoyee', profil_demandeur: 'entreprise', objet: 'O', corps: 'C', dest_canal: 'formulaire', dest_email: null, dest_url_formulaire: null, dest_adresse_postale: null, dest_origine: 'mairie_contact', dest_nom: null, cree_le: '2026-01-01' };
  const queryMock = async (sql: string) => {
    if (sql.includes('config_veille')) return { rows: [] };                                   // chargerConfigVeille → défauts
    if (sql.includes('array_agg(DISTINCT')) return { rows: [{ demande_id: 1, rangs: [1] }] };  // rangs (liste)
    if (sql.includes('array_agg(reference)')) { if (etat.echecListe) throw pgErr(); return { rows: [{ demande_id: 1, refs: ['SLC1'] }] }; }
    if (sql.includes('FROM demande_reference_externe WHERE demande_id')) { if (etat.echecDetail) throw pgErr(); return { rows: [] }; } // détail : succès VIDE
    if (sql.includes('ORDER BY d.cree_le DESC')) return { rows: [DEMANDE_LISTE] };             // listerDemandes principale
    if (sql.includes('WHERE d.id = $1')) return { rows: [DEMANDE_DETAIL] };                    // lireDemande principale
    if (sql.includes('GROUP BY statut')) return { rows: [{ statut: 'envoyee', n: 1 }] };
    if (sql.includes('count(DISTINCT dossier_id)')) return { rows: [{ n: 1 }] };
    if (sql.includes('FROM demande_dossier dd JOIN sitadel_dossier s')) return { rows: [] };   // dossiers du détail
    return { rows: [] };
  };
  return { etat, queryMock };
});
vi.mock('../db/client', () => ({ query: queryMock, withTransaction: async () => undefined, pool: {}, closePool: async () => undefined }));

import { listerDemandes, lireDemande } from './demandeRepo';

let erreurs: unknown[][];
beforeEach(() => { etat.echecListe = false; etat.echecDetail = false; erreurs = []; vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { erreurs.push(a); }); });
afterEach(() => { vi.restoreAllMocks(); });

const CHAMPS = ['name', 'message', 'stack', 'code', 'detail', 'constraint', 'table', 'column'];

describe('P2 — listerDemandes : lecture des références (liste)', () => {
  it('ÉCHEC → referencesIndisponibles=true, JOURNALISÉ (tous les champs), écran conservé (demandes présentes)', async () => {
    etat.echecListe = true;
    const res = await listerDemandes();
    expect(res.referencesIndisponibles).toBe(true);           // « indisponible », pas un 503
    expect(res.demandes).toHaveLength(1);                       // l'onglet n'est PAS vidé
    expect(res.demandes[0].referencesExternes).toEqual([]);    // pas de références (lecture KO)
    const trace = erreurs.find((a) => String(a[0]).includes('indisponible'));
    expect(trace).toBeDefined();
    for (const c of CHAMPS) expect(Object.keys(trace![1] as object)).toContain(c);
  });

  it('SUCCÈS (références présentes) → referencesIndisponibles=false, aucune trace d’erreur', async () => {
    const res = await listerDemandes();
    expect(res.referencesIndisponibles).toBe(false);
    expect(res.demandes[0].referencesExternes).toEqual(['SLC1']);
    expect(erreurs).toHaveLength(0);
  });
});

describe('P2 — lireDemande : lecture des références (détail)', () => {
  it('ÉCHEC → referencesMairieIndisponible=true, JOURNALISÉ, reste du détail présent', async () => {
    etat.echecDetail = true;
    const d = await lireDemande(1);
    expect(d).not.toBeNull();
    expect(d!.referencesMairieIndisponible).toBe(true);        // « indisponibles »
    expect(d!.referencesMairie).toEqual([]);                   // liste vide (mais drapeau distingue le motif)
    expect(d!.reference).toBe('SVAV-DEM-2026-000001');         // le reste du détail est bien là
    const trace = erreurs.find((a) => String(a[0]).includes('indisponible'));
    expect(trace).toBeDefined();
    for (const c of CHAMPS) expect(Object.keys(trace![1] as object)).toContain(c);
  });

  it('SUCCÈS avec ZÉRO référence → referencesMairieIndisponible=false (« aucune », pas « indisponible ») et aucune trace', async () => {
    const d = await lireDemande(1);
    expect(d!.referencesMairieIndisponible).toBe(false);
    expect(d!.referencesMairie).toEqual([]);
    expect(erreurs).toHaveLength(0);
  });
});
