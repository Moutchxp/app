import { describe, it, expect } from 'vitest';
import {
  adressesUniques, copiesAvis, dateFinBail, enumerer, mailAccuseConge, mailAdhocPreavis, mailAdhocSortie, mailsDuPreavis,
  objetAdhocSortie, prenomNom, type DonneesPreavisMails,
} from './mailsPreavisSortie';

/**
 * ══ LOCATION — LES MAILS AUTOMATIQUES DU PRÉAVIS ET DE LA SORTIE (Arno, 05/11/2026). MODULE PUR. ══════════════════════════
 * Dates de fin, destinataires et copies, texte d'Arno, bien hors gestion, locataire sans e-mail.
 */

const D: DonneesPreavisMails = {
  adresse: '4 rue Fictive, 92800 Puteaux', proprietaire: 'DUPONT Jean', enGestion: true,
  locataires: [
    { occupationId: 11, nom: 'BERNARD Alice', prenom: null, emails: ['alice@exemple.test'] },
    { occupationId: 12, nom: 'MARTIN', prenom: 'Paul', emails: ['paul@exemple.test', 'PAUL@exemple.test', 'pas-une-adresse'] },
  ],
  recuLe: '2026-11-10', choix: { mode: 'mois', duree: 1 }, expediteur: 'gestion@criterimmo.fr',
  valideur: { nom: 'Arno JOREL', email: 'a.jorel@sansvisavis.com' }, signature: { html: '', texte: '' },
  // 🔴 Arno (05/11/2026, 460) — les partenaires viennent de la liste « Préavis » (ici, l'amorce : ADHOC).
  partenaires: ['gestion.criterimmo@gmail.com'],
};

describe('la date de fin du bail : réception + durée, jour pour jour', () => {
  it('10/11 + 1 mois → 10/12 ; + 3 mois → 10/02', () => {
    expect(dateFinBail('2026-11-10', { mode: 'mois', duree: 1 })).toBe('2026-12-10');
    expect(dateFinBail('2026-11-10', { mode: 'mois', duree: 3 })).toBe('2027-02-10');
  });

  it('31/01 + 1 mois → le dernier jour de février (28, ou 29 une année bissextile)', () => {
    expect(dateFinBail('2027-01-31', { mode: 'mois', duree: 1 })).toBe('2027-02-28');
    expect(dateFinBail('2028-01-31', { mode: 'mois', duree: 1 })).toBe('2028-02-29');
  });

  it('3 mois : 30/11 → 28/02 ; 31/03 → 30/06 ; à cheval sur l’année', () => {
    expect(dateFinBail('2026-11-30', { mode: 'mois', duree: 3 })).toBe('2027-02-28');
    expect(dateFinBail('2027-03-31', { mode: 'mois', duree: 3 })).toBe('2027-06-30');
    expect(dateFinBail('2026-12-15', { mode: 'mois', duree: 1 })).toBe('2027-01-15');
  });

  it('la date maximale saisie à la main est gardée telle quelle', () => {
    expect(dateFinBail('2026-11-10', { mode: 'date_manuelle', dateMax: '2027-01-05' })).toBe('2027-01-05');
  });
});

describe('les noms et les adresses', () => {
  it('« Prénom Nom » : prénom saisi, ou nom WIPPIMMO « NOM Prénom » remis dans l’ordre', () => {
    expect(prenomNom({ nom: 'MARTIN', prenom: 'Paul' })).toBe('Paul MARTIN');
    expect(prenomNom({ nom: 'BERNARD Alice', prenom: null })).toBe('Alice BERNARD');
    expect(prenomNom({ nom: 'DE LA TOUR Marie-Anne', prenom: null })).toBe('Marie-Anne DE LA TOUR');
    expect(prenomNom({ nom: 'SCI LES TILLEULS', prenom: null })).toBe('SCI LES TILLEULS');
    expect(prenomNom({ nom: 'Dupont', prenom: '' })).toBe('Dupont');
  });

  it('énumération française', () => {
    expect(enumerer(['A'])).toBe('A');
    expect(enumerer(['A', 'B'])).toBe('A et B');
    expect(enumerer(['A', 'B', 'C'])).toBe('A, B et C');
  });

  it('adresses : valides, sans doublon (casse ignorée), hors exclusions', () => {
    expect(adressesUniques(['a@x.fr', 'A@X.fr', 'nope', null, 'b@x.fr'], ['b@x.fr'])).toEqual(['a@x.fr']);
    expect(copiesAvis('gestion@criterimmo.fr', { email: 'gestion@criterimmo.fr' }, ['l@x.fr'])).toEqual(['gestion@criterimmo.fr']);
    expect(copiesAvis('gestion@criterimmo.fr', { email: null }, ['l@x.fr'])).toEqual(['gestion@criterimmo.fr']);
  });
});

