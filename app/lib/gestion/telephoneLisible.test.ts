import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { telephoneLisible } from './telephoneAffichage';

/**
 * 🔴🔴 Arno (28/11/2026, 12h17, point 1) — « les numéros de téléphone français doivent toujours être séparés d'un espace tous les 2 chiffres (ex. 02 32 45
 * 65 56), pas tout collé ; appliquer cette règle sur toute l'interface. » UNE fonction d'affichage partagée, `telephoneLisible`.
 */
describe('telephoneLisible : la règle d’affichage, partout', () => {
  it('français à 10 chiffres, collé, à points ou déjà espacé → « 02 32 45 65 56 »', () => {
    for (const x of ['0232456556', '02.32.45.65.56', '02-32-45-65-56', '02 32 45 65 56']) expect(telephoneLisible(x)).toBe('02 32 45 65 56');
    expect(telephoneLisible('0141991200')).toBe('01 41 99 12 00');
  });
  it('+33 ou 0033 → « +33 1 41 99 12 00 »', () => {
    expect(telephoneLisible('+33141991200')).toBe('+33 1 41 99 12 00');
    expect(telephoneLisible('0033141991200')).toBe('+33 1 41 99 12 00');
    expect(telephoneLisible('+33 1 41 99 12 00')).toBe('+33 1 41 99 12 00');
  });
  it('étranger ou non reconnu : tel qu’enregistré ; vide : rien', () => {
    expect(telephoneLisible('+32 476 12 34 56')).toBe('+32 476 12 34 56');
    expect(telephoneLisible('+212612345678')).toBe('+212612345678');
    expect(telephoneLisible('06 12')).toBe('06 12');
    expect(telephoneLisible('poste 42')).toBe('poste 42');
    expect(telephoneLisible('06828316740682831674')).toBe('06828316740682831674'); // deux numéros collés : jamais découpés au hasard
    expect(telephoneLisible(null)).toBe('');
    expect(telephoneLisible('')).toBe('');
  });
  it('rien n’est perdu : ce qui accompagnait le numéro le suit', () => {
    expect(telephoneLisible('0663219393 (M.Moreau)')).toBe('06 63 21 93 93 (M.Moreau)');
    expect(telephoneLisible('0612345678 (bureau)')).toBe('06 12 34 56 78 (fixe)');
  });
  it('idempotente : un numéro déjà lisible reste le même', () => {
    for (const x of ['06 12 34 56 78', '+33 6 12 34 56 78']) expect(telephoneLisible(telephoneLisible(x))).toBe(telephoneLisible(x));
  });
});

/** Les écrans, mails, PDF et récapitulatifs qui affichaient un numéro tel quel passent désormais par la règle commune (inventaire du 28/11/2026). */
describe('garde : chaque affichage repris passe par telephoneLisible', () => {
  const P = 'app/(admin)/admin/(protected)/';
  const FICHIERS = [
    `${P}gestion/ContactsTache.tsx`, `${P}gestion/TiersDuBien.tsx`, `${P}gestion/FenetreTache.tsx`, `${P}gestion/LocatairesConcernes.tsx`,
    `${P}gestion/FicheCopropriete.tsx`, `${P}gestion/ContactsSyndicCopropriete.tsx`, `${P}gestion/SyndicConnuLocation.tsx`, `${P}gestion/CartesPersonnes.tsx`,
    `${P}gestion/FicheSyndic.tsx`, `${P}location/AccueilLocation.tsx`, `${P}location/ArchivageProprietaire.tsx`, `${P}location/ClientsEtBiens.tsx`,
    `${P}location/SortieLocataires.tsx`, `${P}location/FicheInterventionPreavis.tsx`, `${P}location/ModaleDossierLocation.tsx`, `${P}location/SaisieCartes.tsx`,
    `${P}location/EcransLocation.tsx`, `${P}location/CreationProprietaires.tsx`, `${P}location/RattachementProprietaires.tsx`, `${P}location/PanneauxApporteur.tsx`,
    `${P}mon-espace/MesApporteurs.tsx`, `${P}transaction/OngletCompromis.tsx`, `${P}transaction/PersonnesDossier.tsx`, `${P}internautes/InternautesVue.tsx`,
    `${P}permis/ContactRendu.tsx`, `${P}permis/DemandesRendu.tsx`, 'app/page.tsx', 'app/espace/compte/FicheCompte.tsx', 'app/lib/pdf/certificatPdf.ts',
    'app/lib/location/mailNouvelleLocation.ts', 'app/lib/location/mailPortefeuille.ts', 'app/lib/location/ficheIntervention.ts', 'app/lib/location/edls.ts',
    'app/lib/gestion/mailTache.ts', 'app/lib/sitadel/demande.ts', 'app/lib/veille/relance.ts', 'app/lib/gestion/doublonSyndic.ts', 'app/lib/gestion/traceFiche.ts',
    'app/lib/gestion/syndics.ts',
  ];
  it.each(FICHIERS)('%s', (f) => {
    expect(readFileSync(f, 'utf8')).toMatch(/telephoneLisible\(/);
  });
  it('l’écran ne garde plus l’ancien format « national » de libphonenumber, ni l’affichage par paires de la saisie du syndic', () => {
    expect(readFileSync(`${P}internautes/InternautesVue.tsx`, 'utf8')).not.toContain('lib/internaute/formatTelephone');
    expect(readFileSync(`${P}gestion/FicheSyndic.tsx`, 'utf8')).not.toMatch(/\bformaterTelephone\(/);
  });
});
