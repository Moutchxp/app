// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { LigneVie } from './VieDuBien';
import { preparerBrouillon } from '../../../../lib/gestion/redaction';
import { classementHerite } from '../../../../lib/gestion/classementAvantEnvoi';
import type { LigneHistorique } from '../../../../lib/gestion/historique';
import type { VoieRedaction } from '../../../../lib/gestion/redaction';

/**
 * ══ 🔴🔴 LOT REPONDRE-DEPUIS-HISTORIQUE-DU-BIEN (09/10/2026) ════════════════════════════════════════════════════
 *
 * CONSTAT D'ARNO : « dans l'historique d'un bien, un mail ouvert n'offre AUCUN moyen de répondre. Il faut pouvoir
 * répondre à CHAQUE mail de l'historique sans quitter la page. »
 *
 * SA DEMANDE, EN TROIS POINTS : ① les 3 boutons de la boîte mail à la fin de chaque mail déplié, **même
 * composant, même format** ; ② le MÊME module de rédaction, sur place, avec toutes ses fonctions, **réutilisé et
 * non recopié** ; ③ le message part **déjà rattaché** comme le mail auquel il répond, en VERT.
 *
 * ══ 🔴🔴 CE QUE CES CAS TIENNENT, ET CE QU'ILS NE PEUVENT PAS TENIR ═════════════════════════════════════════════
 *
 * Ils tiennent la PLACE des boutons, le fait qu'ils n'apparaissent que là où on les a demandés, ce que le clic
 * transmet, et le fait qu'aucune règle d'écriture n'ait été réécrite au passage. L'envoi RÉEL, lui, ne se prouve
 * pas dans jsdom : il a été fait une fois, pour de vrai, vers `a.jorel@sansvisavis.com` depuis un bien de TEST —
 * et sa trace est dans `app/.captures/repondre-depuis-historique-du-bien/mesures.md`.
 *
 * 🔒 AUCUNE DONNÉE RÉELLE ICI : adresses inventées en `@fictif.test`, aucun appel réseau (la seule route touchée
 * est doublée).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BOUTONS = readFileSync('app/(admin)/admin/(protected)/gestion/BoutonsRepondre.tsx', 'utf8');
const CONVERSATION = readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8');
const HDB = readFileSync('app/(admin)/admin/(protected)/gestion/HistoriqueDuBien.tsx', 'utf8');
const VDB = readFileSync('app/(admin)/admin/(protected)/gestion/VieDuBien.tsx', 'utf8');

const MESSAGE = 9001;

const LIGNE: LigneHistorique = {
  messageId: MESSAGE, filId: 77, messageIdRfc: '<origine@fictif.test>',
  recuLe: '2026-10-05T09:30:00.000Z', sens: 'recu',
  de: 'locataire@fictif.test', deNom: 'M. INVENTÉ Paul',
  destinataires: ['gestion@criterimmo.fr', 'syndic@fictif.test'],
  a: [{ nom: 'Gestion', adresse: 'gestion@criterimmo.fr' }],
  cc: [{ nom: 'Le syndic', adresse: 'syndic@fictif.test' }],
  cci: [], repondreA: [], adressesTexte: [],
  objet: 'Fuite sous l’évier',
  extrait: 'Bonjour, il y a une fuite sous l’évier depuis hier.', pieces: [],
  parCible: { sorte: 'lot', cle: '219', id: null }, cibleLibelle: '25 rue Inventée, VILLE-TEST — lot 219',
  source: 'rattachement', evenements: [],
  statut: null, statutDetail: null,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  /* La ligne dépliée charge le corps entier : on le lui donne, sans réseau. */
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ corps: 'Bonjour, il y a une fuite sous l’évier depuis hier. Merci.', html: '<p>Bonjour</p>' }),
  })));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function monter(o: {
  ouvert: boolean;
  repondre?: (voie: VoieRedaction, corps: string | null, html: string | null) => void;
  composeur?: React.ReactNode;
}): Promise<void> {
  await act(async () => {
    root.render(createElement(LigneVie, {
      l: LIGNE, maintenant: new Date('2026-10-09T12:00:00.000Z'), ouvert: o.ouvert,
      onBasculer: () => {}, onOuvrirFil: () => {},
      repondre: o.repondre, composeur: o.composeur ?? null,
    }));
  });
  await act(async () => { await Promise.resolve(); });
}

const boutons = (): string[] => [...container.querySelectorAll('.vdb-repondre button')]
  .map((b) => (b.textContent ?? '').trim());

