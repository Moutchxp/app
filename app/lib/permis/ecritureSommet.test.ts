import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * N5-C — dépôt d'écriture du sommet. `db/client` est mocké (routé par fragment SQL) → aucune I/O réelle, les tables n'ont pas
 * besoin d'exister. On éprouve l'ATTRIBUTION (0 → crée un corps · 1 → écrit dessus · ≥2 → n'écrit pas, journalise, alerte),
 * l'INVARIANT réutilisé (saisie non écrasée, et le journal le dit), et le JOURNAL (retenue porte confiance+réserve ; niveau fini
 * en 'candidat', jamais 'retenue'). On asserte le COMPORTEMENT et les paramètres LIÉS, jamais la forme d'un SQL émis.
 */
const H = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const state = {
    corps: [] as { id: number }[],                 // corps existants (pilote l'attribution 0/1/≥2)
    origineCorps: {} as Record<string, unknown>,   // ligne des colonnes _origine renvoyée à ecrireCorps (saisie ?)
    insertCorpsId: 100,                            // id renvoyé par creerCorps
  };
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    if (/json_agg/i.test(sql)) return { rows: [{ global: null, corps: state.corps }] };
    if (/INSERT\s+INTO\s+permis_corps_batiment/i.test(sql)) return { rows: [{ id: state.insertCorpsId }] };
    if (/_origine\s+AS\s+"/i.test(sql) && /FROM\s+permis_corps_batiment/i.test(sql)) return { rows: [state.origineCorps] };
    return { rows: [] }; // UPDATE corps, INSERT journal : ignorés du routage
  };
  return { appels, state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock }));

import { ecrireSommet } from './ecritureSommet';
import { RESERVE_SOMMET, type DecisionSommet } from './decisionSommet';

const journalRows = () => H.appels.filter((a) => /INSERT\s+INTO\s+permis_extraction_journal/i.test(a.sql)).map((a) => a.params);
// index des params du journal : 0 dossier 1 corps 2 champ 3 valeur 4 unite 5 role 6 confiance 7 reserve 8 piece 9 page 10 extrait
const insertsCorps = () => H.appels.filter((a) => /INSERT\s+INTO\s+permis_corps_batiment/i.test(a.sql));
const updatesCorps = () => H.appels.filter((a) => /UPDATE\s+permis_corps_batiment/i.test(a.sql));

function decision(valeurNgf: number | null, opts: Partial<DecisionSommet> = {}): DecisionSommet {
  return {
    valeurNgf, qualificatif: 'acrotère', confiance: 'a_verifier', reserve: RESERVE_SOMMET,
    observations: valeurNgf === null ? [] : [
      { provenance: { pieceId: 1, pieceNom: 'PC3.pdf', page: 2 }, texteBrut: `NGF +${valeurNgf}` },
      { provenance: { pieceId: 2, pieceNom: 'PC5.pdf', page: 4 }, texteBrut: `NGF +${valeurNgf}` },
    ],
    nbPiecesDistinctes: valeurNgf === null ? 0 : 2, coherentTrame: false,
    candidatsNiveauFini: [], raisonAbsence: valeurNgf === null ? 'aucune_cote_acrotere' : null,
    ...opts,
  };
}

beforeEach(() => { H.appels.length = 0; H.state.corps = []; H.state.origineCorps = {}; H.state.insertCorpsId = 100; });