describe('A) l’accusé de réception du congé, aux locataires', () => {
  it('UN mail : À = tous les locataires choisis ; Cc = gestion@ + la personne qui valide', () => {
    const m = mailAccuseConge(D)!;
    expect(m.de).toBe('gestion@criterimmo.fr');
    expect(m.a).toEqual(['alice@exemple.test', 'paul@exemple.test']);
    expect(m.cc).toEqual(['gestion@criterimmo.fr', 'a.jorel@sansvisavis.com']);
    expect(m.objet).toBe('Accusé de réception de votre congé — 4 rue Fictive, 92800 Puteaux');
  });

  it('le texte d’Arno, tel quel, avec les champs remplis (1 mois)', () => {
    const t = mailAccuseConge(D)!.texte;
    expect(t.startsWith('Bonjour Alice BERNARD et Paul MARTIN,\n\nNous accusons réception de votre congé pour le logement situé 4 rue Fictive, 92800 Puteaux, reçu le 10/11/2026.\n\n'
      + 'Votre préavis étant de 1 mois, votre bail prendra fin le 10/12/2026. Nous vous rappelons que le loyer et les charges restent dus jusqu’à la fin du préavis, y compris si vous quittez le logement avant cette date.')).toBe(true);
    expect(t).toContain('Notre équipe vous propose d’organiser dans les 10 jours une visite de pré-état des lieux de sortie.');
    expect(t).toContain('(article 22 de la loi n° 89-462 du 6 juillet 1989)');
    expect(t.endsWith('Nous restons à votre disposition pour toute question.')).toBe(true);
  });

  it('3 mois : la durée et la date de fin suivent', () => {
    expect(mailAccuseConge({ ...D, choix: { mode: 'mois', duree: 3 } })!.texte).toContain('Votre préavis étant de 3 mois, votre bail prendra fin le 10/02/2027.');
  });

  it('la signature Gmail suit le texte (texte ET HTML)', () => {
    const m = mailAccuseConge({ ...D, signature: { html: '<b>Service Gestion</b>', texte: 'Service Gestion' } })!;
    expect(m.texte.endsWith('Nous restons à votre disposition pour toute question.\n\n-- \nService Gestion')).toBe(true);
    expect(m.html).toContain('<div class="gmail_signature" style="margin-top:16px"><b>Service Gestion</b></div>');
  });

  it('un colocataire DÉCOCHÉ (rupture de couple) : seul celui qui part est nommé et destinataire', () => {
    const m = mailAccuseConge({ ...D, locataires: [D.locataires[0]] })!;
    expect(m.a).toEqual(['alice@exemple.test']);
    expect(m.texte.startsWith('Bonjour Alice BERNARD,')).toBe(true);
    expect(m.texte).not.toContain('MARTIN');
  });

  it('le HTML échappe ce qui vient de la base', () => {
    expect(mailAccuseConge({ ...D, adresse: '1 rue <b>X</b>' })!.html).toContain('1 rue &lt;b&gt;X&lt;/b&gt;');
  });
});

