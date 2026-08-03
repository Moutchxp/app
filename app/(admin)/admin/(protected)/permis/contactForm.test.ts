import { describe, it, expect } from 'vitest';
import { corpsPatchContact, corpsAdoptionPrada, noteAuChangementCanal, problemeContactUI, editionInitiale, construireFiche, CANAUX_ORDONNES, problemeUrlOuverture, origineContact, originePrada, libelleEmailType, libelleStatut, libelleSource, libelleCanal } from './contactForm';

describe('S21 — INVARIANT : la PRADA n’est JAMAIS recopiée dans un champ éditable de contact', () => {
  it('editionInitiale : responsableNom vient de mairie_contact, JAMAIS de la PRADA ; l’e-mail non plus', () => {
    const d = {
      codeInsee: '92050', communeNom: 'Nanterre', destCanal: 'email' as const, destEmail: 'mairie@nanterre.fr',
      destUrlFormulaire: null, destAdressePostale: null, destResponsableNom: null,
      destPradaNom: 'Jean PRADA', destPradaCourriel: 'prada@x.fr', destPradaAdresse: '1 rue X', destPradaMillesime: '2026-07',
      destPradaOrigine: 'annuaire_cada', destPradaStatut: 'presume', destPradaRapprochement: 'automatique',
    };
    const e = editionInitiale(d);
    expect(e.responsableNom).toBe('');                 // PAS 'Jean PRADA'
    expect(e.telephone).toBe('');                       // ni ailleurs
    expect(e.email).toBe('mairie@nanterre.fr');         // e-mail = contact, pas PRADA
    // la PRADA n'existe QUE dans la fiche lecture seule (état SÉPARÉ, construit depuis la base)
    const fiche = construireFiche(d);
    expect(fiche.pradaNom).toBe('Jean PRADA');
    expect(fiche.pradaCourriel).toBe('prada@x.fr');
  });
});

describe('S25 — la note existante est CHARGÉE puis préservée à l’enregistrement', () => {
  it('editionInitiale charge la note depuis la base (plus de note vide forcée)', () => {
    const e = editionInitiale({ codeInsee: '75056', communeNom: 'Paris', destCanal: 'formulaire', destEmail: null, destUrlFormulaire: 'https://adsconsult.paris.fr', destAdressePostale: null, destNote: 'Consult ADS ; ancienne adresse BASU conservée.' });
    expect(e.note).toBe('Consult ADS ; ancienne adresse BASU conservée.');
  });
  it('ouvrir une fiche à note NON VIDE et enregistrer SANS y toucher → la note reste INTACTE', () => {
    const d = { codeInsee: '92050', communeNom: 'Nanterre', destCanal: 'email' as const, destEmail: 'mairie@nanterre.fr', destUrlFormulaire: null, destAdressePostale: null, destNote: 'note métier importante' };
    const corps = corpsPatchContact(editionInitiale(d)); // aucune modification de l'utilisateur
    expect(corps.note).toBe('note métier importante'); // ← n'est PLUS écrasée à '' (le bug S24→S25)
  });
  it('note absente en base → éditeur ouvert avec une note vide (NULL honnête)', () => {
    const e = editionInitiale({ codeInsee: '92050', communeNom: 'Nanterre', destCanal: 'email', destEmail: 'x@y.fr', destUrlFormulaire: null, destAdressePostale: null });
    expect(e.note).toBe('');
  });
  it('quitter le canal courrier ne REMPLACE pas une note déjà chargée (complète seulement une note vide)', () => {
    const d = { codeInsee: '78500', communeNom: 'X', destCanal: 'courrier' as const, destEmail: null, destUrlFormulaire: null, destAdressePostale: 'BASU', destNote: 'déjà une note' };
    const e = editionInitiale(d);
    expect(noteAuChangementCanal(e.canal, 'email', e.adressePostale, e.note)).toBe('déjà une note'); // inchangée
    // …mais une note VIDE est bien complétée par l'ancienne adresse courrier (comportement conservé)
    const vide = editionInitiale({ codeInsee: '78500', communeNom: 'X', destCanal: 'courrier', destEmail: null, destUrlFormulaire: null, destAdressePostale: 'BASU' });
    expect(noteAuChangementCanal(vide.canal, 'email', vide.adressePostale, vide.note)).toBe('Ancienne adresse courrier : BASU');
  });
});

