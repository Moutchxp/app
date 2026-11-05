import { describe, expect, it } from 'vitest';
import {
  clientRenseigne, collaborateursAPrevenir, cotesARenseigner, lienCompromis, lireLienCompromis, mailCommun, manquesCreateur, MANQUE_PARTAGE,
  objetMailCommun, PHRASE_CLIENTS_A_SAISIR, type ClientLu, type DonneesMailCommun,
} from './compromisCommun';

/** 🔴 Arno (05/11/2026) — le compromis commun : client renseigné, obligations du créateur, collaborateurs prévenus, mail, lien. PUR. */
const V = (o: Partial<ClientLu> = {}): ClientLu => ({ role: 'vendeur', type: 'particulier', nom: 'DUPONT', prenom: 'Jean', telephone: '0600000000', email: null, ...o });
const A = (o: Partial<ClientLu> = {}): ClientLu => V({ role: 'acquereur', nom: 'MARTIN', prenom: 'Léa', ...o });

describe('un client « renseigné »', () => {
  it('particulier : nom ET prénom, et un téléphone OU un e-mail', () => {
    expect(clientRenseigne(V())).toBe(true);
    expect(clientRenseigne(V({ telephone: null, email: 'j@x.fr' }))).toBe(true);
    expect(clientRenseigne(V({ prenom: '' }))).toBe(false);
    expect(clientRenseigne(V({ telephone: ' ', email: null }))).toBe(false);
  });
  it('société : la raison sociale (sans prénom), et un téléphone ou un e-mail', () => {
    expect(clientRenseigne(V({ type: 'societe', nom: 'SCI LES TILLEULS', prenom: null }))).toBe(true);
    expect(clientRenseigne(V({ type: 'societe', nom: '', prenom: null }))).toBe(false);
  });
});

describe('les obligations du créateur (5)', () => {
  it('🔴 sur les DEUX côtés : les clients des deux côtés ; ni collaborateur ni partage demandés', () => {
    const s = { entreeId: 5, sortieId: 5, personnes: [] as ClientLu[], partageDefini: false };
    expect(manquesCreateur(s, 5).map((m) => m.bloc)).toEqual(['vendeurs', 'acquereurs']);
    expect(manquesCreateur({ ...s, personnes: [V(), A()] }, 5)).toEqual([]);
  });
  it('🔴 sur UN côté : SES clients, le collaborateur de l’autre côté, le partage ; les clients de l’autre côté facultatifs', () => {
    const s = { entreeId: 5, sortieId: null, personnes: [] as ClientLu[], partageDefini: false };
    expect(manquesCreateur(s, 5)).toEqual([
      { bloc: 'vendeurs', message: 'Renseignez au moins un vendeur : nom et prénom (ou raison sociale), et un téléphone ou un e-mail.' },
      { bloc: 'repartition', message: 'Choisissez le collaborateur rattaché à la sortie du mandat (côté acquéreur).' },
      { bloc: 'repartition', message: MANQUE_PARTAGE }]);
    expect(manquesCreateur({ entreeId: 5, sortieId: 7, personnes: [V()], partageDefini: true }, 5)).toEqual([]);
    // tenir la sortie : SES acquéreurs, pas les vendeurs
    expect(manquesCreateur({ entreeId: 7, sortieId: 5, personnes: [V()], partageDefini: true }, 5).map((m) => m.bloc)).toEqual(['acquereurs']);
  });
  it('🔴 « Pour un collègue » : le collaborateur de CHAQUE côté et le partage ; les clients facultatifs', () => {
    expect(manquesCreateur({ entreeId: null, sortieId: null, personnes: [], partageDefini: false }, 2).map((m) => m.message)).toEqual([
      'Choisissez le collaborateur rattaché à l’entrée du mandat (côté vendeur).',
      'Choisissez le collaborateur rattaché à la sortie du mandat (côté acquéreur).', MANQUE_PARTAGE]);
    expect(manquesCreateur({ entreeId: 5, sortieId: 7, personnes: [], partageDefini: true }, 2)).toEqual([]);
  });
  it('les collaborateurs prévenus : ceux d’un côté, sauf le créateur, chacun une fois', () => {
    expect(collaborateursAPrevenir({ entreeId: 5, sortieId: 5 }, 5)).toEqual([]);
    expect(collaborateursAPrevenir({ entreeId: 5, sortieId: 7 }, 5)).toEqual([7]);
    expect(collaborateursAPrevenir({ entreeId: 5, sortieId: 7 }, 2)).toEqual([5, 7]);
    expect(collaborateursAPrevenir({ entreeId: 7, sortieId: 7 }, 2)).toEqual([7]);
  });
});

