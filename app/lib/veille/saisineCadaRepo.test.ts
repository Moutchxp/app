import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * X2 — dépôt de la saisine CADA. Lectures INJECTÉES (pas de DB pour l'éligibilité/création) ; l'ÉCRITURE passe par le
 * withTransaction mocké. On mocke aussi query pour tester le SQL des candidats (fragments sémantiques, jamais la forme
 * complète). Protocole : comportement + paramètres liés.
 */
const { appels, etat, queryMock, withTransactionMock } = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const etat = { rows: [] as unknown[], insertThrows: null as null | { code?: string; constraint?: string }, insertedId: 99, deposeRows: [{ demande_id: 42 }] as unknown[], avisRows: [{ demande_id: 42 }] as unknown[] };
  const queryMock = async (sql: string, params?: unknown[]) => { appels.push({ sql, params: params ?? [] }); return { rows: etat.rows }; };
  const withTransactionMock = async (fn: (q: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) => Promise<unknown>) => {
    const q = async (sql: string, params?: unknown[]) => {
      appels.push({ sql, params: params ?? [] });
      if (/INSERT INTO demande_relance/i.test(sql)) {
        if (etat.insertThrows) { const e = new Error('dup'); Object.assign(e, etat.insertThrows); throw e; }
        return { rows: [{ id: etat.insertedId }] };
      }
      if (/UPDATE demande_relance SET statut = 'envoyee'/i.test(sql) && /RETURNING demande_id/i.test(sql)) return { rows: etat.deposeRows }; // marquerSaisineDeposee
      if (/UPDATE demande_relance SET avis_recu_le/i.test(sql) && /RETURNING demande_id/i.test(sql)) return { rows: etat.avisRows }; // enregistrerAvisSaisine
      return { rows: [] };
    };
    return fn(q);
  };
  return { appels, etat, queryMock, withTransactionMock };
});
vi.mock('../db/client', () => ({ query: queryMock, withTransaction: withTransactionMock, pool: {}, closePool: async () => undefined }));

import {
  lireSaisinesEligibles, creerSaisineCada, marquerSaisineDeposee, enregistrerAvisSaisine, SENS_AVIS, chargerConfirmationCada, depsReellesSaisissables, SaisineCadaError, AucunDossierAcquisError,
  type DepsSaisissables, type DepsCreerSaisine, type CandidatSaisine, type DepsConfirmation, type LigneConfirmationDB,
} from './saisineCadaRepo';
import { piecesDepuisConfig, type ConfigDemandeur, type Lot, type CandidatDossier } from '../sitadel/demande';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const trouver = (re: RegExp) => appels.find((a) => re.test(a.sql));
beforeEach(() => { appels.length = 0; etat.rows = []; etat.insertThrows = null; etat.insertedId = 99; etat.deposeRows = [{ demande_id: 42 }]; etat.avisRows = [{ demande_id: 42 }]; });

// Repères temporels : envoi 14 mars → refus tacite 14 avril → forclusion 14 juin.
const ENVOI = new Date('2026-03-14T10:00:00Z');
const DANS_FENETRE = new Date('2026-05-10T12:00:00Z');   // entre 14 avr et 14 juin
const AVANT_REFUS = new Date('2026-04-01T12:00:00Z');
const APRES_FORCLUSION = new Date('2026-07-01T12:00:00Z');
const RELEVE_FRAICHE = new Date('2026-05-10T06:00:00Z'); // 6 h avant → fraîche (48 h)
const RELEVE_VIEILLE = new Date('2026-04-01T00:00:00Z'); // trop ancienne

const DOSSIER: CandidatDossier = { dossierId: 1, codeInsee: '92004', communeNom: 'Asnières-sur-Seine', canal: 'email', numDau: 'PC0920042500001', dateReelleAutorisation: '2025-06-15', adresse: '12 rue de la Paix', codePostal: '92600', cadastre: ['AB 12'], etatDau: null, absentDuDernierMillesime: false };
const LOT: Lot = { codeInsee: '92004', communeNom: 'Asnières-sur-Seine', canal: 'email', dossiers: [DOSSIER] };
const PIECES = piecesDepuisConfig('PC2,PC3');
const CONF_ENT: ConfigDemandeur = { raisonSociale: 'Criterimmo', formeJuridique: 'SARL', siegeAdresse: '191 avenue Charles de Gaulle 92200 Neuilly', representantNom: 'Arnaud JOREL', representantQualite: 'gérant', emailContact: 'a.jorel@sansvisavis.com', telephone: '' };

