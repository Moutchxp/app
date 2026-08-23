import { describe, it, expect } from 'vitest';
import {
  executerIngestionAuto, construireEtatAutomatisation,
  dansFenetre, nuitCourante, validerArgsCadastre, requisAvecMarge, MARGE_DISQUE_OCTETS,
  type DepsIngestionAuto, type SourceAuto,
} from './ingestionAuto';
import { lireConfigIngestionAuto } from './ingestionAutoRepo';

/**
 * FRAÎCHEUR / F6 — orchestrateur d'ingestion auto (le lot qui EXÉCUTE). Prouve PAR LES TESTS : désactivé → aucune exécution ;
 * hors fenêtre → attente ; dans la fenêtre → exécution ; disque insuffisant → refus + journal ; 2e tentative la nuit → refusée ;
 * une par tick ; et surtout : MIGRATION ABSENTE (config en échec) → tout désactivé → AUCUN runner appelé.
 */

const H = (heure: number) => new Date(`2026-08-23T${String(heure).padStart(2, '0')}:00:00`); // heure LOCALE (getHours déterministe)

interface Faux { deps: DepsIngestionAuto; runners: string[]; refus: string[]; debut: string[]; fin: { resultat: string }[] }
function faux(over: Partial<DepsIngestionAuto> = {}): Faux {
  const runners: string[] = [], refus: string[] = [], debut: string[] = [], fin: { resultat: string }[] = [];
  const deps: DepsIngestionAuto = {
    maintenant: () => H(4), // 4h → dans la fenêtre 3-6
    config: async () => ({ fenetre: { debut: 3, fin: 6 }, actifs: { dila: true, prada: false, sitadel: false, cadastre: false } }),
    actionnables: async () => new Set(['dila']),
    dejaTentee: async () => false,
    disqueLibre: async () => 100 * 1024 ** 3, // 100 Go
    journaliserRefus: async (s) => { refus.push(s); },
    journaliserDebut: async (s) => { debut.push(s); return 1; },
    journaliserFin: async (_id, _f, resultat) => { fin.push({ resultat }); },
    executerRunner: async (s) => { runners.push(s); return { ok: true, erreur: null }; },
    ...over,
  };
  return { deps, runners, refus, debut, fin };
}

describe('executerIngestionAuto — garde-fous', () => {
  it('interrupteur DÉSACTIVÉ → aucune exécution', async () => {
    const f = faux({ config: async () => ({ fenetre: { debut: 3, fin: 6 }, actifs: { dila: false, prada: false, sitadel: false, cadastre: false } }) });
    const r = await executerIngestionAuto(f.deps);
    expect(r.agi).toBe('rien');
    expect(f.runners).toEqual([]);
  });

  it('HORS FENÊTRE (12h) → attente, aucune exécution', async () => {
    const f = faux({ maintenant: () => H(12) });
    const r = await executerIngestionAuto(f.deps);
    expect(r.agi).toBe('hors_fenetre');
    expect(f.runners).toEqual([]);
  });

  it('DANS LA FENÊTRE + actif + actionnable + disque OK → exécution (une seule), tracée début→fin', async () => {
    const f = faux();
    const r = await executerIngestionAuto(f.deps);
    expect(r).toMatchObject({ agi: 'succes', source: 'dila' });
    expect(f.runners).toEqual(['dila']);
    expect(f.debut).toEqual(['dila']);
    expect(f.fin).toEqual([{ resultat: 'succes' }]);
  });

  it('DISQUE INSUFFISANT → refus journalisé, AUCUNE exécution', async () => {
    const f = faux({ disqueLibre: async () => 1 * 1024 ** 3 }); // 1 Go < requis dila (~5,5 Go avec marge)
    const r = await executerIngestionAuto(f.deps);
    expect(r).toMatchObject({ agi: 'refus', motif: 'disque_insuffisant' });
    expect(f.refus).toEqual(['dila']);
    expect(f.runners).toEqual([]);
  });

  it('disque INDÉTERMINABLE (null) → refus (on ne remplit jamais le disque à l’aveugle)', async () => {
    const f = faux({ disqueLibre: async () => null });
    const r = await executerIngestionAuto(f.deps);
    expect(r.agi).toBe('refus');
    expect(f.runners).toEqual([]);
  });

  it('DÉJÀ TENTÉE cette nuit → aucune exécution (une tentative / source / nuit)', async () => {
    const f = faux({ dejaTentee: async () => true });
    const r = await executerIngestionAuto(f.deps);
    expect(r.agi).toBe('rien');
    expect(f.runners).toEqual([]);
  });

  it('UNE INGESTION PAR TICK : deux sources éligibles → un seul runner appelé', async () => {
    const f = faux({
      config: async () => ({ fenetre: { debut: 3, fin: 6 }, actifs: { dila: true, prada: true, sitadel: false, cadastre: false } }),
      actionnables: async () => new Set(['dila', 'prada']),
    });
    await executerIngestionAuto(f.deps);
    expect(f.runners).toHaveLength(1);
  });

  it('échec d’ingestion → journalisé « echec », aucune boucle (return immédiat)', async () => {
    const f = faux({ executerRunner: async () => ({ ok: false, erreur: 'HTTP 500' }) });
    const r = await executerIngestionAuto(f.deps);
    expect(r.agi).toBe('echec');
    expect(f.fin).toEqual([{ resultat: 'echec' }]);
  });
});

