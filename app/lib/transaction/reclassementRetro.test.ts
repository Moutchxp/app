import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { planReclassement, texteReclassement } from './reclassementRetro';
import type { Retrocession, Vente } from './modele';

/**
 * 🔴 LOT BV (Arno, 30/10/2026) — reclasser en commission du négociateur une « rétrocession » importée (ligne « Apporteur Intermédiaire » de son
 * onglet) : la liste, le reste avant / après AU CENTIME, le verdict (reclassable seulement si le reste ne change pas). Rien n'est écrit ici.
 */
const vente = (id: number, honorairesTtc: number, o: Partial<Vente> = {}): Vente => ({ id, societe: 'criterimmo', libelle: `V${id}`, honorairesTtc, statut: 'vendue', annee: 2026, mois: 7,
  dateCompromis: null, apporteur: null, note: null, origine: 'import', sourceFichier: 'TABLEAU DE BORD 2026.xlsx', sourceOnglet: 'CATHERINE', sourceLigne: 23, lignes: [], double: null, ...o });
const retro = (id: number, venteId: number, montantTtc: number, negociateur = 'CATHERINE', o: Partial<Retrocession> = {}): Retrocession => ({ id, societe: 'criterimmo', annee: 2026, mois: 7,
  negociateur, montantTtc, apporteur: null, venteId, libelle: 'montant saisi', origine: 'import', sourceOnglet: negociateur, sourceCellule: 'J3', ...o });

describe('🔴 LOT BV — le plan du reclassement', () => {
  const millecamps = vente(200, 29423);
  const r131 = retro(131, 200, 23538);

  it('MILLECAMPS (CATHERINE, statut à renseigner) : candidate (80 % des honoraires), mais BLOQUÉE — le reste changerait de 19 615 € HT', () => {
    const [c] = planReclassement([millecamps], [r131], () => null, 'criterimmo');
    expect([c.venteId, c.negociateur, c.statut, Math.round(c.partPct), c.resteAvantC, c.resteApresC, c.reclassable]).toEqual([200, 'CATHERINE', null, 80, 490417, 2451917, false]);
    expect(c.motif?.replace(/\s/g, ' ')).toBe('le reste changerait de +19 615,00 € HT : CATHERINE est sans statut (à renseigner) — seule la commission d’un indépendant est déduite');
  });

  it('un négociateur INDÉPENDANT : RECLASSABLE, le reste identique au centime', () => {
    const [c] = planReclassement([millecamps], [r131], () => 'independant', 'criterimmo');
    expect([c.reclassable, c.resteAvantC, c.resteApresC, c.motif]).toEqual([true, 490417, 490417, null]);
  });

  it('un associé : BLOQUÉE (sa commission n’est pas déduite) ; plusieurs destinataires : BLOQUÉE', () => {
    expect(planReclassement([millecamps], [r131], () => 'associe', 'criterimmo')[0].motif).toContain('CATHERINE est associé');
    const [c] = planReclassement([millecamps], [retro(1, 200, 12000, 'CATHERINE'), retro(2, 200, 11538, 'CEDRIC')], () => 'independant', 'criterimmo');
    expect([c.reclassable, c.motif]).toEqual([false, 'plusieurs destinataires (CATHERINE, CEDRIC)']);
  });

  it('pas candidate : 50 % ou moins des honoraires, une vente saisie, une rétrocession saisie, une autre société, une rétrocession « à répartir »', () => {
    const ventes = [vente(1, 10000), vente(2, 10000, { origine: 'saisie' }), vente(3, 10000), vente(4, 10000, { societe: 'macj' })];
    const retros = [retro(11, 1, 5000), retro(12, 2, 9000), retro(13, 3, 9000, 'CATHERINE', { origine: 'saisie' }), retro(14, 4, 9000), retro(15, 3, 9000, 'CATHERINE', { venteId: null })];
    expect(planReclassement(ventes, retros, () => 'independant', 'criterimmo')).toEqual([]);
  });

  it('destinataire = le négociateur lui-même : candidate même sous 50 %', () => {
    const [c] = planReclassement([vente(5, 10000)], [retro(16, 5, 2000, 'CATHERINE', { apporteur: 'catherine' })], () => 'independant', 'criterimmo');
    expect([c.venteId, c.reclassable]).toEqual([5, true]);
  });

  it('le rapport : chaque vente (fichier › onglet › ligne, statut, montant, reste avant → après, verdict), puis les totaux avant / après', () => {
    const t = texteReclassement(planReclassement([millecamps, vente(202, 6000, { sourceLigne: 25, mois: 9 })], [r131, retro(132, 202, 4200)], () => null, 'criterimmo')).replace(/\s/g, ' ');
    expect(t).toContain('CRITERIMMO 2026-07 | vente 200 « V200 » | TABLEAU DE BORD 2026.xlsx › CATHERINE › ligne 23 | négociateur CATHERINE (statut à renseigner)');
    expect(t).toContain('rétrocession 4 200,00 € TTC = 70 % des honoraires 6 000,00 € TTC (n° 132) | reste HT 1 500,00 € → 5 000,00 € | BLOQUÉE');
    expect(t).toContain('Candidates : 2 vente(s) · rétrocessions 27 738,00 € TTC · reste HT avant 6 404,17 € → après 29 519,17 € (écart 23 115,00 €)');
    expect(t).toContain('Reclassables sans changer le reste : 0');
  });
});

describe('🔴 LOT BV — la commande : essai par défaut ; écriture seulement avec la liste accordée, et jamais pour une vente bloquée', () => {
  it('la source : « --ecrire » ET « --ventes=… » ; une vente absente du plan ou bloquée : rien n’est écrit (code 2) ; rapport dans .captures/', () => {
    const src = readFileSync('app/scripts/transaction-reclasser-retro.ts', 'utf8');
    expect(src).toContain("const ecrire = argv.includes('--ecrire');");
    expect(src).toContain("if (demandees.length === 0) { l.push('', '⛔ --ecrire demande --ventes=<n°,n°…> : la liste accordée par Arno. Rien n’est écrit.'); code = 2; }");
    expect(src).toContain('const refus = demandees.filter((id) => !plan.some((c) => c.venteId === id && c.reclassable));');
    expect(src).toContain("cheminRapport({ nomScript: NOM_SCRIPT, demande: optionLigne(argv, 'rapport') })");
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['transaction:reclasser-retro']).toBe('tsx app/scripts/transaction-reclasser-retro.ts');
  });

  it('l’écriture (repo) : relit sous verrou, ajoute la commission, RETIRE les rétrocessions (jamais de DELETE), journalise', () => {
    const src = readFileSync('app/lib/transaction/reclassementRetroRepo.ts', 'utf8');
    expect(src).toContain('FOR UPDATE');
    expect(src).toContain("INSERT INTO transaction_vente_ligne (vente_id, negociateur, role, montant_ttc, nature, compte, origine, note, cree_par_libelle)");
    expect(src).toContain('UPDATE transaction_retrocession SET retire_le = now()');
    expect(src).not.toMatch(/DELETE\s+FROM/i);
    expect(src).toContain('INSERT INTO transaction_journal');
    vi.restoreAllMocks();
  });
});
