import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A1b — écritures « documents ajoutés à la main » : deposerDocumentSurPermis (permis archivé requis ; ORDRE dépôt→insertion ;
 * refus → rien inséré), supprimerDocumentDossier (ligne PUIS objet ; ne touche QUE dossier_document), lireCleTelechargeable
 * (un seul lecteur, dispatché par source). On mocke ../db/client (routé par fragment SQL) ET ../stockage (dépôt/suppression).
 */
const H = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const state = {
    archive: true, insertId: 42,
    cleDossier: 'dossiers/1/uuid.pdf' as string | null,
    cleReponse: 'demandes/1/reponses/2/uuid.pdf' as string | null,
    deleteCle: 'dossiers/1/uuid.pdf' as string | null,
    depot: { depose: true, cle: 'dossiers/7/uuid.pdf', taille: 123, empreinte: 'sha' } as { depose: true; cle: string; taille: number; empreinte: string } | { depose: false; motif: string },
    deposerThrows: false,
    supprimeAppele: null as string | null,
  };
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    if (sql.includes('EXISTS (SELECT 1 FROM demande_dossier dd')) return { rows: [{ ok: state.archive }] };
    if (sql.includes('INSERT INTO dossier_document')) return { rows: [{ id: state.insertId }] };
    if (sql.includes('DELETE FROM dossier_document')) return { rows: state.deleteCle === null ? [] : [{ cle_stockage: state.deleteCle }] };
    if (sql.includes('SELECT cle_stockage FROM dossier_document WHERE id')) return { rows: [{ cle_stockage: state.cleDossier }] };
    if (sql.includes('SELECT cle_stockage FROM demande_reponse_piece WHERE id')) return { rows: [{ cle_stockage: state.cleReponse }] };
    return { rows: [] }; // config_veille → défauts (pieceTailleMaxMo = 50)
  };
  const deposerDocumentDossier = async () => { if (state.deposerThrows) throw new Error('S3 down'); return state.depot; };
  const supprimer = async (cle: string) => { state.supprimeAppele = cle; };
  return { appels, state, queryMock, deposerDocumentDossier, supprimer };
});
vi.mock('../db/client', () => ({ query: H.queryMock, withTransaction: async () => undefined, pool: {}, closePool: async () => undefined }));
vi.mock('../stockage', () => ({ deposerDocumentDossier: H.deposerDocumentDossier, supprimer: H.supprimer }));

import { deposerDocumentSurPermis, supprimerDocumentDossier, lireCleTelechargeable } from './demandeRepo';

const buf = Buffer.from('contenu');
const aInsere = () => H.appels.some((a) => a.sql.includes('INSERT INTO dossier_document'));

beforeEach(() => {
  H.appels.length = 0;
  H.state.archive = true; H.state.insertId = 42; H.state.deleteCle = 'dossiers/1/uuid.pdf';
  H.state.cleDossier = 'dossiers/1/uuid.pdf'; H.state.cleReponse = 'demandes/1/reponses/2/uuid.pdf';
  H.state.depot = { depose: true, cle: 'dossiers/7/uuid.pdf', taille: 123, empreinte: 'sha' };
  H.state.deposerThrows = false; H.state.supprimeAppele = null;
});

describe('A1b — deposerDocumentSurPermis : permis archivé requis + ordre dépôt→insertion', () => {
  it('permis NON archivé → refus explicite, RIEN déposé/inséré', async () => {
    H.state.archive = false;
    const r = await deposerDocumentSurPermis(1, buf, 'application/pdf', 'plan.pdf', 'admin');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toMatch(/archiv/i);
    expect(aInsere()).toBe(false);
  });

  it('dépôt REFUSÉ (type hors whitelist / trop volumineux) → RIEN inséré, motif remonté', async () => {
    H.state.depot = { depose: false, motif: 'type non autorisé pour le dépôt : « text/plain »' };
    const r = await deposerDocumentSurPermis(1, buf, 'text/plain', 'note.txt', 'admin');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toContain('type non autorisé');
    expect(aInsere()).toBe(false);
  });

  it('échec du dépôt S3 (exception) → AUCUNE ligne créée', async () => {
    H.state.deposerThrows = true;
    await expect(deposerDocumentSurPermis(1, buf, 'application/pdf', 'plan.pdf', 'admin')).rejects.toThrow();
    expect(aInsere()).toBe(false);
  });

  it('succès → dépôt PUIS insertion ; la clé insérée est celle du dépôt, le nom d’origine reste hors de la clé', async () => {
    const r = await deposerDocumentSurPermis(1, buf, 'application/pdf', 'plan.pdf', 'admin', 'ma note');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.documentId).toBe(42);
    const ins = H.appels.find((a) => a.sql.includes('INSERT INTO dossier_document'))!;
    expect(ins.params).toContain('dossiers/7/uuid.pdf'); // cle_stockage = clé S3 du dépôt
    expect(ins.params).toContain('plan.pdf');            // nom d'origine en base (colonne nom_fichier)
    expect(ins.params).toContain('sha');                 // empreinte du dépôt persistée
    expect(String(H.state.depot)).not.toContain('plan.pdf'); // le nom d'origine n'entre pas dans la clé du dépôt
  });
});

describe('A1b — supprimerDocumentDossier : ligne PUIS objet ; ne touche QUE dossier_document', () => {
  it('supprime la LIGNE (dossier_document) puis l’OBJET S3, jamais demande_reponse_piece', async () => {
    const ok = await supprimerDocumentDossier(20);
    expect(ok).toBe(true);
    expect(H.appels.some((a) => a.sql.includes('DELETE FROM dossier_document'))).toBe(true);
    expect(H.appels.some((a) => a.sql.includes('demande_reponse_piece'))).toBe(false); // JAMAIS les pièces e-mail
    expect(H.state.supprimeAppele).toBe('dossiers/1/uuid.pdf');                          // objet supprimé APRÈS la ligne
  });

  it('id inconnu → false, aucun objet supprimé', async () => {
    H.state.deleteCle = null;
    const ok = await supprimerDocumentDossier(999);
    expect(ok).toBe(false);
    expect(H.state.supprimeAppele).toBeNull();
  });
});

describe('A1b — lireCleTelechargeable : UN seul lecteur, dispatché par source', () => {
  it('« dossier » → lit dossier_document ; « reponse » → lit demande_reponse_piece', async () => {
    expect(await lireCleTelechargeable(20, 'dossier')).toBe('dossiers/1/uuid.pdf');
    expect(H.appels.some((a) => a.sql.includes('SELECT cle_stockage FROM dossier_document WHERE id'))).toBe(true);
    H.appels.length = 0;
    expect(await lireCleTelechargeable(10, 'reponse')).toBe('demandes/1/reponses/2/uuid.pdf');
    expect(H.appels.some((a) => a.sql.includes('FROM demande_reponse_piece WHERE id'))).toBe(true);
  });
});
