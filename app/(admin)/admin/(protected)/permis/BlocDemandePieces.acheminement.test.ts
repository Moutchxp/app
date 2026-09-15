// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BlocDemandePieces, type PieceManquante } from './BlocDemandePieces';

/**
 * TRANSPARENCE D'ACHEMINEMENT (affichage seul) — avant l'envoi, le bloc dit d'où PARTIRA le message (adresse d'expédition réelle +
 * profil) et dans quelle BOÎTE la mairie a écrit (profil_boite + adresse). Quand les deux diffèrent, une phrase NEUTRE le signale. Les
 * valeurs viennent du serveur (`expedition`/`reception` de l'état) : on éprouve l'AFFICHAGE, jamais une reconstruction côté client.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const MANQUANTES: PieceManquante[] = [{ code: 'cerfa', libelle: 'Formulaire Cerfa', libelleCorps: 'le formulaire Cerfa', ordre: 10 }];

const etat = (over: Record<string, unknown>) => ({
  numDau: 'PC0930012500081', destinataire: 'olivia.somchit@montreuil.fr', repliable: true, motif: null,
  adresses: [], destinataireDefaut: 'olivia.somchit@montreuil.fr', historique: [], expedition: null, reception: null, ...over,
});
const armer = (e: Record<string, unknown>) => {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => e } as unknown as Response)) as unknown as typeof fetch;
};

beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const monter = async (): Promise<void> => {
  await act(async () => { root.render(createElement(BlocDemandePieces, { dossierId: 1, famillesManquantes: MANQUANTES })); });
  await act(async () => { await Promise.resolve(); });
};

describe('Acheminement — expédition / réception / divergence (affichage seul)', () => {
  it('profil « personne » qui a reçu dans la boîte « entreprise » (cas 2026-000167) → les deux adresses + une phrase NEUTRE de divergence', async () => {
    armer(etat({
      repliable: false, motif: 'compte SMTP d’envoi non configuré pour ce profil',
      expedition: { adresse: 'arnaud.jorel@gmail.com', profil: 'personne' },
      reception: { adresse: 'a.jorel@sansvisavis.com', profil: 'entreprise' },
    }));
    await monter();
    const t = container.textContent ?? '';
    expect(t).toContain('arnaud.jorel@gmail.com');   // d'où partira le message
    expect(t).toContain('profil personne');
    expect(t).toContain('a.jorel@sansvisavis.com');  // boîte qui a reçu
    expect(t).toContain('boîte entreprise');
    expect(t).toMatch(/À noter/);                    // divergence signalée
    expect(t).not.toMatch(/⚠|impossible de/);        // phrase neutre, pas d'alerte anxiogène (le motif d'envoi reste à part)
  });

  it('même adresse d’expédition et de réception (entreprise/entreprise) → aucune phrase de divergence', async () => {
    armer(etat({
      expedition: { adresse: 'a.jorel@sansvisavis.com', profil: 'entreprise' },
      reception: { adresse: 'a.jorel@sansvisavis.com', profil: 'entreprise' },
    }));
    await monter();
    const t = container.textContent ?? '';
    expect(t).toContain('Le message partira de');
    expect(t).toContain('La mairie a écrit à');
    expect(t).not.toMatch(/À noter/); // identiques → rien à signaler
  });

  it('boîte de réception INCONNUE (reception null) → on n’affiche RIEN à ce sujet, jamais « inconnu » ni adresse fabriquée', async () => {
    armer(etat({ expedition: { adresse: 'contact@sansvisavis.com', profil: 'entreprise' }, reception: null }));
    await monter();
    const t = container.textContent ?? '';
    expect(t).toContain('Le message partira de'); // expédition affichée
    expect(t).not.toContain('La mairie a écrit à'); // rien sur la réception
    expect(t).not.toMatch(/inconnu/i);
    expect(t).not.toMatch(/À noter/);
  });
});
