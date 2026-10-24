import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Apporteur } from './suivi/suivi';
import {
  type ActiviteCalcul, cumulApporteur, duAfficheApporteurCentimes, gestionRecurrenteParAnnee, recurrentParMois, totauxApporteurs,
} from './suivi/tableauBord';
import { detailDossier } from './suivi/detailDossier';

/**
 * 🔴 Arno (25/10/2026) — LE CALCUL MENSUEL POSÉ SUR LES DOSSIERS (base SIMULÉE, lecture seule) :
 *   · seuls les dossiers SAISIS dans l'outil, « Récurrent », avec un bail connu, le reçoivent ; les montants IMPORTÉS restent tels quels ;
 *   · le dû, le Cumul de l'apporteur, le détail du dossier et le cumul « tous biens » le lisent, et tombent juste au centime.
 * Données fictives.
 */
const ici = vi.hoisted(() => ({ baux: [] as Record<string, unknown>[], indices: [] as Record<string, unknown>[] }));
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({
  query: async (sql: string) => {
    if (sql.includes('FROM gestion_location_indice')) return { rows: ici.indices, rowCount: ici.indices.length };
    if (sql.includes('FROM gestion_bail b')) return { rows: ici.baux, rowCount: ici.baux.length };
    return { rows: [], rowCount: 0 };
  },
  withTransaction: vi.fn(),
}));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));

const { enrichirGestionMensuelle } = await import('./gestionMensuelleRepo');

const RECURRENT: Apporteur = { id: 3, nom: 'Kin Immo', type: 'agence', archive: false, collegues: [],
  baremes: [{ depuis: '2024-01-01', taux: 0.1, coutFixeMensuel: 0, mode: 'recurrent', tauxGestion: 0.1, dureeAnnees: 3 }] };
const ligne = (p: Partial<ActiviteCalcul & { lotId: number; bailId: number; source: string }> = {}): ActiviteCalcul & { lotId: number; bailId: number; source: string } => ({
  id: 1, type: 'bail', dateSignature: '2024-03-15', libelleProprietaire: 'P', libelleLocataire: 'L', honoProprietaireHt: 600, honoLocataireHt: 400,
  primeSaisie: null, mandatGestion: true, categoriePrime: null, apporteurId: 3, apporteurNom: 'Kin Immo', apporteurTaux: null, commissionSaisie: null,
  negociateurId: 5, negociateurLibelle: 'N', avecGestion: false, origineProprietaire: null, origineLocataire: null, loyerHc: 1000, charges: 100,
  assurance: null, parking: false, vacanceJours: null, rattachement: 'rattache', tauxGestionBien: 6, finGestion: null, lotId: 7, bailId: 1, source: 'saisie', ...p,
});
const BAIL = { id: '1', lot_id: '7', entree: '2024-03-15', sortie: null, libelle: '3 rue Fictive', taux_bien: null, locataires: 'DURAND Léa',
  loyer_hc: '1000', provisions: '100', base: 'cc', taux: '6', indice_type: 'irl', indice_annee: 2023, indice_trimestre: 4, revision_le: '2025-03-15',
  revises: [{ effet: '2025-06-01', hc: '1100', prov: '120' }] };
const AUJ = '2025-12-20';

beforeEach(() => {
  ici.baux = [BAIL];
  ici.indices = [{ type: 'irl', annee: 2023, trimestre: 4, valeur: '140' }, { type: 'irl', annee: 2024, trimestre: 4, valeur: '144.2' }];
});

describe('🔴 le calcul mensuel posé sur les dossiers', () => {
  it('un dossier IMPORTÉ ne le reçoit jamais : ses montants restent exactement ceux d’avant', async () => {
    const importe = ligne({ id: 2, source: 'import', commissionSaisie: 250 });
    const avant = duAfficheApporteurCentimes(importe, [RECURRENT], AUJ);
    const activites = [importe];
    await enrichirGestionMensuelle(activites, [RECURRENT], AUJ);
    expect(importe.gestionMensuelle).toBeUndefined();
    expect(duAfficheApporteurCentimes(importe, [RECURRENT], AUJ)).toBe(avant);
  });

  it('un dossier saisi « Récurrent » : le mois du bien (révision, loyer réel « réel »), et le dû le lit', async () => {
    const a = ligne();
    await enrichirGestionMensuelle([a], [RECURRENT], AUJ);
    const gm = a.gestionMensuelle!;
    expect(gm.libelle).toBe('3 rue Fictive');
    const mois = new Map(gm.mois.map((m) => [m.mois, m]));
    expect(mois.get('2024-04')).toMatchObject({ loyerCc: 1100, source: 'entree', honoraires: 66, commission: 6.6 });
    expect(mois.get('2025-04')).toMatchObject({ loyerHc: 1030, source: 'calcule' });
    expect(mois.get('2025-07')).toMatchObject({ loyerHc: 1100, provisions: 120, loyerCc: 1220, source: 'reel', honoraires: 73.2, commission: 7.32 });
    const parMois = recurrentParMois(a, [RECURRENT], AUJ);
    expect(parMois.get('2025-07')).toBe(7.32);
    expect([...parMois.keys()].at(-1)).toBe('2025-12');
  });

  it('un dossier « One shot » (ou sans apporteur) n’en reçoit pas ; un bien sans bail non plus', async () => {
    const one = ligne({ apporteurMode: 'one_shot' });
    const sans = ligne({ id: 3, apporteurId: null });
    const autre = ligne({ id: 4, lotId: 99 });
    await enrichirGestionMensuelle([one, sans, autre], [RECURRENT], AUJ);
    expect([one.gestionMensuelle, sans.gestionMensuelle, autre.gestionMensuelle]).toEqual([undefined, undefined, undefined]);
  });

  it('le Cumul de l’apporteur, le détail du dossier, la carte et le cumul « tous biens » : la même somme, au centime', async () => {
    const a = ligne();
    await enrichirGestionMensuelle([a], [RECURRENT], AUJ);
    const somme = (l: readonly { commission: number }[]): number => l.reduce((t, m) => t + Math.round(m.commission * 100), 0);
    const attendu = somme(a.gestionMensuelle!.mois.filter((m) => m.mois <= '2025-12'));
    const cumul = cumulApporteur([a], [RECURRENT], 3, AUJ);
    const an2025 = cumul.parAnnee.find((y) => y.annee === 2025)!;
    const an2024 = cumul.parAnnee.find((y) => y.annee === 2024)!;
    expect(Math.round((an2024.gestionRecurrente.commission + an2025.gestionRecurrente.commission) * 100)).toBe(attendu);
    const det = detailDossier(a, [RECURRENT], AUJ)!;
    expect(Math.round(det.apporteur.gestion!.montant * 100)).toBe(attendu);
    expect(det.mensuel?.mois.length).toBe(22);
    const tous = gestionRecurrenteParAnnee([a], [RECURRENT], AUJ);
    expect(tous.map((x) => x.annee)).toEqual([2025, 2024]);
    expect(Math.round(tous.reduce((t, x) => t + x.total.commission, 0) * 100)).toBe(attendu);
    expect(tous[0].lignes[0]).toMatchObject({ apporteurId: 3, nom: 'Kin Immo' });
    // La carte de l'annuaire : la part location + la part gestion récurrente, au centime.
    expect(Math.round(totauxApporteurs([a], [RECURRENT], AUJ)[3].commission * 100)).toBe(10000 + attendu);
  });
});
