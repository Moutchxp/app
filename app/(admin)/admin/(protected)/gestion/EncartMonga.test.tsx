// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EncartMonga } from './EncartMonga';

/**
 * ══ 🔴🔴 LOT MONGA-1, POINT 3 — ÉPREUVES DE L'ENCART À L'ÉCRAN ═══════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Les quatre règles d'Arno que seul un rendu peut tenir :
 *
 *   ① SUR UN MAIL ORDINAIRE, L'ENCART NE REND **RIEN**. La fenêtre « Classer » est alors exactement celle d'avant
 *      ce lot — c'est le cas de l'immense majorité du courrier, et une bordure vide se lirait comme une panne.
 *   ② LE LOT UNIQUE EST **COCHÉ, PAS VALIDÉ**. Décision n° 1 d'Arno : « premier rattachement d'une référence =
 *      TOUJOURS un clic d'Arno, même quand le lot est unique. » Aucune requête ne doit partir au rendu.
 *   ③ À PLUSIEURS LOTS, **RIEN N'EST COCHÉ**, et chaque ligne porte son propriétaire et son locataire du jour :
 *      c'est par eux qu'on reconnaît un logement parmi 76 à la même adresse.
 *   ④ LA PHRASE DU RENOMMAGE EST AFFICHÉE **AVANT** LE CLIC, et seulement quand le nom diffère vraiment.
 *
 * 🔒 AUCUN ENVOI, AUCUNE DONNÉE RÉELLE : `fetch` est simulé, les lots et les événements sont inventés.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LOT_27 = {
  cle: '27', libelle: '53 avenue des Ternes, 75017 PARIS — Appartement Type 2 — lot 27',
  adresse: '53 avenue des Ternes', commune: 'PARIS', nature: 'Appartement', typeBien: 'Type 2',
  proprietaire: 'PIRIOU Blandine', locataire: 'ACKET Camille',
};
const LOT_28 = {
  ...LOT_27, cle: '28', libelle: '53 avenue des Ternes, 75017 PARIS — Appartement Type 3 — lot 28',
  proprietaire: 'PIRIOU Blandine', locataire: null,
};

const ENCART_BASE = {
  reference: 'MNG-23987',
  libelle: 'barre de douche defixer',
  adresse: '53 avenue des Ternes, 75017 PARIS',
  lienMission: 'https://app.monga.io/missions/view/abc',
  etape: 'devis_rappel' as const,
  derniereEtapeMot: 'Devis en attente de validation · 05/10',
  nbMails: 4,
  evenementId: null as string | null,
  evenementNom: null as string | null,
  cas: 'unique' as 'unique' | 'plusieurs' | 'aucun',
  lots: [LOT_27],
  evenements: [] as unknown[],
  mot: 'Intervention Monga MNG-23987 · barre de douche defixer · 53 avenue des Ternes, 75017 PARIS',
};

let encart: Record<string, unknown> | null = { ...ENCART_BASE };
const posts: { url: string; corps: unknown }[] = [];

beforeEach(() => {
  encart = { ...ENCART_BASE };
  posts.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    if ((init?.method ?? 'GET') === 'POST') {
      posts.push({ url, corps: JSON.parse(init?.body ?? '{}') });
      return { ok: true, json: async () => ({ etat: 'ok', classes: 4, renomme: null }) } as never;
    }
    if (url.includes('cherche=')) {
      return { ok: true, json: async () => ({ etat: 'ok', lots: [LOT_28] }) } as never;
    }
    return { ok: true, json: async () => ({ etat: 'ok', encart }) } as never;
  }));
});

afterEach(() => { vi.unstubAllGlobals(); });

async function rendre(messageId: number | null = 57489): Promise<{ hote: HTMLElement; racine: Root }> {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  const racine = createRoot(hote);
  await act(async () => {
    racine.render(createElement(EncartMonga, { messageId }));
  });
  /* ⚠️ UN SECOND TOUR : la lecture est asynchrone, et le premier rendu ne montre encore rien. */
  await act(async () => { await Promise.resolve(); });
  return { hote, racine };
}

describe('① sur un mail qui n’est pas un mail Monga, l’encart ne rend RIEN', () => {
  it('🔴🔴 aucun nœud du tout — la fenêtre est celle d’avant ce lot', async () => {
    encart = null;
    const { hote, racine } = await rendre();
    expect(hote.textContent).toBe('');
    await act(async () => { racine.unmount(); });
  });

  it('⚠️ sans migration 311 non plus : « sans_schema » est un état, pas une panne', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => (
      { ok: true, json: async () => ({ etat: 'sans_schema' }) } as never)));
    const { hote, racine } = await rendre();
    expect(hote.textContent).toBe('');
    await act(async () => { racine.unmount(); });
  });

  it('⚠️ aucun mail (pas de `messageId`) ⇒ rien, et aucune requête', async () => {
    const { hote, racine } = await rendre(null);
    expect(hote.textContent).toBe('');
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => { racine.unmount(); });
  });
});

