// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BlocCartes, CarteContact, type GestesCarteContact, type GestesCartes } from './CartesPersonnes';
import {
  CONTACTS_MONTRES, LIBELLE_CARTE_AUTO, LIBELLE_CONTACT_LOCATAIRE, LIBELLE_CONTACT_PROPRIETAIRE,
  motAutresContacts,
} from '../../../../lib/gestion/partieCategorie';
import type { LigneCarte } from '../../../../lib/gestion/partieCategorieRepo';
import type { PersonneAnnuaire } from '../../../../lib/gestion/annuaireRepo';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-7 — LES CARTES DE CONTACT DANS LES CARROUSELS DU HAUT ═══════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (05/10/2026) : « le “+” sert à enrichir le carrousel de la partie concernée. Les cartes de
 * contact s'affichent donc dans les carrousels du haut de fiche. […] Carrousel PROPRIÉTAIRE : après les cartes
 * clients, viennent les cartes “CONTACT DU PROPRIÉTAIRE” (actives, non retirées). […] La carte “+ Ajouter un
 * propriétaire” ou “+ Ajouter un occupant” reste en dernier. […] Les cartes CLIENTS ne changent pas d'un pixel. »
 *
 * 🔴 CE LOT RÉPARE CE QUE J'AVAIS SIGNALÉ À LA FIN DU LOT 6 : les deux libellés de contact existaient et étaient
 * éprouvés depuis le lot 1, mais AUCUN ÉCRAN NE LES RENDAIT. Une carte créée par le « + » n'était visible que
 * comme capsule dans le bloc du bas — un geste à l'effet invisible.
 *
 * ⚠️ CE QUE CE FICHIER NE PEUT PAS TENIR : les empreintes des cartes CLIENTS avant/après. jsdom ne rend pas la
 * même chaîne qu'un navigateur (ni les mêmes attributs d'hydratation), et la preuve qu'Arno demande vaut sur le
 * VRAI écran. Elle est donc faite dans Chrome, et consignée dans `~/Desktop/historique-bien-7-captures/`.
 * Ce qui est éprouvé ici, c'est la STRUCTURE : l'ordre des cartes, les deux compteurs, le repli à six, les trois
 * gestes, et le fait qu'une carte CLIENT ne reçoive aucune classe ni aucun badge de contact.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SRC = readFileSync('app/(admin)/admin/(protected)/gestion/CartesPersonnes.tsx', 'utf8');

const carte = (o: Partial<LigneCarte> = {}): LigneCarte => ({
  id: 1, lotCle: '432', cote: 'proprietaire', adresse: 'assureur@fictif.test', nom: 'AXA Courbevoie',
  telephone: '01 41 21 43 31', origine: 'manuel', verifieLe: '2026-10-05T09:00:00Z',
  verifiePar: 'a.jorel@sansvisavis.com', creeLe: '2026-10-04T22:00:00Z', creePar: 'a.jorel@sansvisavis.com',
  note: null,
  /* 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — les champs de la « Nouvelle fiche » (migration 306). Le défaut est
     VIDE : c'est l'état des 481 cartes de la base, et c'est donc l'état sur lequel l'écran doit tenir. */
  civilite: null, prenom: null, qualite: null, adressePostale: null, codePostal: null, commune: null,
  coordonnees: [], ...o,
});

const client = (o: Partial<PersonneAnnuaire> = {}): PersonneAnnuaire => ({
  sujet: 'proprietaire', id: 146, cle: '146', civilite: 'M.', prenom: 'Nathan', nom: 'ROI',
  nomAffiche: 'M. ROI Nathan', qualite: null, note: null, rang: 1, archive: false, archiveLe: null,
  archivePar: null, adresse: null, commune: null, codePostal: null, contacts: [], absent: false,
  creeLe: null, importeLe: null, ...o,
} as PersonneAnnuaire);

let hote: HTMLDivElement;
let racine: Root;
let gestes: string[] = [];

