import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 🔴🔴 Décision d'Arno (26/11/2026) — « oui, les restitutions doivent apparaître dans l'historique de la fiche du locataire, puisque la fenêtre « Faire
 * restitution » annonce qu'elles sont « journalisées dans le dossier du locataire » » : « Restitution des 20 % validée le JJ/MM/AAAA — X,XX € restitués sur
 * Y,YY € retenus (différence Z,ZZ € : motif) », puis « par Prénom NOM, le JJ/MM/AAAA à HHhMM » ; une restitution annulée, son annulation dessous.
 */
const h = vi.hoisted(() => ({ journal: [] as Record<string, unknown>[], restitutions: [] as Record<string, unknown>[], sql: [] as { s: string; p: unknown[] }[] }));
vi.mock('../db/client', () => ({
  query: async (sql: string, p: unknown[] = []) => {
    const s = sql.replace(/\s+/g, ' ');
    h.sql.push({ s, p });
    if (s.includes('FROM gestion_journal j LEFT JOIN admin_utilisateur')) return { rows: h.journal };
    if (s.includes('FROM gestion_location_restitution_vingt f LEFT JOIN gestion_location_restitution_vingt a')) return { rows: h.restitutions };
    return { rows: [] };
  },
}));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
const { historiqueFiche } = await import('../gestion/traceJournal');
const { ligneRestitutionHistorique, restitutionDeLaLigne, texteRestitutionHistorique, leAHeure, parQui } = await import('./restitutionHistorique');

const J = (id: number, action: string, commentaire: string, quand: string, extra: Record<string, unknown> = {}) => ({
  id: String(id), quand: `${quand}+01`, quand_paris: quand, action, auteur_id: '2', nom: 'Arnaud Jorel', prenom: 'Arnaud', nom_famille: 'Jorel', auteur_libelle: 'a.jorel@sansvisavis.com',
  champ: null, ecran: null, valeur_avant: null, valeur_apres: 'restitution …', commentaire, ...extra });

beforeEach(() => {
  h.sql.length = 0;
  h.journal = [
    J(46861, 'location_restitution_20_faite', 'Restitution des 20 % du dépôt de garantie — sortie validée 40, restitution 6', '2026-11-26 00:02:14.3'),
    J(46859, 'location_restitution_20_annulee', 'Restitution 4 annulée (erreur de saisie) — la sortie 40 revient sur « 20 % à restituer »', '2026-11-26 00:01:40'),
    J(45000, 'location_modifie', 'Téléphone modifié', '2026-11-20 10:00:00', { champ: 'Téléphone', valeur_avant: '06', valeur_apres: '07' }),
    J(46854, 'location_restitution_20_faite', 'Virement effectué le 21/11/2026 — sortie validée 40, restitution 4', '2026-11-25 21:38:00',
      { auteur_id: null, nom: null, prenom: null, nom_famille: null, auteur_libelle: 'Gestion locative' }),
  ];
  h.restitutions = [
    { id: '6', date: '2026-11-21', restitue: '243.60', vingt: '280.00', retenu: '36.40', motif: 'Retenue au titre de la régularisation des charges', a_le: null, a_prenom: null, a_nom: null, a_libelle: null },
    { id: '4', date: '2026-11-21', restitue: '243.60', vingt: null, retenu: '36.40', motif: null, a_le: '2026-11-26 00:01:40', a_prenom: 'Arnaud', a_nom: 'Jorel', a_libelle: 'a.jorel@sansvisavis.com' },
  ];
});

describe('🔴🔴 le texte d’une restitution dans l’historique du locataire', () => {
  it('« Restitution des 20 % validée le … — … restitués sur … retenus (différence … : motif) » ; sans 20 % connu ni motif : ce qui est su', () => {
    expect(texteRestitutionHistorique({ id: 6, date: '2026-11-21', restitue: 243.6, vingt: 280, retenu: 36.4, motif: 'régularisation', annulation: null }))
      .toBe('Restitution des 20 % validée le 21/11/2026 — 243,60 € restitués sur 280,00 € retenus (différence 36,40 € : régularisation)');
    expect(texteRestitutionHistorique({ id: 4, date: '2026-11-21', restitue: 243.6, vingt: null, retenu: 36.4, motif: null, annulation: null }))
      .toBe('Restitution des 20 % validée le 21/11/2026 — 243,60 € restitués (différence 36,40 €)');
    expect(texteRestitutionHistorique({ id: 7, date: '2026-11-21', restitue: 400, vingt: 400, retenu: null, motif: null, annulation: null }))
      .toBe('Restitution des 20 % validée le 21/11/2026 — 400,00 € restitués sur 400,00 € retenus');
  });
  it('la restitution nommée par le journal ; « par Prénom NOM, le … à HHhMM » (adresse en dernier recours)', () => {
    expect(restitutionDeLaLigne('location_restitution_20_faite', 'X — sortie validée 40, restitution 6')).toBe(6);
    expect(restitutionDeLaLigne('location_restitution_20_annulee', 'Restitution 4 annulée (erreur de saisie) — …')).toBe(4);
    expect(restitutionDeLaLigne('location_modifie', 'restitution 6')).toBeNull();
    expect(leAHeure('2026-11-26 00:02:14')).toBe('le 26/11/2026 à 00h02');
    expect(parQui({ prenom: 'Arnaud', nom: 'Jorel', libelle: 'a.jorel@sansvisavis.com' })).toBe('Arnaud JOREL');
    expect(parQui({ prenom: null, nom: null, libelle: 'x@exemple.test' })).toBe('x@exemple.test');
    expect(ligneRestitutionHistorique({ action: 'location_restitution_20_faite', commentaire: '… restitution 9', quand: '2026-11-26 00:00', par: 'A' }, new Map())).toBeNull();
  });
});

