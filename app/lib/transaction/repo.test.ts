import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TUILE « TRANSACTION » — la base, simulée : sans la migration 433 RIEN ne s'écrit ; rien n'est jamais supprimé ; une modification
 * journalise seulement ce qui change ; « Annuler » refuse un geste dépassé par un plus récent. (Éprouvé aussi sur la base jetable.)
 */
const disponible = vi.fn<() => Promise<boolean>>();
const lotD = vi.fn<() => Promise<boolean>>(async () => false);
vi.mock('../admin/schemaDroits', () => ({ droitTransactionDisponible: () => disponible(), repartitionDisponible: () => lotD() }));
const appels: { sql: string; params: unknown[] }[] = [];
let reponses: ((sql: string) => { rows: Record<string, unknown>[] } | undefined)[] = [];
const q = vi.fn(async (sql: string, params: unknown[] = []) => {
  appels.push({ sql: sql.replace(/\s+/g, ' '), params });
  for (const r of reponses) { const x = r(sql.replace(/\s+/g, ' ')); if (x !== undefined) return x; }
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: (s: string, p: unknown[]) => q(s, p), withTransaction: async (fn: (x: typeof q) => unknown) => fn(q) }));

const repo = await import('./repo');
const A = { id: 3, libelle: 'arno' };
beforeEach(() => { appels.length = 0; reponses = []; disponible.mockResolvedValue(true); lotD.mockResolvedValue(false); q.mockClear(); });

describe('sans la migration 433', () => {
  it('toute écriture est refusée avec le motif, sans une requête', async () => {
    disponible.mockResolvedValue(false);
    expect(await repo.modifierVente(1, { mois: 2 }, A)).toEqual({ ok: false, motif: repo.MOTIF_SANS_MIGRATION });
    expect(await repo.rattacherRetro(1, 2, A)).toEqual({ ok: false, motif: repo.MOTIF_SANS_MIGRATION });
    expect(await repo.enregistrerGestion(2025, 1, { nbLots: null, honorairesHt: 1, adhocHt: null, salarieHt: null, resteHt: null, note: null }, A))
      .toEqual({ ok: false, motif: repo.MOTIF_SANS_MIGRATION });
    expect(appels).toEqual([]);
  });
});

describe('rien n’est jamais supprimé', () => {
  it('le dépôt n’émet aucun DELETE ni TRUNCATE', () => {
    const src = readFileSync('app/lib/transaction/repo.ts', 'utf8');
    expect(src).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(src).not.toMatch(/\bTRUNCATE\b/i);
  });
});

describe('modifier une vente', () => {
  it('écrit et journalise SEULEMENT les champs qui changent (valeur avant / après)', async () => {
    reponses.push((s) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE')
      ? { rows: [{ libelle: 'A', honoraires_ttc: '12000', statut: 'vendue', annee: 2025, mois_acte: '2025-03-01', date_compromis: null, apporteur: null, note: null, retire_le: null }] } : undefined));
    reponses.push((s) => (s.startsWith('INSERT INTO transaction_journal') ? { rows: [{ id: '9' }] } : undefined));
    expect(await repo.modifierVente(5, { mois: 4, libelle: 'A' }, A)).toEqual({ ok: true });
    const maj = appels.find((x) => x.sql.startsWith('UPDATE transaction_vente'))!;
    expect(maj.sql).toContain('mois_acte = $2');
    expect(maj.sql).not.toContain('libelle');
    expect(maj.params).toEqual([5, '2025-04-01']);
    const j = appels.find((x) => x.sql.startsWith('INSERT INTO transaction_journal'))!;
    expect(j.params.slice(0, 5)).toEqual(['vente', 5, 'modification', JSON.stringify({ mois_acte: '2025-03-01' }), JSON.stringify({ mois_acte: '2025-04-01' })]);
  });
  it('un compromis n’a pas de mois de l’acte', async () => {
    reponses.push((s) => (s.includes('FOR UPDATE') ? { rows: [{ libelle: 'A', honoraires_ttc: 1, statut: 'vendue', annee: 2025, mois_acte: '2025-03-01', date_compromis: null, apporteur: null, note: null, retire_le: null }] } : undefined));
    reponses.push((s) => (s.startsWith('INSERT INTO transaction_journal') ? { rows: [{ id: '9' }] } : undefined));
    await repo.modifierVente(5, { statut: 'compromis' }, A);
    expect(appels.find((x) => x.sql.startsWith('UPDATE transaction_vente'))!.params).toEqual([5, 'compromis', null]);
  });
});

