import { describe, it, expect, vi } from 'vitest';
import {
  brouillonMailSyndic, civiliteDeTexte, corpsMailSyndic, etageLisible, formuleAppelDestinataires, ligneLocataire,
  destinatairesAppel, formulePour, lignesVersHtml, objetMailSyndic, descriptionDuBien, preremplirDemande, nomDuCompte, surlignageObjet,
  suivreSurlignage, type DonneesMailSyndic,
} from './mailSyndic';

/**
 * ══ 🔴🔴 LOT MAIL-SYNDIC-PREREMPLI — LE MAIL AU SYNDIC, DÉJÀ ÉCRIT (PUR) ═════════════════════════════════════════════
 * La formule d'appel (les 8 cas d'Arno et l'e-mail générique), l'objet, le corps ligne par ligne.
 */

const H = (nom: string) => ({ civilite: 'M.' as const, nom });
const F = (nom: string) => ({ civilite: 'Mme' as const, nom });

describe('la formule d’appel, selon la civilité des destinataires en « À »', () => {
  it('① un seul homme : « Bonjour Monsieur NOM, »', () => {
    expect(formuleAppelDestinataires([H('Bercier')])).toBe('Bonjour Monsieur BERCIER,');
  });
  it('② une seule femme : « Bonjour Madame NOM, »', () => {
    expect(formuleAppelDestinataires([F('Durand')])).toBe('Bonjour Madame DURAND,');
  });
  it('③ plusieurs hommes : « Bonjour Messieurs, »', () => {
    expect(formuleAppelDestinataires([H('A'), H('B')])).toBe('Bonjour Messieurs,');
    expect(formuleAppelDestinataires([H('A'), H('B'), H('C')])).toBe('Bonjour Messieurs,');
  });
  it('④ plusieurs femmes : « Bonjour Mesdames, »', () => {
    expect(formuleAppelDestinataires([F('A'), F('B')])).toBe('Bonjour Mesdames,');
  });
  it('⑤ un homme et une femme : « Bonjour Madame, Monsieur, »', () => {
    expect(formuleAppelDestinataires([H('A'), F('B')])).toBe('Bonjour Madame, Monsieur,');
    expect(formuleAppelDestinataires([F('B'), H('A')])).toBe('Bonjour Madame, Monsieur,');
  });
  it('⑥ un homme et plusieurs femmes : « Bonjour Mesdames, Monsieur, »', () => {
    expect(formuleAppelDestinataires([H('A'), F('B'), F('C')])).toBe('Bonjour Mesdames, Monsieur,');
  });
  it('⑦ une femme et plusieurs hommes : « Bonjour Madame, Messieurs, »', () => {
    expect(formuleAppelDestinataires([F('B'), H('A'), H('C')])).toBe('Bonjour Madame, Messieurs,');
  });
  it('⑧ au moins un contact SANS civilité : « Bonjour Madame, Monsieur, »', () => {
    expect(formuleAppelDestinataires([{ civilite: null, nom: 'Bercier' }])).toBe('Bonjour Madame, Monsieur,');
    expect(formuleAppelDestinataires([H('A'), { civilite: null, nom: 'X' }])).toBe('Bonjour Madame, Monsieur,');
    expect(formuleAppelDestinataires([F('A'), F('B'), { civilite: undefined, nom: null }])).toBe('Bonjour Madame, Monsieur,');
  });
  it('l’e-mail GÉNÉRIQUE (adresse non-contact) : « Bonjour Madame, Monsieur, », seul ou avec des contacts', () => {
    expect(formuleAppelDestinataires([null])).toBe('Bonjour Madame, Monsieur,');
    expect(formuleAppelDestinataires([H('A'), null])).toBe('Bonjour Madame, Monsieur,');
  });
  it('plusieurs de chaque : « Bonjour Mesdames, Messieurs, » ; personne : la formule neutre', () => {
    expect(formuleAppelDestinataires([H('A'), H('B'), F('C'), F('D')])).toBe('Bonjour Mesdames, Messieurs,');
    expect(formuleAppelDestinataires([])).toBe('Bonjour Madame, Monsieur,');
  });
  it('le NOM est le nom de famille enregistré, en capitales ; civilité sans nom ⇒ « Monsieur » seul', () => {
    expect(formuleAppelDestinataires([F(' de la Tour ')])).toBe('Bonjour Madame DE LA TOUR,');
    expect(formuleAppelDestinataires([{ civilite: 'M.', nom: '' }])).toBe('Bonjour Monsieur,');
  });
  it('une civilité écrite autrement (« M », « Monsieur », « Mlle ») se lit ; le reste vaut « inconnue »', () => {
    expect(civiliteDeTexte('M')).toBe('M.');
    expect(civiliteDeTexte('M.')).toBe('M.');
    expect(civiliteDeTexte('Monsieur')).toBe('M.');
    expect(civiliteDeTexte('Mme')).toBe('Mme');
    expect(civiliteDeTexte('Mlle')).toBe('Mme');
    expect(civiliteDeTexte('Dr')).toBeNull();
    expect(civiliteDeTexte(null)).toBeNull();
  });
});

