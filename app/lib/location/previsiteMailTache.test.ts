import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 LA PRÉ-VISITE — les mails du module de tâches (Arno, 10/11/2026) : une tâche de PRÉ-VISITE prend son objet, l'invitation .ics,
 * « Mail envoyé par … » et la signature, et chaque mail est rangé au journal de la Location (historique du bien et des locataires) ;
 * TOUTE AUTRE TÂCHE reste exactement comme avant, sans une requête de plus.
 */
const query = vi.fn(async (sql: string, _p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ');
  if (s.includes('FROM gestion_location_previsite s')) return { rows: [{ id: '40', lot_id: '7', occupation_ids: ['11', '12'], n: 1 }] };
  if (s.includes('FROM admin_utilisateur')) return { rows: [{ prenom: 'Arno', nom: 'Test' }] };
  if (s.includes('FROM gestion_tache_demande')) return { rows: [{ tache_id: '500', demandeur_id: '3', demandeur_libelle: 'Arno Test', destinataire_libelle: 'Claire Test', repondu: false }] };
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: (s: string, p?: unknown[]) => query(s, p ?? []) }));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
vi.mock('../gestion/signatureImagesReel', () => ({ signatureHtmlDeGestion: async () => '<b>Service gestion</b>', imagesSignaturePourEnvoi: async () => ({ images: [] }) }));
const journaliserAvis = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock('./mailsPreavisSortieRepo', () => ({ journaliserAvis: (...a: unknown[]) => journaliserAvis(...a) }));

import { habillerMailTachePrevisite, journaliserMailTachePrevisite } from './previsiteMailTache';

const MESSAGE = { de: 'gestion@exemple.test', deNom: 'Gestion', a: ['claire@exemple.test'], cc: [], cci: [], objet: 'Tâche — x', corps: 'Corps',
  corpsHtml: '<!doctype html><html><body><table></table></body></html>', messageId: '<m@exemple.test>' };
const BASE = { tacheId: 500, sorte: 'invitation' as const, adresse: '4 rue Fictive', jour: '2026-11-20', heure: '10:00', dureeMinutes: 60, deplace: false,
  par: 'Claire Test', refusee: false, demandeurEmail: 'arno@exemple.test' };

beforeEach(() => { query.mockClear(); journaliserAvis.mockClear(); });

describe('l’invitation d’un collègue (tâche de pré-visite)', () => {
  it('objet, .ics, « Mail envoyé par … » puis la signature, glissés avant </body>', async () => {
    const m = await habillerMailTachePrevisite({ ...BASE, objetTache: 'Pré-visite EDL de sortie' }, MESSAGE, { maintenant: new Date('2026-11-12T09:00:00Z') });
    expect(m.objet).toBe('Pré-visite EDL de sortie — 4 rue Fictive — 20/11/2026 10h00-11h00');
    expect(m.corps).toBe('Corps\n\nMail envoyé par Arno TEST (arno@exemple.test)\n\n-- \nService gestion');
    expect(m.corpsHtml).toMatch(/Mail envoyé par Arno TEST \(arno@exemple.test\)<\/p><div class="gmail_signature"[^>]*><b>Service gestion<\/b><\/div><\/div><\/body>/);
    const ics = m.pieces?.[0];
    expect(ics?.nom).toBe('pre-visite.ics');
    expect(ics?.octets.toString('utf8')).toContain('UID:previsite-40@exemple.test');
    expect(ics?.octets.toString('utf8')).toContain('SEQUENCE:1');
  });
  it('après un déplacement : « Rendez-vous déplacé — … »', async () => {
    const m = await habillerMailTachePrevisite({ ...BASE, objetTache: 'Pré-visite EDL de sortie', deplace: true }, MESSAGE);
    expect(m.objet.startsWith('Rendez-vous déplacé — Pré-visite EDL de sortie')).toBe(true);
  });
  it('la confirmation d’un refus : « Pré-visite du 20/11 (…) refusée par Claire Test », envoi automatique, sans .ics', async () => {
    const m = await habillerMailTachePrevisite({ ...BASE, sorte: 'confirmation', refusee: true, objetTache: 'Pré-visite EDL de sortie' }, MESSAGE);
    expect(m.objet).toBe('Pré-visite du 20/11 (4 rue Fictive) refusée par Claire Test');
    expect(m.corps).toContain('Mail envoyé automatiquement');
    expect(m.pieces).toBeUndefined();
  });
  it('TOUTE AUTRE TÂCHE : le message tel quel, aucune requête', async () => {
    const m = await habillerMailTachePrevisite({ ...BASE, objetTache: 'EDL de sortie' }, MESSAGE);
    expect(m).toBe(MESSAGE);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('🔴 Règle 7 — invitations et réponses rangées au journal de la Location (bien + locataires)', () => {
  it('une invitation de pré-visite : journalisée avec le bien et les occupations du préavis', async () => {
    await journaliserMailTachePrevisite(1, 'previsite_invitation', { ...MESSAGE, objet: 'Pré-visite EDL de sortie — 4 rue Fictive — 20/11/2026 10h00-11h00' }, { ok: true, id: 'g1', factice: true });
    expect(journaliserAvis).toHaveBeenCalledTimes(1);
    const [mail, o] = journaliserAvis.mock.calls[0] as [{ sorte: string }, { lotId: number; occupationIds: number[]; statut: string; auteur: { libelle: string } }];
    expect(mail.sorte).toBe('previsite_invitation');
    expect(o).toMatchObject({ lotId: 7, occupationIds: [11, 12], statut: 'envoye', auteur: { libelle: 'Arno Test' } });
  });
  it('un échec est journalisé en échec', async () => {
    await journaliserMailTachePrevisite(1, 'previsite_reponse', { ...MESSAGE, objet: 'Pré-visite du 20/11 acceptée par Claire Test' }, { ok: false, motif: 'refusé' });
    expect((journaliserAvis.mock.calls[0] as [unknown, { statut: string; erreur: string }])[1]).toMatchObject({ statut: 'echec', erreur: 'refusé' });
  });
  it('une autre tâche : rien, aucune requête', async () => {
    await journaliserMailTachePrevisite(1, 'previsite_invitation', MESSAGE, { ok: true, id: 'g', factice: true });
    expect(journaliserAvis).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});