const CAND = (over: Partial<CandidatSaisine> = {}): CandidatSaisine => ({ demandeId: 1, reference: 'SVAV-DEM-2026-000042', communeNom: 'Asnières-sur-Seine', profil: 'entreprise', envoyeLe: ENVOI, dossiersActifs: 2, dossiersDus: 1, refusExpres: [], ...over });
function depsElig(over: Partial<DepsSaisissables> = {}): DepsSaisissables {
  return { lireCandidats: async () => [CAND()], derniereReleveOkLe: async () => RELEVE_FRAICHE, fraicheurHeures: async () => 48, maintenant: () => DANS_FENETRE, ...over };
}
function depsCreer(over: Partial<DepsCreerSaisine> = {}): DepsCreerSaisine {
  return {
    lireMeta: async () => ({ statut: 'envoyee', reference: 'SVAV-DEM-2026-000042', communeNom: 'Asnières-sur-Seine', profil: 'entreprise', envoyeLe: ENVOI, saisineVivante: false, dusRefus: [] }),
    chargerContexte: async () => ({ reglages: { echeanceAlerteJours: 7, releveFraicheurHeures: 48 }, cascade: { rappelJoursAvant: 10, avisJoursAvant: 3, saisineDelaiJours: 4 }, profil: 'entreprise', config: CONF_ENT, pieces: PIECES, adresseReponse: 'a.jorel@sansvisavis.com' }),
    chargerLot: async () => ({ lot: LOT, satisfaitsIds: [] }),
    derniereReleveOkLe: async () => RELEVE_FRAICHE,
    maintenant: () => DANS_FENETRE,
    ...over,
  };
}

describe('X2 — lireSaisinesEligibles : fenêtre + sincérité (relève fraîche)', () => {
  it('fenêtre ouverte + relève fraîche → SAISISSABLE (avec jours avant forclusion)', async () => {
    const r = await lireSaisinesEligibles(depsElig());
    expect(r.saisissables).toHaveLength(1);
    expect(r.indeterminees).toHaveLength(0);
    expect(r.saisissables[0].joursAvantForclusion).toBeGreaterThan(0);
    expect(r.saisissables[0].dossiersDus).toBe(1);
  });

  it('fenêtre ouverte MAIS relève NON fraîche → INDÉTERMINÉE, jamais saisissable (silence non vérifié)', async () => {
    const r = await lireSaisinesEligibles(depsElig({ derniereReleveOkLe: async () => RELEVE_VIEILLE }));
    expect(r.saisissables).toHaveLength(0);
    expect(r.indeterminees).toHaveLength(1);
  });

  it('relève jamais faite (null) → INDÉTERMINÉE', async () => {
    const r = await lireSaisinesEligibles(depsElig({ derniereReleveOkLe: async () => null }));
    expect(r.saisissables).toHaveLength(0);
    expect(r.indeterminees).toHaveLength(1);
  });

  it('avant le refus tacite → écartée (ni saisissable ni indéterminée)', async () => {
    const r = await lireSaisinesEligibles(depsElig({ maintenant: () => AVANT_REFUS }));
    expect(r.saisissables).toHaveLength(0);
    expect(r.indeterminees).toHaveLength(0);
  });

  it('après forclusion → écartée', async () => {
    const r = await lireSaisinesEligibles(depsElig({ maintenant: () => APRES_FORCLUSION, derniereReleveOkLe: async () => APRES_FORCLUSION }));
    expect(r.saisissables).toHaveLength(0);
    expect(r.indeterminees).toHaveLength(0);
  });

  it('T1 — un REFUS EXPRÈS rend la demande saisissable AVANT l’échéance tacite (ancre effective), voie=refus_expres + exclus comptés', async () => {
    // envoi 1er mai (tacite = 1er juin, FUTUR au 10 mai) → sans refus exprès : PAS ouverte.
    const cand: CandidatSaisine = { demandeId: 1, reference: 'SVAV-DEM-2026-000042', communeNom: 'Asnières-sur-Seine', profil: 'entreprise',
      envoyeLe: new Date('2026-05-01T10:00:00Z'), dossiersActifs: 2, dossiersDus: 2, refusExpres: [] };
    const sansRefus = await lireSaisinesEligibles(depsElig({ lireCandidats: async () => [cand] }));
    expect(sansRefus.saisissables).toHaveLength(0); // tacite pas acquis, aucun refus exprès → écartée
    expect(sansRefus.indeterminees).toHaveLength(0);

    // avec 1 refus exprès notifié le 5 mai (acquis au 10 mai) : la fenêtre s'ouvre immédiatement.
    const avecRefus = await lireSaisinesEligibles(depsElig({ lireCandidats: async () => [{ ...cand, refusExpres: [new Date('2026-05-05T00:00:00Z')] }] }));
    expect(avecRefus.saisissables).toHaveLength(1);
    const d = avecRefus.saisissables[0];
    expect(d.voie).toBe('refus_expres');                       // voie distincte du refus tacite
    expect(d.forclusionLe.toISOString()).toBe('2026-07-05T00:00:00.000Z'); // refus exprès (5 mai) + 2 mois
    expect(d.dossiersExclusRefusNonAcquis).toBe(1);            // 2 dus, 1 seul refusé exprès → 1 exclu (refus pas encore acquis)
  });
});

