import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { lireClasseurDetaille, type ClasseurLu, type GestionPerdueExcel } from './lectureExcel';
import { controler, planifier, reglesDesFichiers, retrocessionsDuMois, sourceDe, versActivite } from './planImport';
import { ecarterApporteurs, empreinte, estEcarte, FUSIONNER_SECOND_BLOC, notesEcarts, ONGLETS_MOIS, rapprocherGestionsPerdues, type BienPerte } from './decisionsHistorique';
import { gestionDuMois, type LigneGestion } from './tableauBord';

/**
 * 🔴 Arno (23/10/2026) — les DÉCISIONS sur l'historique 2019 → 2025, une épreuve par décision, sur les copies anonymisées.
 */
const fixture = (annee: number): ClasseurLu => JSON.parse(readFileSync(path.join(process.cwd(), `app/lib/location/suivi/__fixtures__/suiviMensuel${annee}.anonyme.json`), 'utf8')) as ClasseurLu;
const decide = (annee: number) => lireClasseurDetaille(fixture(annee), annee, { ongletsMois: ONGLETS_MOIS[sourceDe(annee)], fusionnerSecondBloc: FUSIONNER_SECOND_BLOC });
const NEGO = { id: 5, libelle: 'Jean-Baptiste PONS' };
const controle = (annee: number, mois = decide(annee).mois) => {
  const plan = planifier(mois, [], { collaborateurs: [], dejaImportees: new Set(), bauxSuivis: new Set(), source: sourceDe(annee) });
  return { plan, c: controler(mois, plan.map((p) => versActivite(p, NEGO)), reglesDesFichiers(mois), mois.flatMap((x) => retrocessionsDuMois(x, NEGO))) };
};

describe('🔴 Décision 1 — « Feuil2 » (2024) = décembre 2024 ; « Feuil1 » (vide) reste ignorée', () => {
  it('les 6 baux de « Feuil2 » entrent en 2024-12, au centime ; « Feuil1 » seule reste à part', () => {
    const d = decide(2024);
    const dec = d.mois.find((m) => m.mois === '2024-12')!;
    expect(dec.nomFeuille).toBe('Feuil2');
    expect(dec.lignes).toHaveLength(6);
    expect(Math.round(dec.totaux.caHt * 100) / 100).toBe(5143.14);
    expect(dec.lignes.every((l) => l.cle.startsWith('2024-12#'))).toBe(true);
    expect(dec.anomalies[0]).toContain('« Feuil2 » lu comme 2024-12');
    expect(d.ignorees.map((g) => g.nom)).toEqual(['Feuil1']);
    expect(d.mois).toHaveLength(12);
    const { c } = controle(2024, d.mois);
    expect(c.filter((x) => !x.auCentime).map((x) => x.mois)).toEqual([]);
  });
});

describe('🔴 Décision 2 — le second bloc (sept.-oct. 2023) importé sous le négociateur du fichier, à SA règle', () => {
  it('la ligne du bloc rejoint les lignes du mois ; l’effet sur la commission est un écart expliqué (15 %, pas 5 %)', () => {
    const sept = decide(2023).mois.find((m) => m.mois === '2023-09')!;
    const bloc = sept.lignes.filter((l) => l.cle.includes('#K'));
    expect(bloc.map((l) => [l.caFichier, l.avecGestion])).toEqual([[675, true]]);
    const e = sept.totaux.ecarts!.find((x) => x.libelle.includes('second bloc'))!;
    expect([e.ca, Math.round(e.commission * 100) / 100]).toEqual([675, 101.25]);
    expect(e.libelle).toContain('le fichier lui comptait à part 33,75 € (5 %), non ajoutés');
    expect(sept.totaux.ventilationAvec).toBe(3514.5);   // la ventilation du fichier, ce bloc compris
    const { c } = controle(2023);
    expect(c.filter((x) => !x.auCentime).map((x) => x.mois)).toEqual([]);
    const s = c.find((x) => x.mois === '2023-09')!;
    expect([s.caFichier, s.caOutil]).toEqual([4012.5, 4687.5]);
    // Sans la décision : le bloc reste à part (comportement d'avant).
    expect(lireClasseurDetaille(fixture(2023), 2023).mois.find((m) => m.mois === '2023-09')!.lignes.some((l) => l.cle.includes('#K'))).toBe(false);
  });
});