describe('🔴 LOT MAIL-PREREMPLI-TEXTE-B-ET-NOM-DANS-OBJET — l’objet porte le nom du compte connecté', () => {
  it('« Prénom NOM » du compte, le nom en capitales ; un seul des deux : celui-là ; aucun : `null`', () => {
    expect(nomDuCompte('Arnaud', 'Jorel')).toBe('Arnaud JOREL');
    expect(nomDuCompte(' Léa ', ' de la Tour ')).toBe('Léa DE LA TOUR');
    expect(nomDuCompte('', 'Jorel')).toBe('JOREL');
    expect(nomDuCompte('Arnaud', null)).toBe('Arnaud');
    expect(nomDuCompte('', '  ')).toBeNull();
    expect(nomDuCompte(null, undefined)).toBeNull();
  });
  it('depuis une fiche bien : « Arnaud JOREL / Cabinet Criterimmo / résidence adresse »', () => {
    expect(objetMailSyndic('25 rue Edith Cavell, 92400 Courbevoie', 'Arnaud JOREL'))
      .toBe('Arnaud JOREL / Cabinet Criterimmo / résidence 25 rue Edith Cavell, 92400 Courbevoie');
  });
  it('hors fiche bien (écran « Syndics ») : « Arnaud JOREL / Cabinet Criterimmo »', () => {
    expect(objetMailSyndic(null, 'Arnaud JOREL')).toBe('Arnaud JOREL / Cabinet Criterimmo');
  });
  it('compte sans nom : l’objet commence par « Cabinet Criterimmo », sans préfixe ; plus jamais « XXXXXXXX »', () => {
    expect(objetMailSyndic('25 rue Edith Cavell, 92400 Courbevoie', null)).toBe('Cabinet Criterimmo / résidence 25 rue Edith Cavell, 92400 Courbevoie');
    expect(objetMailSyndic(null)).toBe('Cabinet Criterimmo');
    expect(objetMailSyndic('R', 'Arnaud JOREL')).not.toContain('XXXXXXXX');
  });
  it('la plage SURLIGNÉE est le nom, en tête ; sans nom : aucune', () => {
    expect(surlignageObjet('Arnaud JOREL / Cabinet Criterimmo', 'Arnaud JOREL')).toEqual([0, 12]);
    expect(surlignageObjet('Cabinet Criterimmo', null)).toBeNull();
    expect(surlignageObjet('Autre / Cabinet', 'Arnaud JOREL')).toBeNull();
  });
});