const gestesCartes: GestesCartes = {
  modifiable: true,
  onEnregistrer: async () => null, onArchiver: async () => null, onRestaurer: async () => null,
  onSeparer: async () => null, onRemplacer: () => {}, onOrdonner: () => {}, onSupprimer: async () => null,
} as unknown as GestesCartes;

const gestesContact: GestesCarteContact = {
  modifiable: true,
  onVerifier: async (id) => { gestes.push(`verifier:${id}`); return null; },
  /* 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — le crayon rend la FICHE COMPLÈTE (`ChampsSaisis`), et plus trois
     champs : les coordonnées sont une LISTE, et le téléphone n'est plus un champ à part. */
  onModifier: async (id, c) => {
    const coords = (c.coordonnees ?? []).map((x) => `${x.sorte}=${x.valeur}`).join(',');
    gestes.push(`modifier:${id}:${c.nom}|${coords}|${c.note}`);
    return null;
  },
  onRetirer: async (id) => { gestes.push(`retirer:${id}`); return null; },
  onRanger: async (a, c) => { gestes.push(`ranger:${a}:${c}`); return null; },
};

beforeEach(() => {
  gestes = [];
  hote = document.createElement('div');
  document.body.appendChild(hote);
  racine = createRoot(hote);
});
afterEach(() => { act(() => racine.unmount()); hote.remove(); });

async function monter(contacts: readonly LigneCarte[], personnes: readonly PersonneAnnuaire[] = [client()]) {
  await act(async () => {
    racine.render(createElement(BlocCartes, {
      titre: 'Propriétaire', id: 'ann-prop', personnes, gestes: gestesCartes, role: 'Propriétaire',
      motAjouter: 'Ajouter un propriétaire',
      creation: { rappel: 'Sera ajouté…', onCreer: async () => null },
      contacts, gestesContact,
    }));
  });
}

const cliquer = async (el: Element | null | undefined): Promise<void> => {
  await act(async () => { (el as HTMLElement | null)?.click(); });
  await act(async () => { await Promise.resolve(); });
};

describe('l’ordre du carrousel : clients, contacts, puis « + Ajouter »', () => {
  it('🔴🔴 L’ORDRE EXACT QU’ARNO DEMANDE', async () => {
    await monter([carte({ id: 1, nom: 'AXA' }), carte({ id: 2, nom: 'Syndic' })]);
    const cartes = [...hote.querySelectorAll('.cp-carte')] as HTMLElement[];
    expect(cartes).toHaveLength(4);
    /* ① le client, et il ne porte aucune marque de contact */
    expect(cartes[0].className).not.toContain('cp-carte--contact');
    expect(cartes[0].textContent).toContain('M. ROI Nathan');
    /* ② et ③ les deux contacts, dans l'ordre reçu — aucun tri refait ici.
       🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — LE NOM EST EN CAPITALES, et c'est le VERDICT QUI A CHANGÉ : la carte
       compose désormais son nom comme celle d'un client (`nomAfficheFormate`, qui met le nom de famille en
       capitales). « Syndic » s'affiche donc « SYNDIC ». C'est exactement la demande d'Arno — « les mêmes
       rubriques qu'une carte client » — et l'attendre en minuscules reviendrait à exiger ici l'inverse de ce que
       le gabarit fait partout ailleurs. */
    expect(cartes[1].className).toContain('cp-carte--contact');
    expect(cartes[1].textContent).toContain('AXA');
    expect(cartes[2].textContent).toContain('SYNDIC');
    /* ④ la tuile d'ajout, EN DERNIER */
    expect(cartes[3].className).toContain('cp-carte--ajout');
    expect(cartes[3].textContent).toContain('Ajouter un propriétaire');
  });

  it('🔴🔴 LES CARTES CLIENTS NE REÇOIVENT NI CLASSE NI BADGE DE CONTACT', async () => {
    await monter([carte()]);
    const clientCarte = hote.querySelector('.cp-carte:not(.cp-carte--contact):not(.cp-carte--ajout)') as HTMLElement;
    expect(clientCarte.className).not.toContain('contact');
    expect(clientCarte.className).not.toContain('a-verifier');
    expect(clientCarte.querySelector('.cp-role')?.textContent).toBe('Propriétaire');
    expect(clientCarte.textContent).not.toContain('CONTACT DU');
  });

  it('⚠️ SANS CONTACT, LE CARROUSEL EST CELUI D’AVANT CE LOT : client puis tuile d’ajout', async () => {
    await monter([]);
    const cartes = [...hote.querySelectorAll('.cp-carte')] as HTMLElement[];
    expect(cartes).toHaveLength(2);
    expect(cartes[1].className).toContain('cp-carte--ajout');
    expect(hote.querySelector('.cp-compte-contacts')).toBeNull();
  });
});

