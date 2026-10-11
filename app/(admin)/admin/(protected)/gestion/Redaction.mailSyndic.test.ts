// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
import { brouillonMailSyndic, corpsMailSyndic, objetMailSyndic, selectionObjet } from '../../../../lib/gestion/mailSyndic';

/**
 * ══ 🔴🔴 LOT MAIL-SYNDIC-PREREMPLI — LE VRAI ÉDITEUR, OUVERT PRÉ-REMPLI ══════════════════════════════════════════════
 * « À l'ouverture, le curseur est dans l'objet avec XXXXXXXX sélectionné. » Le corps s'affiche ligne par ligne, avec
 * ses lignes vides. Et RIEN n'est enregistré : un brouillon pré-rempli qu'on n'a pas touché n'existe pas (aucun POST
 * vers les brouillons, donc aucun brouillon Gmail), et rien n'est envoyé.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONTEXTE: ContexteRedactionEcran = {
  schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: false,
  signature: 'Service Gestion', nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test',
  delaiAnnulationS: 5,
};

const pret = (bien: Parameters<typeof corpsMailSyndic>[0]['bien'], residence: string | null) => {
  const objet = objetMailSyndic('Cabinet Criterimmo', residence);
  return { objet, selection: selectionObjet(objet), corps: corpsMailSyndic({ destinataires: [{ civilite: 'Mme', nom: 'Durand' }], bien }) };
};
const brouillon = (p: ReturnType<typeof pret>): BrouillonEcran => ({
  id: null, voie: 'nouveau', a: ['l.durand@criterimmo.fr'], cc: [], cci: [], citation: null,
  destinatairesApproximatifs: false, filId: null, repondALeMessageId: null,
  ...brouillonMailSyndic(p, { texte: CONTEXTE.signature }),
});

let container: HTMLDivElement;
let root: Root;
let requetes: { url: string; methode: string }[];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  requetes = [];
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown, init?: { method?: string }) => {
    requetes.push({ url: String(entree), methode: init?.method ?? 'GET' });
    return new Response(JSON.stringify({ ok: true, suggestions: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  document.getSelection = () => null as unknown as Selection;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async (b: BrouillonEcran) => {
  let courant = b;
  const rendre = () => root.render(createElement(Redaction, {
    dansFenetre: true, brouillon: courant, contexte: CONTEXTE,
    onChange: (n: BrouillonEcran) => { courant = n; rendre(); },
    onFerme: () => {}, onEnvoye: () => {}, onGeste: () => {},
  } as never));
  await act(async () => { rendre(); });
  await calmer();
};
/** Les lignes du corps telles que l'éditeur les affiche : un paragraphe par ligne, vide = « ». */
const lignesAffichees = (): string[] => {
  const zone = container.querySelector('.red-corps-riche [contenteditable]') ?? container.querySelector('.red-corps-riche');
  return [...(zone?.querySelectorAll('p') ?? [])].map((p) => p.textContent ?? '');
};

const BIEN = {
  proprietaires: ['LOPES Alberto'],
  descriptif: { nature: 'Appartement meublé', typeBien: 'Type 2' },
  locataires: [{ nom: 'ROI Nathan', telephone: '06 12 34 56 78', email: 'n.roi@x.fr' }],
};

describe('🔴 l’objet : le curseur y est, « XXXXXXXX » sélectionné', () => {
  it('depuis une fiche bien', async () => {
    await monter(brouillon(pret(BIEN, '25 rue Edith Cavell, 92400 Courbevoie')));
    const objet = container.querySelector('#red-objet') as HTMLInputElement;
    expect(objet.value).toBe('XXXXXXXX / Cabinet Criterimmo / résidence 25 rue Edith Cavell, 92400 Courbevoie');
    expect(document.activeElement).toBe(objet);
    expect([objet.selectionStart, objet.selectionEnd]).toEqual([0, 8]);
    // Le destinataire cliqué est en place.
    expect(container.querySelector('.red-pastille')?.textContent).toContain('l.durand@criterimmo.fr');
  });

  it('depuis l’écran « Syndics » : objet sans résidence, corps = formule seule puis la signature', async () => {
    await monter(brouillon(pret(null, null)));
    const objet = container.querySelector('#red-objet') as HTMLInputElement;
    expect(objet.value).toBe('XXXXXXXX / Cabinet Criterimmo');
    expect([objet.selectionStart, objet.selectionEnd]).toEqual([0, 8]);
    expect(lignesAffichees()).toEqual(['Bonjour Madame DURAND,', '', '', 'Service Gestion']);
  });

  it('⚠️ un message ordinaire (sans plage) ne vole pas le curseur à l’objet', async () => {
    await monter({ ...brouillon(pret(null, null)), selectionObjet: null });
    expect(document.activeElement).not.toBe(container.querySelector('#red-objet'));
  });
});

describe('🔴 le corps dans l’éditeur, ligne par ligne', () => {
  it('formule, deux lignes vides, blocs séparés d’une ligne vide, deux lignes vides, signature', async () => {
    await monter(brouillon(pret(BIEN, 'R')));
    expect(lignesAffichees()).toEqual([
      'Bonjour Madame DURAND,', '', '',
      'Je prends contact auprès de vous concernant la résidence dont vous êtes le syndic, en qualité de gestionnaire locatif pour le compte du copropriétaire suivant :',
      '', 'LOPES Alberto', '',
      'Concernant un appartement meublé de 2 pièces.', '',
      'Il est actuellement occupé par le locataire suivant :', '',
      'ROI Nathan · 06 12 34 56 78 · n.roi@x.fr', '', '',
      'Service Gestion',
    ]);
  });
  it('plusieurs propriétaires, deux locataires', async () => {
    await monter(brouillon(pret({ ...BIEN, proprietaires: ['A Un', 'B Deux'], locataires: [{ nom: 'C Trois' }, { nom: 'D Quatre', email: 'd@x.fr' }] }, 'R')));
    const l = lignesAffichees();
    expect(l[3]).toMatch(/des copropriétaires suivants :$/);
    expect(l.slice(5, 7)).toEqual(['A Un', 'B Deux']);
    expect(l).toContain('Il est actuellement occupé par les locataires suivants :');
    expect(l.slice(-5)).toEqual(['C Trois', 'D Quatre · d@x.fr', '', '', 'Service Gestion']);
  });
  it('aucun propriétaire, bien vacant, éléments du bien manquants', async () => {
    await monter(brouillon(pret({ proprietaires: [], descriptif: {}, locataires: [] }, 'R')));
    const l = lignesAffichees();
    expect(l.slice(5)).toEqual(['(propriétaire non renseigné)', '', 'Logement actuellement vacant.', '', '', 'Service Gestion']);
    expect(l.join('\n')).not.toContain('Concernant');
  });
});

describe('🔴🔴 rien n’est enregistré ni envoyé tant qu’Arno n’a rien modifié', () => {
  it('aucune écriture (ni brouillon, ni envoi) après l’ouverture, même plusieurs secondes après', async () => {
    await monter(brouillon(pret(BIEN, 'R')));
    await act(async () => { vi.advanceTimersByTime(6000); });
    await calmer();
    expect(requetes.filter((r) => r.methode !== 'GET')).toEqual([]);
  });
});
