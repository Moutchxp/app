import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { statutDeFiche } from './statutSansCompte';
import { effetStatuts, planStatuts, texteStatuts } from './statutNegociateurPlan';
import { planReclassement } from './reclassementRetro';
import type { LigneVente, Retrocession, Vente } from './modele';

/**
 * 🔴 LOT BX (Arno, 30/10/2026) — le statut d'un négociateur SANS compte (CATHERINE, JULIEN, ANTOINE, HELENE, JEAN CLAUDE, FRED : indépendants),
 * posé sur une fiche par libellé (migration 444) ; aucun compte n'est créé ; le compte, quand il existe, fait foi.
 */
const vente = (id: number, honorairesTtc: number, o: Partial<Vente> = {}): Vente => ({ id, societe: 'criterimmo', libelle: `V${id}`, honorairesTtc, statut: 'vendue', annee: 2026, mois: 7,
  dateCompromis: null, apporteur: null, note: null, origine: 'import', sourceFichier: 'TABLEAU DE BORD 2026.xlsx', sourceOnglet: 'CATHERINE', sourceLigne: 23, lignes: [], double: null, ...o });
const retro = (id: number, venteId: number, montantTtc: number, negociateur = 'CATHERINE'): Retrocession => ({ id, societe: 'criterimmo', annee: 2026, mois: 7,
  negociateur, montantTtc, apporteur: null, venteId, libelle: null, origine: 'import', sourceOnglet: negociateur, sourceCellule: 'J3' });
const paye = (negociateur: string, montantTtc: number): LigneVente => ({ id: 1, negociateur, role: 'negociateur', montantTtc, nature: 'vente', compte: true, origine: 'saisie',
  sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null });

describe('🔴 LOT BX — la fiche « statut sans compte »', () => {
  it('se lit par libellé normalisé (casse, accents, espaces) ; inconnu : null', () => {
    const fiches = [{ libelleNormalise: 'jean claude', statut: 'independant' as const }, { libelleNormalise: 'helene', statut: 'independant' as const }];
    expect([statutDeFiche(fiches, 'JEAN  CLAUDE'), statutDeFiche(fiches, 'Hélène'), statutDeFiche(fiches, 'MYLENE')]).toEqual(['independant', 'independant', null]);
  });

  it('le statut lu par les écrans : un compte rapproché fait foi ; sans compte, la fiche (repo, source)', () => {
    const src = readFileSync('app/lib/transaction/repo.ts', 'utf8');
    expect(src).toContain('out[l] = c === null ? statutDeFiche(fiches, l) : statuts.get(c.id) ?? null;');
  });

  it('le plan : un libellé rapproché d’un compte est REFUSÉ ; l’effet sur le reste, avant / après, au centime', () => {
    const plan = planStatuts(['CATHERINE', 'PIERRE'], 'independant', { CATHERINE: null, PIERRE: 'independant' }, { CATHERINE: null, PIERRE: { nom: 'Pierre Thevenin' } });
    expect(plan.map((p) => [p.libelle, p.refus === null])).toEqual([['CATHERINE', true], ['PIERRE', false]]);
    // aucune commission de CATHERINE : rien ne bouge ; une commission de 1 200 TTC : le reste baisse de 1 000 HT (elle devient déduite)
    expect(effetStatuts([vente(1, 6000)], [], 'criterimmo', { CATHERINE: null }, plan)).toMatchObject({ lignesPaye: 0, resteAvantC: 500000, resteApresC: 500000 });
    const e = effetStatuts([vente(1, 6000, { lignes: [paye('CATHERINE', 1200)] })], [], 'criterimmo', { CATHERINE: null }, plan);
    expect([e.lignesPaye, e.resteAvantC, e.resteApresC]).toEqual([1, 500000, 400000]);
    expect(texteStatuts(plan, [e]).replace(/\s/g, ' ')).toContain('PIERRE | compte Pierre Thevenin | aujourd’hui : Indépendant → Indépendant | REFUSÉ');
  });

  it('après la fiche : la rétrocession « Apporteur Intermédiaire » de CATHERINE est RECLASSABLE, reste identique au centime (MILLECAMPS)', () => {
    const [c] = planReclassement([vente(200, 29423)], [retro(131, 200, 23538)], (l) => (l === 'CATHERINE' ? 'independant' : null), 'criterimmo');
    expect([c.reclassable, c.resteAvantC, c.resteApresC]).toEqual([true, 490417, 490417]);
  });

  it('une vente « à attribuer » (double) : BLOQUÉE — sa rétrocession compte dans le mois, pas sa commission (cas 214 SANCHEZ, 230 HOPPENOT)', () => {
    const double = { cle: 'double|x', attribution: 'a_attribuer' } as unknown as Vente['double'];
    const [c] = planReclassement([vente(214, 1750, { societe: 'macj', double })], [{ ...retro(136, 214, 1000, 'PIERRE'), societe: 'macj' }], () => 'independant', 'macj');
    expect([c.reclassable, c.resteAvantC === c.resteApresC]).toEqual([false, true]);
    expect(c.motif).toContain('vente « à attribuer »');
    const retenue = { cle: 'double|x', attribution: 'retenue' } as unknown as Vente['double'];
    expect(planReclassement([vente(214, 1750, { societe: 'macj', double: retenue })], [{ ...retro(136, 214, 1000, 'PIERRE'), societe: 'macj' }], () => 'independant', 'macj')[0].reclassable).toBe(true);
  });
});

describe('🔴 LOT BX — les commandes : essai par défaut, aucune suppression', () => {
  it('transaction:statut-negociateur : --ecrire, refus en bloc d’un libellé à compte, rapport dans .captures/', () => {
    const src = readFileSync('app/scripts/transaction-statut-negociateur.ts', 'utf8');
    expect(src).toContain("const ecrire = argv.includes('--ecrire');");
    expect(src).toContain('rapproché(s) d’un compte. Rien n’est écrit.');
    expect(src).toContain("cheminRapport({ nomScript: NOM_SCRIPT, demande: optionLigne(argv, 'rapport') })");
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['transaction:statut-negociateur']).toBe('tsx app/scripts/transaction-statut-negociateur.ts');
  });

  it('la fiche et l’annulation : retirer / rétablir, journalisé, jamais de DELETE ; la migration 444 interdit DELETE et TRUNCATE', () => {
    for (const f of ['app/lib/transaction/statutSansCompte.ts', 'app/lib/transaction/reclassementRetroRepo.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toMatch(/DELETE\s+FROM/i);
      expect(src).toContain('INSERT INTO transaction_journal');
    }
    expect(readFileSync('app/lib/transaction/reclassementRetroRepo.ts', 'utf8')).toContain('UPDATE transaction_retrocession SET retire_le = NULL');
    const m = readFileSync('db/migrations/444_transaction_negociateur_statut.sql', 'utf8');
    expect(m).toContain('EXECUTE FUNCTION transaction_refuser_effacement()');
    expect(m).toContain("'negociateur_statut'");
    expect(readFileSync('app/scripts/transaction-reclasser-retro.ts', 'utf8')).toContain("const annuler = argv.includes('--annuler');");
  });
});