describe('les deux compteurs ne se mêlent pas', () => {
  it('🔴🔴 LE TITRE NE COMPTE QUE LES CLIENTS ; les contacts ont leur propre « + N contacts »', async () => {
    await monter([carte({ id: 1 }), carte({ id: 2 })]);
    /* ⚠️ UN CARROUSEL QUI ANNONCERAIT « PROPRIÉTAIRE 3 » DIRAIT QUE CE BIEN A TROIS PROPRIÉTAIRES. */
    expect(hote.querySelector('.ann-bloc-titre .gst-compte')?.textContent).toBe('1');
    expect(hote.querySelector('.cp-compte-contacts')?.textContent).toBe('+ 2 contacts');
  });

  it('⚠️ LE SINGULIER EST GÉRÉ', async () => {
    await monter([carte()]);
    expect(hote.querySelector('.cp-compte-contacts')?.textContent).toBe('+ 1 contact');
  });
});

describe('six cartes, puis « Voir les N autres contacts »', () => {
  const beaucoup = Array.from({ length: 55 }, (_, i) => carte({ id: i + 1, nom: `Contact ${i + 1}` }));

  it('🔴🔴 LE CAS DU BIEN 155 : 6 montrées, et une carte qui DIT les 49 autres', async () => {
    await monter(beaucoup);
    expect(hote.querySelectorAll('.cp-carte--contact')).toHaveLength(CONTACTS_MONTRES);
    const plus = hote.querySelector('.cp-carte--plus-contacts') as HTMLElement;
    expect(plus).not.toBeNull();
    expect(plus.textContent).toContain(motAutresContacts(55) as string);
    expect(plus.getAttribute('aria-expanded')).toBe('false');
  });

  it('🔴🔴 ELLE DÉPLIE, ET ELLE REPLIE', async () => {
    await monter(beaucoup);
    await cliquer(hote.querySelector('.cp-carte--plus-contacts'));
    expect(hote.querySelectorAll('.cp-carte--contact')).toHaveLength(55);
    expect(hote.querySelector('.cp-carte--plus-contacts')?.textContent).toContain('Masquer');
    await cliquer(hote.querySelector('.cp-carte--plus-contacts'));
    expect(hote.querySelectorAll('.cp-carte--contact')).toHaveLength(CONTACTS_MONTRES);
  });

  it('⚠️ SIX OU MOINS : aucune carte de dépliage', async () => {
    await monter(beaucoup.slice(0, 6));
    expect(hote.querySelector('.cp-carte--plus-contacts')).toBeNull();
  });

  it('⚠️ LA TUILE D’AJOUT RESTE LA DERNIÈRE, même replié', async () => {
    await monter(beaucoup);
    const cartes = [...hote.querySelectorAll('.cp-carte')] as HTMLElement[];
    expect(cartes[cartes.length - 1].className).toContain('cp-carte--ajout');
  });
});

