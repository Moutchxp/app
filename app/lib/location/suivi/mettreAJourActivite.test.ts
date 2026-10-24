import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (24/10/2026) — « Dossier de location » : la LIGNE de suivi existante est mise à jour par son identifiant ; jamais une
 * seconde ligne (aucun INSERT), les mêmes vérifications que la saisie. Base simulée : rien n'est écrit.
 */
vi.mock('server-only', () => ({}));
const appels: { sql: string; params: unknown[] }[] = [];
let ligneExiste = true;
const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  appels.push({ sql: s, params });
  if (s.startsWith('SELECT id FROM gestion_location_activite WHERE id = $1 AND annule_le IS NULL FOR UPDATE')) return { rows: ligneExiste ? [{ id: String(params[0]) }] : [] };
  if (s.includes('FROM admin_utilisateur')) return { rows: [{ libelle: 'Jean-Baptiste Pons' }] };
  if (s.includes('FOR UPDATE')) return { rows: [{ apporteur_id: null, lot_id: '51' }] };
  if (s.includes('FROM gestion_location_apporteur a')) return { rows: [{ archive: false, rattache: true }] };
  if (s.startsWith('SELECT count(*)') || s.includes('information_schema')) return { rows: [{ n: 1 }] };
  return { rows: [], rowCount: 1 };
});
vi.mock('../../db/client', () => ({ query, withTransaction: async (f: (q: typeof query) => unknown) => f(query) }));
vi.mock('../sondeLocation', () => ({ colonneExisteMemo: async () => true }));
const { mettreAJourActivite } = await import('./suiviRepo');

const auteur = { id: 5, libelle: 'jb.pons@exemple.fr' };
const suivi = {
  type: 'bail', dateSignature: '2026-09-01', honoProprietaireHt: '567,38', honoLocataireHt: '567,38', negociateurId: 3, apporteurId: null, apporteurTaux: '',
  mandatGestion: false, avecGestion: true, origineProprietaire: null, origineLocataire: null, origineContact: 'relocation', collegueId: null,
  commissionApporteur: '', primeMode: 'aucune', primeMontant: '', origineContactPrecision: '', apporteurMode: null, apporteurTauxGestion: '', categoriePrime: 'logement',
};
beforeEach(() => { appels.length = 0; ligneExiste = true; });

describe('🔴 mettreAJourActivite — la même ligne, jamais une seconde', () => {
  it('met à jour la ligne par son identifiant ; aucun INSERT', async () => {
    expect(await mettreAJourActivite(100, suivi, auteur)).toEqual({ etat: 'ok' });
    expect(appels.some((a) => a.sql.startsWith('INSERT INTO gestion_location_activite'))).toBe(false);
    const u = appels.find((a) => a.sql.startsWith('UPDATE gestion_location_activite SET type = $2'))!;
    expect(u.sql).toContain('WHERE id = $1');
    expect(u.params.slice(0, 6)).toEqual([100, 'bail', '2026-09-01', 567.38, 567.38, 3]);
    expect(u.params[6]).toBe('Jean-Baptiste Pons');
  });
  it('une ligne disparue (annulée) : refus, rien n’est écrit', async () => {
    ligneExiste = false;
    expect(await mettreAJourActivite(100, suivi, auteur)).toEqual({ etat: 'refus', motif: 'Cette ligne du suivi n’existe plus.' });
    expect(appels.some((a) => a.sql.startsWith('UPDATE'))).toBe(false);
  });
  it('les refus de la saisie s’appliquent tels quels (cases exclusives, origine obligatoire)', async () => {
    expect((await mettreAJourActivite(100, { ...suivi, mandatGestion: true }, auteur)).etat).toBe('refus');
    expect(await mettreAJourActivite(100, { ...suivi, origineContact: null, avecGestion: false }, auteur)).toEqual({ etat: 'refus', motif: 'L’origine du contact est obligatoire.' });
  });
});