describe('S22 — A : la fiche vient EXCLUSIVEMENT de la base, jamais de l’état d’édition', () => {
  const d = {
    codeInsee: '92050', communeNom: 'Nanterre', destCanal: 'email' as const, destEmail: 'mairie@nanterre.fr',
    destUrlFormulaire: null, destAdressePostale: 'BASU, 3 rue X', destStatut: 'presume', destSource: 'annuaire',
    destTelephone: '01 11 11 11 11', destTelephoneStandard: '01 22 22 22 22', destResponsableNom: 'Nom Service', destEmailType: 'urbanisme',
  };
  it('construireFiche reflète la ligne en base (destinataire, canal, statut, source, téléphones, responsable)', () => {
    const f = construireFiche(d);
    expect(f.destinataireActuel).toBe('mairie@nanterre.fr');
    expect(f.canalEnregistre).toBe('email');
    expect(f.contactStatut).toBe('presume');
    expect(f.contactSource).toBe('annuaire');
    expect(f.telephone).toBe('01 11 11 11 11');
    expect(f.telephoneStandard).toBe('01 22 22 22 22');
    expect(f.responsableNom).toBe('Nom Service');
    expect(f.adressePostale).toBe('BASU, 3 rue X');
  });
  it('construireFiche ne prend QUE la base : éditer le formulaire (canal, e-mail) ne change AUCUNE valeur de la fiche', () => {
    const avant = construireFiche(d);
    // on « édite » : nouveau canal, nouvel e-mail — construireFiche ne voit pas cet état, il relit la même base
    const edition = editionInitiale(d);
    const edite = { ...edition, canal: 'courrier' as const, email: 'autre@zzz.fr' };
    void edite; // l'état d'édition n'est JAMAIS un paramètre de construireFiche
    expect(construireFiche(d)).toEqual(avant);
  });
  it('champs absents en base → null (jamais chaîne vide dans la fiche)', () => {
    const f = construireFiche({ codeInsee: '78475', communeNom: 'Osmoy', destCanal: null, destEmail: null, destUrlFormulaire: null, destAdressePostale: null });
    expect(f.destinataireActuel).toBeNull();
    expect(f.canalEnregistre).toBeNull();
    expect(f.contactSource).toBeNull();
    expect(f.telephone).toBeNull();
  });
});

describe('S22 — libellés lecture seule (texte, jamais couleur)', () => {
  it('libelleStatut / libelleSource / libelleCanal', () => {
    expect(libelleStatut('confirme')).toBe('confirmé');
    expect(libelleStatut(null)).toBe('non renseigné');
    expect(libelleSource('saisie_manuelle')).toBe('saisie manuelle');
    expect(libelleSource('annuaire')).toBe('annuaire');
    expect(libelleSource(null)).toBe('non renseigné');
    expect(libelleCanal('email')).toBe('e-mail');
    expect(libelleCanal(null)).toBe('non renseigné');
  });
});

describe('S22 — D : corpsAdoptionPrada ne touche que e-mail + nature + canal, et PRÉSERVE la BASU en note', () => {
  const base = { code: '75056', canal: 'courrier', email: 'ancien@mairie.fr', urlFormulaire: '', adressePostale: 'BASU, 6 promenade…',
    note: '', telephone: '01 42 76 40 40', responsableNom: 'Chenel', telephoneStandard: '01 42 76 40 00', emailType: '' };
  it('adopter la PRADA : e-mail=courriel PRADA, nature=prada, canal=email ; téléphone/responsable/standard INCHANGÉS', () => {
    const corps = corpsAdoptionPrada(base, 'prada@paris.fr', 'courrier', 'BASU, 6 promenade…');
    expect(corps.email).toBe('prada@paris.fr');
    expect(corps.emailType).toBe('prada');
    expect(corps.canal).toBe('email');                       // nécessaire au routage — explicité dans la confirmation
    expect(corps.telephone).toBe('01 42 76 40 40');          // pas touché
    expect(corps.responsableNom).toBe('Chenel');             // pas touché
    expect(corps.telephoneStandard).toBe('01 42 76 40 00');  // pas touché
    // la BASU en base (canal courrier) est conservée en note — pas perdue par le passage à canal='email'
    expect(corps.note).toBe('Ancienne adresse courrier : BASU, 6 promenade…');
  });
  it('ne pré-remplit pas la note si l’utilisateur en a déjà saisi une (jamais d’écrasement)', () => {
    const corps = corpsAdoptionPrada({ ...base, note: 'ma note' }, 'prada@paris.fr', 'courrier', 'BASU');
    expect(corps.note).toBe('ma note');
  });
});

