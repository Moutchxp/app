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
  dernierEchangeLe: '2026-09-22T12:00:00Z', nbFils: 1, nbMailsDeplaces: 0, attend: true,
};

// Typés d'après le contrat RÉEL des routes : sans ça, un littéral s'infère trop étroitement (`traiteLe: null` de
//   type `null`) et le jeu d'essai ne pourrait plus exprimer la variante « carte traitée ».
const DETAIL: CarteDetail = {
  evenementId: 9, reference: 'GES-2026-000009', objet: 'Fuite salle de bain', demandeurNom: 'Mme M.',
  demandeurEmail: 'm@exemple.test', adresseLibre: '28 avenue Marceau', etat: 'a_traiter',
  ouvertLe: '2026-09-20T12:00:00Z', ouvertPar: 'arno', traiteLe: null, traitePar: null,
  fils: [{ filId: 5, objet: 'Fuite salle de bain', interlocuteur: 'Mme M.', dernierLe: '2026-09-22T12:00:00Z', nbMessages: 2, nbPieces: 1, attend: true }],
  mailsDeplaces: [],
};

/**
 * LOT 5b — les champs de conversation (extrait, hors-file, destinataires, HTML seul) complètent chaque message. Ils
 * sont posés ICI une fois pour toutes, avec les valeurs du cas ordinaire, pour que les cas de test ne parlent que de
 * ce qu'ils éprouvent.
 */
const conv = <T extends Partial<MessageDeFil>>(m: T) => ({
  extrait: typeof m.corps === 'string' ? m.corps.slice(0, 300) : null,
  horsFile: false, motifHorsFile: null,
  destA: null, destCc: null, destinatairesFondus: null, htmlSeul: false,
  ...m,
}) as MessageDeFil;

const EN_TETE = { filId: 5, objet: 'Fuite salle de bain', etat: 'a_classer' as const, reference: 'GES-2026-000009', evenementId: 9 };

const MESSAGES: MessageDeFil[] = [
  conv({
    messageId: 1, sens: 'recu' as const, de: 'locataire@exemple.test', deNom: 'Mme M.', recuLe: '2026-09-21T12:00:00Z',
    objet: 'Fuite',
    // Un corps RÉEL : signature avec une référence d'image, puis l'historique cité dessous.
    corps: 'Bonjour,\n\nIl y a une fuite sous le lavabo. [cid:image001.png@01DA]\n\n> Le 20 septembre, Gestion a écrit :\n> Bonjour, avez-vous constaté quelque chose ?',
    automatique: false,
    pieces: [
      { pieceId: 7, nomFichier: 'constat.pdf', typeMime: 'application/pdf', tailleOctets: 120000, disponible: true, motifNonStocke: null },
      { pieceId: 8, nomFichier: 'video.mov', typeMime: 'video/quicktime', tailleOctets: null, disponible: false, motifNonStocke: 'type refusé' },
      { pieceId: 9, nomFichier: 'image001.png', typeMime: 'image/png', tailleOctets: 3000, disponible: true, motifNonStocke: null },
    ],
  }),
  conv({
    messageId: 2, sens: 'envoye' as const, de: 'gestion@criterimmo.fr', deNom: null, recuLe: '2026-09-22T12:00:00Z',
    objet: 'Re: Fuite', corps: null, automatique: false, pieces: [],
  }),
];

let container: HTMLDivElement;
let root: Root;
let appels: string[];
let rapports: { message: string; rechargerTout?: boolean }[];
let patchs: unknown[];
let posts: { url: string; corps: unknown }[];
let PARTIS: { messageId: number; objet: string | null; recuLe: string; reference: string; evenementId: number }[];
let reponseDetail: typeof DETAIL;

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = []; rapports = []; patchs = []; posts = []; PARTIS = []; reponseDetail = DETAIL;
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    appels.push(`${init?.method ?? 'GET'} ${u}`);
    if (init?.method === 'PATCH') { patchs.push(JSON.parse(String(init.body))); return ok({ ok: true }); }
    if (init?.method === 'POST') {
      posts.push({ url: u, corps: JSON.parse(String(init.body)) });
      return ok({ ok: true, evenementId: 42, reference: 'GES-2026-000042' });
    }
    if (init?.method === 'DELETE') return ok({ ok: true });
    // LOT 5b — la réponse porte désormais l'EN-TÊTE de l'échange : la vue conversation est ouverte depuis trois
    //   endroits et doit savoir seule quoi proposer en haut.
    if (u.includes('/messages')) return ok({ fil: EN_TETE, messages: MESSAGES, partis: PARTIS });
    // La RECHERCHE d'événement (lot 4d) : deux cartes, dont celle où l'on se trouve déjà.
    if (u.includes('/api/admin/gestion/evenements?')) {
      return ok({ max: 30, evenements: [
        { id: 42, reference: 'GES-2026-000042', objet: 'Chaudière', demandeur: 'M. D.', adresseLibre: null, etat: 'a_traiter', nbFils: 1 },
        { id: 9, reference: 'GES-2026-000009', objet: 'Fuite salle de bain', demandeur: 'Mme M.', adresseLibre: null, etat: 'a_traiter', nbFils: 1 },
      ] });
    }
    return ok(reponseDetail);
  }) as unknown as typeof fetch;
});
const ok = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps } as unknown as Response);
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