describe('② l’en-tête, mot pour mot celui d’Arno', () => {
  it('la phrase, la dernière étape, le nombre de mails et le lien Mission', async () => {
    const { hote, racine } = await rendre();
    const t = hote.textContent ?? '';
    expect(t).toContain('Intervention Monga MNG-23987 · barre de douche defixer · 53 avenue des Ternes');
    expect(t).toContain('Devis en attente de validation · 05/10');
    expect(t).toContain('4 mails');
    const lien = hote.querySelector('a.emg-lien') as HTMLAnchorElement | null;
    expect(lien?.href).toBe('https://app.monga.io/missions/view/abc');
    /* ⚠️ `noreferrer` : on n'annonce pas notre écran interne à Monga. */
    expect(lien?.rel).toContain('noreferrer');
    await act(async () => { racine.unmount(); });
  });
});

describe('③ LE LOT UNIQUE EST COCHÉ, ET SEULEMENT COCHÉ', () => {
  it('🔴🔴 coché d’office, et AUCUNE écriture n’est partie', async () => {
    const { hote, racine } = await rendre();
    const radios = [...hote.querySelectorAll('input[type=radio]')] as HTMLInputElement[];
    expect(radios).toHaveLength(1);
    expect(radios[0].checked).toBe(true);
    /**
     * 🔴🔴 LA RÈGLE EST LÀ, ET ELLE SE MESURE AINSI : aucun POST. Présélectionner fait gagner du temps ; valider
     * d'office aurait rangé du courrier dans le dossier de quelqu'un sans que personne ait regardé.
     */
    expect(posts).toEqual([]);
    const bouton = hote.querySelector('button.emg-valider') as HTMLButtonElement | null;
    expect(bouton?.disabled).toBe(false);
    expect(bouton?.textContent).toContain('Créer l’événement « barre de douche defixer »');
    await act(async () => { racine.unmount(); });
  });

  it('le clic envoie la référence, le mail et le lot — et rien d’autre', async () => {
    const { hote, racine } = await rendre();
    const bouton = hote.querySelector('button.emg-valider') as HTMLButtonElement;
    await act(async () => { bouton.click(); });
    await act(async () => { await Promise.resolve(); });
    expect(posts).toHaveLength(1);
    expect(posts[0].corps).toEqual({ reference: 'MNG-23987', messageId: 57489, lotCle: '27' });
    await act(async () => { racine.unmount(); });
  });
});