describe('la ligne rouge : MES côtés d’un compromis COMMUN sans client renseigné', () => {
  const v = (personnes: ClientLu[]) => ({ statut: 'compromis', dossier: { entree: { id: 5 }, sortie: { id: 7 }, personnes } });
  it('commun, mon côté (sortie) sans acquéreur valide → à renseigner ; un acquéreur valide → rien', () => {
    expect(cotesARenseigner(v([V()]), 7, true)).toEqual(['sortie']);
    expect(cotesARenseigner(v([V(), A({ email: null, telephone: null })]), 7, true)).toEqual(['sortie']);
    expect(cotesARenseigner(v([V(), A()]), 7, true)).toEqual([]);
  });
  it('🔴 un compromis d’AVANT ce lot (non marqué), une vente actée, un compte qui n’y est pas : jamais rouge', () => {
    expect(cotesARenseigner(v([]), 7, false)).toEqual([]);
    expect(cotesARenseigner({ ...v([]), statut: 'vendue' }, 7, true)).toEqual([]);
    expect(cotesARenseigner(v([]), 9, true)).toEqual([]);
  });
});

describe('le mail à l’autre collaborateur', () => {
  const D: DonneesMailCommun = { destinataire: { prenom: 'Pierre', nom: 'Pierre Thevenin' }, createur: 'Arnaud Jorel', quand: '2026-11-05', structure: 'CRITERIMMO',
    mandat: 'M-42', adresse: '12 rue de l’Essai, 75011 Paris', prixVente: 450000, honorairesTtc: 20000, sesCotes: ['sortie'],
    partage: ['entrée du mandat — Arnaud Jorel (CRITERIMMO) : 50 %', 'sortie du mandat — Pierre Thevenin (MACJ) : 50 %'], clientsSaisis: 0,
    lien: 'https://exemple.test/admin/mon-espace?affaire=99&cote=sortie&modifier=1' };
  it('objet : « Nouveau compromis commun — mandat <n°> — <adresse si connue> »', () => {
    expect(objetMailCommun(D)).toBe('Nouveau compromis commun — mandat M-42 — 12 rue de l’Essai, 75011 Paris');
    expect(objetMailCommun({ ...D, adresse: null })).toBe('Nouveau compromis commun — mandat M-42');
  });
  it('🔴 clients NON saisis : la phrase, et le lien qui ouvre ce compromis sur son côté', () => {
    const m = mailCommun(D);
    expect(m.texte.replace(/[\u202f\u00a0]/g, ' ')).toBe([
      'Bonjour Pierre,', '',
      'Arnaud Jorel a créé le 05/11/2026 un compromis commun avec vous dans « Mon espace ».', '',
      'Structure : CRITERIMMO', 'N° de mandat : M-42', 'Bien : 12 rue de l’Essai, 75011 Paris', 'Prix de vente : 450 000 €',
      'Honoraires : 20 000 € TTC (16 666,67 € HT)', 'Votre côté : sortie du mandat (côté acquéreur)',
      'Partage de la commission : entrée du mandat — Arnaud Jorel (CRITERIMMO) : 50 % ; sortie du mandat — Pierre Thevenin (MACJ) : 50 %', '',
      PHRASE_CLIENTS_A_SAISIR, '', 'Renseigner mes clients : https://exemple.test/admin/mon-espace?affaire=99&cote=sortie&modifier=1'].join('\n'));
    expect(m.html).toContain('href="https://exemple.test/admin/mon-espace?affaire=99&amp;cote=sortie&amp;modifier=1"');
    expect(m.html).toContain('>Renseigner mes clients</a>');
  });
  it('🔴 clients saisis : « N fiche(s) client créée(s) », sans lien', () => {
    const m = mailCommun({ ...D, clientsSaisis: 2 });
    expect(m.texte.endsWith('Les coordonnées de vos clients ont été saisies : 2 fiche(s) client créée(s).')).toBe(true);
    expect(m.texte).not.toContain('Renseigner mes clients');
    expect(m.html).not.toContain('href=');
  });
  it('le lien : écrit puis relu ; un lien incomplet ne s’ouvre pas', () => {
    const l = lienCompromis('https://exemple.test/', 99, 'sortie');
    expect(l).toBe('https://exemple.test/admin/mon-espace?affaire=99&cote=sortie&modifier=1');
    expect(lireLienCompromis(new URL(l).search)).toEqual({ venteId: 99, cote: 'sortie' });
    expect(lireLienCompromis('?affaire=99&cote=sortie')).toBeNull();
    expect(lireLienCompromis('?affaire=x&cote=sortie&modifier=1')).toBeNull();
  });
});