describe('🔴 le surlignage SUIT la frappe, et disparaît si le nom est effacé', () => {
  const O = 'Arnaud JOREL / Cabinet Criterimmo';
  const P: [number, number] = [0, 12];
  it('frappe APRÈS le nom (le curseur est à la fin de l’objet à l’ouverture) : le nom reste surligné, intact', () => {
    expect(suivreSurlignage(O, `${O} — urgent`, P)).toEqual([0, 12]);
    expect(suivreSurlignage(O, O.replace('Cabinet', 'Cab.'), P)).toEqual([0, 12]);
  });
  it('frappe AVANT le nom : il glisse', () => {
    expect(suivreSurlignage(O, `RE ${O}`, P)).toEqual([3, 15]);
  });
  it('nom modifié à la main : le surlignage suit (raccourci, allongé, remplacé)', () => {
    expect(suivreSurlignage(O, O.replace('Arnaud ', ''), P)).toEqual([0, 5]);                    // « JOREL »
    expect(suivreSurlignage(O, O.replace('JOREL', 'JOREL-MARTIN'), P)).toEqual([0, 19]);
    expect(suivreSurlignage(O, O.replace('Arnaud JOREL', 'Léa PETIT'), P)).toEqual([0, 9]);
    expect(suivreSurlignage('Arnaud JOR / C', 'Arnaud JORE / C', [0, 10])).toEqual([0, 11]);    // retapé à sa fin
  });
  it('nom entièrement effacé : plus de surlignage', () => {
    expect(suivreSurlignage(O, O.slice(12), P)).toBeNull();
    expect(suivreSurlignage(O, '', P)).toBeNull();
  });
  it('rien ne change, ou aucun surlignage : la même chose', () => {
    expect(suivreSurlignage(O, O, P)).toEqual(P);
    expect(suivreSurlignage(O, `${O}!`, null)).toBeNull();
  });
});

describe('la description du bien — chaque élément n’apparaît que s’il est renseigné', () => {
  const t = (d: Parameters<typeof descriptionDuBien>[0]) => descriptionDuBien(d).texte;
  it('tout renseigné : type, pièces, surface, étage, lots', () => {
    expect(t({ nature: 'Appartement', pieces: 3, surfaceM2: 62, etage: 4, lotsCopropriete: ['219', '220'] }))
      .toBe('un appartement de 3 pièces de 62 m², situé au 4e étage, lots de copropriété n° 219, 220');
  });
  it('le type vient de la fiche, en minuscules ; « Type N » donne le nombre de pièces', () => {
    expect(t({ nature: 'Appartement meublé', typeBien: 'Type 2' })).toBe('un appartement meublé de 2 pièces');
    expect(t({ nature: 'Appartement', typeBien: 'Type 1' })).toBe('un appartement de 1 pièce');
    expect(t({ nature: 'Appartement meublé', typeBien: 'Studio' })).toBe('un studio meublé');
    expect(t({ nature: 'Local commercial', typeBien: null })).toBe('un local commercial');
    expect(descriptionDuBien({ nature: 'Maison', typeBien: 'Type 6', etage: 0 }))
      .toEqual({ texte: 'une maison de 6 pièces, située au rez-de-chaussée', feminin: true });
  });
  it('éléments manquants : jamais de virgule orpheline ; rien du tout : « un logement »', () => {
    expect(t({ nature: 'Appartement', etage: 1 })).toBe('un appartement, situé au 1er étage');
    expect(t({ nature: 'Appartement', lotsCopropriete: ['219'] })).toBe('un appartement, lot de copropriété n° 219');
    expect(t({ surfaceM2: 18.5 })).toBe('un logement de 18,5 m²');
    expect(t({ etage: 0 })).toBe('un logement, situé au rez-de-chaussée');
    expect(t({ nature: 'A renseigner' })).toBe('un logement');
    expect(t({})).toBe('un logement');
  });
  it('étage 0 = « rez-de-chaussée », 1 = « 1er étage », sinon « Ne étage »', () => {
    expect(etageLisible(0)).toBe('rez-de-chaussée');
    expect(etageLisible(1)).toBe('1er étage');
    expect(etageLisible(4)).toBe('4e étage');
  });
});

const BIEN = { nature: 'Appartement', pieces: 3, surfaceM2: 62, etage: 4, lotsCopropriete: ['219', '220'] };
const ADRESSE = '25 rue Edith Cavell, 92400 Courbevoie';
const corps = (o: Partial<NonNullable<DonneesMailSyndic['bien']>>, dest: DonneesMailSyndic['destinataires'] = [null]) =>
  corpsMailSyndic({ destinataires: dest, bien: { adresse: ADRESSE, proprietaires: ['DUPONT Jean'], descriptif: BIEN, locataires: [], ...o } });
const ANNONCE = 'Le Cabinet Criterimmo assure la gestion locative d\'un bien situé dans la résidence du 25 rue Edith Cavell, '
  + '92400 Courbevoie, dont vous êtes le syndic. Ce bien appartient à :';