describe('X2 — depsReellesSaisissables : SQL des candidats (fragments sémantiques)', () => {
  it('filtre : envoyee + émission confirmée + dossier dû + AUCUNE saisine vivante', async () => {
    etat.rows = [];
    await depsReellesSaisissables().lireCandidats();
    const sel = trouver(/FROM demande d/i)!;
    const s = norm(sel.sql);
    expect(s).toContain("d.statut = 'envoyee'");
    expect(s).toContain("WHERE statut = 'envoye'");                              // B2 — émission CONFIRMÉE, agnostique au canal (téléservice inclus)
    expect(s).not.toContain("canal = 'email'");                                 // B2 — le filtre e-mail est levé (le dépôt formulaire porte aussi envoye_le)
    expect(s).toContain('dd.actif AND dd.satisfait_le IS NULL');                  // au moins un dossier DÛ
    expect(s).toContain("rl.type = 'saisine_cada' AND rl.statut <> 'abandonnee'"); // pas de saisine vivante
  });
});

describe('X2 — creerSaisineCada : garde-fous + création brouillon + 23505', () => {
  it('happy path → INSERT type=saisine_cada / statut=brouillon (objet+corps figés, profil lié) + journal, renvoie l’id', async () => {
    const id = await creerSaisineCada(42, 'admin', depsCreer());
    expect(id).toBe(99);
    const ins = trouver(/INSERT INTO demande_relance/i)!;
    expect(norm(ins.sql)).toContain("'saisine_cada'");
    expect(norm(ins.sql)).toContain("'brouillon'");
    const [demandeId, objet, corps, profil] = ins.params as [number, string, string, string];
    expect(demandeId).toBe(42);
    expect(objet).toContain('Saisine de la Commission');
    expect(corps).toContain('PC0920042500001'); // le corps figé a bien été généré depuis le lot
    expect(profil).toBe('entreprise');
    const jrn = trouver(/INSERT INTO demande_journal/i)!;
    expect(norm(jrn.sql)).toContain('VALUES ($1, NULL, NULL, $2, $3)'); // append-only : demande.statut jamais écrit
    expect(jrn.params[0]).toBe(42);
  });

  it('T1/Correction 3 — corps limité aux dossiers dont le refus est ACQUIS ; un dus « en silence » est EXCLU (jamais muet)', async () => {
    const D2: CandidatDossier = { ...DOSSIER, dossierId: 2, numDau: 'PC0920042500002' };
    const deps = depsCreer({
      // envoi 1er mai (tacite 1er juin, FUTUR au 10 mai) ; dossier 1 refusé exprès le 5 mai (acquis), dossier 2 encore en silence.
      lireMeta: async () => ({ statut: 'envoyee', reference: 'SVAV-DEM-2026-000042', communeNom: 'Asnières-sur-Seine', profil: 'entreprise',
        envoyeLe: new Date('2026-05-01T10:00:00Z'), saisineVivante: false, dusRefus: [{ dossierId: 1, refusLe: new Date('2026-05-05T00:00:00Z') }] }),
      chargerLot: async () => ({ lot: { ...LOT, dossiers: [DOSSIER, D2] }, satisfaitsIds: [] }),
      maintenant: () => new Date('2026-05-10T12:00:00Z'),
    });
    await creerSaisineCada(42, 'admin', deps);
    const corps = (trouver(/INSERT INTO demande_relance/i)!.params as [number, string, string])[2];
    expect(corps).toContain('PC0920042500001');     // dossier 1 (refus exprès acquis) → DANS le corps
    expect(corps).not.toContain('PC0920042500002'); // dossier 2 (refus pas encore acquis) → EXCLU
  });

  it('T1 — fenêtre ouverte mais AUCUN dossier dus acquis → AucunDossierAcquisError (jamais une saisine prématurée)', async () => {
    const deps = depsCreer({
      // la fenêtre s'ouvre via un refus exprès (dossier 99) mais le lot ne porte qu'un dossier NON acquis → rien à réclamer.
      lireMeta: async () => ({ statut: 'envoyee', reference: 'R', communeNom: 'X', profil: 'entreprise',
        envoyeLe: new Date('2026-05-01T10:00:00Z'), saisineVivante: false, dusRefus: [{ dossierId: 99, refusLe: new Date('2026-05-05T00:00:00Z') }] }),
      chargerLot: async () => ({ lot: { ...LOT, dossiers: [DOSSIER] }, satisfaitsIds: [] }),
      maintenant: () => new Date('2026-05-10T12:00:00Z'),
    });
    await expect(creerSaisineCada(42, 'admin', deps)).rejects.toBeInstanceOf(AucunDossierAcquisError);
    expect(trouver(/INSERT INTO demande_relance/i)).toBeUndefined();
  });

  it('demande non « envoyee » → refus métier, aucune insertion', async () => {
    await expect(creerSaisineCada(42, 'admin', depsCreer({ lireMeta: async () => ({ statut: 'close', reference: 'R', communeNom: 'X', profil: 'entreprise', envoyeLe: ENVOI, saisineVivante: false, dusRefus: [] }) }))).rejects.toBeInstanceOf(SaisineCadaError);
    expect(trouver(/INSERT INTO demande_relance/i)).toBeUndefined();
  });

  it('saisine déjà vivante (pré-contrôle) → refus « déjà en cours »', async () => {
    await expect(creerSaisineCada(42, 'admin', depsCreer({ lireMeta: async () => ({ statut: 'envoyee', reference: 'R', communeNom: 'X', profil: 'entreprise', envoyeLe: ENVOI, saisineVivante: true, dusRefus: [] }) }))).rejects.toThrow(/déjà en cours/i);
  });

  it('avant refus tacite → refus ; après forclusion → refus', async () => {
    await expect(creerSaisineCada(42, 'admin', depsCreer({ maintenant: () => AVANT_REFUS }))).rejects.toThrow(/refus tacite/i);
    await expect(creerSaisineCada(42, 'admin', depsCreer({ maintenant: () => APRES_FORCLUSION }))).rejects.toThrow(/forclos/i);
  });

  it('relève non fraîche → refus (silence non vérifié), aucune insertion', async () => {
    await expect(creerSaisineCada(42, 'admin', depsCreer({ derniereReleveOkLe: async () => RELEVE_VIEILLE }))).rejects.toThrow(/silence non vérifié/i);
    expect(trouver(/INSERT INTO demande_relance/i)).toBeUndefined();
  });

  it('tous les dossiers satisfaits → refus', async () => {
    await expect(creerSaisineCada(42, 'admin', depsCreer({ chargerLot: async () => ({ lot: LOT, satisfaitsIds: [1] }) }))).rejects.toThrow(/satisfaits/i);
  });

  it('23505 sur demande_relance_vivante_uniq (double-clic) → refus métier NOMMÉ, jamais un 503', async () => {
    etat.insertThrows = { code: '23505', constraint: 'demande_relance_vivante_uniq' };
    await expect(creerSaisineCada(42, 'admin', depsCreer())).rejects.toBeInstanceOf(SaisineCadaError);
    await expect(creerSaisineCada(42, 'admin', depsCreer())).rejects.toThrow(/déjà en cours/i);
  });

  it('23505 sur une AUTRE contrainte → n’est PAS masquée (relancée telle quelle)', async () => {
    etat.insertThrows = { code: '23505', constraint: 'autre_chose' };
    await expect(creerSaisineCada(42, 'admin', depsCreer())).rejects.not.toBeInstanceOf(SaisineCadaError);
  });
});

