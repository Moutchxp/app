// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BoiteMail } from './BoiteMail';
import { capsuleStatut, motCapsule, sqlSortesBien, SORTES_BIEN } from '../../../../lib/gestion/statutClassement';

/**
 * ══ 🔴🔴 LOT STATUT-LIGNE-APRES-CLASSEMENT — LA PASTILLE D'UNE LIGNE DIT CE QUI EST VALIDÉ DANS LE MAIL ═══════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LE CONSTAT D'ARNO (03/10/2026), fil 36691 / message 57461 (« augustin », reçu de Mira Bercier, adresse inconnue
 * de l'annuaire). Il marque l'échange « Interne » : dans le mail, la pastille dit « Interne » et le bloc vert
 * s'affiche. De retour dans la Réception, la ligne dit toujours « À classer ».
 *
 * 🔴 CE QUE LE DIAGNOSTIC A TROUVÉ, ET IL Y AVAIT **DEUX** DÉFAUTS DISTINCTS :
 *
 *   ① LE SERVEUR AVAIT RAISON, L'ÉCRAN GARDAIT UN ÉTAT RÉVOLU. Vérifié en base (`gestion_fil_interne` id 49,
 *      vivante) et par la lecture réelle de la liste (`interne: true`). Mais la liste n'est pas DÉMONTÉE quand on
 *      lit un mail : elle est MASQUÉE (`hidden` sur `.pe-liste`), pour préserver la page, la recherche et le
 *      défilement. Rien ne lui disait qu'un classement venait d'être validé → elle affichait l'avant-geste.
 *
 *   ② « QU'EST-CE QU'UN BIEN ? » ÉTAIT ÉCRITE CINQ FOIS, AVEC DEUX RÉPONSES. `SORTES_BIEN` (la pastille du MAIL),
 *      `receptionRepo` et `classementBien` comptaient `locataire` ; la jointure de la LIGNE, le prédicat du dossier
 *      « À classer » et l'historique d'une cible ne le comptaient pas. Tant qu'aucun lien `locataire` n'existait,
 *      les deux réponses coïncidaient. **Le 01/10/2026, 17 061 liens `locataire` ont été posés** : mesuré le
 *      03/10, 15 494 échanges affichaient « Classé » dans le mail et « À classer » sur leur ligne, et le compteur
 *      en retenait 267 de trop (9 414 contre 9 147).
 *
 * CE FICHIER ÉPROUVE LES DEUX, ET DANS CET ORDRE.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * UNE LIGNE « À CLASSER » — celle du constat : un seul mail, expéditeur inconnu, aucun rattachement.
 *
 * ⚠️ `classement` N'EST PAS `null` ET C'EST INDISPENSABLE : la liste n'affiche aucune capsule quand il l'est (c'est
 * le cas « migration 257 absente », où l'on ne sait rien). Un objet à zéro, lui, dit « on sait, et il n'y a rien ».
 */
const A_CLASSER = {
  filId: 36691,
  messageAffiche: 57461,
  objet: 'augustin',
  interlocuteur: 'Mira Bercier',
  dernierSens: 'recu' as const,
  dernierLe: '2026-10-02T18:28:30Z',
  extrait: 'Envoyé de mon iPhone',
  nbMessages: 1,
  nbLisibles: 1,
  aPiece: false,
  nbPieces: 0,
  piecesDuMessage: 0,
  piecesAilleurs: 0,
  nbCorbeille: 0,
  reference: null,
  sansSuite: false,
  nonRemise: null,
  nonEnvoye: null,
  etoilee: false,
  classement: { nbActifs: 0, parUnHumain: false, detail: null },
  horsGestion: false,
  motifHorsGestion: null,
  interne: false,
};

let container: HTMLDivElement;
let root: Root;
let urls: string[];
/** Ce que la prochaine lecture rendra. Le test le remplace entre deux rendus, comme le ferait un geste réel. */
let ligneServie: Record<string, unknown>;
let totalServi: number;

