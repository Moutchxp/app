import { describe, it, expect } from 'vitest';
import {
  relanceReponseDue, executerRelanceReponsePartielle, MOTIF_RELANCE_REPONSE_PREFIXE,
  type CandidatRelanceReponse, type DepsRelanceReponsePartielle,
} from './relanceReponsePartielleAuto';
import { MOTIF_RELANCE_PARTIELLE_PREFIXE, MOTIF_ANNONCE_CADA_PREFIXE } from './cascadePartielleRepo';
import type { FamillePlan } from '../permis/planMasse';

const D = (iso: string | null) => (iso ? new Date(iso) : null);

describe('PART-E — relanceReponseDue (idempotence : réponse plus récente que le dernier sortant + pièces manquantes)', () => {
  const manque: FamillePlan[] = ['masse'];
  it('réponse plus récente que le dernier sortant + manquant → due', () => {
    expect(relanceReponseDue({ dernierMailLe: D('2026-08-30T10:00:00Z'), dernierSortantLe: D('2026-08-20T10:00:00Z'), famillesManquantes: manque })).toBe(true);
  });
  it('jamais relancé encore (aucun sortant) + réponse + manquant → due', () => {
    expect(relanceReponseDue({ dernierMailLe: D('2026-08-30T10:00:00Z'), dernierSortantLe: null, famillesManquantes: manque })).toBe(true);
  });
  it('déjà relancé APRÈS la dernière réponse → NON due (pas de doublon au tic suivant)', () => {
    expect(relanceReponseDue({ dernierMailLe: D('2026-08-20T10:00:00Z'), dernierSortantLe: D('2026-08-25T10:00:00Z'), famillesManquantes: manque })).toBe(false);
  });
  it('aucune réponse mairie → NON due', () => {
    expect(relanceReponseDue({ dernierMailLe: null, dernierSortantLe: null, famillesManquantes: manque })).toBe(false);
  });
  it('plus aucune pièce manquante → NON due (rien à réclamer)', () => {
    expect(relanceReponseDue({ dernierMailLe: D('2026-08-30T10:00:00Z'), dernierSortantLe: null, famillesManquantes: [] })).toBe(false);
  });
});

describe('PART-E — cohabitation CASC-3 : préfixe de journal DISTINCT (n’incrémente jamais le compteur de la cascade)', () => {
  it('le préfixe PART-E ne commence pas comme les préfixes CASC-3', () => {
    expect(MOTIF_RELANCE_REPONSE_PREFIXE.startsWith(MOTIF_RELANCE_PARTIELLE_PREFIXE)).toBe(false);
    expect(MOTIF_RELANCE_REPONSE_PREFIXE.startsWith(MOTIF_ANNONCE_CADA_PREFIXE)).toBe(false);
  });
});

// Fenêtre d'envoi (envoiOuvre) lue en heure LOCALE → dates construites en local (jamais 'Z').
const JEUDI_10H = new Date(2026, 8, 3, 10, 0, 0);   // ouvré, 9-11
const DIMANCHE_10H = new Date(2026, 7, 30, 10, 0, 0); // non ouvré

const cand = (demandeId: number, dernierMailLe: string, rang = 1): CandidatRelanceReponse => ({ demandeId, dernierMailLe: new Date(dernierMailLe), famillesManquantes: ['masse'], rang });

function deps(over: {
  candidats: CandidatRelanceReponse[]; relanceActive?: boolean; calme?: number; now?: Date; debut?: number; fin?: number; cap?: number; erreurSur?: number[];
}): { deps: DepsRelanceReponsePartielle; envois: { demandeId: number; rang: number; objet: string }[] } {
  const envois: { demandeId: number; rang: number; objet: string }[] = [];
  return {
    envois,
    deps: {
      maintenant: () => over.now ?? JEUDI_10H,
      lireConfig: async () => ({ relanceActive: over.relanceActive ?? true, calmeMinutes: over.calme ?? 10, envoiHeureDebut: over.debut ?? 9, envoiHeureFin: over.fin ?? 11, capParRun: over.cap ?? 5 }),
      candidats: async () => over.candidats,
      envoyer: async (demandeId, rang, objet) => { if (over.erreurSur?.includes(demandeId)) throw new Error('envoi KO'); envois.push({ demandeId, rang, objet }); },
    },
  };
}

describe('PART-E — executerRelanceReponsePartielle (mode auto)', () => {
  it('mode MANUEL (relance_auto_active OFF) → rien n’est envoyé (la pastille prend le relais)', async () => {
    const d = deps({ candidats: [cand(1, '2026-08-01T10:00:00Z')], relanceActive: false });
    const bilan = await executerRelanceReponsePartielle(d.deps);
    expect(bilan.envoyes).toBe(0); expect(d.envois).toEqual([]);
    expect(bilan.raison).toContain('mode manuel');
  });

  it('hors fenêtre (dimanche) → REPORTE, rien envoyé', async () => {
    const d = deps({ candidats: [cand(1, '2026-08-01T10:00:00Z')], now: DIMANCHE_10H });
    const bilan = await executerRelanceReponsePartielle(d.deps);
    expect(bilan.reporte).toBe(true); expect(d.envois).toEqual([]);
  });

  it('due + calme écoulé + fenêtre ouverte → envoie la relance (texteRelancePartielle) au bon rang', async () => {
    const d = deps({ candidats: [cand(7, '2026-08-20T10:00:00Z', 3)], now: JEUDI_10H, calme: 10 });
    const bilan = await executerRelanceReponsePartielle(d.deps);
    expect(bilan.envoyes).toBe(1);
    expect(d.envois[0]).toMatchObject({ demandeId: 7, rang: 3 });
    expect(d.envois[0].objet).toContain('relance'); // objet de texteRelancePartielle
  });

  it('calme NON écoulé (dernier mail il y a 2 min) → différé, jamais envoyé (garde vagueCloseeEnvoi)', async () => {
    const recent = new Date(JEUDI_10H.getTime() - 2 * 60_000).toISOString();
    const d = deps({ candidats: [cand(1, recent)], now: JEUDI_10H, calme: 10 });
    const bilan = await executerRelanceReponsePartielle(d.deps);
    expect(bilan.envoyes).toBe(0); expect(bilan.differes).toBe(1);
  });

  it('cap PAR RUN respecté (anti-emballement) — surplus différé', async () => {
    const d = deps({ candidats: [cand(1, '2026-08-01T10:00:00Z'), cand(2, '2026-08-01T10:00:00Z'), cand(3, '2026-08-01T10:00:00Z')], now: JEUDI_10H, cap: 2 });
    const bilan = await executerRelanceReponsePartielle(d.deps);
    expect(bilan.envoyes).toBe(2); expect(bilan.differes).toBe(1);
  });

  it('isolation : un envoi en échec n’arrête pas les suivants', async () => {
    const d = deps({ candidats: [cand(1, '2026-08-01T10:00:00Z'), cand(2, '2026-08-01T10:00:00Z')], now: JEUDI_10H, erreurSur: [1] });
    const bilan = await executerRelanceReponsePartielle(d.deps);
    expect(bilan.envoyes).toBe(1); expect(bilan.erreurs).toBe(1);
    expect(d.envois.map((e) => e.demandeId)).toEqual([2]);
  });
});