describe('S21 — libellés d’origine (texte, pas couleur)', () => {
  it('origineContact selon le statut', () => {
    expect(origineContact('presume')).toMatch(/présumée/);
    expect(origineContact('confirme')).toMatch(/saisie manuelle/);
    expect(origineContact(null)).toMatch(/inconnue/);
  });
  it('originePrada combine source + rapprochement', () => {
    expect(originePrada('annuaire_cada', 'automatique')).toMatch(/annuaire CADA.*automatique/);
    expect(originePrada('saisie_manuelle', 'manuel')).toMatch(/saisie manuelle.*manuel/);
  });
  it('libelleEmailType : valeur → libellé, absent → « non renseigné »', () => {
    expect(libelleEmailType('urbanisme')).toBe('service urbanisme');
    expect(libelleEmailType(null)).toBe('non renseigné');
    expect(libelleEmailType('')).toBe('non renseigné');
  });
});

describe('S19 — editionInitiale porte standard + nature de l’adresse ; problemeUrlOuverture', () => {
  it('editionInitiale : telephoneStandard et emailType repris du dossier', () => {
    const e = editionInitiale({ codeInsee: '78238', communeNom: 'Flins', destCanal: 'email', destEmail: 'accueil@x.fr', destUrlFormulaire: null, destAdressePostale: null, destTelephoneStandard: '01 30 90 40 00', destEmailType: 'accueil' });
    expect(e.telephoneStandard).toBe('01 30 90 40 00');
    expect(e.emailType).toBe('accueil');
    // absents en base → chaînes vides (NULL honnête)
    const v = editionInitiale({ codeInsee: '92050', communeNom: 'Nanterre', destCanal: 'email', destEmail: 'x@y.fr', destUrlFormulaire: null, destAdressePostale: null });
    expect(v.emailType).toBe('');
    expect(v.telephoneStandard).toBe('');
  });
  it('problemeUrlOuverture : vide/invalide → raison ; http(s) → null', () => {
    expect(problemeUrlOuverture('')).toMatch(/aucune URL/);
    expect(problemeUrlOuverture('ftp://x')).toMatch(/invalide/);
    expect(problemeUrlOuverture('https://teleservice.paris.fr')).toBeNull();
  });
});