describe('🔴🔴 LOT MAIL-PREREMPLI-TEXTE-B — le corps, ligne par ligne (version B d’Arno)', () => {
  it('🔴 l’exemple d’Arno, bien du 25 rue Edith Cavell, mot pour mot', () => {
    const t = corps({
      proprietaires: ['JULLIEN - GARRIDO Cédric'], descriptif: { nature: 'Appartement meublé', typeBien: 'Type 2' },
      locataires: [{ nom: 'YOUENOU et TALHOUARN Marine et Valentin', telephone: '06 79 50 64 16', email: 'marineynu@icloud.com' }],
    });
    expect(t.split('\n')).toEqual([
      'Bonjour Madame, Monsieur,', '', '',
      ANNONCE, '',
      'JULLIEN - GARRIDO Cédric', '',
      'Il s\'agit d\'un appartement meublé de 2 pièces, actuellement occupé par :', '',
      'YOUENOU et TALHOUARN Marine et Valentin · 06 79 50 64 16 · marineynu@icloud.com',
      '', '', '',
    ]);
  });
  it('⛔ la formule d’appel et les deux lignes vides qui la suivent ne bougent pas', () => {
    const l = corps({}, [F('Durand')]).split('\n');
    expect(l.slice(0, 3)).toEqual(['Bonjour Madame DURAND,', '', '']);
  });
  it('l’adresse du bien est dans la phrase ; sans adresse, la phrase tient sans elle', () => {
    expect(corps({}).split('\n')[3]).toBe(ANNONCE);
    expect(corps({ adresse: null }).split('\n')[3]).toBe(
      'Le Cabinet Criterimmo assure la gestion locative d\'un bien situé dans la résidence dont vous êtes le syndic. Ce bien appartient à :');
  });
  it('1 propriétaire, puis 2 : un par ligne, sous la même phrase', () => {
    expect(corps({}).split('\n').slice(3, 7)).toEqual([ANNONCE, '', 'DUPONT Jean', '']);
    expect(corps({ proprietaires: ['A Un', 'B Deux'] }).split('\n').slice(3, 8)).toEqual([ANNONCE, '', 'A Un', 'B Deux', '']);
  });
  it('aucun propriétaire : « (propriétaire non renseigné) »', () => {
    expect(corps({ proprietaires: [] }).split('\n')[5]).toBe('(propriétaire non renseigné)');
  });
  it('1 locataire, puis 2 : « …, actuellement occupé par : », une ligne vide, un locataire par ligne', () => {
    expect(corps({ locataires: [{ nom: 'ROI Nathan', email: 'n.roi@exemple.fr' }] })).toContain(
      'Il s\'agit d\'un appartement de 3 pièces de 62 m², situé au 4e étage, lots de copropriété n° 219, 220, actuellement occupé par :'
      + '\n\nROI Nathan · n.roi@exemple.fr\n\n\n');
    expect(corps({ locataires: [{ nom: 'A Un', telephone: '01 02 03 04 05' }, { nom: 'B Deux' }] }))
      .toContain('actuellement occupé par :\n\nA Un · 01 02 03 04 05\nB Deux\n\n\n');
  });
  it('bien vacant : « Il s’agit d’…, actuellement vacant. », sans liste dessous', () => {
    const t = corps({ locataires: [] });
    expect(t.endsWith('DUPONT Jean\n\nIl s\'agit d\'un appartement de 3 pièces de 62 m², situé au 4e étage, lots de copropriété n° 219, 220, actuellement vacant.\n\n\n')).toBe(true);
  });
  it('description absente : « un logement »', () => {
    expect(corps({ descriptif: {} })).toContain('DUPONT Jean\n\nIl s\'agit d\'un logement, actuellement vacant.\n\n\n');
    expect(corps({ descriptif: {}, locataires: [{ nom: 'ROI Léa' }] }))
      .toContain('Il s\'agit d\'un logement, actuellement occupé par :\n\nROI Léa\n\n\n');
  });
  it('une maison : l’accord suit (« occupée », « vacante »)', () => {
    expect(corps({ descriptif: { nature: 'Maison' } })).toContain('Il s\'agit d\'une maison, actuellement vacante.');
    expect(corps({ descriptif: { nature: 'Maison' }, locataires: [{ nom: 'X' }] })).toContain('une maison, actuellement occupée par :');
  });
  it('plus aucune phrase d’avant', () => {
    const t = corps({ locataires: [{ nom: 'X' }] });
    for (const vieux of ['Je prends contact', 'Concernant', 'Il est actuellement', 'Logement actuellement vacant']) expect(t).not.toContain(vieux);
  });
  it('ligne d’un locataire : éléments absents omis', () => {
    expect(ligneLocataire({ nom: 'ROI Nathan', telephone: '', email: 'x@y.fr' })).toBe('ROI Nathan · x@y.fr');
  });
  it('hors fiche bien : la formule d’appel seule, puis deux lignes vides (inchangé)', () => {
    expect(corpsMailSyndic({ destinataires: [H('Bercier')], bien: null })).toBe('Bonjour Monsieur BERCIER,\n\n\n');
  });
});

