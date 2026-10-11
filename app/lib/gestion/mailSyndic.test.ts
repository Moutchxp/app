import { describe, it, expect, vi } from 'vitest';
import {
  brouillonMailSyndic, civiliteDeTexte, corpsMailSyndic, etageLisible, formuleAppelDestinataires, ligneLocataire,
  lignesVersHtml, objetMailSyndic, phraseDuBien, preremplirDemande, selectionObjet, type DonneesMailSyndic,
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

describe('l’objet', () => {
  it('depuis une fiche bien : « XXXXXXXX / Cabinet / résidence adresse »', () => {
    expect(objetMailSyndic('Cabinet Criterimmo', '25 rue Edith Cavell, 92400 Courbevoie'))
      .toBe('XXXXXXXX / Cabinet Criterimmo / résidence 25 rue Edith Cavell, 92400 Courbevoie');
  });
  it('hors fiche bien (écran « Syndics ») : « XXXXXXXX / Cabinet »', () => {
    expect(objetMailSyndic('Cabinet Criterimmo', null)).toBe('XXXXXXXX / Cabinet Criterimmo');
  });
  it('« XXXXXXXX » est la plage sélectionnée à l’ouverture', () => {
    expect(selectionObjet('XXXXXXXX / Cabinet Criterimmo')).toEqual([0, 8]);
    expect(selectionObjet('sans marque')).toBeNull();
  });
});

describe('la phrase du bien — chaque élément n’apparaît que s’il est renseigné', () => {
  it('tout renseigné : la phrase d’Arno', () => {
    expect(phraseDuBien({ nature: 'Appartement', pieces: 3, surfaceM2: 62, etage: 4, lotsCopropriete: ['219', '220'] }))
      .toBe('Concernant un appartement de 3 pièces de 62 m², situé au 4e étage, lots de copropriété n° 219, 220.');
  });
  it('le type vient de la fiche, en minuscules ; « Type N » donne le nombre de pièces', () => {
    expect(phraseDuBien({ nature: 'Appartement meublé', typeBien: 'Type 2' })).toBe('Concernant un appartement meublé de 2 pièces.');
    expect(phraseDuBien({ nature: 'Appartement', typeBien: 'Type 1' })).toBe('Concernant un appartement de 1 pièce.');
    expect(phraseDuBien({ nature: 'Appartement meublé', typeBien: 'Studio' })).toBe('Concernant un studio meublé.');
    expect(phraseDuBien({ nature: 'Local commercial', typeBien: null })).toBe('Concernant un local commercial.');
    expect(phraseDuBien({ nature: 'Maison', typeBien: 'Type 6', etage: 0 })).toBe('Concernant une maison de 6 pièces, située au rez-de-chaussée.');
  });
  it('éléments manquants : jamais de virgule orpheline', () => {
    expect(phraseDuBien({ nature: 'Appartement', etage: 1 })).toBe('Concernant un appartement, situé au 1er étage.');
    expect(phraseDuBien({ nature: 'Appartement', lotsCopropriete: ['219'] })).toBe('Concernant un appartement, lot de copropriété n° 219.');
    expect(phraseDuBien({ surfaceM2: 18.5 })).toBe('Concernant un bien de 18,5 m².');
    expect(phraseDuBien({ etage: 0 })).toBe('Concernant le bien, situé au rez-de-chaussée.');
    expect(phraseDuBien({ nature: 'A renseigner' })).toBeNull();
    expect(phraseDuBien({})).toBeNull();
  });
  it('étage 0 = « rez-de-chaussée », 1 = « 1er étage », sinon « Ne étage »', () => {
    expect(etageLisible(0)).toBe('rez-de-chaussée');
    expect(etageLisible(1)).toBe('1er étage');
    expect(etageLisible(4)).toBe('4e étage');
  });
});

const BIEN = { nature: 'Appartement', pieces: 3, surfaceM2: 62, etage: 4, lotsCopropriete: ['219', '220'] };
const corps = (o: Partial<NonNullable<DonneesMailSyndic['bien']>>, dest: DonneesMailSyndic['destinataires'] = [null]) =>
  corpsMailSyndic({ destinataires: dest, bien: { proprietaires: ['DUPONT Jean'], descriptif: BIEN, locataires: [], ...o } });

describe('le corps, ligne par ligne', () => {
  it('🔴 la mise en page exacte : deux lignes vides après la formule, une entre les blocs, deux à la fin', () => {
    const t = corps({
      proprietaires: ['DUPONT Jean', 'MARTIN Claire'],
      locataires: [{ nom: 'ROI Nathan', telephone: '06 12 34 56 78', email: 'n.roi@exemple.fr' }, { nom: 'ROI Léa' }],
    }, [F('Durand')]);
    expect(t.split('\n')).toEqual([
      'Bonjour Madame DURAND,',
      '',
      '',
      'Je prends contact auprès de vous concernant la résidence dont vous êtes le syndic, en qualité de gestionnaire locatif pour le compte des copropriétaires suivants :',
      '',
      'DUPONT Jean',
      'MARTIN Claire',
      '',
      'Concernant un appartement de 3 pièces de 62 m², situé au 4e étage, lots de copropriété n° 219, 220.',
      '',
      'Il est actuellement occupé par les locataires suivants :',
      '',
      'ROI Nathan · 06 12 34 56 78 · n.roi@exemple.fr',
      'ROI Léa',
      '',
      '',
      '',
    ]);
  });
  it('un seul propriétaire : « …du copropriétaire suivant : »', () => {
    const l = corps({}).split('\n');
    expect(l[3]).toMatch(/pour le compte du copropriétaire suivant :$/);
    expect(l[5]).toBe('DUPONT Jean');
    expect(l[6]).toBe('');
  });
  it('plusieurs propriétaires : un par ligne, sous « …des copropriétaires suivants : »', () => {
    const l = corps({ proprietaires: ['A Un', 'B Deux', 'C Trois'] }).split('\n');
    expect(l[3]).toMatch(/des copropriétaires suivants :$/);
    expect(l.slice(5, 8)).toEqual(['A Un', 'B Deux', 'C Trois']);
  });
  it('aucun propriétaire : « (propriétaire non renseigné) »', () => {
    const l = corps({ proprietaires: [] }).split('\n');
    expect(l[5]).toBe('(propriétaire non renseigné)');
  });
  it('un seul locataire : « …par le locataire suivant : », une ligne vide, sa ligne', () => {
    const t = corps({ locataires: [{ nom: 'ROI Nathan', email: 'n.roi@exemple.fr' }] });
    expect(t).toContain('Il est actuellement occupé par le locataire suivant :\n\nROI Nathan · n.roi@exemple.fr\n\n\n');
  });
  it('deux locataires : « …par les locataires suivants : », un par ligne', () => {
    const t = corps({ locataires: [{ nom: 'A Un', telephone: '01 02 03 04 05' }, { nom: 'B Deux' }] });
    expect(t).toContain('Il est actuellement occupé par les locataires suivants :\n\nA Un · 01 02 03 04 05\nB Deux\n\n\n');
  });
  it('vacant : « Logement actuellement vacant. »', () => {
    const t = corps({ locataires: [] });
    expect(t.endsWith('lots de copropriété n° 219, 220.\n\nLogement actuellement vacant.\n\n\n')).toBe(true);
  });
  it('éléments du bien tous absents : la ligne « Concernant » n’est pas écrite, sans double ligne vide', () => {
    const t = corps({ descriptif: {} });
    expect(t).not.toContain('Concernant');
    expect(t).toContain('DUPONT Jean\n\nLogement actuellement vacant.');
  });
  it('ligne d’un locataire : éléments absents omis', () => {
    expect(ligneLocataire({ nom: 'ROI Nathan', telephone: '', email: 'x@y.fr' })).toBe('ROI Nathan · x@y.fr');
  });
  it('hors fiche bien : la formule d’appel seule, puis deux lignes vides', () => {
    expect(corpsMailSyndic({ destinataires: [H('Bercier')], bien: null })).toBe('Bonjour Monsieur BERCIER,\n\n\n');
  });
});

describe('ce que l’éditeur reçoit', () => {
  it('une ligne = un paragraphe, une ligne vide = un paragraphe vide (les deux lignes vides survivent)', () => {
    expect(lignesVersHtml('Bonjour,\n\n\nA < B')).toBe('<p>Bonjour,</p><p><br /></p><p><br /></p><p>A &lt; B</p>');
  });
  it('signature HTML dessous, après les deux lignes vides ; le texte porte la signature texte', () => {
    const b = brouillonMailSyndic({ objet: 'XXXXXXXX / C', selection: [0, 8], corps: 'Bonjour,\n\n\nFin.\n\n\n' },
      { texte: 'Service Gestion', html: '<div>SIG</div>' });
    expect(b.corps).toBe('Bonjour,\n\n\nFin.\n\n\nService Gestion');
    expect(b.corpsHtml).toBe('<p>Bonjour,</p><p><br /></p><p><br /></p><p>Fin.</p><p><br /></p><p><br /></p><div>SIG</div>');
    expect(b.selectionObjet).toEqual([0, 8]);
  });
});

describe('la demande d’écriture → le brouillon', () => {
  const BASE = { a: ['x@y.fr'], objet: '', corps: '\n\nSIG', corpsHtml: null as string | null };
  it('une adresse seule : le message adressé, exactement comme avant (aucune lecture)', async () => {
    const lire = vi.fn();
    expect(await preremplirDemande('x@y.fr', BASE, {}, lire)).toBe(BASE);
    expect(lire).not.toHaveBeenCalled();
  });
  it('avec son syndic et son bien : la route est lue (lot, adresse), objet et corps posés', async () => {
    const lire = vi.fn(async (_u: string) => new Response(JSON.stringify({
      etat: 'ok', objet: 'XXXXXXXX / C / résidence R', selection: [0, 8], corps: 'Bonjour,\n\n\n',
    }), { status: 200 }));
    const b = await preremplirDemande({ email: 'x@y.fr', syndic: { syndicId: 40, lotId: 176 } }, BASE, { texte: 'SIG' }, lire);
    expect(lire.mock.calls[0][0]).toBe('/api/admin/gestion/syndics/40/mail?a=x%40y.fr&lot=176');
    expect(b).toMatchObject({ a: ['x@y.fr'], objet: 'XXXXXXXX / C / résidence R', corps: 'Bonjour,\n\n\nSIG', selectionObjet: [0, 8] });
  });
  it('depuis l’écran « Syndics » (pas de bien) : pas de paramètre « lot »', async () => {
    const lire = vi.fn(async (_u: string) => new Response(JSON.stringify({ etat: 'ok', objet: 'XXXXXXXX / C', selection: [0, 8], corps: 'B,\n\n\n' })));
    await preremplirDemande({ email: 'x@y.fr', syndic: { syndicId: 40, lotId: null } }, BASE, {}, lire);
    expect(lire.mock.calls[0][0]).toBe('/api/admin/gestion/syndics/40/mail?a=x%40y.fr');
  });
  it('lecture impossible (refus ou panne) : le message s’ouvre adressé, sans pré-remplissage', async () => {
    expect(await preremplirDemande({ email: 'x@y.fr', syndic: { syndicId: 40, lotId: 1 } }, BASE, {},
      async () => new Response(JSON.stringify({ etat: 'erreur' }), { status: 503 }))).toBe(BASE);
    expect(await preremplirDemande({ email: 'x@y.fr', syndic: { syndicId: 40, lotId: 1 } }, BASE, {},
      async () => { throw new Error('réseau'); })).toBe(BASE);
  });
});
