import { describe, it, expect } from 'vitest';
import { construireCleEntrante, extensionEntrante, empreinteSha256, deposerPieceEntrante, construireCleDocument, deposerDocumentDossier } from './index';

/**
 * R4 — chemin de stockage ENTRANT (pièces des réponses de mairies, tiers non fiable). La clé n'inclut JAMAIS le nom
 * d'origine ; whitelist LARGE mais explicite ; garde-fous (type/taille/non configuré) qui NE JETTENT PAS mais renvoient un
 * motif. En environnement de test, le stockage n'est pas configuré (S3_* absents) → le dépôt d'un type/ taille valides
 * s'arrête proprement sur « stockage non configuré ».
 */
describe('R4 — construireCleEntrante : clé non énumérable, sans nom d’origine', () => {
  it('réponse RATTACHÉE → demandes/<id>/reponses/<id>/<uuid>.<ext>', () => {
    const cle = construireCleEntrante(42, 7, 'pdf');
    expect(cle).toMatch(/^demandes\/42\/reponses\/7\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/);
  });

  it('réponse NON rattachée → demandes/non-rattachees/<id>/<uuid>.<ext>', () => {
    const cle = construireCleEntrante(null, 7, 'pdf');
    expect(cle).toMatch(/^demandes\/non-rattachees\/7\/[0-9a-f-]{36}\.pdf$/);
  });

  it('deux appels → deux clés différentes (UUID)', () => {
    expect(construireCleEntrante(1, 1, 'pdf')).not.toBe(construireCleEntrante(1, 1, 'pdf'));
  });
});

describe('R4 — extensionEntrante : whitelist propre au chemin entrant', () => {
  it('types acceptés → extension', () => {
    expect(extensionEntrante('application/pdf')).toBe('pdf');
    expect(extensionEntrante('image/tiff')).toBe('tiff');
    expect(extensionEntrante('application/zip')).toBe('zip');
    expect(extensionEntrante('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('docx');
    expect(extensionEntrante('image/vnd.dwg')).toBe('dwg');
    expect(extensionEntrante('APPLICATION/PDF')).toBe('pdf'); // casse ignorée
  });

  it('type hors whitelist / vide → null', () => {
    expect(extensionEntrante('application/x-msdownload')).toBeNull();
    expect(extensionEntrante(null)).toBeNull();
  });
});

describe('R4 — empreinteSha256', () => {
  it('SHA-256 hexadécimal du contenu (valeur connue pour « abc »)', () => {
    expect(empreinteSha256(Buffer.from('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('R4 — deposerPieceEntrante : garde-fous (ne jette pas, renvoie un motif)', () => {
  const opts = { demandeId: 42, reponseId: 7, tailleMaxOctets: 50 * 1024 * 1024 };

  it('type refusé → non déposé, motif explicite', async () => {
    const r = await deposerPieceEntrante(Buffer.from('x'), 'application/x-msdownload', opts);
    expect(r.depose).toBe(false);
    if (!r.depose) expect(r.motif).toMatch(/type non autorisé/i);
  });

  it('taille au-dessus de la borne → non déposé, motif explicite (borne appliquée)', async () => {
    const r = await deposerPieceEntrante(Buffer.alloc(11), 'application/pdf', { ...opts, tailleMaxOctets: 10 });
    expect(r.depose).toBe(false);
    if (!r.depose) expect(r.motif).toMatch(/trop volumineuse/i);
  });

  it('stockage non configuré (type + taille OK) → non déposé, motif « stockage non configuré » (aucune exception)', async () => {
    const r = await deposerPieceEntrante(Buffer.from('petit pdf'), 'application/pdf', opts);
    expect(r.depose).toBe(false);
    if (!r.depose) expect(r.motif).toBe('stockage non configuré');
  });
});

describe('A1b — construireCleDocument : clé non énumérable d’un document ajouté à la main, SANS nom d’origine', () => {
  it('dossiers/<dossier_id>/<uuid>.<ext>', () => {
    expect(construireCleDocument(75056, 'pdf')).toMatch(/^dossiers\/75056\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/);
  });
  it('le nom d’origine n’entre JAMAIS dans la clé (la fonction ne le reçoit même pas)', () => {
    expect(construireCleDocument(1, 'pdf')).not.toContain('plan-de-masse');
  });
  it('deux appels → deux clés différentes (UUID)', () => {
    expect(construireCleDocument(1, 'pdf')).not.toBe(construireCleDocument(1, 'pdf'));
  });
});

describe('A1b — deposerDocumentDossier : mêmes garde-fous que l’entrant (whitelist + taille RÉUTILISÉES)', () => {
  const opts = { dossierId: 7, tailleMaxOctets: 50 * 1024 * 1024 };
  it('type hors whitelist → non déposé, motif explicite (rien à insérer en amont)', async () => {
    const r = await deposerDocumentDossier(Buffer.from('x'), 'text/plain', opts);
    expect(r.depose).toBe(false);
    if (!r.depose) expect(r.motif).toMatch(/type non autorisé/i);
  });
  it('trop volumineux → non déposé, motif explicite (borne = piece_taille_max_mo)', async () => {
    const r = await deposerDocumentDossier(Buffer.alloc(11), 'application/pdf', { ...opts, tailleMaxOctets: 10 });
    expect(r.depose).toBe(false);
    if (!r.depose) expect(r.motif).toMatch(/trop volumineux/i);
  });
  it('type + taille OK mais stockage non configuré (tests) → non déposé, sans exception', async () => {
    const r = await deposerDocumentDossier(Buffer.from('petit pdf'), 'application/pdf', opts);
    expect(r.depose).toBe(false);
    if (!r.depose) expect(r.motif).toBe('stockage non configuré');
  });
});