describe('🔴 Décision 3 — écart avec le fichier : l’outil garde le calcul juste, une note le dit (montant du fichier en info-bulle)', () => {
  it('une note par écart, sur le total qu’il touche : fichier → outil', () => {
    const n21 = notesEcarts(decide(2021).mois, controle(2021).c, 'CA_JBP_2021');
    expect(n21.map((n) => [n.mois, n.champ, Math.round(n.fichier * 100) / 100, Math.round(n.outil * 100) / 100])).toEqual([
      ['2021-06', 'apporteurs', 86.67, 215], ['2021-09', 'apporteurs', 382.42, 1078.25], ['2021-10', 'apporteurs', 256.67, 601.25]]);
    const n25 = notesEcarts(decide(2025).mois, controle(2025).c, 'CA_JBP_2025');
    expect(n25.map((n) => [n.mois, n.champ, Math.round(n.fichier * 100) / 100, Math.round(n.outil * 100) / 100])).toEqual([['2025-12', 'commission', 4365.31, 1448.64]]);
    const n24 = notesEcarts(decide(2024).mois, controle(2024).c, 'CA_JBP_2024');
    expect(n24.map((n) => [n.mois, n.champ, n.fichier, n.outil])).toEqual([['2024-05', 'ca', 4442.889999999999, 5292.889999999999]]);
    expect(new Set([...n21, ...n25, ...n24].map((n) => n.importCle)).size).toBe(5);
  });
});

describe('🔴 Décision 4 — trois noms ne sont pas des apporteurs : jamais créés, leur nom nulle part', () => {
  it('reconnus à l’empreinte de leur nom (jamais écrit en clair dans le code) ; civilité, casse et accents n’y font rien', () => {
    expect(empreinte('Mme  Élodie TEST')).toBe(empreinte('elodie test'));
    expect(estEcarte('Frédéric Rousseau')).toBe(false);
  });
  it('la ligne garde son CA et sa commission, sans apporteur ni origine ; le nom disparaît des anomalies et des rétrocessions', () => {
    const ecarte = (t: string) => t === 'Apporteur I';   // l'alias, dans la copie anonymisée, de l'un des trois noms
    const e = ecarterApporteurs(decide(2024).mois, ecarte, () => false);
    expect([e.lignes, e.commission]).toEqual([1, 558]);
    const aout = e.mois.find((m) => m.mois === '2024-08')!;
    const l = aout.lignes.find((x) => x.rang === 18)!;
    expect([l.apporteurTexte, l.commission]).toEqual([null, 558]);
    expect(aout.anomalies.join(' ')).not.toContain('Apporteur I');
    const plan = planifier(e.mois, [], { collaborateurs: [], dejaImportees: new Set(), bauxSuivis: new Set(), source: 'CA_JBP_2024' });
    const p = plan.find((x) => x.ligne.cle === '2024-08#18')!;
    expect([p.apporteur, p.origine.origine]).toEqual([null, null]);
    expect(versActivite(p, NEGO)).toMatchObject({ apporteurNom: null, apporteurId: null, commissionSaisie: 558, origineContact: null });
    const { c } = controle(2024, e.mois);
    expect(c.every((x) => x.auCentime)).toBe(true);   // la commission reste comptée : le contrôle au centime tient
    // Une rétrocession nommée par le seul prénom (août 2025) ne le garde pas.
    const r = ecarterApporteurs(decide(2025).mois, () => false, (t) => t === 'Texte 17');
    expect(r.mois.find((m) => m.mois === '2025-08')!.totaux.retrocessions!.map((x) => x.libelle)).toEqual(['Texte 1', 'Rétrocession (commissions)']);
  });
});