describe('ce que l’éditeur reçoit', () => {
  it('une ligne = un paragraphe, une ligne vide = un paragraphe vide (les deux lignes vides survivent)', () => {
    expect(lignesVersHtml('Bonjour,\n\n\nA < B')).toBe('<p>Bonjour,</p><p><br /></p><p><br /></p><p>A &lt; B</p>');
  });
  it('signature HTML dessous, après les deux lignes vides ; le texte porte la signature texte', () => {
    const b = brouillonMailSyndic({ objet: 'Arnaud JOREL / C', surlignage: [0, 12], corps: 'Bonjour,\n\n\nFin.\n\n\n' },
      { texte: 'Service Gestion', html: '<div>SIG</div>' });
    expect(b.corps).toBe('Bonjour,\n\n\nFin.\n\n\nService Gestion');
    expect(b.corpsHtml).toBe('<p>Bonjour,</p><p><br /></p><p><br /></p><p>Fin.</p><p><br /></p><p><br /></p><div>SIG</div>');
    expect(b.surlignageObjet).toEqual([0, 12]);
    expect(b.curseurEnFinDObjet).toBe(true);
    expect(b).not.toHaveProperty('selectionObjet');
  });
});

describe('la demande d’écriture → le brouillon', () => {
  const BASE = { a: ['x@y.fr'], objet: '', corps: '\n\nSIG', corpsHtml: null as string | null, cibles: [] as unknown[] };
  const rep = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status });
  const SYNDIC = { etat: 'ok', objet: 'Arnaud JOREL / C / résidence R', surlignage: [0, 12], corps: 'Bonjour Madame, Monsieur,\n\n\n',
    civilites: { 'm.b@c.fr': { civilite: 'M.', nom: 'Bercier' } } };
  const BIEN = { etat: 'ok', cible: { sorte: 'lot', cle: '219', id: 176, libelle: '25 rue X — lot 219', categorie: 'logement' },
    groupes: [{ cle: 'clients', titre: 'Clients de l’agence', lignes: [
      { adresse: 'p@x.fr', nom: 'DUPONT Jean', role: 'Propriétaire', ton: 'proprietaire', propre: true, civilite: 'M.', nomFamille: 'DUPONT' },
    ] }] };
  const routeur = (s: unknown, b: unknown) => vi.fn(async (u: string) => (u.includes('/syndics/') ? rep(s) : rep(b)));

  it('une adresse seule : le message adressé, exactement comme avant (aucune lecture)', async () => {
    const lire = vi.fn();
    expect(await preremplirDemande('x@y.fr', BASE, {}, lire)).toBe(BASE);
    expect(lire).not.toHaveBeenCalled();
  });
  it('depuis une fiche syndic ouverte d’un bien : les DEUX lectures (syndic, bien), objet et corps posés', async () => {
    const lire = routeur(SYNDIC, BIEN);
    const b = await preremplirDemande({ email: 'x@y.fr', contexte: { syndicId: 40, lotId: 176 } }, BASE, { texte: 'SIG' }, lire);
    expect(lire.mock.calls.map((c) => c[0]).sort()).toEqual([
      '/api/admin/gestion/biens/176/ecrire', '/api/admin/gestion/syndics/40/mail?a=x%40y.fr&lot=176']);
    expect(b).toMatchObject({ a: ['x@y.fr'], objet: 'Arnaud JOREL / C / résidence R', corps: 'Bonjour Madame, Monsieur,\n\n\nSIG',
      surlignageObjet: [0, 12], curseurEnFinDObjet: true });
    // Le bien d'origine est pré-coché, les adresses du bien sont là, et la formule sait se recalculer.
    expect(b.cibles).toEqual([{ sorte: 'lot', cle: '219', id: 176, libelle: '25 rue X — lot 219', categorie: 'logement' }]);
    expect(b.suggestionsBien).toEqual(BIEN.groupes);
    expect(b.appel).toEqual({ formule: 'Bonjour Madame, Monsieur,', civilites: {
      'p@x.fr': { civilite: 'M.', nom: 'DUPONT' }, 'm.b@c.fr': { civilite: 'M.', nom: 'Bercier' } } });
  });
  it('depuis l’écran « Syndics » (pas de bien) : la seule lecture du syndic, sans « lot »', async () => {
    const lire = routeur({ ...SYNDIC, objet: 'Arnaud JOREL / C' }, BIEN);
    const b = await preremplirDemande({ email: 'x@y.fr', contexte: { syndicId: 40, lotId: null } }, BASE, {}, lire);
    expect(lire.mock.calls.map((c) => c[0])).toEqual(['/api/admin/gestion/syndics/40/mail?a=x%40y.fr']);
    expect(b.cibles).toEqual([]);
    expect(b.suggestionsBien).toBeUndefined();
  });
  it('depuis une carte CLIENT de la fiche bien (pas de syndic) : bien pré-coché et adresses proposées, corps intact', async () => {
    const lire = routeur(SYNDIC, BIEN);
    const b = await preremplirDemande({ email: 'p@x.fr', contexte: { lotId: 176 } }, BASE, {}, lire);
    expect(lire.mock.calls.map((c) => c[0])).toEqual(['/api/admin/gestion/biens/176/ecrire']);
    expect(b).toMatchObject({ objet: '', corps: '\n\nSIG', cibles: [{ cle: '219' }] });
    expect(b.appel).toBeUndefined();
  });
  it('LOT MAIL-DEPUIS-BIEN-MISE-EN-PAGE-OBJET-DRIVE — depuis un bien : « depuisLeBien » et son dossier Drive voyagent', async () => {
    const b = await preremplirDemande({ email: 'p@x.fr', contexte: { lotId: 176 } }, BASE, {},
      routeur(SYNDIC, { ...BIEN, dossierDrive: { id: 'D9', nom: 'lot 219' } }));
    expect([b.depuisLeBien, b.dossierDriveBien]).toEqual([true, { id: 'D9', nom: 'lot 219' }]);
    const sans = await preremplirDemande({ email: 'p@x.fr', contexte: { lotId: 176 } }, BASE, {}, routeur(SYNDIC, { ...BIEN, dossierDrive: null }));
    expect([sans.depuisLeBien, sans.dossierDriveBien]).toEqual([true, null]);
    const ecranSyndics = await preremplirDemande({ email: 'p@x.fr', contexte: { syndicId: 40, lotId: null } }, BASE, {}, routeur(SYNDIC, BIEN));
    expect(ecranSyndics.depuisLeBien).toBeUndefined();
  });
  it('un bien déjà classé par ailleurs n’est pas remplacé', async () => {
    const b = await preremplirDemande({ email: 'p@x.fr', contexte: { lotId: 176 } },
      { ...BASE, cibles: [{ sorte: 'evenement' }] }, {}, routeur(SYNDIC, BIEN));
    expect(b.cibles).toEqual([{ sorte: 'evenement' }]);
  });
  it('lecture impossible (refus ou panne) : le message s’ouvre adressé, sans pré-remplissage', async () => {
    expect(await preremplirDemande({ email: 'x@y.fr', contexte: { syndicId: 40, lotId: 1 } }, BASE, {},
      async () => rep({ etat: 'erreur' }, 503))).toEqual(BASE);
    expect(await preremplirDemande({ email: 'x@y.fr', contexte: { syndicId: 40, lotId: 1 } }, BASE, {},
      async () => { throw new Error('réseau'); })).toEqual(BASE);
  });
});