describe('X3 — marquerSaisineDeposee : dépôt manuel (envoyee sans acheminement, refus hors brouillon)', () => {
  it('brouillon → statut envoyee + envoyee_le (garde brouillon) + journal, AUCUNE ligne d’acheminement', async () => {
    etat.deposeRows = [{ demande_id: 42 }];
    await marquerSaisineDeposee(7, 'admin');
    const upd = trouver(/UPDATE demande_relance SET statut = 'envoyee'/i)!;
    const s = norm(upd.sql);
    expect(s).toContain('envoyee_le = now()');
    expect(s).toContain("type = 'saisine_cada'");
    expect(s).toContain("statut = 'brouillon'"); // garde : seule une saisine en brouillon
    expect(upd.params).toEqual([7]);
    const jrn = trouver(/INSERT INTO demande_journal/i)!;
    expect(norm(jrn.sql)).toContain('VALUES ($1, NULL, NULL, $2, $3)'); // append-only, demande.statut jamais écrit
    expect(jrn.params[0]).toBe(42);
    expect(String(jrn.params[1])).toMatch(/formulaire/i);
    expect(trouver(/INSERT INTO demande_acheminement/i)).toBeUndefined(); // aucune émission à prouver
  });

  it('saisine non-brouillon (0 ligne mise à jour) → refus métier, aucun journal', async () => {
    etat.deposeRows = [];
    await expect(marquerSaisineDeposee(7, 'admin')).rejects.toBeInstanceOf(SaisineCadaError);
    expect(trouver(/INSERT INTO demande_journal/i)).toBeUndefined();
  });
});

