import { describe, it, expect, vi } from 'vitest';

// On n'importe QUE la constante SQL ; db/client est neutralisé (aucune connexion).
vi.mock('../db/client', () => ({ query: vi.fn(), withTransaction: vi.fn() }));
import { SQL_DOSSIERS_DEJA_DEMANDES, diagnostiquer } from './demandeRepo';
import { proposerLots, type CandidatDossier, type ParamsLot } from './demande';

/**
 * Q3-B — la requête qui alimente `dejaRattaches` encode la règle « soldé sans documents → revient au stock », SANS jamais
 * faire revenir un dossier OBTENU. On PROUVE la règle par FRAGMENTS sémantiques (jamais la forme exacte du SQL), et la
 * CONSÉQUENCE (revient → proposable + bon bucket) par le chemin PUR partagé proposerLots/diagnostiquer.
 * La sémantique end-to-end des 7 situations est prouvée sur VRAIE base par `demandeRepoDejaDemandes.itest.ts`.
 */
const n = SQL_DOSSIERS_DEJA_DEMANDES.replace(/\s+/g, ' ');

describe('Q3-B — SQL_DOSSIERS_DEJA_DEMANDES : la règle est encodée', () => {
  it('ne retient que des rattachements ACTIFs, dossier_id DISTINCT', () => {
    expect(n).toContain('SELECT DISTINCT dd.dossier_id');
    expect(n).toContain('FROM demande_dossier dd JOIN demande d ON d.id = dd.demande_id');
    expect(n).toContain('WHERE dd.actif');
  });
  it('INVARIANT obtenu : satisfait_le (rattachement actif) OU dossier_document → compte TOUJOURS', () => {
    expect(n).toContain('s.dossier_id = dd.dossier_id AND s.actif AND s.satisfait_le IS NOT NULL');
    expect(n).toContain('FROM dossier_document doc WHERE doc.dossier_id = dd.dossier_id');
  });
  it('soldé sans documents : demande close OU triage refus_mairie ne comptent plus (sauf obtenu)', () => {
    expect(n).toContain("d.statut <> 'close'");
    expect(n).toContain("dd.triage IS DISTINCT FROM 'refus_mairie'");
  });
});

// Consommation PARTAGÉE : proposerLots ET diagnostiquer lisent le MÊME `dejaRattaches`. Un dossier REVENU (absent du set)
//   redevient proposable et n'est PAS compté « déjà rattaché » ; un dossier encore rattaché reste exclu et bien bucketé.
const P: ParamsLot = { dateMin: '2000-01-01', dossiersParDemande: 5, permisParCommuneParMois: 10 };
function cand(over: Partial<CandidatDossier> = {}): CandidatDossier {
  return {
    dossierId: 1, codeInsee: '75056', communeNom: 'Paris', canal: 'formulaire', etatDau: '2',
    absentDuDernierMillesime: false, dateReelleAutorisation: '2024-05-01', ...over,
  } as CandidatDossier;
}

describe('Q3-B — conséquence : un permis revenu (absent de dejaRattaches) redevient proposable + bon bucket', () => {
  it('absent du set → proposé dans un lot ; présent → exclu et compté « déjà rattaché »', () => {
    const c = cand({ dossierId: 42 });
    const vide = { dejaRattaches: new Set<number>(), permisCeMoisParCommune: new Map<string, number>() };
    const rattache = { dejaRattaches: new Set<number>([42]), permisCeMoisParCommune: new Map<string, number>() };
    // revenu (absent) → proposable
    expect(proposerLots([c], P, vide)).toHaveLength(1);
    expect(diagnostiquer([c], vide, P).dossiersDejaRattaches).toBe(0);
    // encore rattaché (présent) → exclu, bucket « déjà rattaché »
    expect(proposerLots([c], P, rattache)).toHaveLength(0);
    expect(diagnostiquer([c], rattache, P).dossiersDejaRattaches).toBe(1);
  });
});