describe('④ à PLUSIEURS lots, rien n’est coché, et chaque ligne dit qui habite', () => {
  it('🔴🔴 aucun radio coché — le choix est manuel (décision n° 2 d’Arno)', async () => {
    encart = { ...ENCART_BASE, cas: 'plusieurs', lots: [LOT_27, LOT_28] };
    const { hote, racine } = await rendre();
    const radios = [...hote.querySelectorAll('input[type=radio]')] as HTMLInputElement[];
    expect(radios).toHaveLength(2);
    expect(radios.some((r) => r.checked)).toBe(false);
    /* 🔴 ET LE BOUTON EST DÉSACTIVÉ TANT QU'AUCUN LOT N'EST CHOISI : pas de clic possible « dans le vide ». */
    expect((hote.querySelector('button.emg-valider') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { racine.unmount(); });
  });

  it('🔴 le propriétaire et le locataire DU JOUR, et « aucun locataire » quand c’est vacant', async () => {
    encart = { ...ENCART_BASE, cas: 'plusieurs', lots: [LOT_27, LOT_28] };
    const { hote, racine } = await rendre();
    const gens = [...hote.querySelectorAll('.emg-lot-gens')].map((n) => n.textContent ?? '');
    expect(gens[0]).toContain('PIRIOU Blandine');
    expect(gens[0]).toContain('ACKET Camille');
    // ⚠️ « Vacant » est une RÉPONSE, pas un trou : on l'écrit.
    expect(gens[1]).toContain('aucun locataire aujourd’hui');
    expect(hote.textContent).toContain('Plusieurs biens à cette adresse : choisissez lequel.');
    await act(async () => { racine.unmount(); });
  });

  it('⚠️ aucun lot reconnu ⇒ le moteur de recherche, et lui seul', async () => {
    encart = { ...ENCART_BASE, cas: 'aucun', lots: [] };
    const { hote, racine } = await rendre();
    expect(hote.textContent).toContain('Aucun bien reconnu à cette adresse : cherchez-le.');
    expect(hote.querySelectorAll('input[type=radio]')).toHaveLength(0);
    expect(hote.querySelector('input.emg-recherche')).not.toBeNull();
    expect((hote.querySelector('button.emg-valider') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { racine.unmount(); });
  });
});

describe('⑤ LA PHRASE DU RENOMMAGE, AVANT LE CLIC', () => {
  const EVT = {
    evenementId: '4242', reference: 'GES-2026-000042', objet: 'Fuite salle de bain',
    etat: 'en_cours', ouvertLe: '2026-10-01', lots: ['27'],
  };

  it('🔴🔴 le nom diffère ⇒ la phrase d’Arno, mot pour mot, à côté du bouton', async () => {
    encart = { ...ENCART_BASE, evenements: [EVT] };
    const { hote, racine } = await rendre();
    expect(hote.querySelector('.emg-renomme')?.textContent).toBe(
      'Le nom deviendra « barre de douche defixer » (nom Monga). Ancien nom conservé dans l’historique.');
    expect(hote.textContent).toContain('GES-2026-000042 — Fuite salle de bain');
    expect(hote.textContent).toContain('Relier à cet événement');
    await act(async () => { racine.unmount(); });
  });

  it('⚠️ le nom est DÉJÀ celui de Monga ⇒ aucune phrase (on n’annonce pas un renommage qui n’aura pas lieu)',
    async () => {
      encart = {
        ...ENCART_BASE,
        evenements: [{ ...EVT, objet: 'barre de douche defixer' }],
      };
      const { hote, racine } = await rendre();
      expect(hote.querySelector('.emg-renomme')).toBeNull();
      expect(hote.textContent).toContain('Relier à cet événement');
      await act(async () => { racine.unmount(); });
    });

  it('« Relier » envoie la référence, l’événement ET LE MAIL — jamais un lot', async () => {
    encart = { ...ENCART_BASE, evenements: [EVT] };
    const { hote, racine } = await rendre();
    const bouton = [...hote.querySelectorAll('button')]
      .find((b) => (b.textContent ?? '').includes('Relier à cet événement')) as HTMLButtonElement;
    await act(async () => { bouton.click(); });
    await act(async () => { await Promise.resolve(); });
    /**
     * 🔴 `messageId` EST TRANSMIS ICI AUSSI, et pas seulement à la création : c'est « l'ancre », le mail depuis
     * lequel Arno clique, et il doit être classé même s'il dormait à la corbeille. Sans lui, le mail 57489 de
     * l'essai réel aurait été le SEUL de sa référence à rester dehors.
     */
    expect(posts[0].corps).toEqual({ reference: 'MNG-23987', evenementId: 4242, messageId: 57489 });
    expect(posts[0].corps).not.toHaveProperty('lotCle');
    await act(async () => { racine.unmount(); });
  });
});

describe('⑥ après le clic : « Annuler » quelques secondes', () => {
  it('🔴 le bandeau apparaît, et « Annuler » passe par la porte « délier »', async () => {
    const { hote, racine } = await rendre();
    const bouton = hote.querySelector('button.emg-valider') as HTMLButtonElement;
    await act(async () => { bouton.click(); });
    await act(async () => { await Promise.resolve(); });
    expect(hote.querySelector('.emg-fait')).not.toBeNull();
    const annuler = [...hote.querySelectorAll('.emg-fait button')][0] as HTMLButtonElement;
    expect(annuler.textContent).toBe('Annuler');
    await act(async () => { annuler.click(); });
    await act(async () => { await Promise.resolve(); });
    /**
     * 🔴 LA MÊME PORTE QUE « DÉLIER » : c'est ce qui rend l'annulation exacte — elle remet le nom d'avant,
     * désactive les affectations et retire les rattachements que le classement avait posés. Un second chemin de
     * restauration aurait divergé au premier ajustement.
     */
    expect(posts[1].corps).toMatchObject({ reference: 'MNG-23987', delier: true });
    await act(async () => { racine.unmount(); });
  });
});

describe('⑦ une référence DÉJÀ reliée : l’encart ne propose plus, il DIT', () => {
  it('🔴 aucun choix de lot, aucun bouton de création', async () => {
    encart = {
      ...ENCART_BASE, evenementId: '4242', evenementNom: 'barre de douche defixer', lots: [], evenements: [],
    };
    const { hote, racine } = await rendre();
    expect(hote.textContent).toContain('Reliée à l’événement');
    expect(hote.textContent).toContain('s’y classent tout seuls');
    expect(hote.querySelector('button.emg-valider')).toBeNull();
    expect(hote.querySelectorAll('input[type=radio]')).toHaveLength(0);
    await act(async () => { racine.unmount(); });
  });
});