describe('X4 — enregistrerAvisSaisine : avis CADA (garde envoyee, sens en liste fermée, journal)', () => {
  it('SENS_AVIS = liste fermée (miroir du CHECK avis_sens)', () => {
    expect(SENS_AVIS).toEqual(['favorable', 'defavorable', 'sans_suite']);
  });

  it('saisine envoyée → avis_recu_le + avis_sens (garde envoyee) + journal, sens en paramètre LIÉ, demande.statut jamais écrit', async () => {
    etat.avisRows = [{ demande_id: 42 }];
    await enregistrerAvisSaisine(7, 'defavorable', 'admin');
    const upd = trouver(/UPDATE demande_relance SET avis_recu_le/i)!;
    const s = norm(upd.sql);
    expect(s).toContain('avis_recu_le = now()');
    expect(s).toContain('avis_sens = $2');
    expect(s).toContain("type = 'saisine_cada'");
    expect(s).toContain("statut = 'envoyee'"); // garde : seule une saisine envoyée peut recevoir un avis
    expect(upd.params).toEqual([7, 'defavorable']); // sens LIÉ, jamais interpolé
    const jrn = trouver(/INSERT INTO demande_journal/i)!;
    expect(norm(jrn.sql)).toContain('VALUES ($1, NULL, NULL, $2, $3)'); // append-only
    expect(jrn.params[0]).toBe(42);
    expect(String(jrn.params[1])).toContain('defavorable');
    expect(appels.some((a) => /UPDATE\s+demande\b/i.test(a.sql))).toBe(false); // jamais demande.statut
  });

  it('saisine non envoyée (0 ligne) → SaisineCadaError, aucun journal', async () => {
    etat.avisRows = [];
    await expect(enregistrerAvisSaisine(7, 'favorable', 'admin')).rejects.toBeInstanceOf(SaisineCadaError);
    expect(trouver(/INSERT INTO demande_journal/i)).toBeUndefined();
  });
});

