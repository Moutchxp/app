import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Câblage du lot COORDONNEES-CONNU dans la page de demande de certificat (EcranCertificat, app/page.tsx).
const page = readFileSync(path.join(process.cwd(), 'app/page.tsx'), 'utf8').replace(/\s+/g, ' ');
const ecran = page.slice(page.indexOf('function EcranCertificat('), page.indexOf('function appliqueMasqueTel('));

describe('internaute connecté : coordonnées connues', () => {
  it('lit le compte par la route de lecture (non connecté → null → rien ne change)', () => {
    expect(ecran).toContain('fetch("/api/internaute/coordonnees", { cache: "no-store" })');
    expect(ecran).toContain('const c = lireReponseCoordonnees(d);');
    expect(ecran).toContain('const [compte, setCompte] = useState<CoordonneesConnues | null>(null);');
  });
  it('préremplit depuis le COMPTE sans écraser une saisie commencée', () => {
    expect(ecran).toContain('setPrenom((v) => v || c.prenom || "");');
    expect(ecran).toContain('setEmail((v) => v || c.email || "");');
    // un indicatif seul (« +33 », posé par le champ affiché avant l'arrivée du compte) n'est pas une saisie
    expect(ecran).toContain('setTelephone((v) => (v.replace(/\\D/g, "").length > 4 ? v : c.telephone || v));');
  });
  it('rappel « Vos coordonnées » + « Modifier » ; ne demande que ce qui manque ; non connecté : tous les champs', () => {
    expect(ecran).toContain('id="rappel-coordonnees"');
    expect(ecran).toContain('onClick={() => setModifierIdentite(true)}');
    expect(ecran).toContain('compte === null || manquants.includes(k) || (modifierIdentite && k !== "telephone")');
    expect(ecran).toContain('{aSaisir("prenom") && <div>');
    expect(ecran).toContain('{aSaisir("nom") && <div>');
    expect(ecran).toContain('{aSaisir("telephone") && (');
    expect(ecran).toContain('{compte === null && ( <> <label className="mb-1 mt-3 block text-sm font-semibold text-svv-ink">Email');
  });
  it('e-mail et téléphone : cadenas de l’espace client (jamais modifiables ici)', () => {
    expect(ecran).toContain('<CadenasInfo cible="tunnel-email" />');
    expect(ecran).toContain('<CadenasInfo cible="tunnel-telephone" />');
  });
  it('prénom/nom modifiés → chemin EXISTANT de l’espace client (PATCH), avant la soumission', () => {
    expect(ecran).toContain('fetch("/api/internaute/espace/compte", { method: "PATCH",');
    expect(ecran).toContain('await majPrenomNomCompte(); await soumettre();');
  });
});

describe('adresse de résidence ≠ adresse analysée', () => {
  it('« Non » propose la dernière adresse de résidence SAISIE, jamais l’adresse analysée', () => {
    expect(ecran).toContain('if (!residenceAdresse && compte?.derniereResidence) setResidenceAdresse(compte.derniereResidence);');
    expect(ecran).not.toMatch(/setResidenceAdresse\((adresseChoisie|adresseBien|adresseAuto)\)/);
  });
  it('la question « résidence principale » reste posée à chaque analyse (elle porte sur le bien)', () => {
    expect(ecran).toContain('Le bien analysé est-il votre résidence principale ?');
  });
});

describe('consentements', () => {
  it('F1 (Écran A) et F2 (Écran B) : pas redemandés s’ils sont déjà valables, sinon proposés décochés', () => {
    expect(ecran).toContain('(t) => t.finalite !== "email_marketing" && !consentementDejaValable(compte, t.finalite),');
    expect(ecran).toContain('.filter((t) => t.finalite === "email_marketing" && !consentementDejaValable(compte, t.finalite))');
    // aucune case pré-cochée : l'état initial reste à false pour toutes les finalités
    expect(ecran).toContain('recontact_interne: false, email_marketing: false, retargeting_tiers: false,');
  });
});

describe('adresse de résidence principale : FACULTATIVE partout (décision d’Arno du 16/10/2026)', () => {
  const champsManquants = ecran.slice(ecran.indexOf('const champsManquants'), ecran.indexOf('const enErreur'));
  it('aucune règle « requis » sur l’adresse de résidence ; la question Oui/Non, elle, reste requise', () => {
    expect(champsManquants).not.toContain('residenceAdresse');
    expect(champsManquants).toContain('bienEstResidence === null && { cle: "residence"');
  });
  it('« Non » : le champ porte la mention « (facultatif) » ; vide → null dans le corps envoyé (jamais une chaîne vide)', () => {
    expect(ecran).toContain('Adresse de résidence principale <span className="font-normal text-svv-muted">(facultatif)</span>');
    expect(ecran).toContain('adresseResidence: bienEstResidence === false ? residenceAdresse.trim() || null : null,');
  });
  it('UN SEUL champ d’adresse à l’écran : le rappel n’en a aucun ; « Oui » → « le bien analysé » ; sans réponse → adresse du compte en lecture', () => {
    const rappel = ecran.slice(ecran.indexOf('id="rappel-coordonnees"'), ecran.indexOf('{(aSaisir("prenom") || aSaisir("nom"))'));
    expect(rappel).not.toContain('AdresseAutocomplete');
    expect(rappel).toContain('{bienEstResidence === true ? ( <p id="rappel-residence"');
    expect(rappel).toContain('<span className="font-semibold">le bien analysé</span>');
    expect(rappel).toContain(') : bienEstResidence === null && compte.derniereResidence ? (');
    expect(ecran.match(/<AdresseAutocomplete/g)).toHaveLength(1); // le seul : sous la question, réponse « Non »
    expect(ecran).not.toContain('"non renseignée"');
  });
});