describe('S17 — ordre des canaux (préférence décroissante) + présélection téléservice', () => {
  it('l’ordre est téléservice → e-mail → courrier → inconnu', () => {
    expect(CANAUX_ORDONNES.map((o) => o.value)).toEqual(['formulaire', 'email', 'courrier', 'inconnu']);
  });

  it('commune AVEC url_formulaire connue → ouvre sur « formulaire », URL pré-remplie, suggestion signalée (même si canal enregistré ≠)', () => {
    const e = editionInitiale({ codeInsee: '75056', communeNom: 'Paris', destCanal: 'inconnu', destEmail: '', destUrlFormulaire: 'https://teleservice.paris.fr', destAdressePostale: '' });
    expect(e.canal).toBe('formulaire');
    expect(e.urlFormulaire).toBe('https://teleservice.paris.fr');
    expect(e.suggestionTeleservice).toBe(true);
  });

  it('S18 — editionInitiale porte téléphone / responsable / date de vérification du protocole', () => {
    const e = editionInitiale({ codeInsee: '75056', communeNom: 'Paris', destCanal: 'formulaire', destEmail: null, destUrlFormulaire: 'https://adsconsult.paris.fr', destAdressePostale: null, destTelephone: '01 42 76 40 40', destResponsableNom: 'Charles Chenel', destProtocoleVerifieLe: '2026-08-03' });
    expect(e.telephone).toBe('01 42 76 40 40');
    expect(e.responsableNom).toBe('Charles Chenel');
    expect(e.protocoleVerifieLe).toBe('2026-08-03');
  });

  it('commune SANS url_formulaire → ouvre sur son canal enregistré, aucune présélection', () => {
    const e = editionInitiale({ codeInsee: '92050', communeNom: 'Nanterre', destCanal: 'email', destEmail: 'x@y.fr', destUrlFormulaire: '', destAdressePostale: '' });
    expect(e.canal).toBe('email');
    expect(e.suggestionTeleservice).toBe(false);
    // commune vraiment inconnue → 'inconnu', jamais 'formulaire' deviné
    const vierge = editionInitiale({ codeInsee: '78475', communeNom: 'Osmoy', destCanal: null, destEmail: null, destUrlFormulaire: null, destAdressePostale: null });
    expect(vierge.canal).toBe('inconnu');
    expect(vierge.suggestionTeleservice).toBe(false);
  });
});

const base = { code: '75056', email: '', urlFormulaire: '', adressePostale: '', note: '', telephone: '', responsableNom: '', telephoneStandard: '', emailType: '' };

describe('S16 — problemeContactUI refuse un canal incohérent (miroir contrainte DB)', () => {
  it('formulaire SANS URL → refusé', () => {
    expect(problemeContactUI({ ...base, canal: 'formulaire' })).toMatch(/URL de formulaire/);
  });
  it('formulaire AVEC URL valide → accepté (null)', () => {
    expect(problemeContactUI({ ...base, canal: 'formulaire', urlFormulaire: 'https://teleservice.paris.fr' })).toBeNull();
  });
  it('email sans e-mail → refusé ; email valide → accepté', () => {
    expect(problemeContactUI({ ...base, canal: 'email' })).toMatch(/e-mail/);
    expect(problemeContactUI({ ...base, canal: 'email', email: 'urbanisme@ville.fr' })).toBeNull();
  });
});

describe('S15 — corpsPatchContact transmet bien la note', () => {
  it('inclut note (trimé) dans le corps envoyé à PATCH /contact', () => {
    const corps = corpsPatchContact({
      code: '75056', canal: 'email', email: '  daj-cada@paris.fr ', urlFormulaire: '', adressePostale: '',
      note: '  Ancienne adresse courrier : BASU  ', telephone: '  01 42 76 40 40 ', responsableNom: '  Chenel  ',
      telephoneStandard: '  01 42 76 40 00 ', emailType: 'accueil',
    });
    expect(corps).toEqual({
      codeInsee: '75056', canal: 'email', email: 'daj-cada@paris.fr', urlFormulaire: '', adressePostale: '',
      note: 'Ancienne adresse courrier : BASU', telephone: '01 42 76 40 40', responsableNom: 'Chenel',
      telephoneStandard: '01 42 76 40 00', emailType: 'accueil',
    });
  });
});

describe('S15 — noteAuChangementCanal (trace en quittant le courrier)', () => {
  it('quitter courrier → pré-remplit la note avec l’adresse postale (si note vide)', () => {
    expect(noteAuChangementCanal('courrier', 'email', 'BASU, 6 promenade…, 75013 Paris', ''))
      .toBe('Ancienne adresse courrier : BASU, 6 promenade…, 75013 Paris');
  });
  it('ne touche PAS une note déjà saisie (jamais d’écrasement)', () => {
    expect(noteAuChangementCanal('courrier', 'email', 'BASU', 'ma note à moi')).toBe('ma note à moi');
  });
  it('changement entre canaux non-courrier → note inchangée', () => {
    expect(noteAuChangementCanal('email', 'formulaire', '', '')).toBe('');
    expect(noteAuChangementCanal('inconnu', 'email', '', '')).toBe('');
  });
});