describe('le locataire sans e-mail : signalé, jamais bloquant', () => {
  it('un sans e-mail : il est listé ; le mail part aux autres', () => {
    const r = mailsDuPreavis({ ...D, locataires: [D.locataires[0], { occupationId: 12, nom: 'MARTIN', prenom: 'Paul', emails: [] }] });
    expect(r.sansEmail).toEqual(['Paul MARTIN']);
    expect(r.mails.map((m) => m.sorte)).toEqual(['preavis_locataires', 'preavis_adhoc']);
    expect(r.mails[0].a).toEqual(['alice@exemple.test']);
    // Il reste NOMMÉ dans l'accusé : le congé est le sien aussi.
    expect(r.mails[0].texte.startsWith('Bonjour Alice BERNARD et Paul MARTIN,')).toBe(true);
  });

  it('AUCUN n’a d’e-mail : pas d’accusé ; ADHOC est informé, et le mail le dit à la place de la copie', () => {
    const r = mailsDuPreavis({ ...D, locataires: D.locataires.map((l) => ({ ...l, emails: [] })) });
    expect(r.sansEmail).toEqual(['Alice BERNARD', 'Paul MARTIN']);
    expect(r.mails.map((m) => m.sorte)).toEqual(['preavis_adhoc']);
    expect(r.mails[0].texte).toContain('Aucun des locataires n’a d’adresse e-mail connue : l’accusé de réception ne leur a pas été envoyé par mail.');
    expect(r.mails[0].texte).not.toContain('Copie du mail');
  });
});

describe('B) l’information à ADHOC, pour le préavis', () => {
  it('À = ADHOC ; Cc = gestion@ + la personne qui valide ; objet ; texte ; puis la copie complète du mail A', () => {
    const a = mailAccuseConge(D)!;
    const b = mailAdhocPreavis(D, a)!;
    expect(b.a).toEqual(['gestion.criterimmo@gmail.com']);
    expect(b.cc).toEqual(['gestion@criterimmo.fr', 'a.jorel@sansvisavis.com']);
    expect(b.objet).toBe('[Information] Préavis reçu — 4 rue Fictive, 92800 Puteaux — Alice BERNARD et Paul MARTIN');
    expect(b.texte.startsWith('Bonjour,\n\nPour information, nous avons reçu le 10/11/2026 le congé de Alice BERNARD et Paul MARTIN, locataires du logement situé '
      + '4 rue Fictive, 92800 Puteaux (propriétaire : DUPONT Jean). Fin du bail : 10/12/2026.\n\nCe message est purement informatif : aucune action n’est attendue de votre part. '
      + 'Vous trouverez ci-dessous la copie du mail envoyé aux locataires.')).toBe(true);
    expect(b.texte).toContain(`À : alice@exemple.test, paul@exemple.test\nCc : gestion@criterimmo.fr, a.jorel@sansvisavis.com\nObjet : ${a.objet}\n\n${a.texte}`);
    expect(b.html).toContain(a.html);
  });

  it('notre signature AVANT la copie (comme un transfert), une seule fois pour nous', () => {
    const d = { ...D, signature: { html: '<b>Service Gestion</b>', texte: 'Service Gestion' } };
    const b = mailAdhocPreavis(d, mailAccuseConge(d))!;
    expect(b.texte).toContain('copie du mail envoyé aux locataires.\n\n-- \nService Gestion\n\n---------- Copie du mail envoyé aux locataires ----------');
    expect(b.texte.endsWith('Nous restons à votre disposition pour toute question.\n\n-- \nService Gestion')).toBe(true);
    expect(b.texte.split('-- \nService Gestion')).toHaveLength(3);
  });

  it('un seul locataire : « locataire » au singulier', () => {
    const d = { ...D, locataires: [D.locataires[0]] };
    expect(mailAdhocPreavis(d, mailAccuseConge(d))!.texte).toContain('le congé de Alice BERNARD, locataire du logement');
  });

  it('🔴 bien HORS gestion : AUCUN mail ADHOC ; l’accusé aux locataires part quand même', () => {
    const r = mailsDuPreavis({ ...D, enGestion: false });
    expect(r.mails.map((m) => m.sorte)).toEqual(['preavis_locataires']);
    expect(mailAdhocPreavis({ ...D, enGestion: false }, null)).toBeNull();
  });
});

