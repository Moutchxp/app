// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CarteVive } from './CarteVive';
import type { CarteDetail, MessageDeFil } from '../../../../lib/gestion/carteRepo';

/**
 * LOT 4c-B — LA CARTE VIVANTE, éprouvée en montant le composant (jsdom + act, sans testing-library).
 *
 * Ce qui est vérifié ici n'est pas l'apparence mais trois promesses faites à Arno :
 *   ① PARESSE : une carte repliée ne lance AUCUNE requête, un échange replié non plus. C'est ce qui rend l'écran
 *      tenable avec des centaines d'échanges — et ça ne se voit que par le compte des appels réseau.
 *   ② LES PIÈCES SONT SERVIES PAR L'APPLICATION : les liens pointent vers /api/…/pieces/<id>, jamais vers MinIO.
 *   ③ LES GESTES DISENT CE QU'ILS FONT : état, correction, détachement — chacun rend un compte rendu, et le
 *      détachement (qui change AUSSI la file) demande la relecture de tout l'écran.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MAINTENANT = new Date('2026-09-23T12:00:00Z');

const CARTE = {
  evenementId: 9, reference: 'GES-2026-000009', objet: 'Fuite salle de bain', demandeur: 'Mme M.',
  adresseLibre: '28 avenue Marceau', etat: 'a_traiter' as const, ouvertLe: '2026-09-20T12:00:00Z',
  dernierEchangeLe: '2026-09-22T12:00:00Z', nbFils: 1, attend: true,
};

// Typés d'après le contrat RÉEL des routes : sans ça, un littéral s'infère trop étroitement (`traiteLe: null` de
//   type `null`) et le jeu d'essai ne pourrait plus exprimer la variante « carte traitée ».
const DETAIL: CarteDetail = {
  evenementId: 9, reference: 'GES-2026-000009', objet: 'Fuite salle de bain', demandeurNom: 'Mme M.',
  demandeurEmail: 'm@exemple.test', adresseLibre: '28 avenue Marceau', etat: 'a_traiter',
  ouvertLe: '2026-09-20T12:00:00Z', ouvertPar: 'arno', traiteLe: null, traitePar: null,
  fils: [{ filId: 5, objet: 'Fuite salle de bain', interlocuteur: 'Mme M.', dernierLe: '2026-09-22T12:00:00Z', nbMessages: 2, nbPieces: 1, attend: true }],
};

const MESSAGES: MessageDeFil[] = [
  {
    messageId: 1, sens: 'recu' as const, de: 'locataire@exemple.test', deNom: 'Mme M.', recuLe: '2026-09-21T12:00:00Z',
    objet: 'Fuite', corps: 'Bonjour,\n\nIl y a une fuite sous le lavabo.', automatique: false,
    pieces: [
      { pieceId: 7, nomFichier: 'constat.pdf', typeMime: 'application/pdf', tailleOctets: 120000, disponible: true, motifNonStocke: null },
      { pieceId: 8, nomFichier: 'video.mov', typeMime: 'video/quicktime', tailleOctets: null, disponible: false, motifNonStocke: 'type refusé' },
    ],
  },
  {
    messageId: 2, sens: 'envoye' as const, de: 'gestion@criterimmo.fr', deNom: null, recuLe: '2026-09-22T12:00:00Z',
    objet: 'Re: Fuite', corps: null, automatique: false, pieces: [],
  },
];

let container: HTMLDivElement;
let root: Root;
let appels: string[];
let rapports: { message: string; rechargerTout?: boolean }[];
let patchs: unknown[];
let reponseDetail: typeof DETAIL;

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = []; rapports = []; patchs = []; reponseDetail = DETAIL;
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    appels.push(`${init?.method ?? 'GET'} ${u}`);
    if (init?.method === 'PATCH') { patchs.push(JSON.parse(String(init.body))); return ok({ ok: true }); }
    if (init?.method === 'DELETE') return ok({ ok: true });
    if (u.includes('/messages')) return ok({ messages: MESSAGES });
    return ok(reponseDetail);
  }) as unknown as typeof fetch;
});
const ok = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps } as unknown as Response);
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); }); };
const monter = async () => {
  await act(async () => {
    root.render(createElement(CarteVive, {
      carte: CARTE, maintenant: MAINTENANT,
      onGeste: (message: string, options?: { rechargerTout?: boolean }) => rapports.push({ message, ...options }),
    }));
  });
  await calmer();
};
const boutons = () => [...container.querySelectorAll('button')] as HTMLButtonElement[];
const boutonPar = (motif: RegExp) => boutons().find((b) => motif.test(b.textContent ?? ''));
const cliquer = async (b: HTMLElement | undefined) => { await act(async () => { b?.click(); }); await calmer(); };
const liens = () => [...container.querySelectorAll('a')] as HTMLAnchorElement[];

describe('① PARESSE — ce qu’on n’ouvre pas ne coûte rien', () => {
  it('une carte repliée n’émet AUCUNE requête', async () => {
    await monter();
    expect(appels).toEqual([]);
    expect(container.textContent).toContain('GES-2026-000009'); // le résumé, lui, est déjà là
  });

  it('le dépliage de la carte charge son dossier — une seule fois', async () => {
    await monter();
    await cliquer(boutonPar(/Fuite salle de bain/));
    expect(appels).toEqual(['GET /api/admin/gestion/evenements/9']);
    expect(container.textContent).toContain('Échanges rattachés');
  });

  it('les MESSAGES ne partent qu’au dépliage de l’échange, pas à celui de la carte', async () => {
    await monter();
    await cliquer(boutonPar(/Fuite salle de bain/));
    expect(appels.some((a) => a.includes('/messages'))).toBe(false);
    await cliquer(boutons().find((b) => /2 messages/.test(b.textContent ?? '')));
    expect(appels).toContain('GET /api/admin/gestion/fils/5/messages');
  });

  it('replier puis rouvrir ne relance RIEN (le contenu reste monté)', async () => {
    await monter();
    const titre = () => boutonPar(/Fuite salle de bain/);
    await cliquer(titre());
    await cliquer(titre());
    await cliquer(titre());
    expect(appels.filter((a) => a === 'GET /api/admin/gestion/evenements/9')).toHaveLength(1);
  });
});

describe('② les pièces jointes sont SERVIES PAR L’APPLICATION', () => {
  const ouvrirTout = async () => {
    await monter();
    await cliquer(boutonPar(/Fuite salle de bain/));
    await cliquer(boutons().find((b) => /2 messages/.test(b.textContent ?? '')));
  };

  it('le lien d’une pièce pointe vers l’application, JAMAIS vers le stockage', async () => {
    await ouvrirTout();
    const piece = liens().find((a) => a.textContent === 'constat.pdf');
    expect(piece?.getAttribute('href')).toBe('/api/admin/gestion/pieces/7');
    for (const a of liens()) expect(a.getAttribute('href') ?? '').not.toMatch(/^https?:|minio|amazonaws|X-Amz/i);
  });

  it('« Télécharger » est un geste distinct de la consultation, sur la même pièce', async () => {
    await ouvrirTout();
    expect(liens().some((a) => a.getAttribute('href') === '/api/admin/gestion/pieces/7?telecharger=1')).toBe(true);
  });

  it('une pièce NON conservée est dite telle, avec son motif, et SANS lien mort', async () => {
    await ouvrirTout();
    expect(container.textContent).toContain('video.mov — non conservée (type refusé)');
    expect(liens().some((a) => a.textContent?.includes('video.mov'))).toBe(false);
  });

  it('la taille est lisible par un humain', async () => {
    await ouvrirTout();
    expect(container.textContent).toContain('120 ko');
  });

  it('le texte du message est rendu TEL QUEL, jamais interprété comme du HTML', async () => {
    await ouvrirTout();
    const corps = container.querySelector('.gst-msg-corps');
    expect(corps?.textContent).toContain('Il y a une fuite sous le lavabo.');
    expect(corps?.innerHTML).not.toContain('<');
  });

  it('un message sans texte le DIT, et le sens de chaque message est dit par un MOT', async () => {
    await ouvrirTout();
    expect(container.textContent).toContain('(message sans texte)');
    expect(container.textContent).toContain('reçu de Mme M.');
    expect(container.textContent).toContain('nous avons écrit');
  });
});

describe('③ LES GESTES', () => {
  it('changer l’état envoie un PATCH et rend compte', async () => {
    await monter();
    await cliquer(boutonPar(/Fuite salle de bain/));
    await cliquer(boutonPar(/^En cours$/));
    expect(patchs).toEqual([{ etat: 'en_cours' }]);
    expect(rapports[0].message).toContain('en cours');
    expect(rapports[0].rechargerTout).toBeUndefined(); // la file n'a pas bougé : inutile de replier tout l'écran
  });

  it('l’état DÉJÀ posé n’est pas cliquable — on ne demande pas à la base ce qu’elle sait déjà', async () => {
    await monter();
    await cliquer(boutonPar(/Fuite salle de bain/));
    expect(boutonPar(/^À traiter$/)?.disabled).toBe(true);
    expect(boutonPar(/^À traiter$/)?.getAttribute('aria-pressed')).toBe('true');
  });

  it('corriger le « quoi » envoie les trois champs modifiables, et rafraîchit la carte', async () => {
    await monter();
    await cliquer(boutonPar(/Fuite salle de bain/));
    await cliquer(boutonPar(/^Modifier$/));
    const champ = container.querySelector('input') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(champ, 'Fuite sous le lavabo');
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await cliquer(boutonPar(/^Enregistrer$/));
    expect(patchs[0]).toMatchObject({ objet: 'Fuite sous le lavabo', demandeurNom: 'Mme M.', adresseLibre: '28 avenue Marceau' });
    expect(appels.filter((a) => a === 'GET /api/admin/gestion/evenements/9')).toHaveLength(2); // relecture après le geste
  });

  it('un « quoi » vidé ne peut pas être enregistré — la carte deviendrait introuvable', async () => {
    await monter();
    await cliquer(boutonPar(/Fuite salle de bain/));
    await cliquer(boutonPar(/^Modifier$/));
    const champ = container.querySelector('input') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(champ, '   ');
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(boutonPar(/^Enregistrer$/)?.disabled).toBe(true);
  });

  it('détacher rend compte ET demande la relecture de tout l’écran — la file a changé', async () => {
    await monter();
    await cliquer(boutonPar(/Fuite salle de bain/));
    await cliquer(boutons().find((b) => /2 messages/.test(b.textContent ?? '')));
    await cliquer(boutonPar(/Détacher de cet événement/));
    expect(appels).toContain('DELETE /api/admin/gestion/fils/5/affectation');
    expect(rapports[0]).toEqual({ message: 'Échange détaché : il est revenu dans la file, avec tous ses messages.', rechargerTout: true });
  });

  it('le détachement dit qu’il ne supprime rien — c’est la règle du module, elle se lit à l’écran', async () => {
    await monter();
    await cliquer(boutonPar(/Fuite salle de bain/));
    await cliquer(boutons().find((b) => /2 messages/.test(b.textContent ?? '')));
    expect(container.textContent).toContain('Détacher ne supprime rien');
  });

  it('une carte TRAITÉE affiche sa date de traitement, et reste rouvrable', async () => {
    reponseDetail = { ...DETAIL, etat: 'traite', traiteLe: '2026-09-23T09:00:00Z', traitePar: 'arno' };
    await monter();
    await cliquer(boutonPar(/Fuite salle de bain/));
    expect(container.textContent).toContain('Traité le');
    expect(container.textContent).toContain('Rouvrable à tout moment');
    expect(boutonPar(/^En cours$/)?.disabled).toBe(false);
  });

  it('une carte SANS échange rattaché le dit, et rappelle qu’un détachement n’est pas une perte', async () => {
    reponseDetail = { ...DETAIL, fils: [] };
    await monter();
    await cliquer(boutonPar(/Fuite salle de bain/));
    expect(container.textContent).toContain('Aucun échange rattaché');
  });

  it('un champ non renseigné est DIT non renseigné, jamais laissé en blanc', async () => {
    reponseDetail = { ...DETAIL, adresseLibre: null };
    await monter();
    await cliquer(boutonPar(/Fuite salle de bain/));
    expect(container.textContent).toContain('non renseignée');
  });
});
