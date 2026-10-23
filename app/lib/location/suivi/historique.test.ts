import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { anneeDeFeuille, lireClasseurDetaille, lireFeuille, type ClasseurLu, type FeuilleLue } from './lectureExcel';
import { anneeDuFichier, controler, planifier, reglesDesFichiers, retrocessionsDuMois, sourceDe, versActivite } from './planImport';
import { canoniserApporteurs, memeApporteur } from './repriseExcel';
import { historiqueAnnees } from './tableauBord';

/**
 * 🔴 Arno (23/10/2026) — l'historique 2019 → 2025 du suivi mensuel : chaque VARIANTE du fichier a son épreuve, et chaque fichier
 * (copie ANONYMISÉE : montants et formules intacts, noms remplacés) tombe AU CENTIME mois par mois.
 */
const fixture = (annee: number): ClasseurLu => JSON.parse(readFileSync(path.join(process.cwd(), `app/lib/location/suivi/__fixtures__/suiviMensuel${annee}.anonyme.json`), 'utf8')) as ClasseurLu;
const lu = (annee: number) => lireClasseurDetaille(fixture(annee), annee);
const mois = (annee: number, m: string) => lu(annee).mois.find((x) => x.mois === m)!;
const NEGO = { id: 5, libelle: 'Jean-Baptiste PONS' };
const cellules = (lignes: Record<string, string | number | [number, string]>): FeuilleLue['cellules'] =>
  Object.fromEntries(Object.entries(lignes).map(([a, v]) => [a, Array.isArray(v) ? { v: v[0], f: v[1] } : { v }]));

describe('🔴 Historique — le contrôle au centime, fichier par fichier (copies anonymisées)', () => {
  const ATTENDU: Record<number, { lignes: number; ca: number; mois: number }> = {
    2020: { lignes: 84, ca: 81439.52, mois: 14 }, 2021: { lignes: 133, ca: 100897.32, mois: 12 }, 2022: { lignes: 133, ca: 113687.17, mois: 11 },
    2023: { lignes: 119, ca: 87412.26, mois: 12 }, 2024: { lignes: 107, ca: 94274.22, mois: 11 }, 2025: { lignes: 139, ca: 126660.04, mois: 12 },
  };
  for (const annee of [2020, 2021, 2022, 2023, 2024, 2025]) {
    it(`${annee} : chaque mois tombe au centime (CA, apporteurs, primes, CA net, commission, avec gestion)`, () => {
      const { mois: m } = lu(annee);
      const plan = planifier(m, [], { collaborateurs: ['Collaborateur Un', 'Collaborateur Deux', 'Collaborateur Trois'], dejaImportees: new Set(), bauxSuivis: new Set(), source: sourceDe(annee) });
      const controle = controler(m, plan.map((p) => versActivite(p, NEGO)), reglesDesFichiers(m), m.flatMap((x) => retrocessionsDuMois(x, NEGO)));
      expect(controle.filter((c) => !c.auCentime).map((c) => c.mois)).toEqual([]);
      expect(m).toHaveLength(ATTENDU[annee].mois);
      expect(plan).toHaveLength(ATTENDU[annee].lignes);
      expect(Math.round(m.reduce((s, x) => s + x.totaux.caHt, 0) * 100) / 100).toBe(ATTENDU[annee].ca);
      expect(plan.every((p) => p.importCle.startsWith(`CA_JBP_${annee}#`))).toBe(true);
    });
  }
});