describe('🔴🔴 historiqueFiche du LOCATAIRE : les restitutions, à leur place chronologique', () => {
  it('les lignes du dossier du locataire (restitution, annulation, nouvelle restitution), les autres lignes inchangées ; lecture seule', async () => {
    const l = await historiqueFiche('locataire', 583);
    expect(l.map((x) => x.id)).toEqual([46861, 46859, 45000, 46854]);                // l'ordre du journal, inchangé
    expect(l[0].restitution).toEqual({ texte: 'Restitution des 20 % validée le 21/11/2026 — 243,60 € restitués sur 280,00 € retenus (différence 36,40 € : Retenue au titre de la régularisation des charges)',
      par: 'par Arnaud JOREL, le 26/11/2026 à 00h02', annulee: null });
    expect(l[1].restitution).toEqual({ texte: 'Restitution 4 annulée (erreur de saisie) — la sortie 40 revient sur « 20 % à restituer »', par: 'par Arnaud JOREL, le 26/11/2026 à 00h01', annulee: null });
    expect(l[3].restitution).toEqual({ texte: 'Restitution des 20 % validée le 21/11/2026 — 243,60 € restitués (différence 36,40 €)',
      par: 'par Gestion locative, le 25/11/2026 à 21h38', annulee: 'Annulée le 26/11/2026 à 00h01 par Arnaud JOREL' });
    // une ligne ordinaire garde son format
    expect(l[2]).toEqual({ id: 45000, quand: '2026-11-20 10:00:00+01', par: 'Arnaud Jorel', parId: 2, champ: 'Téléphone', avant: '06', apres: '07', texte: 'Téléphone modifié', ecran: null });
    const sql = h.sql.find((x) => x.s.includes('FROM gestion_journal j'))!;
    expect(sql.s).toContain("OR (j.entite = 'annuaire' AND j.entite_id = $1 AND j.action IN ('location_restitution_20_faite', 'location_restitution_20_annulee'))");
    expect(h.sql.find((x) => x.s.includes('FROM gestion_location_restitution_vingt f'))!.p).toEqual([[6, 4]]);
    expect(h.sql.some((x) => /^(INSERT|UPDATE|DELETE)/.test(x.s.trim()))).toBe(false);
  });
  it('le BIEN : rien ne change (ni restitutions ajoutées au filtre, ni rendu particulier)', async () => {
    h.journal = [J(46862, 'location_restitution_20_faite', 'Restitution des 20 % du dépôt de garantie — sortie validée 40, restitution 6', '2026-11-26 00:02:14')];
    const l = await historiqueFiche('lot', 503);
    expect(l[0].restitution).toBeUndefined();
    expect(l[0].texte).toBe('Restitution des 20 % du dépôt de garantie — sortie validée 40, restitution 6');
    expect(h.sql.find((x) => x.s.includes('FROM gestion_journal j'))!.s).not.toContain('location_restitution_20_faite');
  });
  it('le contrôle de conflit d’une fiche ouverte (filtreFiche) ne compte pas les restitutions ; « Dernière modification » non plus', () => {
    const t = readFileSync('app/lib/gestion/traceJournal.ts', 'utf8');
    const f = t.slice(t.indexOf('export function filtreFiche'), t.indexOf('\n}\n', t.indexOf('export function filtreFiche')));
    expect(f).not.toContain('location_restitution');
    expect(readFileSync('app/(admin)/api/admin/gestion/annuaire/location/route.ts', 'utf8')).toContain('derniere: historique.find((h) => h.restitution === undefined) ?? null');
    const ecran = readFileSync('app/(admin)/admin/(protected)/location/TraceFiche.tsx', 'utf8');
    expect(ecran).toContain('derniere: x.historique.find((h) => h.restitution === undefined) ?? null');
    expect(ecran).toContain('{l.restitution.annulee !== null && <span className="trf-restitution-annulee" data-restitution-annulee>{l.restitution.annulee}</span>}');
  });
});
