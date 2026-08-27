import { describe, it, expect, vi } from 'vitest';

// On n'importe QUE la constante SQL ; db/client est neutralisé (aucune connexion).
vi.mock('../db/client', () => ({ query: vi.fn(), withTransaction: vi.fn() }));
import { SQL_DOSSIERS_DEJA_DEMANDES, SQL_PERMIS_CE_MOIS_PAR_COMMUNE, diagnostiquer } from './demandeRepo';
import { proposerLots, dateLiberationQuota, type CandidatDossier, type ParamsLot } from './demande';

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

// R2-fix2 — le plafond mensuel ne compte QUE les permis ACTIFS distincts. On prouve la RÈGLE par fragments (jamais la forme
//   exacte) ; la conséquence en base (détaché exclu, déplacé compté une fois) est prouvée par demandeRepoDejaDemandes.itest.ts.
const m = SQL_PERMIS_CE_MOIS_PAR_COMMUNE.replace(/\s+/g, ' ');
describe('R2-fix2 — SQL_PERMIS_CE_MOIS_PAR_COMMUNE : le comptage du plafond est corrigé', () => {
  it('ne compte que les rattachements ACTIFS et des dossiers DISTINCTS', () => {
    expect(m).toContain('dd.actif');
    expect(m).toContain('count(DISTINCT dd.dossier_id)');
  });
  it('ne retient que les demandes RÉELLEMENT PARTIES, sur le mois calendaire de création', () => {
    expect(m).toContain("d.statut IN ('envoyee', 'close')");
    expect(m).toContain("date_trunc('month', d.cree_le) = date_trunc('month', now())");
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

describe('D2/Part 5 — diagnostiquer NOMME les communes au plafond (fin du décompte anonyme « soirée Paris »)', () => {
  it('commune au plafond → NOMMÉE avec consommé/plafond + canal (scope process)', () => {
    const c = cand({ dossierId: 7, codeInsee: '75056', communeNom: 'Paris', canal: 'formulaire' });
    const hist = { dejaRattaches: new Set<number>(), permisCeMoisParCommune: new Map<string, number>([['75056', 10]]) };
    expect(proposerLots([c], P, hist)).toHaveLength(0); // 10/10 → aucun lot
    const d = diagnostiquer([c], hist, P);
    expect(d.communesPlafondMensuel).toBe(1);
    expect(d.communesAuPlafond).toEqual([{ codeInsee: '75056', nom: 'Paris', consomme: 10, plafond: 10, canal: 'formulaire' }]);
  });
  it('sous le plafond → non listée (aucun faux positif)', () => {
    const c = cand({ dossierId: 8, codeInsee: '75056' });
    const hist = { dejaRattaches: new Set<number>(), permisCeMoisParCommune: new Map<string, number>([['75056', 3]]) };
    expect(diagnostiquer([c], hist, P).communesAuPlafond).toEqual([]);
  });
});

describe('D4-bis — surcharges de préparation PAR RAIL (byte-identique quand rien surchargé)', () => {
  const teleC = (over: Partial<CandidatDossier> = {}) => cand({ codeInsee: '75056', communeNom: 'Paris', canal: 'formulaire', ...over }); // téléservice
  const emailC = (over: Partial<CandidatDossier> = {}) => cand({ codeInsee: '92050', communeNom: 'Nanterre', canal: 'email', ...over });   // e-mail
  const histVide = { dejaRattaches: new Set<number>(), permisCeMoisParCommune: new Map<string, number>() };

  // 🔴 BYTE-IDENTIQUE (invariant V2/ORDRE_HISTORIQUE) : surcharges NULL/absentes ⇒ MÊMES lots qu'avec les seuls réglages communs.
  it('surcharges null/absentes ⇒ proposerLots byte-identique', () => {
    const cands = [emailC({ dossierId: 1 }), emailC({ dossierId: 2 }), teleC({ dossierId: 3 }), teleC({ dossierId: 4 })];
    const attendu = proposerLots(cands, P, histVide);
    expect(proposerLots(cands, { ...P, teleserviceDossiersParDemande: null, teleservicePermisParCommuneParMois: null }, histVide)).toEqual(attendu);
    expect(proposerLots(cands, { ...P, teleserviceDossiersParDemande: undefined, teleservicePermisParCommuneParMois: undefined }, histVide)).toEqual(attendu);
  });
  it('surcharge téléservice ÉGALE à la valeur commune ⇒ byte-identique', () => {
    const cands = [teleC({ dossierId: 3 })];
    expect(proposerLots(cands, { ...P, teleserviceDossiersParDemande: P.dossiersParDemande, teleservicePermisParCommuneParMois: P.permisParCommuneParMois }, histVide))
      .toEqual(proposerLots(cands, P, histVide));
  });

  it('la surcharge PLAFOND n’agit QUE sur le rail téléservice (formulaire), jamais e-mail', () => {
    const P2 = { ...P, teleservicePermisParCommuneParMois: 1 }; // téléservice plafonné à 1 ; commun = 10
    // Paris (formulaire) : 1 permis déjà ce mois → plafond téléservice 1 − 1 = quota 0 → aucun lot.
    expect(proposerLots([teleC({ dossierId: 3 })], P2, { dejaRattaches: new Set<number>(), permisCeMoisParCommune: new Map([['75056', 1]]) })).toHaveLength(0);
    // Nanterre (e-mail) : la surcharge téléservice est IGNORÉE → plafond commun 10 → lot produit.
    expect(proposerLots([emailC({ dossierId: 5 })], P2, histVide).length).toBeGreaterThan(0);
  });

  it('la surcharge DOSSIERS change le découpage sur formulaire seulement', () => {
    const cands = [teleC({ dossierId: 1 }), teleC({ dossierId: 2 }), teleC({ dossierId: 3 })]; // 3 dossiers Paris
    expect(proposerLots(cands, P, histVide)).toHaveLength(1);                                   // commun dossiersParDemande=5 → 1 lot de 3
    expect(proposerLots(cands, { ...P, teleserviceDossiersParDemande: 1 }, histVide)).toHaveLength(3); // surcharge 1 → 3 lots de 1
  });

  it('diagnostiquer — le plafond NOMMÉ reflète la surcharge téléservice', () => {
    const d = diagnostiquer([teleC({ dossierId: 3 })], { dejaRattaches: new Set<number>(), permisCeMoisParCommune: new Map([['75056', 1]]) }, { ...P, teleservicePermisParCommuneParMois: 1 });
    expect(d.communesAuPlafond).toEqual([{ codeInsee: '75056', nom: 'Paris', consomme: 1, plafond: 1, canal: 'formulaire' }]);
  });
});

describe('D2/Part 5 — dateLiberationQuota = 1er du mois suivant', () => {
  it('JJ/MM/AAAA du 1er du mois d’après', () => {
    expect(dateLiberationQuota(new Date(2026, 7, 15))).toBe('01/09/2026'); // 15 août → 1er sept
    expect(dateLiberationQuota(new Date(2026, 11, 20))).toBe('01/01/2027'); // décembre → janvier suivant
  });
});