describe('X5 — chargerConfirmationCada : classification des états (miroir des gardes de creerSaisineCada)', () => {
  const AVANT_REFUS = new Date('2026-03-20T12:00:00Z'); // avant le 14 avr → refus non acquis
  const LIGNE = (over: Partial<LigneConfirmationDB> = {}): LigneConfirmationDB => ({
    statut: 'envoyee', reference: 'SVAV-DEM-2026-000042', commune_nom: 'Asnières-sur-Seine', envoye_le: ENVOI,
    dossiers_dus_nums: ['DAU-1'], refus_expres: [], saisine_statut: null, saisine_envoyee_le: null, ...over,
  });
  function depsConf(over: Partial<DepsConfirmation> = {}): DepsConfirmation {
    return {
      lire: async () => LIGNE(),
      derniereReleveOkLe: async () => new Date('2026-05-10T06:00:00Z'), // 6 h avant DANS_FENETRE → fraîche (<48 h)
      fraicheurHeures: async () => 48,
      maintenant: () => DANS_FENETRE,
      ...over,
    };
  }

  it('demande introuvable → demande_absente', async () => {
    expect((await chargerConfirmationCada(42, depsConf({ lire: async () => null }))).etat).toBe('demande_absente');
  });
  it('saisine déjà envoyée → deja_lancee (avec la date)', async () => {
    const c = await chargerConfirmationCada(42, depsConf({ lire: async () => LIGNE({ saisine_statut: 'envoyee', saisine_envoyee_le: new Date('2026-05-01T00:00:00Z') }) }));
    expect(c.etat).toBe('deja_lancee');
    expect(c.dejaLanceeLe).toEqual(new Date('2026-05-01T00:00:00Z'));
  });
  it('saisine en brouillon → deja_lancee (en préparation, sans date)', async () => {
    const c = await chargerConfirmationCada(42, depsConf({ lire: async () => LIGNE({ saisine_statut: 'brouillon' }) }));
    expect(c.etat).toBe('deja_lancee');
    expect(c.dejaLanceeLe).toBeNull();
  });
  it('demande hors état (non envoyée, ou sans date d’envoi) → demande_hors_etat', async () => {
    expect((await chargerConfirmationCada(42, depsConf({ lire: async () => LIGNE({ statut: 'close' }) }))).etat).toBe('demande_hors_etat');
    expect((await chargerConfirmationCada(42, depsConf({ lire: async () => LIGNE({ envoye_le: null }) }))).etat).toBe('demande_hors_etat');
  });
  it('refus tacite non acquis → refus_non_acquis', async () => {
    expect((await chargerConfirmationCada(42, depsConf({ maintenant: () => AVANT_REFUS }))).etat).toBe('refus_non_acquis');
  });
  it('fenêtre forclose → forclose', async () => {
    expect((await chargerConfirmationCada(42, depsConf({ maintenant: () => APRES_FORCLUSION }))).etat).toBe('forclose');
  });
  it('plus aucun dossier dû → plus_de_dossier', async () => {
    expect((await chargerConfirmationCada(42, depsConf({ lire: async () => LIGNE({ dossiers_dus_nums: [] }) }))).etat).toBe('plus_de_dossier');
  });
  it('relève pas assez fraîche → silence_non_verifie (sincérité)', async () => {
    expect((await chargerConfirmationCada(42, depsConf({ derniereReleveOkLe: async () => new Date('2026-05-01T00:00:00Z') }))).etat).toBe('silence_non_verifie'); // ~9 j → > 48 h
  });
  it('tout réuni → saisissable, avec jours avant forclusion + dossiers dus', async () => {
    const c = await chargerConfirmationCada(42, depsConf());
    expect(c.etat).toBe('saisissable');
    expect(c.reference).toBe('SVAV-DEM-2026-000042');
    expect(c.dossiersDusNums).toEqual(['DAU-1']);
    expect(typeof c.joursAvantForclusion).toBe('number');
    expect(c.forclusionLe).not.toBeNull();
  });
});