describe('l’information à ADHOC, pour la sortie', () => {
  const S = {
    adresse: '4 rue Fictive, 92800 Puteaux', lotId: 7, type: 'Appartement', etage: '3', porte: 'G', annexes: ['Cave n° 7'], proprietaire: 'DUPONT Jean',
    sortants: [{ nom: 'BERNARD Alice', entree: '2022-09-01', sortie: '2026-11-04' }], vacant: false, restants: ['MARTIN Paul'],
    auteur: { nom: 'Arno JOREL', email: 'a.jorel@sansvisavis.com' }, quand: '2026-11-04T10:00:00Z',
    enGestion: true, expediteur: 'gestion@criterimmo.fr', signature: { html: '', texte: '' }, partenaires: ['gestion.criterimmo@gmail.com'] as string[],
  };

  it('À = ADHOC ; Cc = gestion@ + la personne qui valide ; logement, adresse, propriétaire, sortants avec leurs dates, reste loué à', () => {
    const m = mailAdhocSortie(S)!;
    expect(m.sorte).toBe('sortie_adhoc');
    expect(m.a).toEqual(['gestion.criterimmo@gmail.com']);
    expect(m.cc).toEqual(['gestion@criterimmo.fr', 'a.jorel@sansvisavis.com']);
    expect(m.objet).toBe(objetAdhocSortie('4 rue Fictive, 92800 Puteaux'));
    expect(m.objet).toBe('[Information] Sortie de locataire(s) — 4 rue Fictive, 92800 Puteaux');
    expect(m.texte).toContain('Logement : Appartement · 3e étage · porte G — avec Cave n° 7\nAdresse : 4 rue Fictive, 92800 Puteaux\nPropriétaire : DUPONT Jean');
    expect(m.texte).toContain('Locataire sorti :\n- Alice BERNARD — entré(e) le 01/09/2022, sorti(e) le 04/11/2026');
    expect(m.texte).toContain('Le logement reste loué à Paul MARTIN.');
  });

  it('tous sortis : « logement vacant » ; plusieurs sortants : pluriel', () => {
    const m = mailAdhocSortie({ ...S, vacant: true, restants: [],
      sortants: [...S.sortants, { nom: 'MARTIN Paul', entree: null, sortie: '2026-11-04' }] })!;
    expect(m.texte).toContain('Le logement est désormais vacant.');
    expect(m.texte).toContain('Locataires sortis :\n- Alice BERNARD');
    expect(m.texte).toContain('- Paul MARTIN — date d’entrée non renseignée, sorti(e) le 04/11/2026');
  });

  it('🔴 bien HORS gestion : aucun mail', () => {
    expect(mailAdhocSortie({ ...S, enGestion: false })).toBeNull();
  });
});

describe('🔴 Arno (05/11/2026, 460) — les partenaires viennent de la LISTE configurée (plus aucune adresse dans le code)', () => {
  it('préavis : À = toute la liste, DANS L’ORDRE (doublon ignoré) ; Cc = gestion@ + la personne qui valide', () => {
    const b = mailAdhocPreavis({ ...D, partenaires: ['monga@x.fr', 'gestion.criterimmo@gmail.com', 'MONGA@x.fr'] }, mailAccuseConge(D))!;
    expect(b.a).toEqual(['monga@x.fr', 'gestion.criterimmo@gmail.com']);
    expect(b.cc).toEqual(['gestion@criterimmo.fr', 'a.jorel@sansvisavis.com']);
  });
  it('liste VIDE (ou case décochée) : aucun mail partenaire ; l’accusé aux locataires part toujours', () => {
    const r = mailsDuPreavis({ ...D, partenaires: [] });
    expect(r.mails.map((m) => m.sorte)).toEqual(['preavis_locataires']);
  });
  it('sortie : À = la liste « Sorties » dans l’ordre ; vide : aucun mail', () => {
    const S = { adresse: '4 rue Fictive', lotId: 7, type: 'Appartement', etage: '3', porte: 'G', annexes: [], proprietaire: 'DUPONT Jean',
      sortants: [{ nom: 'BERNARD Alice', entree: '2022-09-01', sortie: '2026-11-04' }], vacant: true, restants: [],
      auteur: { nom: 'Arno JOREL', email: 'a.jorel@sansvisavis.com' }, quand: '2026-11-04T10:00:00Z', enGestion: true, expediteur: 'gestion@criterimmo.fr',
      signature: { html: '', texte: '' } };
    expect(mailAdhocSortie({ ...S, partenaires: ['b@x.fr', 'a@x.fr'] })!.a).toEqual(['b@x.fr', 'a@x.fr']);
    expect(mailAdhocSortie({ ...S, partenaires: [] })).toBeNull();
  });
});
