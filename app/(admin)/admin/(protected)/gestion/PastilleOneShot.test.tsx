// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { PastilleOneShot, viderMemoireOneShot, CSS_PASTILLE_ONE_SHOT } from './PastilleOneShot';
import { annoncerClassement } from '../../../../lib/gestion/signalClassement';

/**
 * ══ 🔴🔴 LOT PASTILLE-SUIVI-MODIFIE-ONE-SHOT — LA PASTILLE ET SA MODALE, À L'ÉCRAN ════════════════════════════════
 *
 *   ① pastille ABSENTE sans modification one shot ;
 *   ② pastille présente, « ×N » quand il y en a plusieurs ;
 *   ③ ABSENTE sur les autres mails de la même conversation ;
 *   ④ la modale : titre, suivi de fond / modifié pour ce mail / auteur / date pour chaque modification, la phrase
 *      d'Arno, « Fermer », et AUCUNE autre action ;
 *   ⑤ son clic ne plie pas la carte (la ligne est un bouton) ;
 *   ⑥ une requête pour toutes les pastilles d'un rendu, et une relecture après un geste de classement ;
 *   ⑦ la place : juste après « reçu de … » dans les trois cartes, à la hauteur des capsules de la liste.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DEUX = [
  {
    fond: 'rattaché à 25 rue Edith Cavell (lot 12), partie LOCATAIRE Nevine Abdellatif',
    modifie: 'sorti du suivi de 25 rue Edith Cavell (lot 12)', par: 'Arnaud Jorel', le: '2026-10-11T16:12:00Z',
  },
  {
    fond: 'rattaché à 25 rue Edith Cavell (lot 12), partie LOCATAIRE Nevine Abdellatif',
    modifie: 'rattaché aussi à 15 rue Carle Hebert (lot 24)', par: 'Arnaud Jorel', le: '2026-10-11T16:12:00Z',
  },
];

let racine: HTMLDivElement;
let root: Root;
let appels: string[];
let reponse: Record<string, unknown>;

/**
 * 🔴 LOT MODALE-AVANT-APRES-DEUX-COLONNES — le geste STRUCTURÉ qui a produit les deux modifications ci-dessus : le
 * suivi de fond (lot 12, locataire Nevine Abdellatif) remplacé, pour ce mail seul, par le lot 24.
 */
const GESTE = {
  avant: { sorte: 'biens', biens: [{ cle: '12', libelle: '25 rue Edith Cavell — lot 12' }],
    personnes: [{ sorte: 'locataire', cle: 'L1', libelle: 'Nevine Abdellatif' }] },
  interneEchangeAvant: false,
  apres: { sorte: 'biens', biens: [{ cle: '24', libelle: '15 rue Carle Hebert — lot 24' }] },
  recalcule: false, par: 'Arnaud Jorel', le: '2026-10-11T16:12:00Z',
};
let gestes: Record<string, unknown[]> = {};

async function attendre(): Promise<void> {
  await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
}

beforeEach(() => {
  viderMemoireOneShot();
  appels = [];
  reponse = { 2: DEUX };
  gestes = { 2: [GESTE] };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    appels.push(String(url));
    if (String(url).includes('/biens/lignes')) {
      return new Response(JSON.stringify({ etat: 'ok', lignes: {
        '12': '25 rue Edith Cavell, 92400 COURBEVOIE — lot 12', '24': '15 rue Carle Hebert, 92400 COURBEVOIE — lot 24',
      } }), { status: 200 });
    }
    return new Response(JSON.stringify({ etat: 'ok', parMail: reponse, gestes }), { status: 200 });
  }));
  racine = document.createElement('div');
  racine.className = 'svv-adm-root';
  document.body.appendChild(racine);
  root = createRoot(racine);
});

afterEach(() => {
  act(() => root.unmount());
  racine.remove();
  vi.unstubAllGlobals();
});