describe('le gabarit d’une carte de contact', () => {
  async function monterSeule(c: LigneCarte): Promise<void> {
    await act(async () => { racine.render(createElement(CarteContact, { c, gestes: gestesContact })); });
  }

  it('🔴🔴 LE BADGE DIT « CONTACT DU … », JAMAIS « PROPRIÉTAIRE » SEUL', async () => {
    await monterSeule(carte({ cote: 'proprietaire' }));
    expect(hote.querySelector('.cp-role')?.textContent).toBe(LIBELLE_CONTACT_PROPRIETAIRE);
    await monterSeule(carte({ cote: 'locataire' }));
    expect(hote.querySelector('.cp-role')?.textContent).toBe(LIBELLE_CONTACT_LOCATAIRE);
  });

  it('🔴 E-MAIL, TÉLÉPHONE AVEC « Copier », ET NOTE — le gabarit des cartes clients', async () => {
    await monterSeule(carte({ telephone: '01 41 21 43 31', note: 'rappeler le matin' }));
    const t = hote.textContent ?? '';
    expect(t).toContain('assureur@fictif.test');
    expect(t).toContain('01 41 21 43 31');
    expect(t).toContain('rappeler le matin');
    expect(hote.querySelector('.cp-copier')).not.toBeNull();
  });

  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — LE VERDICT A CHANGÉ, ET VOICI POURQUOI ═════════════════════════════
   *
   * Ce cas attendait « sans téléphone, AUCUN “Copier” ». C'était vrai au lot 7, où la carte n'avait qu'une ligne
   * « Téléphone » copiable et une ligne « E-mail » qui ne l'était pas. Arno demande maintenant « les mêmes
   * rubriques qu'une carte client (QUALITÉ, ADRESSE, **MOBILE/E-MAIL avec “Copier”**, NOTE) » : l'adresse e-mail
   * est devenue une COORDONNÉE, et une coordonnée se copie — chez un client comme ici.
   *
   * Le cas garde donc son intention (« aucun bouton ne copie du vide ») en la vérifiant sur ce qui est VIDE : une
   * carte sans téléphone n'affiche aucune rubrique « Mobile », et son unique « Copier » est celui de l'adresse.
   */
  it('⚠️ AUCUN « Copier » SUR DU VIDE : sans téléphone, il ne reste que celui de l’adresse', async () => {
    await monterSeule(carte({ telephone: null }));
    const boutons = [...hote.querySelectorAll('.cp-copier')] as HTMLElement[];
    expect(boutons).toHaveLength(1);
    expect(boutons[0].getAttribute('aria-label')).toBe('Copier cette adresse');
    /* La rubrique « Mobile » n'existe pas : il n'y a pas de numéro, donc pas de ligne. */
    expect(hote.textContent).not.toContain('Mobile');
    /* Et les rubriques restées vides le DISENT — « non renseignée », jamais un blanc. */
    expect(hote.textContent).toContain('non renseignée');
  });

  /**
   * 🔴🔴 LA TRAME ORANGE ET LE BOUTON « VÉRIFIÉ », tant que personne n'a regardé. Le mot vient du module PUR :
   * l'écran, le script de reprise et les épreuves disent la MÊME chose.
   */
  it('🔴🔴 UNE CARTE NON VÉRIFIÉE PORTE LA TRAME ORANGE ET LE BOUTON « Vérifié »', async () => {
    await monterSeule(carte({ verifieLe: null, verifiePar: null, origine: 'auto' }));
    expect((hote.querySelector('.cp-carte') as HTMLElement).className).toContain('cp-carte--a-verifier');
    expect(hote.textContent).toContain(LIBELLE_CARTE_AUTO);
    const b = [...hote.querySelectorAll('button')].find((x) => x.textContent === 'Vérifié');
    expect(b).toBeDefined();
    await cliquer(b);
    expect(gestes).toEqual(['verifier:1']);
  });

  it('🔴 UNE CARTE VÉRIFIÉE DIT PAR QUI, et n’a plus de trame ni de bouton', async () => {
    await monterSeule(carte({ verifieLe: '2026-10-05T09:00:00Z', verifiePar: 'a.jorel@sansvisavis.com' }));
    expect((hote.querySelector('.cp-carte') as HTMLElement).className).not.toContain('a-verifier');
    expect(hote.textContent).toContain('Vérifiée par a.jorel@sansvisavis.com');
    expect([...hote.querySelectorAll('button')].some((x) => x.textContent === 'Vérifié')).toBe(false);
  });

  /**
   * 🔴🔴 LE DÉFAUT QUE L'ESSAI À L'ÉCRAN A TROUVÉ, ET QUE CE CAS FERME. Les carrousels affichaient « Vérifiée par
   * undefined » : la réponse de la route ne portait ni `verifieLe` ni `verifiePar`, et `undefined === null` est
   * FAUX — la carte se croyait donc vérifiée, sans trame ni bouton. Deux gardes : la route les envoie, et la
   * carte ne les invente pas.
   */
  it('🔴🔴 UNE RÉPONSE SANS `verifieLe` LAISSE LA CARTE « À VÉRIFIER », et n’écrit jamais « par undefined »', async () => {
    const sansChamps = { ...carte(), verifieLe: undefined, verifiePar: undefined } as unknown as LigneCarte;
    await monterSeule(sansChamps);
    expect((hote.querySelector('.cp-carte') as HTMLElement).className).toContain('cp-carte--a-verifier');
    expect(hote.textContent).not.toContain('undefined');
  });

  it('🔴 LE MENU « ⋯ » PORTE LES TROIS GESTES D’ARNO, et aucun ne supprime', async () => {
    await monterSeule(carte({ cote: 'proprietaire' }));
    await cliquer(hote.querySelector('[aria-label="Autres gestes"]'));
    const mots = [...hote.querySelectorAll('.cp-menu-ligne')].map((e) => e.textContent ?? '');
    expect(mots).toHaveLength(3);
    expect(mots[0]).toContain('Changer de côté');
    expect(mots[1]).toContain('Passer en tiers indépendant');
    expect(mots[2]).toContain('Retirer');
    expect(mots.join(' ')).not.toContain('Supprimer');
  });

  it('🔴🔴 « CHANGER DE CÔTÉ » PASSE PAR LA PORTE DU RANGEMENT — pas par un geste à lui', async () => {
    await monterSeule(carte({ cote: 'proprietaire' }));
    await cliquer(hote.querySelector('[aria-label="Autres gestes"]'));
    await cliquer([...hote.querySelectorAll('.cp-menu-ligne')][0]);
    expect(gestes).toEqual(['ranger:assureur@fictif.test:locataire']);
  });

  it('🔴 « PASSER EN TIERS INDÉPENDANT » AUSSI', async () => {
    await monterSeule(carte());
    await cliquer(hote.querySelector('[aria-label="Autres gestes"]'));
    await cliquer([...hote.querySelectorAll('.cp-menu-ligne')][1]);
    expect(gestes).toEqual(['ranger:assureur@fictif.test:independant']);
  });

  it('🔴 « RETIRER » PASSE PAR SON GESTE, qui pose un statut — jamais un DELETE', async () => {
    await monterSeule(carte({ id: 1467 }));
    await cliquer(hote.querySelector('[aria-label="Autres gestes"]'));
    await cliquer([...hote.querySelectorAll('.cp-menu-ligne')][2]);
    expect(gestes).toEqual(['retirer:1467']);
  });

  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — LE CRAYON OUVRE LE FORMULAIRE DES CLIENTS, LE MÊME ═════════════════
   *
   * DEMANDE D'ARNO : « Le même formulaire complet sert à “Modifier ce contact” (le crayon de la carte). »
   *
   * Ce cas vérifiait les quatre champs du petit formulaire du lot 7 (adresse en lecture seule, nom, téléphone,
   * note). Ce formulaire-là n'existe plus : c'est `FormulaireCarte` qui s'ouvre, avec ses huit champs et sa liste
   * de coordonnées. Le cas vérifie donc ce qui compte VRAIMENT et qui n'a pas changé de sens :
   *   · le titre est bien celui du module pur (« Modifier ce contact ») ;
   *   · la fiche arrive PRÉ-REMPLIE de ce que la carte porte — y compris son adresse e-mail, amorcée comme
   *     coordonnée (`ficheDeContact`) ;
   *   · « Enregistrer » rend la fiche COMPLÈTE, coordonnées comprises, dans l'ordre affiché.
   */
  it('🔴🔴 LE CRAYON OUVRE LE FORMULAIRE COMPLET, PRÉ-REMPLI, et rend la fiche entière', async () => {
    await monterSeule(carte({ nom: 'AXA', telephone: '01 41 21 43 31', note: 'ancienne' }));
    await cliquer(hote.querySelector('[aria-label="Modifier"]'));

    expect(hote.querySelector('.cp-form-titre')?.textContent).toBe('Modifier ce contact');
    /* 🔴 LES DEUX COORDONNÉES SONT LÀ, DANS L'ORDRE : le numéro de la carte, puis son adresse e-mail. */
    const valeurs = [...hote.querySelectorAll('[aria-label="Valeur"]')] as HTMLInputElement[];
    expect(valeurs.map((v) => v.value)).toEqual(['01 41 21 43 31', 'assureur@fictif.test']);
    /* Et les huit champs de la fiche sont bien ceux du formulaire des clients. */
    const t = hote.textContent ?? '';
    for (const mot of ['Civilité', 'Nom', 'Prénom', 'Qualité', 'Adresse', 'Code postal', 'Commune',
      'Téléphones et e-mails', 'Note libre']) {
      expect(t, mot).toContain(mot);
    }

    /* ⚠️ UN CHAMP CONTRÔLÉ PAR REACT NE SE CHANGE PAS EN POSANT `value` : React garde sa propre valeur et la
       réécrit. On passe donc par le setter NATIF du prototype, puis on émet l'événement — c'est la seule façon
       de simuler une frappe sur un champ contrôlé, et c'est ce que fait `changer` ailleurs dans ce dépôt. */
    const poser = (el: HTMLInputElement, v: string): void => {
      const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      d?.set?.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const nom = [...hote.querySelectorAll('.cp-champ')]
      .find((l) => l.textContent?.startsWith('Nom'))?.querySelector('input') as HTMLInputElement;
    await act(async () => { poser(nom, 'AXA Courbevoie'); });
    await cliquer([...hote.querySelectorAll('button')].find((b) => b.textContent === 'Enregistrer'));
    /* 🔴 LE NOM EST MIS EN FORME SOUS LES DOIGTS, comme chez un client : « AXA COURBEVOIE ». */
    expect(gestes).toEqual([
      'modifier:1:AXA COURBEVOIE|telephone=01 41 21 43 31,email=assureur@fictif.test|ancienne',
    ]);
  });

  /**
   * 🔴🔴 LA RÈGLE D'ARNO, À L'ENDROIT OÙ ELLE BLOQUE : « Pour un CONTACT, seuls le NOM et AU MOINS UN E-MAIL
   * sont obligatoires ; les autres champs sont facultatifs, SANS MESSAGE ROUGE. »
   */
  it('🔴🔴 UN CONTACT N’EXIGE QUE LE NOM ET UN E-MAIL — pas les six champs d’un client', async () => {
    await monterSeule(carte({ nom: 'AXA', telephone: null }));
    await cliquer(hote.querySelector('[aria-label="Modifier"]'));
    /* Aucun manque : ni civilité, ni prénom, ni adresse, ni code postal, ni commune, ni téléphone. */
    expect(hote.querySelectorAll('.cp-manque')).toHaveLength(0);
    const enregistrer = [...hote.querySelectorAll('button')]
      .find((b) => b.textContent === 'Enregistrer') as HTMLButtonElement;
    expect(enregistrer.disabled).toBe(false);

    /* Mais retirer la dernière adresse e-mail bloque, et le dit sous le bloc des coordonnées. */
    await cliquer(hote.querySelector('[aria-label="Retirer"]'));
    expect(hote.textContent).toContain('Il faut au moins une adresse e-mail');
    expect(([...hote.querySelectorAll('button')]
      .find((b) => b.textContent === 'Enregistrer') as HTMLButtonElement).disabled).toBe(true);
  });

  it('⚠️ SANS LA MIGRATION, LES TROIS GESTES SONT DÉSACTIVÉS — avec leur motif, jamais absents', async () => {
    await act(async () => {
      racine.render(createElement(CarteContact, {
        c: carte({ verifieLe: null }), gestes: { ...gestesContact, modifiable: false },
      }));
    });
    for (const b of [...hote.querySelectorAll('button')] as HTMLButtonElement[]) {
      if (b.className.includes('cp-copier')) continue;
      expect(b.disabled, b.textContent ?? '').toBe(true);
    }
  });
});

describe('🔒 les gardes de structure', () => {
  /**
   * 🔴🔴 « Les cartes CLIENTS ne changent pas d'un pixel » (Arno). La preuve par les EMPREINTES est faite dans
   * Chrome ; ce garde-ci tient la seule chose qu'un test puisse tenir sans navigateur : aucune règle de style
   * neuve ne s'applique à une carte qui ne porte pas une classe de CONTACT.
   */
  it('🔒🔒 AUCUNE RÈGLE NEUVE NE TOUCHE UNE CARTE CLIENT', () => {
    const css = SRC.split('export const CSS_CARTES')[1] ?? '';
    /* 🔴 LE BLOC NEUF EST BORNÉ PAR SON PROPRE ENCADRÉ ET PAR LA RÈGLE QUI LE SUIVAIT DÉJÀ (`.cp-tete`) : sans
       cette borne, le garde lisait tout le reste de la feuille et se dénonçait sur des règles d'avant ce lot. */
    const apres = css.split('LOT HISTORIQUE-BIEN-7')[1] ?? '';
    const bloc = apres.split('.cp-tete{')[0] ?? '';
    expect(bloc).not.toBe('');
    let neuves = 0;
    for (const ligne of bloc.split('\n')) {
      const t = ligne.trim();
      if (!t.startsWith('.')) continue;
      neuves += 1;
      /* Chaque sélecteur neuf porte une classe que SEULE une carte de contact a. */
      const propre = /--contact|--a-verifier|--plus-contacts|cp-compte-contacts|cp-a-verifier|cp-menu/.test(t);
      expect(propre, t).toBe(true);
    }
    /* ⚠️ ET LE GARDE A BIEN VU QUELQUE CHOSE : un bloc vide passerait sans rien protéger. */
    expect(neuves).toBeGreaterThan(5);
  });

  it('🔒 LE COMPTEUR DU TITRE LIT TOUJOURS `vivantes.length` — les contacts ne l’approchent pas', () => {
    expect(SRC).toContain('{titre} <span className="gst-compte">{vivantes.length}</span>');
  });

  it('🔒 LES MOTS ET LA BORNE VIENNENT DU MODULE PUR, jamais recopiés ici', () => {
    for (const nom of ['CONTACTS_MONTRES', 'motAutresContacts', 'motContactsDuCarrousel', 'libelleDuCote',
      'LIBELLE_CARTE_AUTO', 'roleDeContactPermis']) {
      expect(SRC).toContain(nom);
    }
    /* ⚠️ ET AUCUN LIBELLÉ RECOPIÉ : le mot n'existe qu'une fois, dans `partieCategorie.ts`. */
    expect(SRC).not.toContain("'CONTACT DU PROPRIÉTAIRE'");
    expect(SRC).not.toContain("'CONTACT DU LOCATAIRE'");
  });
});

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — LE GABARIT D'UNE CARTE DE CONTACT EST CELUI D'UN CLIENT ═════════════════
 *
 * DEMANDE D'ARNO : « La carte de contact du carrousel montre les mêmes rubriques qu'une carte client (QUALITÉ,
 * ADRESSE, MOBILE/E-MAIL avec “Copier”, NOTE), avec le badge CONTACT DU PROPRIÉTAIRE / CONTACT DU LOCATAIRE. Le
 * même formulaire complet sert à “Modifier ce contact” (le crayon de la carte). »
 */
describe('🔴🔴 les rubriques d’une carte de contact, et son formulaire', () => {
  /** La carte seule, hors du carrousel : c'est son GABARIT qu'on regarde ici. */
  async function monterSeule(c: LigneCarte): Promise<void> {
    await act(async () => { racine.render(createElement(CarteContact, { c, gestes: gestesContact })); });
  }

  it('🔴🔴 LES QUATRE RUBRIQUES D’UNE CARTE CLIENT, DANS LE MÊME ORDRE', async () => {
    await monterSeule(carte({
      nom: 'ROSKY', prenom: 'Fanny', civilite: 'Mme', qualite: 'syndic',
      adressePostale: '2 rue Mars et Roty', codePostal: '92800', commune: 'puteaux',
      note: 'ne pas appeler avant 10 h',
      coordonnees: [
        { sorte: 'telephone', libelle: 'Mobile', valeur: '06 11 22 33 44' },
        { sorte: 'email', libelle: 'E-mail', valeur: 'f.rosky@fictif.test' },
      ],
    }));
    const titres = [...hote.querySelectorAll('.cp-lab')].map((l) => l.textContent).filter((t) => t !== '');
    expect(titres).toEqual(['Qualité', 'Adresse', 'Mobile', 'E-mail', 'Note']);
    /* 🔴 LE NOM SE COMPOSE COMME CELUI D'UN CLIENT : « Mme ROSKY Fanny ». */
    expect(hote.querySelector('.cp-nom')?.textContent).toBe('Mme ROSKY Fanny');
    /* 🔴 L'ADRESSE POSTALE EST MISE EN FORME À L'AFFICHAGE, comme chez un client : la commune en capitales. */
    expect(hote.textContent).toContain('2 rue Mars et Roty, 92800 PUTEAUX');
    /* 🔴 CHAQUE COORDONNÉE A SON « Copier » — c'est la demande, mot pour mot. */
    expect(hote.querySelectorAll('.cp-copier')).toHaveLength(2);
  });

  /**
   * 🔴🔴 LES 481 CARTES D'AVANT LA 306 N'ONT PAS DE LISTE, et elles doivent rester lisibles : leur téléphone (de
   * la 304) et leur adresse e-mail AMORCENT la liste. Sans cet amorçage, la carte d'un contact proposé
   * n'afficherait plus rien — et le crayon se serait ouvert sur une liste vide, donc en rouge.
   */
  it('🔴🔴 UNE CARTE D’AVANT LA 306 S’AFFICHE QUAND MÊME : son numéro et son adresse', async () => {
    await monterSeule(carte({ telephone: '01 41 21 43 31', coordonnees: [] }));
    const titres = [...hote.querySelectorAll('.cp-lab')].map((l) => l.textContent).filter((t) => t !== '');
    expect(titres).toEqual(['Qualité', 'Adresse', 'Mobile', 'E-mail', 'Note']);
    expect(hote.textContent).toContain('01 41 21 43 31');
    expect(hote.textContent).toContain('assureur@fictif.test');
  });

  /** 🔴 « LE MÊME COMPOSANT, PAS UNE COPIE » — le garde de structure, comme pour le « + » du bloc du bas. */
  it('🔴🔴 LE CRAYON MONTE `FormulaireCarte`, et plus aucun formulaire de contact n’est redessiné', () => {
    const bloc = SRC.slice(SRC.indexOf('export function CarteContact'), SRC.indexOf('export function BlocCartes'));
    expect(bloc).toContain('<FormulaireCarte');
    expect(bloc).toContain('TITRE_CONTACT_MODIFIER');
    /* Les quatre champs du petit formulaire du lot 7 ont disparu : ils ne sont plus écrits nulle part ici. */
    for (const mort of ['>Adresse mail<', 'Modifier ce contact</p>', 'setTelephone', 'setNote']) {
      expect(bloc, mort).not.toContain(mort);
    }
  });
});