describe('annuler un geste', () => {
  it('refuse quand la ligne a été modifiée depuis par un geste plus récent', async () => {
    reponses.push((s) => (s.includes('FROM transaction_journal j WHERE id = $1')
      ? { rows: [{ id: '7', entite: 'retrocession', entite_id: '4', action: 'rattachement', avant: { vente_id: null }, apres: { vente_id: 10 }, deja: false }] } : undefined));
    reponses.push((s) => (s.includes('FROM transaction_retrocession WHERE id = $1 FOR UPDATE') ? { rows: [{ vente_id: '11', apporteur: null, montant_ttc: '1200', retire_le: null }] } : undefined));
    const r = await repo.annulerGeste(7, A);
    expect(r.ok).toBe(false);
    expect(appels.some((x) => x.sql.startsWith('UPDATE'))).toBe(false);
  });
  it('une MISE À JOUR par l’import (compromis devenu vente, D2) s’annule en remettant la valeur d’avant — jamais en retirant la vente', async () => {
    reponses.push((s) => (s.includes('FROM transaction_journal j WHERE id = $1')
      ? { rows: [{ id: '5', entite: 'vente', entite_id: '18', action: 'import_mise_a_jour', avant: { statut: 'compromis', annee: 2025 }, apres: { statut: 'vendue', annee: 2026 }, deja: false }] } : undefined));
    reponses.push((s) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE')
      ? { rows: [{ libelle: 'OURY/BERTRAND', honoraires_ttc: '50000', statut: 'vendue', annee: 2026, mois_acte: '2026-02-01', date_compromis: null, apporteur: null, note: null, retire_le: null }] } : undefined));
    reponses.push((s) => (s.startsWith('INSERT INTO transaction_journal') ? { rows: [{ id: '6' }] } : undefined));
    expect(await repo.annulerGeste(5, A)).toEqual({ ok: true });
    const maj = appels.find((x) => x.sql.startsWith('UPDATE transaction_vente'))!;
    expect(maj.sql).not.toContain('retire_le');
    expect(maj.params.slice(1)).toEqual(['compromis', 2025]);
  });
  it('remet la valeur d’avant et journalise l’annulation (annule_journal_id)', async () => {
    reponses.push((s) => (s.includes('FROM transaction_journal j WHERE id = $1')
      ? { rows: [{ id: '7', entite: 'retrocession', entite_id: '4', action: 'rattachement', avant: { vente_id: null }, apres: { vente_id: 10 }, deja: false }] } : undefined));
    reponses.push((s) => (s.includes('FROM transaction_retrocession WHERE id = $1 FOR UPDATE') ? { rows: [{ vente_id: '10', apporteur: null, montant_ttc: '1200', retire_le: null }] } : undefined));
    reponses.push((s) => (s.startsWith('INSERT INTO transaction_journal') ? { rows: [{ id: '8' }] } : undefined));
    expect(await repo.annulerGeste(7, A)).toEqual({ ok: true });
    expect(appels.find((x) => x.sql.startsWith('UPDATE transaction_retrocession'))!.params).toEqual([4, null]);
    const j = appels.find((x) => x.sql.startsWith('INSERT INTO transaction_journal'))!;
    expect(j.params[2]).toBe('annulation');
    expect(j.params[6]).toBe(7);
  });
});

describe('LOT C — attribuer une vente notée chez les deux sociétés', () => {
  const notesEnBase = (s: string) => (s.includes('WHERE double_cle = $1') ? { rows: [{ id: '1', societe: 'criterimmo' }, { id: '2', societe: 'macj' }] } : undefined);
  const etat: Record<string, string> = { '1': 'a_attribuer', '2': 'a_attribuer' };
  it('« Attribuer à MACJ » : MACJ retenue, CRITERIMMO écartée, chaque note journalisée ; « Remettre à attribuer » défait', async () => {
    reponses.push(notesEnBase);
    reponses.push((s) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE') ? { rows: [{ libelle: 'X', honoraires_ttc: '1', statut: 'vendue', annee: 2025, mois_acte: null,
      date_compromis: null, apporteur: null, note: null, retire_le: null, attribution: etat[String(appels.at(-1)!.params[0])] }] } : undefined));
    reponses.push((s) => (s.startsWith('INSERT INTO transaction_journal') ? { rows: [{ id: '9' }] } : undefined));
    expect(await repo.attribuer('double|X', 'macj', A)).toEqual({ ok: true });
    const majs = appels.filter((x) => x.sql.startsWith('UPDATE transaction_vente'));
    expect(majs.map((x) => x.params)).toEqual([[1, 'ecartee'], [2, 'retenue']]);
    expect(appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_journal')).map((x) => x.params[2])).toEqual(['attribution', 'attribution']);
    appels.length = 0; etat['1'] = 'ecartee'; etat['2'] = 'retenue';
    expect(await repo.attribuer('double|X', null, A)).toEqual({ ok: true });
    expect(appels.filter((x) => x.sql.startsWith('UPDATE transaction_vente')).map((x) => x.params)).toEqual([[1, 'a_attribuer'], [2, 'a_attribuer']]);
  });
  it('une société qui n’a pas noté la vente est refusée', async () => {
    reponses.push((s) => (s.includes('WHERE double_cle = $1') ? { rows: [{ id: '1', societe: 'criterimmo' }] } : undefined));
    expect((await repo.attribuer('double|X', 'macj', A)).ok).toBe(false);
  });
});

