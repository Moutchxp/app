// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { GrilleDateHeures } from './GrilleDateHeures';
import { DUREES_RDV_DEFAUT, MINUTES_RDV_DEFAUT, PLAGE_RDV_DEFAUT } from '../../../../lib/location/minutesRdv';

/**
 * 🔴🔴 Arno (19/11/2026) — LA DURÉE D'UN RENDEZ-VOUS ET LA FIN CALCULÉE : le vrai composant (pré-visite et état des lieux le partagent), rendu dans
 * un parent qui garde début et fin comme les formulaires. 30 min d'office ; début 10h00 → fin 10h30 ; 1 h → 11h00 ; fin à la main → « Personnalisée » ;
 * début 20h00 → seules les durées qui finissent au plus tard à 21h00 ; « Modifier / déplacer » : la durée déduite du rendez-vous actuel.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let hote: HTMLDivElement; let racine: Root;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote); });
afterEach(() => { act(() => racine.unmount()); hote.remove(); });

const etat = { debut: '', fin: '' };
function Parent({ debut0 = '', fin0 = '', plage = PLAGE_RDV_DEFAUT, defaut = 30 }: { debut0?: string; fin0?: string; plage?: typeof PLAGE_RDV_DEFAUT; defaut?: number }) {
  const [jour, setJour] = useState('2099-01-06');
  const [debut, setDebut] = useState(debut0);
  const [fin, setFin] = useState(fin0);
  etat.debut = debut; etat.fin = fin;
  return createElement(GrilleDateHeures, { classe: 'pvv-grille', libelles: { date: 'Date *', debut: 'Début *', fin: 'Fin *' }, jour, onJour: setJour,
    debut, onDebut: setDebut, fin, onFin: setFin, minutes: MINUTES_RDV_DEFAUT, plage, durees: { ...DUREES_RDV_DEFAUT, defaut },
    donnees: { jour: 'data-j', debut: 'data-d', fin: 'data-f' } });
}
const rendre = (p: Parameters<typeof Parent>[0] = {}) => act(() => racine.render(createElement(Parent, p)));
function choisirDans(champ: HTMLElement, id: string): void {
  flushSync(() => champ.click());
  const o = champ.closest('.lch')!.querySelector(`li[data-option="${id}"]`) as HTMLElement | null;
  if (o === null) throw new Error(`option absente : ${id}`);
  flushSync(() => o.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}
const choisirHeure = (sel: string, v: string) => act(() => {
  const el = hote.querySelector(sel)!; const [h, m] = v.split(':');
  choisirDans(el.querySelector('[data-heure]') as HTMLElement, h); choisirDans(el.querySelector('[data-minute]') as HTMLElement, m);
});
const choisirDuree = (id: string) => act(() => choisirDans(hote.querySelector('[data-duree-choix]') as HTMLElement, id));
const duree = () => hote.querySelector('[data-duree-rdv]')!.getAttribute('data-duree');
const dureeLue = () => hote.querySelector('[data-duree-choix]')!.textContent;
const dureesProposees = () => { const c = hote.querySelector('[data-duree-choix]') as HTMLElement; flushSync(() => c.click());
  const l = [...c.closest('.lch')!.querySelectorAll('li[data-option]')].map((x) => x.getAttribute('data-option')); flushSync(() => c.click()); return l; };

describe('🔴🔴 Arno (19/11/2026) — la durée du rendez-vous et l’heure de fin calculée', () => {
  it('« Durée * » à côté de la date ; 30 min d’office ; les durées du réglage : 15 min, 30 min, 45 min, 1 h', () => {
    rendre();
    expect(hote.querySelector('[data-duree-rdv] .gdh-libelle')?.textContent).toBe('Durée *');
    expect(duree()).toBe('30');
    expect(dureeLue()).toContain('30 min');
    expect(dureesProposees()).toEqual(['15', '30', '45', '60']);
  });
  it('début 10h00 → fin 10h30 ; passage à 1 h → fin 11h00 ; nouveau début 14h15 → fin 15h15', () => {
    rendre();
    choisirHeure('[data-d]', '10:00');
    expect(etat.fin).toBe('10:30');
    expect(hote.querySelector('[data-f]')?.getAttribute('data-valeur')).toBe('10:30');
    choisirDuree('60');
    expect(etat.fin).toBe('11:00');
    choisirHeure('[data-d]', '14:15');
    expect(etat.fin).toBe('15:15');
    expect(duree()).toBe('60');
  });
  it('fin modifiée à la main : « Personnalisée » (ou la durée qui correspond) ; un nouveau changement de durée recalcule la fin', () => {
    rendre();
    choisirHeure('[data-d]', '10:00');
    choisirHeure('[data-f]', '11:30');
    expect(duree()).toBe('personnalisee');
    expect(dureeLue()).toContain('Autre (90 min)'); // 🔴 (19/11/2026) remplace « Personnalisée »
    choisirHeure('[data-f]', '10:45');
    expect(duree()).toBe('45');
    choisirDuree('15');
    expect(etat.fin).toBe('10:15');
  });
  it('début 20h00 (fin au plus tard 21h00) : seules les durées compatibles ; la fin ne dépasse jamais 21h00', () => {
    rendre({ plage: { debutMin: '08:00', debutMax: '20:30', finMax: '21:00' } });
    choisirDuree('60');
    choisirHeure('[data-d]', '20:30');
    expect(dureesProposees()).toEqual(['15', '30']);
    expect(etat.fin).toBe('21:00');
    expect(duree()).toBe('30');
    rendre({ plage: PLAGE_RDV_DEFAUT });
    choisirHeure('[data-d]', '20:00');
    expect(dureesProposees()).toEqual(['15', '30', '45', '60']);
    choisirDuree('60');
    expect(etat.fin).toBe('21:00');
  });
  it('« Modifier / déplacer » : la durée déduite du rendez-vous actuel, sa fin inchangée ; une durée hors liste : « Personnalisée »', () => {
    rendre({ debut0: '14:00', fin0: '14:45' });
    expect(duree()).toBe('45');
    expect(etat.fin).toBe('14:45');
    act(() => racine.unmount()); racine = createRoot(hote);
    rendre({ debut0: '14:00', fin0: '15:30' });
    expect(duree()).toBe('personnalisee');
    expect(etat.fin).toBe('15:30');
  });
});

describe('🔴🔴 Arno (19/11/2026, 503) — durées d’office par sorte et « Autre (n min) »', () => {
  it('à la création : la durée d’office de la sorte (état des lieux : 1 h) ; « Autre » n’apparaît jamais', () => {
    rendre({ defaut: 60 });
    expect(duree()).toBe('60');
    expect(dureesProposees()).toEqual(['15', '30', '45', '60']);
    choisirHeure('[data-d]', '10:00');
    expect(etat.fin).toBe('11:00');
  });
  it('« Modifier / déplacer » d’un rendez-vous de 19 min : « Autre (19 min) », la durée réelle', () => {
    rendre({ debut0: '10:00', fin0: '10:19' });
    expect(duree()).toBe('personnalisee');
    expect(dureeLue()).toContain('Autre (19 min)');
    expect(dureesProposees()).toContain('personnalisee');
  });
});