describe('PREUVE — migration 143 ABSENTE → tout désactivé → AUCUN runner', () => {
  it('config lue via le repli RÉEL (requête qui échoue = colonnes absentes) → aucune exécution', async () => {
    const reqEnEchec = (async () => { throw new Error('column "dila_auto_active" does not exist'); }) as unknown as Parameters<typeof lireConfigIngestionAuto>[0];
    const f = faux({ config: () => lireConfigIngestionAuto(reqEnEchec) }); // ← le VRAI repli, pas un mock d'états
    const r = await executerIngestionAuto(f.deps);
    expect(r.agi).toBe('rien');
    expect(f.runners).toEqual([]); // rien n'a pu partir entre le commit et l'application de la migration
  });
});

describe('helpers purs', () => {
  it('dansFenetre : 3-6 contient 4, exclut 12 ; fenêtre traversant minuit 23-2', () => {
    expect(dansFenetre(H(4), 3, 6)).toBe(true);
    expect(dansFenetre(H(12), 3, 6)).toBe(false);
    expect(dansFenetre(H(23), 23, 2)).toBe(true);
    expect(dansFenetre(H(1), 23, 2)).toBe(true);
    expect(dansFenetre(H(5), 23, 2)).toBe(false);
  });
  it('nuitCourante : après minuit dans une fenêtre traversante → nuit de la veille', () => {
    expect(nuitCourante(new Date('2026-08-23T01:00:00'), 23, 2)).toBe('2026-08-22');
    expect(nuitCourante(new Date('2026-08-23T04:00:00'), 3, 6)).toBe('2026-08-23');
  });
  it('validerArgsCadastre : millésime externe validé au motif strict, refus sinon', () => {
    expect(validerArgsCadastre('2026-06-01', '75,78,92,93').ok).toBe(true);
    expect(validerArgsCadastre('latest', '75').ok).toBe(false);
    expect(validerArgsCadastre('2026-06-01', '7a').ok).toBe(false);
    expect(validerArgsCadastre('2026-06-01; rm -rf /', '75').ok).toBe(false);
  });
  it('requisAvecMarge inclut la marge de sécurité (≥ 5 Go)', () => {
    expect(requisAvecMarge('dila' as SourceAuto)).toBe(500 * 1024 ** 2 + MARGE_DISQUE_OCTETS);
    expect(MARGE_DISQUE_OCTETS).toBeGreaterThanOrEqual(4 * 1024 ** 3);
  });
});

describe('construireEtatAutomatisation — cas (b)/(c) → aucun interrupteur', () => {
  const modele = construireEtatAutomatisation({
    sources: [{ cle: 'dila', nom: 'DILA' }, { cle: 'bdtopo_bati', nom: 'BD TOPO bâtiment' }, { cle: 'lidar', nom: 'LiDAR HD' }],
    actionnables: new Set(['dila']),
    avecCommande: new Set(['dila', 'bdtopo_bati']), // bdtopo_bati a un bloc de commande (cas b) ; lidar non (cas c)
    fenetre: { debut: 3, fin: 6 },
    actifs: { dila: true },
    dernierParSource: {},
    nuit: '2026-08-23',
  });
  const s = (cle: string) => modele.sources.find((x) => x.cle === cle)!;

  it('DILA (a) → automatisable, actif, en attente cette nuit', () => {
    expect(s('dila')).toMatchObject({ automatisable: true, actif: true, enAttenteCetteNuit: true, raisonManuelle: null });
  });
  it('BD TOPO bâtiment (b) → PAS d’interrupteur, raison « étape manuelle requise »', () => {
    expect(s('bdtopo_bati')).toMatchObject({ automatisable: false, raisonManuelle: 'étape manuelle requise' });
  });
  it('LiDAR (c) → PAS d’interrupteur, raison « aucune procédure connue »', () => {
    expect(s('lidar')).toMatchObject({ automatisable: false, raisonManuelle: 'aucune procédure connue' });
  });
});