describe('ecrireSommet — attribution', () => {
  it('0 corps → crée UN corps, écrit la valeur, journalise la ligne retenue', async () => {
    H.state.corps = [];
    const r = await ecrireSommet(1, decision(89.46), 'auto');
    expect(r).toMatchObject({ statut: 'ecrit', corpsCree: true, corpsId: 100, ignoreSaisie: false });
    expect(insertsCorps()).toHaveLength(1);                                  // un corps a bien été créé
    expect(updatesCorps()).toHaveLength(1);                                  // valeur écrite (UPDATE du corps)
    const retenues = journalRows().filter((p) => p[5] === 'retenue');
    expect(retenues.length).toBeGreaterThan(0);
    expect(retenues.every((p) => p[2] === 'altitude_sommet_ngf' && p[1] === 100)).toBe(true);
  });

  it('1 corps → écrit dessus, ne crée AUCUN corps', async () => {
    H.state.corps = [{ id: 42 }];
    const r = await ecrireSommet(1, decision(89.46), 'auto');
    expect(r).toMatchObject({ statut: 'ecrit', corpsCree: false, corpsId: 42 });
    expect(insertsCorps()).toHaveLength(0);
    expect(journalRows().filter((p) => p[5] === 'retenue').every((p) => p[1] === 42)).toBe(true);
  });

  it('≥2 corps → aucune écriture d’altitude, journal + alerte', async () => {
    H.state.corps = [{ id: 1 }, { id: 2 }];
    const r = await ecrireSommet(1, decision(89.46), 'auto');
    expect(r).toEqual({ statut: 'ambigu_plusieurs_corps', nbCorps: 2 });
    expect(insertsCorps()).toHaveLength(0);
    expect(updatesCorps()).toHaveLength(0);                                  // rien d'écrit sur un corps
    const ecartees = journalRows().filter((p) => p[2] === 'altitude_sommet_ngf');
    expect(ecartees.length).toBeGreaterThan(0);
    expect(ecartees.every((p) => p[5] === 'ecartee' && p[1] === null)).toBe(true); // corps_id null = ambiguïté
  });
});

describe('ecrireSommet — invariant saisie & journal', () => {
  it("valeur déjà en origine='saisie' → non écrasée, et le journal le dit (ecartee, corps renseigné)", async () => {
    H.state.corps = [{ id: 42 }];
    H.state.origineCorps = { altitudeSommetNgf: 'saisie' };
    const r = await ecrireSommet(1, decision(89.46), 'auto');
    expect(r).toMatchObject({ statut: 'ecrit', ignoreSaisie: true });
    expect(updatesCorps()).toHaveLength(0);                                  // rien réécrit : la saisie l'emporte
    const sommet = journalRows().filter((p) => p[2] === 'altitude_sommet_ngf');
    expect(sommet.every((p) => p[5] === 'ecartee' && p[1] === 42)).toBe(true); // corps_id renseigné = saisie prioritaire
  });

  it("la ligne 'retenue' porte confiance ET réserve", async () => {
    H.state.corps = [{ id: 42 }];
    await ecrireSommet(1, decision(89.46, { confiance: 'a_verifier' }), 'auto');
    const retenue = journalRows().find((p) => p[5] === 'retenue')!;
    expect(retenue[6]).toBe('a_verifier');       // confiance
    expect(retenue[7]).toBe(RESERVE_SOMMET);      // réserve
  });

  it("les candidats « niveau fini » sont journalisés en role='candidat', JAMAIS 'retenue'", async () => {
    H.state.corps = [{ id: 42 }];
    const d = decision(89.46, {
      candidatsNiveauFini: [{ valeur: 66.92, observations: [{ provenance: { pieceId: 3, pieceNom: 'PC40.pdf', page: 26 }, texteBrut: 'NGF +66.92' }] }],
    });
    await ecrireSommet(1, d, 'auto');
    const nf = journalRows().filter((p) => p[2] === 'niveau_fini');
    expect(nf).toHaveLength(1);
    expect(nf[0][5]).toBe('candidat');
    expect(nf[0][1]).toBeNull();                  // jamais rattaché à un corps
    expect(journalRows().some((p) => p[2] === 'niveau_fini' && p[5] === 'retenue')).toBe(false);
  });
});

describe('ecrireSommet — pas de sommet', () => {
  it('aucune cote acrotère → aucun corps touché, seuls les candidats sont journalisés', async () => {
    const d = decision(null, {
      candidatsNiveauFini: [{ valeur: 80.86, observations: [{ provenance: { pieceId: 3, pieceNom: 'PC40.pdf', page: 26 }, texteBrut: 'NGF +80.86' }] }],
    });
    const r = await ecrireSommet(1, d, 'auto');
    expect(r).toEqual({ statut: 'aucun_sommet' });
    expect(insertsCorps()).toHaveLength(0);
    expect(updatesCorps()).toHaveLength(0);
    expect(journalRows().every((p) => p[2] === 'niveau_fini' && p[5] === 'candidat')).toBe(true);
  });
});