describe('la formule recalculée sur les destinataires en « À »', () => {
  const C = { 'h@x.fr': { civilite: 'M.' as const, nom: 'Martin' }, 'f@x.fr': { civilite: 'Mme' as const, nom: 'Durand' },
    'f2@x.fr': { civilite: 'Mme' as const, nom: 'Petit' } };
  it('d’après les civilités connues ; une adresse inconnue rend la formule neutre ; la casse ne compte pas', () => {
    expect(formulePour(['H@x.fr'], C)).toBe('Bonjour Monsieur MARTIN,');
    expect(formulePour(['h@x.fr', 'f@x.fr'], C)).toBe('Bonjour Madame, Monsieur,');
    expect(formulePour(['f@x.fr', 'f2@x.fr'], C)).toBe('Bonjour Mesdames,');
    expect(formulePour(['h@x.fr', 'inconnu@x.fr'], C)).toBe('Bonjour Madame, Monsieur,');
  });
});

describe('🔴🔴 LOT FORMULE-CONTACT-PRIME-ET-PUCES-COLOREES — une seule fonction, à l’ouverture comme au recalcul', () => {
  const C = { 'arnaud.jorel@gmail.com': { civilite: 'M.' as const, nom: 'JOREL' }, 'f@x.fr': { civilite: 'Mme' as const, nom: 'Durand' } };
  it('🔴 un contact connu AVEC civilité, seul en À ⇒ « Bonjour Monsieur NOM, » / « Bonjour Madame NOM, »', () => {
    expect(formulePour(['arnaud.jorel@gmail.com'], C)).toBe('Bonjour Monsieur JOREL,');
    expect(formulePour(['F@x.fr'], C)).toBe('Bonjour Madame DURAND,');
    expect(destinatairesAppel(['arnaud.jorel@gmail.com', 'inconnu@x.fr'], C)).toEqual([{ civilite: 'M.', nom: 'JOREL' }, null]);
  });
  const SYNDIC = (corps: string) => ({ etat: 'ok', objet: 'Arnaud JOREL / C', surlignage: [0, 12], corps,
    civilites: { 'arnaud.jorel@gmail.com': { civilite: 'M.', nom: 'JOREL' } } });
  const routeur = (s: unknown, b: unknown) => vi.fn(async (u: string) => new Response(JSON.stringify(u.includes('/syndics/') ? s : b)));
  it('🔴 à l’OUVERTURE : arnaud.jorel@gmail.com seul en À ⇒ « Bonjour Monsieur JOREL, » — la formule que le recalcul donnerait', async () => {
    const BASE = { a: ['arnaud.jorel@gmail.com'], objet: '', corps: '\n\nSIG', corpsHtml: null as string | null, cibles: [] as unknown[] };
    const b = await preremplirDemande({ email: 'arnaud.jorel@gmail.com', contexte: { syndicId: 2, lotId: null } }, BASE, {},
      routeur(SYNDIC('Bonjour Monsieur JOREL,\n\n\n'), null));
    expect(b.corps.split('\n')[0]).toBe('Bonjour Monsieur JOREL,');
    expect(b.appel?.formule).toBe('Bonjour Monsieur JOREL,');
    expect(b.appel && formulePour(['arnaud.jorel@gmail.com'], b.appel.civilites)).toBe(b.appel?.formule);
  });
  it('la formule d’ouverture est RECALCULÉE sur la table complète (personnes du bien comprises) : jamais deux résultats', async () => {
    const BIEN = { etat: 'ok', groupes: [{ cle: 'clients', titre: 'C', lignes: [
      { adresse: 'p@x.fr', nom: 'DUPONT Jean', role: 'Propriétaire', ton: 'proprietaire', propre: true, civilite: 'M.', nomFamille: 'DUPONT' }] }] };
    const BASE = { a: ['p@x.fr'], objet: '', corps: '', corpsHtml: null as string | null, cibles: [] as unknown[] };
    const b = await preremplirDemande({ email: 'p@x.fr', contexte: { syndicId: 2, lotId: 176 } }, BASE, {},
      routeur(SYNDIC('Bonjour Madame, Monsieur,\n\n\nLe Cabinet…\n\n\n'), BIEN));
    expect(b.corps.split('\n').slice(0, 4)).toEqual(['Bonjour Monsieur DUPONT,', '', '', 'Le Cabinet…']);
    expect(b.corpsHtml?.startsWith('<p>Bonjour Monsieur DUPONT,</p>')).toBe(true);
    expect(b.appel?.formule).toBe('Bonjour Monsieur DUPONT,');
  });
});
