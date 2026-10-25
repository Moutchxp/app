import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (25/10/2026) — « Conséquences de la modification » : calculées par le serveur SANS RIEN ÉCRIRE ; les lignes sensibles réservées aux
 * administrateurs ; l'enregistrement écrit le RÉSUMÉ de ces conséquences au journal. Base et dépôts simulés.
 */
vi.mock('server-only', () => ({}));
const ecrits: string[] = [];
vi.mock('../../db/client', () => ({
  query: vi.fn(async (sql: string) => { ecrits.push(sql.replace(/\s+/g, ' ')); return { rows: [{ date_signature: '2026-03-10' }] }; }),
  withTransaction: vi.fn(),
}));
const ligne = { id: 41, type: 'bail', dateSignature: '2026-03-10', libelleProprietaire: 'P', libelleLocataire: 'L', honoProprietaireHt: 600, honoLocataireHt: 400, primeSaisie: null,
  mandatGestion: false, categoriePrime: 'logement', apporteurId: 7, apporteurNom: 'Léa Dupont', apporteurTaux: 0.2, commissionSaisie: null, negociateurId: 3, negociateurLibelle: 'JB',
  avecGestion: false, origineProprietaire: 'nouveau', origineLocataire: 'nouveau', loyerHc: 900, charges: 100, assurance: null, parking: false, vacanceJours: null,
  rattachement: 'rattache', origineContact: 'apporteur', lotId: 1, bailId: 5, source: 'saisie' };
vi.mock('./tableauBordRepo', () => ({ donneesTableau: async () => ({ activites: [ligne], apporteurs: [{ id: 7, nom: 'Léa Dupont', type: 'partenaire', archive: false, compteId: null,
  baremes: [{ depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: 0, mode: 'one_shot', tauxGestion: 0 }], collegues: [], remunerations: [] }],
  regles: [{ depuis: '2019-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }], retrocessions: [], recurrents: [], collegues: [], aujourdhui: '2026-03-31' }) }));
const modifier = vi.fn(async (..._a: unknown[]) => ({ etat: 'ok', data: { mot: 'Internet' } }));
vi.mock('../origineProprietaireRepo', () => ({ modifierOrigineActivite: (...a: unknown[]) => modifier(...a) }));
const { simulerOrigineActivite, enregistrerOrigineActivite } = await import('./origineConsequencesRepo');
beforeEach(() => { ecrits.length = 0; modifier.mockClear(); });

describe('🔴 les conséquences côté serveur', () => {
  it('SANS RIEN ÉCRIRE : seulement des lectures', async () => {
    const r = await simulerOrigineActivite(41, { origineContact: 'internet' }, true);
    expect(r.etat).toBe('ok');
    expect(ecrits.every((s) => s.trimStart().startsWith('SELECT'))).toBe(true);
  });
  it('un non-administrateur ne reçoit AUCUNE ligne sensible (variable, net)', async () => {
    const admin = await simulerOrigineActivite(41, { origineContact: 'internet' }, true);
    const autre = await simulerOrigineActivite(41, { origineContact: 'internet' }, false);
    if (admin.etat !== 'ok' || autre.etat !== 'ok') throw new Error('refus');
    expect(admin.data.lignes.some((l) => l.sensible)).toBe(true);
    expect(autre.data.lignes.some((l) => l.sensible)).toBe(false);
  });
  it('l’enregistrement passe le RÉSUMÉ des conséquences au journal (avec la modification)', async () => {
    await enregistrerOrigineActivite(41, { origineContact: 'internet' }, 'apporteur|||', { id: 2, libelle: 'Arnaud Jorel' }, true);
    const resume = modifier.mock.calls[0][4] as string;
    expect(resume).toContain('Origine — Origine du contact : Apporteur d’affaires → Internet');
    expect(resume).toContain('Résultat du mois — Honoraires d’apporteurs');
  });
  it('une origine incomplète : refusée, rien n’est calculé ni écrit', async () => {
    expect(await simulerOrigineActivite(41, { origineContact: 'apporteur' }, true)).toMatchObject({ etat: 'refus' });
    await enregistrerOrigineActivite(41, { origineContact: 'apporteur' }, 'x', { id: 2, libelle: 'Arnaud Jorel' }, true);
    expect(modifier).not.toHaveBeenCalled();
  });
});
