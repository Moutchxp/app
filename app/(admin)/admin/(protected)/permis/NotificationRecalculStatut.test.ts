// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { NotificationRecalculStatut, motStatutRecalcul, libelleChangementRecalcul } from './TraceEmpriseRendu';
import type { ChangementStatut, DiffRecalcul } from './diffStatutsRecalcul';

// Nommage identique à l'écran : ici on renvoie le cleabs tel quel (dans l'app c'est le repère A/B/C… via repereDe).
const repereDe = (c: string) => c;
const diff = (changements: ChangementStatut[], desaccords: DiffRecalcul['desaccords'] = []): DiffRecalcul =>
  ({ changements, desaccords, aDesChangements: changements.length > 0 || desaccords.length > 0 });

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; });

describe('libelleChangementRecalcul — vocabulaire IDENTIQUE aux boutons du bloc (aucun 3e mot)', () => {
  it('entrée / sortie / changement de statut, avec les mots des trois statuts', () => {
    expect(motStatutRecalcul('detruit')).toBe('bâtiment détruit');
    expect(motStatutRecalcul('mixte')).toBe('partiellement détruit');
    expect(motStatutRecalcul(null)).toBe('bâtiment préservé'); // aucun statut = préservé
    expect(libelleChangementRecalcul({ cleabs: 'A', nature: 'entree', avant: null, apres: 'detruit' })).toBe('entré sous l’emprise → bâtiment détruit');
    expect(libelleChangementRecalcul({ cleabs: 'A', nature: 'sortie', avant: 'detruit', apres: null })).toBe('sorti de l’emprise → bâtiment préservé');
    expect(libelleChangementRecalcul({ cleabs: 'A', nature: 'statut', avant: 'mixte', apres: 'detruit' })).toBe('partiellement détruit → bâtiment détruit');
  });
});

describe('NotificationRecalculStatut — liste les CHANGEMENTS, acquittable, jamais rouge', () => {
  it('un changement par bâtiment (repère + libellé), bouton « J’ai vu », accent indigo (pas rouge)', () => {
    const html = renderToStaticMarkup(createElement(NotificationRecalculStatut, {
      diff: diff([
        { cleabs: 'A', nature: 'entree', avant: null, apres: 'detruit' },
        { cleabs: 'B', nature: 'statut', avant: 'mixte', apres: 'detruit' },
      ]), repereDe, onAcquitter: () => {},
    }));
    expect(html).toContain('data-recalcul-notif="true"');
    expect(html).toContain('2 bâtiments existants mis à jour'); // en-tête chiffré, accord pluriel
    expect(html).toContain('>A</strong>'); expect(html).toContain('entré sous l’emprise → bâtiment détruit');
    expect(html).toContain('>B</strong>'); expect(html).toContain('partiellement détruit → bâtiment détruit');
    expect(html).toContain('J’ai vu');
    expect(html).toContain('#4338ca'); // indigo assumé
    expect(html).not.toContain('svv-red'); // le rouge est déjà pris (taux / prévision / erreurs)
  });

  it('accord SINGULIER pour un seul changement', () => {
    const html = renderToStaticMarkup(createElement(NotificationRecalculStatut, {
      diff: diff([{ cleabs: 'A', nature: 'statut', avant: 'preserve', apres: 'mixte' }]), repereDe, onAcquitter: () => {},
    }));
    expect(html).toContain('1 bâtiment existant mis à jour');
  });

  it('AUCUN changement (diff null) → ne rend RIEN', () => {
    expect(renderToStaticMarkup(createElement(NotificationRecalculStatut, { diff: null, repereDe, onAcquitter: () => {} }))).toBe('');
  });

  it('des DÉSACCORDS mais AUCUN changement → ne rend RIEN (les désaccords vivent dans le bloc, pas dans la notification)', () => {
    const d = diff([], [{ cleabs: 'A', manuel: 'preserve', autoPropose: 'detruit' }]);
    expect(d.aDesChangements).toBe(true); // le diff a bien qqch à signaler…
    expect(renderToStaticMarkup(createElement(NotificationRecalculStatut, { diff: d, repereDe, onAcquitter: () => {} }))).toBe(''); // …mais PAS dans la notification
  });

  it('« J’ai vu » APPELLE onAcquitter (acquittement)', () => {
    const onAcquitter = vi.fn();
    const div = document.createElement('div'); document.body.appendChild(div);
    root = createRoot(div);
    act(() => root!.render(createElement(NotificationRecalculStatut, {
      diff: diff([{ cleabs: 'A', nature: 'entree', avant: null, apres: 'detruit' }]), repereDe, onAcquitter,
    })));
    const bouton = div.querySelector('button')!;
    expect(bouton.textContent).toContain('J’ai vu');
    act(() => bouton.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onAcquitter).toHaveBeenCalledTimes(1);
    document.body.removeChild(div);
  });
});

describe('BlocTraceEmprise — ACQUITTEMENT UNIQUE ET PARTAGÉ (un seul état recalculStatut)', () => {
  const BLOC = readFileSync('app/(admin)/admin/(protected)/permis/BlocTraceEmprise.tsx', 'utf8').replace(/\s+/g, ' ');
  it('la notification est rendue dans la zone d’alerte, alimentée par l’état partagé recalculStatut', () => {
    expect(BLOC).toContain('const [recalculStatut, setRecalculStatut] = useState<DiffRecalcul | null>(null)');
    expect(BLOC).toContain('<NotificationRecalculStatut diff={recalculStatut} repereDe={repereDe} occupe={occupe} onAcquitter={onAcquitterRecalcul} />');
  });
  it('acquitter EFFACE l’état partagé (donc notification ET marquages du bloc en même temps)', () => {
    expect(BLOC).toContain('const onAcquitterRecalcul = useCallback(() => setRecalculStatut(null), [])');
  });
  it('les 3 gestes d’ajustement alimentent l’état partagé (montrer s’il y a des changements, sinon effacer)', () => {
    expect((BLOC.match(/setRecalculStatut\(j\.recalculStatut\?\.aDesChangements \? j\.recalculStatut : null\)/g) ?? []).length).toBe(3);
  });
});