/**
 * Laisse le composant se poser : micro-tâches (promesses des `fetch`) ET macro-tâche (la recherche d'événement est
 * TEMPORISÉE — sans ce tour de boucle, la liste de résultats serait encore vide au moment du clic).
 */
const calmer = async () => {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
};
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
const cliquer = async (b: HTMLElement | null | undefined) => { await act(async () => { b?.click(); }); await calmer(); };
const liens = () => [...container.querySelectorAll('a')] as HTMLAnchorElement[];
/** Le « ⋯ » de l'échange : discret à l'œil, mais parfaitement désignable — par son libellé accessible. */
const menuDeLEchange = () => container.querySelector('button[aria-label="Actions sur cet échange"]') as HTMLButtonElement | null;
/** Les RÉSULTATS de la recherche, et eux seuls : le titre de la carte porte aussi sa référence. */
const resultats = () => [...container.querySelectorAll('.gst-resultats button')] as HTMLButtonElement[];
const resultatPar = (motif: RegExp) => resultats().find((b) => motif.test(b.textContent ?? ''));

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
  /**
   * LOT 5b — un dépliage de PLUS qu'avant, et c'est voulu : dans la vue conversation, seul le DERNIER message est
   * ouvert d'emblée (comportement de toutes les messageries). Les tests ci-dessous portent sur le PREMIER message —
   * ils cliquent donc « Tout déplier ». Rien n'est perdu : tout est là, à un clic.
   */
  const ouvrirTout = async () => {
    await monter();
    await cliquer(boutonPar(/Fuite salle de bain/));
    await cliquer(boutons().find((b) => /2 messages/.test(b.textContent ?? '')));
    await cliquer(boutonPar(/^Tout déplier$/));
  };

  it('le lien d’une pièce pointe vers l’application, JAMAIS vers le stockage', async () => {
    await ouvrirTout();
    // LOT 5-PJ-A — le nom vit désormais SOUS la vignette ; le lien, lui, se reconnaît à son libellé accessible.
    const piece = liens().find((a) => (a.getAttribute('aria-label') ?? '').includes('constat.pdf'));
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
    // Le formateur est celui du lot 4c, et lui seul : le lot 5-PJ-A a d'abord introduit un second (« 120 Ko »), que
    //   ce test a attrapé. Les deux ne doivent jamais coexister dans un même écran.
    expect(container.textContent).toContain('120 ko');
  });

  it('le texte du message est rendu TEL QUEL, jamais interprété comme du HTML', async () => {
    await ouvrirTout();
    const corps = container.querySelector('.gst-msg-corps');
    expect(corps?.textContent).toContain('Il y a une fuite sous le lavabo.');
    expect(corps?.innerHTML).not.toContain('<');
  });

  it('LOT 4d-C — la référence technique d’image ne s’affiche pas', async () => {
    await ouvrirTout();
    expect(container.textContent).not.toContain('cid:image001.png');
    expect(container.textContent).toContain('Il y a une fuite sous le lavabo.');
  });

  it('LOT 4d-C — l’historique cité est REPLIÉ, présent, et consultable d’un clic', async () => {
    await ouvrirTout();
    const repli = container.querySelector('.gst-cite') as HTMLDetailsElement | null;
    expect(repli?.open).toBe(false);                                   // replié au départ
    expect(container.textContent).toContain('Afficher le message cité');
    expect(container.textContent).toContain('avez-vous constaté quelque chose ?'); // …mais jamais perdu
  });

  it('LOT 4d-C — les images de signature sont rangées à part, repliées, et restent consultables', async () => {
    await ouvrirTout();
    expect(container.textContent).toContain('1 image de signature');
    // Elle ne se mêle pas aux vraies pièces…
    // LOT 5-PJ-A — les vraies pièces sont une GRILLE de cartes ; les signatures ont la leur, dans le repli.
    const vraies = [...container.querySelectorAll('.pj-grille')][0];
    expect(vraies?.textContent).toContain('constat.pdf');
    expect(vraies?.textContent).not.toContain('image001.png');
    // …mais elle est bien là, servie par l'application comme les autres.
    expect(liens().some((a) => a.getAttribute('href') === '/api/admin/gestion/pieces/9')).toBe(true);
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

  /**
   * LOT 4d — le gros bouton « Détacher de cet événement » est devenu une entrée du menu « ⋯ » de l'échange (décision
   * d'Arno : des commandes discrètes, pas des boutons partout). La FONCTION est conservée à l'identique — c'est ce que
   * ce test vérifie : même appel, même compte rendu, même relecture de tout l'écran.
   */
  it('détacher, depuis le menu discret, rend compte ET demande la relecture de tout l’écran', async () => {
    await monter();
    await cliquer(boutonPar(/Fuite salle de bain/));
    await cliquer(menuDeLEchange());
    await cliquer(boutonPar(/^Détacher l’échange$/));
    expect(appels).toContain('DELETE /api/admin/gestion/fils/5/affectation');
    expect(rapports[0]).toEqual({ message: 'Échange détaché : il est revenu dans la file, avec tous ses messages.', rechargerTout: true });
  });

  it('l’écran dit que détacher ou déplacer ne supprime rien — c’est la règle du module', async () => {
    await monter();
    await cliquer(boutonPar(/Fuite salle de bain/));
    await cliquer(boutons().find((b) => /2 messages/.test(b.textContent ?? '')));
    expect(container.textContent).toContain('ne supprime rien');
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


describe('④ LOT 4d — LE MENU DISCRET ET LE DÉPLACEMENT', () => {
  const ouvrirCarte = async () => { await monter(); await cliquer(boutonPar(/Fuite salle de bain/)); };

  it('l’échange porte un « ⋯ », pas une rangée de boutons', async () => {
    await ouvrirCarte();
    const m = menuDeLEchange();
    expect(m).not.toBeNull();
    expect(m?.getAttribute('aria-haspopup')).toBe('menu');
    expect(m?.getAttribute('aria-expanded')).toBe('false'); // fermé au repos : rien n’encombre
    // Aucune commande n’est visible tant que le menu est fermé.
    expect(boutonPar(/Déplacer l’échange/)).toBeUndefined();
    expect(boutonPar(/Détacher l’échange/)).toBeUndefined();
  });

  it('il ouvre les deux commandes de l’échange', async () => {
    await ouvrirCarte();
    await cliquer(menuDeLEchange());
    expect(menuDeLEchange()?.getAttribute('aria-expanded')).toBe('true');
    expect(boutonPar(/^Déplacer l’échange…$/)).toBeDefined();
    expect(boutonPar(/^Détacher l’échange$/)).toBeDefined();
  });

  it('« Déplacer… » ouvre la RECHERCHE d’événement, et nomme l’échange déplacé', async () => {
    await ouvrirCarte();
    await cliquer(menuDeLEchange());
    await cliquer(boutonPar(/^Déplacer l’échange…$/));
    expect(container.textContent).toContain('Déplacer l’échange « Fuite salle de bain » vers');
    expect(container.querySelector('input[type="search"]')).not.toBeNull();
    expect(appels).toContain('GET /api/admin/gestion/evenements?q=');
  });

  it('on ne peut pas déplacer avant d’avoir choisi une destination', async () => {
    await ouvrirCarte();
    await cliquer(menuDeLEchange());
    await cliquer(boutonPar(/^Déplacer l’échange…$/));
    expect(boutonPar(/^Déplacer$/)?.disabled).toBe(true);
  });

  it('choisir une carte puis valider RATTACHE AILLEURS, et relit tout l’écran', async () => {
    await ouvrirCarte();
    await cliquer(menuDeLEchange());
    await cliquer(boutonPar(/^Déplacer l’échange…$/));
    await cliquer(resultatPar(/GES-2026-000042/));
    await cliquer(boutonPar(/^Déplacer$/));
    expect(posts[0]).toEqual({ url: '/api/admin/gestion/fils/5/affectation', corps: { evenementId: 42 } });
    expect(rapports[0]).toMatchObject({ rechargerTout: true });
    expect(rapports[0].message).toContain('GES-2026-000042');
  });

  it('la carte où l’on est n’est pas proposée comme destination — s’y déplacer n’a aucun sens', async () => {
    await ouvrirCarte();
    await cliquer(menuDeLEchange());
    await cliquer(boutonPar(/^Déplacer l’échange…$/));
    expect(resultatPar(/GES-2026-000009/)).toBeUndefined(); // la carte courante
    expect(resultatPar(/GES-2026-000042/)).toBeDefined();   // une autre
  });

  it('Échap referme le menu sans rien déclencher', async () => {
    await ouvrirCarte();
    await cliquer(menuDeLEchange());
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    await calmer();
    expect(menuDeLEchange()?.getAttribute('aria-expanded')).toBe('false');
    expect(posts).toEqual([]);
    expect(appels.some((a) => a.startsWith('DELETE'))).toBe(false);
  });
});


describe('⑤ LOT 4d-B2 — DÉPLACER UN MAIL SEUL', () => {
  const ouvrirFil = async () => {
    await monter();
    await cliquer(boutonPar(/Fuite salle de bain/));
    await cliquer(boutons().find((b) => /2 messages/.test(b.textContent ?? '')));
  };
  const menusDeMail = () => [...container.querySelectorAll('button[aria-label="Actions sur ce message"]')] as HTMLButtonElement[];

  it('CHAQUE mail porte son « ⋯ », et rien n’est visible tant qu’il est fermé', async () => {
    await ouvrirFil();
    expect(menusDeMail()).toHaveLength(2); // un par message affiché
    expect(boutonPar(/Déplacer ce mail/)).toBeUndefined();
  });

  it('le menu d’un mail ouvre ses deux commandes', async () => {
    await ouvrirFil();
    await cliquer(menusDeMail()[0]);
    expect(boutonPar(/^Déplacer ce mail vers un autre événement…$/)).toBeDefined();
    expect(boutonPar(/^Détacher ce mail$/)).toBeDefined();
  });

  it('« Déplacer ce mail… » ouvre la MÊME recherche, et rattache le mail choisi', async () => {
    await ouvrirFil();
    await cliquer(menusDeMail()[0]);
    await cliquer(boutonPar(/^Déplacer ce mail vers un autre événement…$/));
    expect(container.textContent).toContain('Déplacer ce mail vers');
    await cliquer(resultatPar(/GES-2026-000042/));
    await cliquer(boutonPar(/^Déplacer$/));
    expect(posts[0]).toEqual({ url: '/api/admin/gestion/messages/1/affectation', corps: { evenementId: 42 } });
    expect(rapports[0].message).toContain('GES-2026-000042');
    expect(rapports[0].message).toContain('échange d’origine'); // l'écran DIT que rien n'est perdu
    expect(rapports[0].rechargerTout).toBe(true);
  });

  it('« Détacher ce mail » le remet dans son échange', async () => {
    await ouvrirFil();
    await cliquer(menusDeMail()[1]);
    await cliquer(boutonPar(/^Détacher ce mail$/));
    expect(appels).toContain('DELETE /api/admin/gestion/messages/2/affectation');
    expect(rapports[0].message).toContain('remis dans son échange');
  });

  it('l’échange d’origine ANNONCE les mails partis, et les remet d’un clic', async () => {
    PARTIS = [{ messageId: 9, objet: 'Fuite', recuLe: '2026-09-21T10:00:00Z', reference: 'GES-2026-000042', evenementId: 42 }];
    await ouvrirFil();
    expect(container.textContent).toContain('1 mail déplacé vers');
    expect(container.textContent).toContain('GES-2026-000042');
    await cliquer(boutonPar(/^Remettre dans son échange$/));
    expect(appels).toContain('DELETE /api/admin/gestion/messages/9/affectation');
  });

  it('les mails venus seuls s’affichent dans la carte, en disant d’où ils sortent', async () => {
    reponseDetail = {
      ...DETAIL,
      mailsDeplaces: [{
        filId: 77, objetDuFil: 'Préavis de départ',
        message: conv({
          messageId: 12, sens: 'recu' as const, de: 'locataire@exemple.test', deNom: 'Mme M.',
          recuLe: '2026-09-21T12:00:00Z', objet: 'Fuite', corps: 'Il y a une fuite.', automatique: false, pieces: [],
        }),
      }],
    };
    await monter();
    await cliquer(boutonPar(/Fuite salle de bain/));
    expect(container.textContent).toContain('Mails déplacés ici');
    expect(container.textContent).toContain('Venu de l’échange « Préavis de départ »');
    expect(container.textContent).toContain('Il y a une fuite.');
  });
});