describe('🔴🔴 ① les trois boutons, à la place demandée', () => {
  it('🔴🔴 ils sont là, dans l’ordre de la boîte mail', async () => {
    await monter({ ouvert: true, repondre: () => {} });
    expect(boutons()).toEqual(['Répondre', 'Répondre à tous', 'Transférer']);
  });

  /**
   * 🔴 « APRÈS LES PIÈCES JOINTES ET “VOIR LA CONVERSATION D'ORIGINE →” » (Arno). L'ordre du document est
   * vérifiable : la rangée suit la sortie, et rien ne s'intercale.
   */
  it('🔴 ils viennent APRÈS « Voir la conversation d’origine → »', async () => {
    await monter({ ouvert: true, repondre: () => {} });
    const sortie = container.querySelector('.vdb-sortie');
    const rangee = container.querySelector('.vdb-repondre');
    expect(sortie).not.toBeNull();
    expect(rangee).not.toBeNull();
    /* `DOCUMENT_POSITION_FOLLOWING` = la rangée vient après la sortie dans le document. */
    const position = (sortie as Element).compareDocumentPosition(rangee as Node);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  /**
   * 🔴🔴 RIEN NE CHANGE LÀ OÙ PERSONNE N'A RIEN DEMANDÉ. Cette ligne est montée par QUATRE écrans (historique du
   * bien, vie du bien, fiche d'un locataire, annuaire) ; seul le premier sait écrire. Sans la propriété, la
   * ligne est celle d'hier — c'est la règle de ce fichier pour toute capacité nouvelle.
   */
  it('🔴🔴 aucun bouton sans la propriété : les trois autres écrans ne bougent pas', async () => {
    await monter({ ouvert: true });
    expect(container.querySelector('.vdb-repondre')).toBeNull();
  });

  /** ⚠️ ET JAMAIS SUR UN MAIL REPLIÉ : vingt-cinq rangées de boutons dans une liste finissent par être cliquées. */
  it('⚠️ un mail replié n’en montre aucun', async () => {
    await monter({ ouvert: false, repondre: () => {} });
    expect(container.querySelector('.vdb-repondre')).toBeNull();
  });

  /** 🔴 LE CLIC DIT QUELLE VOIE, ET REMET LE CORPS ENTIER — c'est lui qui fera la citation. */
  it('🔴 le clic transmet la voie ET le corps chargé', async () => {
    const vus: { voie: VoieRedaction; corps: string | null; html: string | null }[] = [];
    await monter({ ouvert: true, repondre: (voie, corps, html) => vus.push({ voie, corps, html }) });
    const tous = [...container.querySelectorAll('.vdb-repondre button')][1] as HTMLButtonElement;
    await act(async () => { tous.click(); });
    expect(vus).toHaveLength(1);
    expect(vus[0].voie).toBe('repondre_tous');
    /* 🔴 LE CORPS ENTIER, PAS L'EXTRAIT : la liste n'en reçoit que 240 caractères, et citer un texte coupé au
       milieu d'un mot est précisément ce que le lot HISTORIQUE-BIEN-4 a corrigé ailleurs. */
    expect(vus[0].corps).toContain('Merci.');
    expect(vus[0].html).toBe('<p>Bonjour</p>');
  });
});

describe('🔴🔴 ② l’éditeur sur place — le même, et jamais démonté', () => {
  it('🔴 il se pose sous le mail quand l’écran le fournit', async () => {
    await monter({ ouvert: true, repondre: () => {}, composeur: createElement('p', { id: 'faux-editeur' }, 'éditeur') });
    expect(container.querySelector('#faux-editeur')).not.toBeNull();
  });

  /**
   * 🔴🔴 REPLIER UN MAIL NE JETTE PAS LA RÉPONSE EN COURS. L'éditeur est CACHÉ (`hidden`), jamais démonté : le
   * démonter perdrait le texte frappé depuis la dernière accalmie, une pièce en cours de dépôt, le compte à
   * rebours d'annulation d'un envoi. C'est la règle de la conversation, et c'est elle qu'on vérifie ici.
   */
  it('🔴🔴 replier le mail CACHE l’éditeur, il ne le démonte pas', async () => {
    await monter({ ouvert: false, repondre: () => {}, composeur: createElement('p', { id: 'faux-editeur' }, 'éditeur') });
    const e = container.querySelector('#faux-editeur');
    expect(e).not.toBeNull();
    expect((e?.parentElement as HTMLElement).hidden).toBe(true);
  });
});

describe('🔴🔴 ③ un seul composant de boutons, et aucune règle d’écriture réécrite', () => {
  /**
   * 🔴🔴 « MÊME COMPOSANT, MÊME FORMAT QUE DANS LA BOÎTE MAIL » (Arno), pris au mot : le groupe vivait DANS la
   * conversation. Il en est sorti tel quel, et la conversation l'importe désormais. Deux rangées jumelles
   * auraient divergé au premier ajustement d'icône ou de libellé.
   */
  it('🔴🔴 la conversation emploie le composant partagé, et ne redéclare plus le bloc', () => {
    expect(CONVERSATION).toContain("from './BoutonsRepondre'");
    expect(CONVERSATION).toContain('<BoutonsRepondre onRepondre={onRepondre} />');
    /* Le bloc recopié n'existe plus nulle part : ni la rangée en dur, ni une seconde `IconeVoie`. */
    expect(CONVERSATION).not.toContain('function IconeVoie(');
    expect(CONVERSATION).not.toContain("role=\"group\" aria-label=\"Répondre à ce message\"");
    expect(VDB).toContain("from './BoutonsRepondre'");
  });

  /** 🔴 LES MOTS ET LES CLASSES SONT CEUX DE LA BOÎTE, au caractère près. */
  it('🔴 mêmes libellés, même habillage de bouton', () => {
    for (const mot of ['Répondre', 'Répondre à tous', 'Transférer']) expect(BOUTONS).toContain(`'${mot}'`);
    expect(BOUTONS).toContain('className="svv-btn svv-btn-outline gst-btn"');
  });

  /**
   * 🔴🔴 LE BLOC N'ÉCRIT AUCUNE RÈGLE DE RÉDACTION. Qui reçoit quoi, l'objet « Re: » / « Tr: », la citation :
   * tout vient de `preparerBrouillon`, le module pur. Une seconde écriture ici aurait divergé de la boîte au
   * premier ajustement — et c'est la réponse d'un client qui serait partie à la mauvaise personne.
   */
  it('🔴🔴 l’historique appelle le module pur, et ne préfixe aucun objet lui-même', () => {
    expect(HDB).toContain('const b = preparerBrouillon(voie, {');
    expect(HDB).toContain('classementHerite({');
    const sansCommentaires = HDB.replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(sansCommentaires).not.toContain("'Re: '");
    expect(sansCommentaires).not.toContain("'Tr: '");
  });

  /**
   * 🔴🔴 CE DONT LA RÉPONSE HÉRITE, VRAIMENT CALCULÉ : le bien de CETTE fiche, en vert. C'est le même appel que
   * fait le bloc, joué ici avec le libellé que la ligne porte — la case verte du champ « Classer ce mail » lit
   * exactement ce tableau-là.
   */
  it('🔴🔴 le brouillon naît rattaché au bien de la fiche', () => {
    const herite = classementHerite({
      biens: [{ sorte: 'lot', cle: '219', id: null, libelle: LIGNE.cibleLibelle }],
    });
    expect(herite.cibles).toEqual([
      { sorte: 'lot', cle: '219', id: null, libelle: '25 rue Inventée, VILLE-TEST — lot 219' },
    ]);
    expect(herite.interne).toBe(false);
    expect(herite.horsGestion).toBe(false);
  });

  /**
   * 🔴 ET LES TROIS VOIES FONT CE QU'ELLES DISENT, sur CE mail-ci — joué par le module pur avec exactement les
   * champs que le bloc lui passe (`destA: l.a`, `destCc: l.cc`, `destReplyTo: l.repondreA`).
   */
  it('🔴 Répondre, Répondre à tous, Transférer : les destinataires d’Arno', () => {
    const origine = {
      messageId: LIGNE.messageId, de: LIGNE.de, deNom: LIGNE.deNom, objet: LIGNE.objet, recuLe: LIGNE.recuLe,
      corps: LIGNE.extrait, destA: LIGNE.a, destCc: LIGNE.cc, destReplyTo: LIGNE.repondreA,
      destinatairesFondus: LIGNE.destinataires.join(', '),
    };
    const ctx = { adresseGestion: 'gestion@criterimmo.fr', signature: '' };
    const r = preparerBrouillon('repondre', origine, ctx, { filId: LIGNE.filId });
    expect(r.a).toEqual(['locataire@fictif.test']);
    expect(r.cc).toEqual([]);
    expect(r.objet).toBe('Re: Fuite sous l’évier');

    const rt = preparerBrouillon('repondre_tous', origine, ctx, { filId: LIGNE.filId });
    expect(rt.a).toEqual(['locataire@fictif.test']);
    /* ⚠️ NOTRE PROPRE ADRESSE N'Y EST PAS : on ne se répond pas à soi-même. */
    expect(rt.cc).toEqual(['syndic@fictif.test']);

    const tr = preparerBrouillon('transferer', origine, ctx, { filId: LIGNE.filId });
    expect(tr.a).toEqual([]);
    expect(tr.objet).toBe('Tr: Fuite sous l’évier');
    /* 🔴 ET IL RÉPOND BIEN À CE MESSAGE-LÀ : c'est ce lien qui fait suivre les pièces d'un transfert, côté
       serveur, et qui raccroche la réponse au bon endroit du fil chez le correspondant. */
    expect(tr.repondALeMessageId).toBe(MESSAGE);
  });
});

describe('🔴 ce que l’écran refuse de proposer', () => {
  /**
   * 🔴 SANS DROIT D'ENVOI, OU SANS SCHÉMA, AUCUN BOUTON. Se taire vaut mieux que proposer un geste dont on sait
   * qu'il ne peut pas aboutir — règle du module, déjà celle de la conversation.
   */
  it('🔴 les deux mêmes conditions que la conversation, et pas une de plus', () => {
    expect(HDB).toContain('const peutRepondre = redaction !== null && redaction.schemaPret && redaction.peutEnvoyer;');
    expect(HDB).toContain('repondre={peutRepondre ? repondreAuMail : undefined}');
  });

  /** 🔴 ENVOYÉ ⇒ LA LISTE SE RELIT, par le compteur que ce bloc emploie déjà pour toutes ses relectures. */
  it('🔴 un envoi fait relire l’historique, sans rechargement de page', () => {
    expect(HDB).toContain('onEnvoye={() => { setReponse(null); setRechargement((n) => n + 1); }}');
  });
});