describe('🔴 Historique — les variantes du fichier', () => {
  it('« Nov 19 » et « Déc 19 » du fichier 2020 vont en 2019 (l’année vient de l’onglet, jamais du fichier)', () => {
    expect(lu(2020).mois.map((m) => m.mois).slice(0, 3)).toEqual(['2019-11', '2019-12', '2020-01']);
    expect(anneeDeFeuille('Nov 19', 2020)).toBe(2019);
    expect(anneeDeFeuille('Juill 23', 2023)).toBe(2023);
    expect(anneeDeFeuille('Janv ', 2024)).toBe(2024);
    expect(anneeDuFichier('CA JBP 2025 (3).xlsx')).toBe(2025);
    expect(anneeDuFichier('/x/CA_JBP_2025_3.xlsx')).toBe(2025);
  });

  it('2022 et 2024 sans décembre ; « Feuil1 » vide ignoré, « Feuil2 » (6 baux) signalé, jamais rattaché à un mois', () => {
    expect(lu(2022).mois.some((m) => m.mois === '2022-12')).toBe(false);
    const d = lu(2024);
    expect(d.mois.some((m) => m.mois === '2024-12')).toBe(false);
    expect(d.ignorees.map((g) => [g.nom, g.lignes])).toEqual([['Feuil1', 0], ['Feuil2', 6]]);
    expect(Math.round(d.ignorees[1].caHt * 100) / 100).toBe(5143.14);
    expect(d.mois.flatMap((m) => m.lignes)).toHaveLength(107);
  });

  it('en-tête en ligne 1 (2024, novembre) : les données dès la ligne 2 ; sans en-tête : la position du modèle, dès la ligne 2', () => {
    expect(mois(2024, '2024-11').lignes[0].rang).toBe(2);
    const sans = lireFeuille({ nom: 'Mars', cellules: cellules({
      A2: 'DUPONT', B2: 400, C2: 'DURAND', D2: 400, E2: [800, 'B2+D2'], F2: 150, G2: 'Apporteur Z', H2: [80, 'E2*10%'],
      A5: 'TOTAL CA HT', B5: [800, 'SUM(E2:E4)'], F5: [150, 'SUM(F2:F4)'], H5: [80, 'SUM(H2:H4)'],
      A6: 'TOTAL CA HT - APPORTEURS', C6: [720, 'B5-H5'], A7: 'COMS JB Brut', C7: [258, 'C6*15%+F5'],
    }) }, 2024)!;
    expect(sans.lignes.map((l) => [l.rang, l.proprietaire, l.caFichier, l.prime, l.apporteurTexte, l.commission, l.tauxCommission])).toEqual([[2, 'DUPONT', 800, 150, 'Apporteur Z', 80, 0.1]]);
    expect(sans.anomalies[0]).toContain('En-tête absente');
  });

  it('colonne E saisie à la main ≠ B + D : la valeur du fichier est gardée, et l’écart est dit ; l’ancien modèle (E = prime) n’en est pas un', () => {
    const f = lireFeuille({ nom: 'Fév', cellules: cellules({
      A1: 'PROPRIETAIRES', B1: 'PROPRIETAIRES', C1: 'LOCATAIRES', D1: 'LOCATAIRES', E1: 'TOTAL CA HT', F1: 'GESTION',
      A2: 'DUPONT', B2: 2112, C2: 'DURAND', D2: 2600, E2: 150, A4: 'TOTAL CA HT', B4: [150, 'SUM(E2:E3)'], A5: 'COMS JB Brut', C5: [22.5, 'B4*15%+F4'],
    }) }, 2020)!;
    expect(f.lignes[0].caFichier).toBe(150);
    expect(f.anomalies.join(' ')).toContain('CA 150,00 € ≠ honoraires 2112,00 € + 2600,00 € (CA saisi à la main)');
    // Février 2020 (ancien modèle) : E est la colonne « GESTION » — 150 € de prime, le CA est B + D.
    const fev = mois(2020, '2020-02').lignes[0];
    expect([fev.honoProprietaireHt, fev.honoLocataireHt, fev.caFichier, fev.prime, fev.commission]).toEqual([2112, 2600, 4712, 150, 0]);
    expect(mois(2020, '2020-02').anomalies.join(' ')).not.toContain('≠ honoraires');
  });

  it('commission H : le taux de la formule est gardé (10 %, 20 %) ; une commission saisie n’a pas de taux et c’est dit', () => {
    expect(mois(2020, '2020-06').lignes[0].tauxCommission).toBe(0.1);
    expect(mois(2023, '2023-08').lignes[0].tauxCommission).toBe(0.2);
    const saisie = mois(2020, '2020-08').lignes.find((l) => l.rang === 3)!;
    expect([saisie.commission, saisie.tauxCommission]).toEqual([250, null]);
    expect(mois(2020, '2020-08').anomalies.join(' ')).toContain('saisie à la main (250,00 €, sans formule)');
  });

  it('apporteurs : les variantes d’orthographe deviennent UN apporteur (celui de l’annuaire s’il y est), sans doublon', () => {
    expect(memeApporteur('Claire Dumarais', 'Claire Dumarrais')).toBe(true);
    expect(memeApporteur('Paul Rey', 'Paul Reys')).toBe(false);   // nom de 3 lettres : aucune faute tolérée
    expect(memeApporteur('Paul Bouj', 'Paul Boujh')).toBe(true);   // 4 lettres : une
    expect(memeApporteur('Mme Lantier', 'Lantier')).toBe(true);
    expect(memeApporteur('Madame Lantier', 'Mme Lantier')).toBe(true);
    expect(memeApporteur('Roux Stéphane', 'Stéphane Roux')).toBe(true);
    expect(memeApporteur('Claire Dumarais', 'Marie Dumarais')).toBe(false);   // deux prénoms : deux personnes
    const c = canoniserApporteurs(['Claire Dumarrais', 'Claire Dumarais', 'Claire Dumarais', 'Hugo Ferrant', 'Hugo Ferant', 'Mme Lantier', 'Lantier'], ['Hugo Ferrant']);
    expect(c.retenu.get('Claire Dumarrais')).toBe('Claire Dumarais');
    expect(c.retenu.get('Hugo Ferant')).toBe('Hugo Ferrant');
    expect(c.retenu.get('Lantier')).toBe('Mme Lantier');
    expect(new Set(c.retenu.values()).size).toBe(3);
  });

  it('« GESTION PERDU » / « Loyers cc » (2025) : lues quand elles sont remplies, y compris quand l’en-tête est plus bas', () => {
    const sept = mois(2025, '2025-09').gestionsPerdues!;
    expect(sept).toHaveLength(5);
    expect(sept.reduce((s, g) => s + (g.loyersCc ?? 0), 0)).toBe(1380 + 1111 + 800 + 800 + 883);
    expect(sept.every((g) => g.proprietaire.startsWith('Propriétaire perdu'))).toBe(true);
    expect(mois(2025, '2025-11').gestionsPerdues!.map((g) => g.loyersCc)).toEqual([2000]);
    expect(mois(2025, '2025-01').gestionsPerdues).toEqual([]);
  });

  it('bas de feuille : 12,5 % puis 15 % ; deux rétrocessions ; une ligne hors commission ; une commission de vente ajoutée ; un total qui oublie des lignes', () => {
    expect(reglesDesFichiers([...lu(2020).mois, ...lu(2021).mois]).map((r) => [r.depuis, r.tauxNegociateur])).toEqual([['2019-11-01', 0.125], ['2020-09-01', 0.15]]);
    expect(mois(2025, '2025-08').totaux.retrocessions).toEqual([{ libelle: expect.any(String), montant: 613.93 }, { libelle: expect.any(String), montant: 379.98 }]);
    expect(retrocessionsDuMois(mois(2025, '2025-08'), NEGO).map((r) => r.montant)).toEqual([613.93, 379.98]);
    expect(mois(2022, '2022-03').totaux.horsCommission).toEqual([{ rang: 8, montant: 730 }]);
    expect(retrocessionsDuMois(mois(2022, '2022-03'), NEGO).map((r) => Math.round(r.montant * 100) / 100)).toEqual([109.5]);
    const vente = mois(2025, '2025-12').totaux.ecarts!;
    expect(vente.map((e) => [e.commission, e.ca])).toEqual([[-2916.67, 0]]);
    expect(mois(2021, '2021-06').totaux.ecarts!.map((e) => Math.round(e.apporteurs * 100) / 100)).toEqual([128.33]);
    expect(mois(2021, '2021-06').totaux.ecarts![0].libelle).toContain('=SUM(H2:H9)');
    expect(mois(2024, '2024-05').totaux.ecarts!.map((e) => e.ca)).toEqual([850]);
  });

  it('une ligne sans nom qui porte une commission (août 2024 : 558 €) est lue et comptée, et c’est dit', () => {
    const l = mois(2024, '2024-08').lignes.find((x) => x.rang === 18)!;
    expect([l.proprietaire, l.locataire, l.commission, l.caFichier]).toEqual(['', '', 558, 0]);
    expect(mois(2024, '2024-08').anomalies.join(' ')).toContain('Ligne 18 : des montants sans propriétaire ni locataire');
  });

  it('un second négociateur dans l’onglet (sept. 2023) : lu à part, signalé, jamais mêlé ; la ventilation est ramenée à ce bloc', () => {
    const m = mois(2023, '2023-09');
    expect(m.autreBloc).toMatchObject({ negociateur: 'Négociatrice B', caHt: 675, commissionBrute: 33.75, tauxNegociateur: 0.05 });
    expect(m.autreBloc!.lignes).toHaveLength(1);
    expect(m.lignes.some((l) => l.caFichier === 675 && l.rang === 3 && l.cle.includes('#K'))).toBe(false);
    expect(m.totaux.ventilationAvec).toBe(2839.5);
    expect(m.anomalies.join(' ')).toContain('NON importées');
  });
});

describe('🔴 Historique — « année par année » (Suivi annuel)', () => {
  it('une ligne par année d’activité ; la commission seulement pour qui peut la voir', () => {
    const acts = [2020, 2021].flatMap((annee) => {
      const { mois: m } = lu(annee);
      return planifier(m, [], { collaborateurs: [], dejaImportees: new Set(), bauxSuivis: new Set(), source: sourceDe(annee) }).map((p) => versActivite(p, NEGO));
    });
    const regles = reglesDesFichiers([...lu(2020).mois, ...lu(2021).mois]);
    const h = historiqueAnnees(acts, { regles, apporteurs: [], retrocessions: [] }, true);
    expect(h.map((x) => [x.annee, Math.round(x.ca * 100) / 100])).toEqual([[2019, 9118.5], [2020, 72321.02], [2021, 100897.32 + 0]]);
    expect(Math.round(h[0].commission! * 100) / 100).toBe(3839.81);
    expect(historiqueAnnees(acts, { regles, apporteurs: [], retrocessions: [] }, false).every((x) => x.commission === null)).toBe(true);
  });
});