describe('🔴 Décision 5 — les gestions perdues du fichier entrent dans « Mandats de gestion perdus »', () => {
  const p = (mois: string, rang: number, proprietaire: string, loyersCc: number | null): GestionPerdueExcel => ({ mois, rang, proprietaire, loyersCc, commentaire: 'Parti ailleurs' });
  const biens: BienPerte[] = [
    { lotId: 12, proprietaire: 'DUPRÉ Françoise', adresse: '43 avenue Marceau, COURBEVOIE', statut: 'en_gestion', tauxConditions: 6, tauxWippimmo: 5 },
    { lotId: 20, proprietaire: 'LEROUX Paul', adresse: '4 allée Botticelli, COURBEVOIE', statut: 'en_gestion', tauxConditions: null, tauxWippimmo: 5.5 },
    { lotId: 21, proprietaire: 'LEROUX Paul', adresse: '35 rue Rouget de Lisle, ISSY', statut: 'en_gestion', tauxConditions: null, tauxWippimmo: null },
  ];
  it('rapprochée au bien (l’adresse départage deux biens du même propriétaire) ; taux : conditions, sinon WIPPIMMO, sinon réglage — toujours dit', () => {
    const r = rapprocherGestionsPerdues([p('2025-09', 5, 'DUPRÉ', 883), p('2025-09', 6, 'LEROUX 4 allée Botticelli Courbevoie', 800), p('2025-09', 7, 'LEROUX', 800), p('2025-10', 4, 'INCONNU PARIS 15', 1380)],
      biens, { tauxHt: 4.5 }, 'CA_JBP_2025');
    expect(r.map((x) => [x.lotId, x.tauxSource, x.tauxHt])).toEqual([[12, 'conditions', 6], [20, 'wippimmo', 5.5], [null, 'reglage', 4.5], [null, 'reglage', 4.5]]);
    expect(Math.round(r[0].honorairesMensuels! * 100) / 100).toBe(52.98);
    expect(r[2].notes[0]).toContain('2 biens à ce propriétaire');
    expect(r[3].notes[0]).toContain('aucun bien de ce propriétaire');
    expect(r.every((x) => x.notes.some((n) => n.startsWith('taux DÉDUIT')))).toBe(true);
    expect(r.map((x) => x.importCle)).toEqual(['CA_JBP_2025#perdue#2025-09#5', 'CA_JBP_2025#perdue#2025-09#6', 'CA_JBP_2025#perdue#2025-09#7', 'CA_JBP_2025#perdue#2025-10#4']);
  });
  it('la copie 2025 porte les 7 pertes ; dans le Suivi du mois, elles sont des mandats perdus et entrent dans la balance', () => {
    const toutes = decide(2025).mois.flatMap((m) => m.gestionsPerdues ?? []);
    expect(toutes.map((g) => g.mois)).toEqual(['2025-09', '2025-09', '2025-09', '2025-09', '2025-09', '2025-10', '2025-11']);
    const fichier: LigneGestion = { lotId: null, libelle: 'PROPRIÉTAIRE PERDU 1', proprietaire: 'PROPRIÉTAIRE PERDU 1', effetLe: '2025-09-01', avant: 'en_gestion',
      apres: 'perdue_fichier', loyerHc: 1380, provisions: 0, base: 'cc', tauxHt: 4.5, origine: 'fichier', tauxSource: 'reglage' };
    const g = gestionDuMois([fichier], '2025-09');
    expect(g.perdues).toHaveLength(1);
    expect(Math.round(g.perduMensuel * 100) / 100).toBe(62.1);
    expect(Math.round(g.balanceAnnuelle * 100) / 100).toBe(-745.2);
  });
});

describe('🔴 Migration 408 : ajout seul, rejouable', () => {
  it('crée ses deux tables « si absentes », sans rien supprimer ni modifier', () => {
    const sql = readFileSync(path.join(process.cwd(), 'db/migrations/408_location_suivi_historique.sql'), 'utf8').replace(/--.*$/gm, '');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS gestion_location_gestion_perdue');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS gestion_location_ecart_fichier');
    expect(sql).not.toMatch(/\b(DROP|DELETE|UPDATE|TRUNCATE)\b/i);
    expect((sql.match(/import_cle\s+text UNIQUE/g) ?? []).length).toBe(2);
  });
});