/** Trois mails d'une même conversation, chacun dans une LIGNE-BOUTON comme dans les vraies cartes. */
function rendre(onPlier: () => void): void {
  act(() => {
    root.render(createElement('ul', null, [1, 2, 3].map((id) => createElement('li', { key: id, 'data-mail': id },
      createElement('button', { type: 'button', onClick: onPlier },
        createElement('span', null, `reçu de Mail ${id}`),
        createElement(PastilleOneShot, { messageId: id, classe: 'vdb-capsule' }))))));
  });
}

describe('PastilleOneShot', () => {
  it('① ② ③ ⑥ présente « ×2 » sur le mail modifié, absente sur les autres mails du fil, une seule requête', async () => {
    rendre(() => {});
    await attendre();
    expect(appels).toHaveLength(1);
    expect(appels[0]).toBe('/api/admin/gestion/one-shot?messages=1,2,3');
    const p = (id: number) => racine.querySelector(`[data-mail="${id}"] .svv-oneshot`);
    expect(p(1)).toBeNull();
    expect(p(3)).toBeNull();
    expect(p(2)?.textContent).toBe('Suivi modifié en one shot ×2');
    expect(p(2)?.className).toContain('vdb-capsule');
  });

  it('① ② une seule modification : le mot sans « ×N »', async () => {
    reponse = { 2: [DEUX[0]] };
    rendre(() => {});
    await attendre();
    expect(racine.querySelector('.svv-oneshot')?.textContent).toBe('Suivi modifié en one shot');
  });

  it('① aucune modification nulle part : aucune pastille', async () => {
    reponse = {};
    rendre(() => {});
    await attendre();
    expect(racine.querySelectorAll('.svv-oneshot')).toHaveLength(0);
  });

  it('④ ⑤ le clic ouvre la modale en lecture seule, sans plier la carte ; « Fermer » la ferme', async () => {
    const plier = vi.fn();
    rendre(plier);
    await attendre();
    act(() => { (racine.querySelector('.svv-oneshot') as HTMLElement).click(); });
    expect(plier).not.toHaveBeenCalled();
    await attendre();
    const modale = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(modale).not.toBeNull();
    expect(modale.querySelector('h2')?.textContent).toBe('Suivi modifié pour ce mail uniquement (One shot)');
    /* 🔴 LOT MODALE-AVANT-APRES-DEUX-COLONNES — deux colonnes, une ligne par bien (adresse, CP ville, lot). */
    const avant = modale.querySelector('.maa-col--avant') as HTMLElement;
    const apres = modale.querySelector('.maa-col--apres') as HTMLElement;
    expect(avant.querySelector('.maa-col-titre')?.textContent).toBe('AVANT — suivi de fond · 1 bien suivi');
    expect(apres.querySelector('.maa-col-titre')?.textContent).toBe('APRÈS — ce mail uniquement · 1 bien suivi');
    expect([...avant.querySelectorAll('.maa-bien')].map((b) => b.textContent)).toEqual(['25 rue Edith Cavell, 92400 COURBEVOIE — lot 12']);
    expect(avant.querySelector('.maa-parties')?.textContent).toBe('Parties : Nevine Abdellatif (locataire)');
    /* 🔴 À DROITE : l'ajouté porte un « + » vert, le retiré est barré. */
    expect(apres.querySelector('.maa-bien--ajoute')?.textContent).toBe('+15 rue Carle Hebert, 92400 COURBEVOIE — lot 24');
    expect(apres.querySelector('.maa-bien--retire')?.textContent).toBe('25 rue Edith Cavell, 92400 COURBEVOIE — lot 12 (retiré)');
    expect(modale.querySelector('.maa-qui')?.textContent).toBe('Par Arnaud Jorel, le 11/10/2026 à 18:12');
    expect(modale.textContent).toContain(
      'Les autres mails de cette conversation et de cet expéditeur suivent toujours le suivi de fond.');
    /* 🔴 AUCUNE ACTION DE MODIFICATION : un seul bouton, « Fermer ». */
    const boutons = [...modale.querySelectorAll('button')].map((b) => b.textContent);
    expect(boutons).toEqual(['Fermer']);
    act(() => { (modale.querySelector('button') as HTMLElement).click(); });
    expect(plier).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('🔴 LOT TRACE-ONE-SHOT — sans photo, la mention discrète « (suivi de fond recalculé aujourd’hui) » ; avec photo, rien', async () => {
    /* 🔴 LOT MODALE-AVANT-APRES-DEUX-COLONNES — la mention vit désormais dans le titre de la colonne AVANT. */
    gestes = { 2: [{ ...GESTE, recalcule: true }, { ...GESTE, recalcule: false }] };
    rendre(() => {});
    await attendre();
    act(() => { (racine.querySelector('.svv-oneshot') as HTMLElement).click(); });
    const titres = [...document.querySelectorAll('[role="dialog"] .maa-col--avant .maa-col-titre')];
    expect(titres[0].querySelector('.maa-recalcule')?.textContent).toBe(' (recalculé aujourd’hui)');
    expect(titres[1].querySelector('.maa-recalcule')).toBeNull();
  });

  it('④ Échap ferme la modale', async () => {
    rendre(() => {});
    await attendre();
    act(() => { (racine.querySelector('.svv-oneshot') as HTMLElement).click(); });
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('⑥ un geste de classement fait relire : la pastille disparaît quand la modification n’est plus en vigueur', async () => {
    rendre(() => {});
    await attendre();
    expect(racine.querySelector('.svv-oneshot')).not.toBeNull();
    reponse = {};
    act(() => annoncerClassement({ messageId: 2, filId: 9 }));
    await attendre();
    expect(appels).toHaveLength(2);
    expect(racine.querySelector('.svv-oneshot')).toBeNull();
  });

  it('une réponse en erreur : aucune pastille, aucun écran cassé', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    rendre(() => {});
    await attendre();
    expect(racine.querySelectorAll('.svv-oneshot')).toHaveLength(0);
  });
});

describe('⑦ la place et la couleur', () => {
  const dossier = 'app/(admin)/admin/(protected)/gestion';
  it('contour rouge et texte rouge par les jetons du thème (Clair et Sombre)', () => {
    expect(CSS_PASTILLE_ONE_SHOT).toMatch(/\.svv-oneshot\.svv-oneshot\{[^}]*color:var\(--color-svv-red\)/);
    expect(CSS_PASTILLE_ONE_SHOT).toMatch(/\.svv-oneshot\.svv-oneshot\{[^}]*border:1px solid var\(--color-svv-red\)/);
    expect(CSS_PASTILLE_ONE_SHOT).not.toContain('`');
  });
  it('historique du bien : juste après « reçu de … », capsule de la liste', () => {
    const s = readFileSync(`${dossier}/VieDuBien.tsx`, 'utf8').replace(/\s+/g, ' ');
    expect(s).toMatch(/\{libelleSens\(l\.sens\)\}[^<]*<\/span>[^<]*(\{\/\*[^]*?\*\/\}\s*)?<PastilleOneShot messageId=\{l\.messageId\} classe="vdb-capsule" \/>/);
  });
  it('conversation : dans la rangée de « reçu de … »', () => {
    const s = readFileSync(`${dossier}/Conversation.tsx`, 'utf8').replace(/\s+/g, ' ');
    expect(s).toContain('<span className="cnv-qui">{libelleSens(message.sens)} {qui} '
      + '<PastilleOneShot messageId={message.messageId} classe="cnv-capsule cnv-oneshot" /> </span>');
  });
  it('Réception : avec les capsules de la ligne, sur le mail que la ligne montre', () => {
    const s = readFileSync(`${dossier}/BoiteMail.tsx`, 'utf8');
    expect(s).toContain('<PastilleOneShot messageId={l.messageAffiche} classe="bte-capsule" />');
  });
});