describe('🔴 LOT D (434) — compromis, répartition, « Acte signé »', () => {
  const dossier = (o: Record<string, unknown> = {}) => ({ societe: 'criterimmo' as const, statut: 'compromis' as const, libelle: null, honorairesTtc: 12000, dateCompromis: '2026-10-20',
    dateActePrevue: '2027-01-15', dateActe: null, adresseBien: '1 rue A, Puteaux', note: null, entreeId: 5, sortieId: 7, apporteurId: null, apporteurNom: null, retroApporteurTtc: 0,
    personnes: [{ id: null, role: 'vendeur' as const, nom: 'DUPONT', telephone: '06 12 34 56 78', email: null, adresse: null }, { id: null, role: 'acquereur' as const, nom: 'MARTIN', telephone: null, email: null, adresse: null }],
    parties: [{ sorte: 'entree' as const, compteId: 5, nom: null, coordonnees: null, pourcentage: 50, montantHt: null }, { sorte: 'sortie' as const, compteId: 7, nom: null, coordonnees: null, pourcentage: 50, montantHt: null }],
    lignes: [], ...o });
  const comptes = (s: string) => (s.includes('FROM admin_utilisateur WHERE id = ANY') ? { rows: [{ id: '5', nom: 'Jean-Baptiste PONS' }, { id: '7', nom: 'Mylène EBERLIN' }] } : undefined);
  // JB : CRITERIMMO depuis toujours ; Mylène : CRITERIMMO jusqu'au 31/10/2026, MACJ à compter du 01/11/2026.
  const periodes = (s: string) => (s.includes('FROM transaction_societe_compte') ? { rows: [{ compte_id: '5', societe: 'criterimmo', depuis: '2000-01-01' },
    { compte_id: '7', societe: 'criterimmo', depuis: '2000-01-01' }, { compte_id: '7', societe: 'macj', depuis: '2026-11-01' }] } : undefined);
  const ecritures = () => appels.filter((x) => /^(INSERT|UPDATE)/.test(x.sql));

  it('sans la 434 : refus avec le motif, rien n’est écrit ; la lecture ne nomme aucune colonne neuve', async () => {
    expect(await repo.enregistrerDossier(null, dossier(), '2026-10-27', A)).toEqual({ ok: false, motif: repo.MOTIF_SANS_434 });
    expect(ecritures()).toEqual([]);
    await repo.lireVentes('macj');
    expect(appels.map((x) => x.sql).join(' ')).not.toMatch(/transaction_partie|repartition|date_acte/);
  });
  it('une répartition ≠ 100 % est refusée AVANT toute écriture (la saisie reste à l’écran)', async () => {
    lotD.mockResolvedValue(true);
    reponses.push(comptes, periodes);
    const r = await repo.enregistrerDossier(null, dossier({ parties: [{ sorte: 'entree', compteId: 5, nom: null, coordonnees: null, pourcentage: 60, montantHt: null },
      { sorte: 'sortie', compteId: 7, nom: null, coordonnees: null, pourcentage: 50, montantHt: null }] }), '2026-10-27', A);
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.motif).toMatch(/exactement 100 %/);
    expect(ecritures()).toEqual([]);
  });
  it('un compromis neuf : la vente, ses personnes, ses parties — la société FIGÉE à la date de la vente ; tout journalisé', async () => {
    lotD.mockResolvedValue(true);
    let id = 40;
    reponses.push(comptes, periodes, (s) => (s.includes('RETURNING id') ? { rows: [{ id: String(++id) }] } : undefined));
    const r = await repo.enregistrerDossier(null, dossier(), '2026-10-27', A);
    expect(r).toEqual({ ok: true, valeur: 41 });
    const v = appels.find((x) => x.sql.startsWith('INSERT INTO transaction_vente ('))!;
    expect(v.sql).toContain('repartition');
    expect(v.params).toContain('DUPONT / MARTIN');
    expect(v.params).toContain(2027); // l'année du prévisionnel : celle de l'acte prévu
    const parties = appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_partie'));
    // Le compromis est du 20/10/2026 : Mylène était encore CRITERIMMO ce jour-là.
    expect(parties.map((x) => [x.params[1], x.params[2], x.params[4], x.params[7]])).toEqual([['entree', 5, 'criterimmo', 50], ['sortie', 7, 'criterimmo', 50]]);
    expect(appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_personne'))).toHaveLength(2);
    expect(appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_journal')).map((x) => x.params[2])).toEqual(['saisie', 'saisie', 'saisie', 'personnes', 'repartition']);
  });
  it('une personne déjà connue (même téléphone) est RÉUTILISÉE, jamais recréée', async () => {
    lotD.mockResolvedValue(true);
    reponses.push(comptes, periodes, (s) => (s.startsWith('SELECT id, nom, telephone, email, adresse FROM transaction_personne')
      ? { rows: [{ id: '3', nom: 'Paul DUPONT', telephone: '+33 6 12 34 56 78', email: null, adresse: null }] } : undefined),
    (s) => (s.includes('FROM transaction_personne WHERE id = $1 FOR UPDATE') ? { rows: [{ nom: 'Paul DUPONT', telephone: '+33 6 12 34 56 78', email: null, adresse: null, note: null, retire_le: null }] } : undefined),
    (s) => (s.includes('RETURNING id') ? { rows: [{ id: '50' }] } : undefined));
    await repo.enregistrerDossier(null, dossier(), '2026-10-27', A);
    const nouvelles = appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_personne'));
    expect(nouvelles.map((x) => x.params[0])).toEqual(['MARTIN']);
    expect(appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_vente_personne')).map((x) => x.params[1])).toContain(3);
  });
  it('« Acte signé » : vente encaissée au mois de l’acte ; « Revenir en compromis » le défait (journalisé)', async () => {
    lotD.mockResolvedValue(true);
    const ligne = { libelle: 'X', honoraires_ttc: '12000', statut: 'compromis', annee: 2027, mois_acte: null, date_compromis: '2026-10-20', apporteur: null, note: null, retire_le: null,
      attribution: null, adresse_bien: null, date_acte_prevue: '2027-01-15', date_acte: null, negociateur_entree_id: '5', negociateur_sortie_id: '7', apporteur_id: null, retro_apporteur_ttc: '0', repartition: true };
    reponses.push((s) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE') ? { rows: [ligne] } : undefined), (s) => (s.includes('RETURNING id') ? { rows: [{ id: '9' }] } : undefined));
    expect(await repo.acteSigne(41, '2026-12-18', A)).toEqual({ ok: true });
    const maj = appels.find((x) => x.sql.startsWith('UPDATE transaction_vente'))!;
    expect(maj.params).toEqual([41, 'vendue', 2026, '2026-12-01', '2026-12-18']);
    expect(appels.find((x) => x.sql.startsWith('INSERT INTO transaction_journal'))!.params[2]).toBe('acte_signe');
    appels.length = 0;
    Object.assign(ligne, { statut: 'vendue', annee: 2026, mois_acte: '2026-12-01', date_acte: '2026-12-18' });
    expect(await repo.retourCompromis(41, A)).toEqual({ ok: true });
    expect(appels.find((x) => x.sql.startsWith('UPDATE transaction_vente'))!.params).toEqual([41, 'compromis', null, 2027, null]);
    Object.assign(ligne, { statut: 'compromis' });
    expect((await repo.retourCompromis(41, A)).ok).toBe(false);
  });
  it('« Annuler » une répartition : l’ensemble posé est retiré, celui d’avant revient (jamais supprimé)', async () => {
    lotD.mockResolvedValue(true);
    reponses.push((s) => (s.includes('FROM transaction_journal j WHERE id = $1')
      ? { rows: [{ id: '12', entite: 'vente', entite_id: '41', action: 'repartition', avant: { ids: [1, 2] }, apres: { ids: [3, 4, 5] }, deja: false }] } : undefined),
    (s) => (s.startsWith('SELECT id FROM transaction_partie WHERE vente_id') ? { rows: [{ id: '3' }, { id: '4' }, { id: '5' }] } : undefined),
    (s) => (s.includes('RETURNING id') ? { rows: [{ id: '13' }] } : undefined));
    expect(await repo.annulerGeste(12, A)).toEqual({ ok: true });
    const majs = appels.filter((x) => x.sql.startsWith('UPDATE transaction_partie'));
    expect(majs.map((x) => [x.sql.includes('retire_le = now()'), x.params[0]])).toEqual([[true, [3, 4, 5]], [false, [1, 2]]]);
    const j = appels.find((x) => x.sql.startsWith('INSERT INTO transaction_journal'))!;
    expect([j.params[2], j.params[6]]).toEqual(['repartition', 12]);
  });
});