const reponse = () => ({
  lignes: [ligneServie], suivant: null, total: totalServi, comptes: null,
  nonLus: [], nonLusTotal: 0, nonLusPartiel: false,
  pleinTexte: true, automatiquesMasques: null, brouillons: { lignes: [], tronque: false },
});

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  urls = [];
  ligneServie = A_CLASSER;
  totalServi = 9414;
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    urls.push(String(url));
    return { ok: true, json: async () => reponse() } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const capsule = () => container.querySelector('.bte-capsule')?.textContent?.trim() ?? null;

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LE MOT DE LA PASTILLE — UNE SEULE RÈGLE, CELLE DE `capsuleStatut`
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 la pastille d’une ligne reflète ce qui est validé dans le mail', () => {
  const rendre = async (ligne: Record<string, unknown>) => {
    ligneServie = ligne;
    await act(async () => { root.render(createElement(BoiteMail, { onOuvrir: () => {} })); });
    await calmer();
  };

  /** 🔴 LE CAS EXACT D'ARNO : « Interne » sur un expéditeur inconnu, aucun rattachement, un seul message. */
  it('🔴🔴 « Interne » sur un expéditeur inconnu → la ligne dit « Interne »', async () => {
    await rendre({ ...A_CLASSER, interne: true });
    expect(capsule()).toBe('Interne');
    expect(container.querySelector('.bte-capsule')?.className).toContain('bte-capsule--interne');
  });

  it('« Hors gestion » → la ligne dit « Hors gestion »', async () => {
    await rendre({ ...A_CLASSER, horsGestion: true, motifHorsGestion: 'prospection' });
    expect(capsule()).toBe('Hors gestion');
  });

  it('un rattachement posé à la main → la ligne dit « Classé »', async () => {
    await rendre({ ...A_CLASSER, classement: { nbActifs: 1, parUnHumain: true, detail: 'lot 26 — à la main' } });
    expect(capsule()).toBe('Classé');
  });

  /**
   * 🔴 ET L'ORDRE DE PRIORITÉ NE BOUGE PAS : Classé > Auto > Interne > Hors gestion > À classer. Arno l'a
   * explicitement exclu du lot (« ne change ni les règles de classement, ni la priorité des statuts ») — on
   * l'éprouve donc plutôt que de se contenter de ne pas y toucher.
   */
  it('🔴 un échange rattaché ET marqué « Interne » reste « Classé »', async () => {
    await rendre({
      ...A_CLASSER, interne: true, horsGestion: true,
      classement: { nbActifs: 1, parUnHumain: true, detail: 'lot 26 — à la main' },
    });
    expect(capsule()).toBe('Classé');
    // La règle PURE dit la même chose, et c'est elle que la ligne consulte.
    expect(motCapsule(capsuleStatut({ nbActifs: 1, parUnHumain: true, interne: true, horsGestion: true })))
      .toBe('Classé');
    expect(motCapsule(capsuleStatut({ nbActifs: 0, parUnHumain: false, interne: true, horsGestion: true })))
      .toBe('Interne');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LE DÉFAUT D'ARNO — LA LIGNE SUIT LE CLASSEMENT VALIDÉ DANS LA CONVERSATION
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 après une validation, la ligne se met à jour au retour dans la liste', () => {
  /**
   * 🔴🔴 L'ÉPREUVE CENTRALE DU LOT. On monte la liste avec la ligne « À classer », on change ce que le serveur
   * rendra (le geste a eu lieu dans la conversation), puis on incrémente `versionStatuts` — ce que
   * `PleinEcranBoite` fait sur `onClassementChange`. La ligne doit alors dire « Interne ».
   */
  it('🔴🔴 un battement de `versionStatuts` fait relire la page : « À classer » devient « Interne »', async () => {
    await act(async () => {
      root.render(createElement(BoiteMail, { onOuvrir: () => {}, versionStatuts: 0 }));
    });
    await calmer();
    expect(capsule()).toBe('À classer');

    // Le geste a été validé dans la conversation : la base dit désormais « interne ».
    ligneServie = { ...A_CLASSER, interne: true };
    totalServi = 9413;
    await act(async () => {
      root.render(createElement(BoiteMail, { onOuvrir: () => {}, versionStatuts: 1 }));
    });
    await calmer();
    expect(capsule()).toBe('Interne');
  });

  /**
   * 🔴🔴 « LE COMPTEUR “À CLASSER” BAISSE » (Arno). La liste est la seule à savoir ce qu'elle montre : elle
   * rapporte son total au parent, qui l'écrit dans la colonne. Le battement doit donc rapporter le NOUVEAU total.
   */
  it('🔴🔴 le total de l’étiquette est rapporté à nouveau après le battement', async () => {
    const totaux: (number | null)[] = [];
    const onTotalEtiquette = (_s: string, t: number | null) => { totaux.push(t); };
    await act(async () => {
      root.render(createElement(BoiteMail, {
        onOuvrir: () => {}, versionStatuts: 0, onTotalEtiquette,
        etiquette: { sorte: 'a_classer_statut', evenementId: null },
      }));
    });
    await calmer();
    expect(totaux).toContain(9414);

    ligneServie = { ...A_CLASSER, interne: true };
    totalServi = 9413;
    await act(async () => {
      root.render(createElement(BoiteMail, {
        onOuvrir: () => {}, versionStatuts: 1, onTotalEtiquette,
        etiquette: { sorte: 'a_classer_statut', evenementId: null },
      }));
    });
    await calmer();
    expect(totaux).toContain(9413);
  });

  /**
   * ══ 🔴🔴 « VAUT POUR TOUS LES DOSSIERS […] ET LA RECHERCHE » (Arno) ═══════════════════════════════════════════
   *
   * 🔴 ET SURTOUT : LE BATTEMENT NE DÉTRUIT PAS LA RECHERCHE. C'est ce qui le distingue de `premiere()` (la voie
   * du geste « Rattacher » fait DEPUIS la liste) : celle-là repart de la première page. Ici on vient de la
   * conversation, la liste attend derrière avec son travail en cours — on relit sa page, on ne la remplace pas.
   */
  it('🔴🔴 sous une recherche, le battement relit la RECHERCHE et la conserve', async () => {
    await act(async () => {
      root.render(createElement(BoiteMail, { onOuvrir: () => {}, versionStatuts: 0 }));
    });
    await calmer();
    const champ = container.querySelector('input[type="search"]') as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, 'augustin');
    await act(async () => { champ.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => {
      champ.closest('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await calmer();
    expect(urls.some((u) => u.includes('/boite/recherche'))).toBe(true);

    ligneServie = { ...A_CLASSER, interne: true };
    urls = [];
    await act(async () => {
      root.render(createElement(BoiteMail, { onOuvrir: () => {}, versionStatuts: 1 }));
    });
    await calmer();
    // La lecture déclenchée par le battement est celle de la RECHERCHE, avec le mot tapé.
    const relecture = urls.filter((u) => u.includes('/boite'));
    expect(relecture.length).toBeGreaterThan(0);
    expect(relecture.every((u) => u.includes('/boite/recherche'))).toBe(true);
    expect(relecture.some((u) => u.includes('q=augustin'))).toBe(true);
    // Et le champ n'a pas été vidé : la liste n'a pas été remontée.
    expect((container.querySelector('input[type="search"]') as HTMLInputElement).value).toBe('augustin');
    expect(capsule()).toBe('Interne');
  });

  /** ⚠️ `versionStatuts` À 0 (son défaut) NE DÉCLENCHE RIEN : la liste est celle d'avant ce lot. */
  it('⚠️ sans battement, aucune lecture de plus', async () => {
    await act(async () => { root.render(createElement(BoiteMail, { onOuvrir: () => {} })); });
    await calmer();
    const avant = urls.filter((u) => u.includes('/boite')).length;
    await act(async () => { root.render(createElement(BoiteMail, { onOuvrir: () => {} })); });
    await calmer();
    expect(urls.filter((u) => u.includes('/boite')).length).toBe(avant);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ UNE SEULE SOURCE DE VÉRITÉ — LE CÂBLAGE, ET LA LISTE DES SORTES DE BIEN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 une seule source de vérité', () => {
  const code = (f: string) => readFileSync(f, 'utf8');
  const BOITE = 'app/(admin)/admin/(protected)/gestion/BoiteMail.tsx';
  const PLEIN = 'app/(admin)/admin/(protected)/gestion/PleinEcranBoite.tsx';
  const CONV = 'app/(admin)/admin/(protected)/gestion/Conversation.tsx';
  const VUE = 'app/(admin)/admin/(protected)/gestion/GestionVue.tsx';

  /**
   * 🔴🔴 LES QUATRE GESTES QU'ARNO NOMME PASSENT PAR LE MÊME RAPPEL. « Rattacher » et l'« étape 2 contact
   * externe » aboutissent tous deux à `onRattachement` (c'est le `onChange` d'`EncartRattachement`), d'où deux
   * points d'appel et non quatre.
   */
  it('🔴🔴 la conversation signale les trois validations de classement', () => {
    const c = code(CONV);
    expect(c).toContain('onClassementChange?: () => void');
    // Trois appels : « Interne », « Hors gestion », et le rappel commun des rattachements (étape 2 comprise).
    expect((c.match(/onClassementChange\?\.\(\)/g) ?? []).length).toBe(3);
  });

  /** 🔴 L'ÉCRAN FAIT LES DEUX : la liste relit sa page, et le parent redemande les compteurs de la colonne. */
  it('🔴 le plein écran relaie vers la liste ET vers les compteurs', () => {
    const p = code(PLEIN);
    expect(p).toContain('setVersionStatuts((v) => v + 1)');
    expect(p).toContain('onClassementChange?.()');
    expect(p).toContain('versionStatuts={versionStatuts}');
    expect(code(VUE)).toContain('onClassementChange={() => setVersionComptes((v) => v + 1)}');
  });

  /**
   * 🔴🔴 LA LISTE NE RECALCULE PAS LE STATUT, ELLE LE REDEMANDE. Poser « c'est Interne maintenant » à la main dans
   * l'état d'écran aurait fait une SECONDE écriture de la règle de priorité — exactement le défaut ② ci-dessus.
   * Le battement passe donc par `chargerPage`, la lecture ordinaire.
   */
  it('🔴🔴 le battement relit la page, il ne fabrique aucun statut', () => {
    const b = code(BOITE);
    const corps = b.slice(b.indexOf('relireSurPlace.current = () =>'));
    expect(corps).toContain('chargerPage(depart');
    expect(corps).not.toContain('interne: true');
    expect(corps).not.toContain('capsuleStatut(');
  });

  /**
   * ══ 🔴🔴 « QU'EST-CE QU'UN BIEN ? » N'EST PLUS ÉCRITE QU'UNE FOIS ═════════════════════════════════════════════
   *
   * 🔴 C'EST LE DÉFAUT ② , ET IL ÉTAIT MESURABLE : 15 494 échanges contredits entre leur mail et leur ligne, et
   * 267 de trop dans le compteur. Un fichier de SQL qui recopie la liste à la main est la façon dont cela revient.
   */
  it('🔴🔴 aucun fichier ne recopie la liste des sortes de bien', () => {
    for (const f of [
      'app/lib/gestion/boiteRepo.ts',
      'app/lib/gestion/receptionRepo.ts',
      'app/lib/gestion/historiqueRepo.ts',
      'app/lib/gestion/classementBien.ts',
    ]) {
      const sql = code(f);
      // Aucune liste de sortes écrite dans une clause `IN` : elles viennent toutes de `sqlSortesBien()`.
      expect(sql).not.toMatch(/cible_sorte IN \('lot'/);
      expect(sql).toContain('sqlSortesBien()');
    }
  });

  /** ⚠️ ET LE FRAGMENT RENDU EST BIEN CELUI DE LA RÈGLE, pas une chaîne écrite une sixième fois. */
  it('⚠️ `sqlSortesBien()` cite exactement `SORTES_BIEN`', () => {
    expect(sqlSortesBien()).toBe(SORTES_BIEN.map((s) => `'${s}'`).join(', '));
    expect(sqlSortesBien()).toBe("'lot', 'proprietaire', 'locataire'");
  });
});
