// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  bandeauGli, caseColoree, htmlNouvelleLocation, INTRODUCTION, lignesBailMail, lotDuMail, SIGNATURE, statutProprietaires, texteNouvelleLocation,
  type DonneesNouvelleLocation, type LotSource, type PersonneMail,
} from './mailNouvelleLocation';

/**
 * 🔴 Arno (21/10/2026) — LE MAIL « NOUVELLE LOCATION » DANS GMAIL : Gmail efface la couleur de fond des <div> (pastille verte
 * devenue blanc sur blanc, ronds ⚠ / ✕ disparus). On rejoue ici le « rendu Gmail » : les styles des <div> et <span> retirés, le
 * raccourci `background:` ignoré — aucune zone colorée ne doit disparaître, aucun texte blanc ne doit rester sans fond.
 */
const ADR = { voie: '12 rue Victor Hugo', codePostal: '92400', commune: 'Courbevoie' };
const P = (nom: string, prenom: string, plus: Partial<PersonneMail> = {}): PersonneMail => ({ civilite: 'M.', nom, prenom, qualite: null, adresse: null, mobiles: [], fixes: [], emails: [], note: null, ...plus });
const LOT: LotSource = { id: 1, principal: true, categorie: 'logement', typeLibelle: 'Appartement', nombrePieces: 3, meuble: false, nomAnnexe: null, parkingSituation: null, parkingType: null,
  ...ADR, porte: 'G', numLotCopro: '47', batiment: null, escalier: null, etage: null, precisionAcces: null, ascenseur: null, digicode: true, digicodeCode: '57B83',
  surfaceHabitable: null, surfaceCarrez: null, surfaceExterieure: null, surface: null, construction: null, chauffage: null, dpeClasse: null, dpeDate: null, dpeNonSoumis: null,
  syndic: null, derniereAg: null, assurancePno: null, pnoAnniversaire: null, entretiens: [], annotation: null, commentaire: null };
function donnees(plus: Partial<DonneesNouvelleLocation> = {}): DonneesNouvelleLocation {
  const parking = lotDuMail({ ...LOT, id: 2, principal: false, categorie: 'parking', typeLibelle: null, voie: '14 rue Victor Hugo', parkingType: 'box_simple' }, ADR);
  return {
    bailId: 1, entree: '2026-11-01', bien: ADR,
    statut: statutProprietaires({ proprietaires: [{ nom: 'M. DUPONT Jean', dejaEnGestion: false, depuis: null }], biensEnGestion: 1, mandats: [] }),
    proprietaires: [P('DUPONT', 'Jean')], lots: [lotDuMail(LOT, ADR), parking], gli: bandeauGli({ assurance: 'aucune', precision: null, garantPhysique: false }, []),
    locataires: [P('MARTIN', 'Sophie')], garants: [{ ...P('MARTIN', 'Henri'), garantit: ['Mme MARTIN Sophie'] }],
    bail: { loyer: { principal: 124000, provisions: 18000 }, lignes: lignesBailMail('2026-11-01', null, null) },
    driveUrl: 'https://drive.google.com/drive/folders/ABC', expediteur: 'gestion@criterimmo.fr', ...plus,
  };
}

/** Le « rendu Gmail » : styles des <div> / <span> retirés, raccourci `background:` ignoré. */
function gmail(html: string): Document {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const e of [...doc.querySelectorAll('div, span')]) e.removeAttribute('style');
  for (const e of [...doc.querySelectorAll('[style]')]) e.setAttribute('style', (e.getAttribute('style') ?? '').replace(/(^|;)\s*background\s*:[^;]*/gi, '$1'));
  return doc;
}
const fonds = (doc: Document): string[] => [...doc.querySelectorAll('[bgcolor]')].map((e) => (e.getAttribute('bgcolor') ?? '').toLowerCase());
const SOMBRES = ['#1d2433', '#2f7d4f', '#2f5bb5', '#9b1c1c', '#d64545', '#b7791f'];

describe('🔴 rendu Gmail : aucune zone colorée perdue', () => {
  it('jamais une couleur de fond sur un <div>, un <span>, un <p>, un <b> ou un <a> ; jamais le raccourci « background: »', () => {
    for (const d of [donnees(), donnees({ gli: bandeauGli(null, []), statut: statutProprietaires({ proprietaires: [{ nom: 'A', dejaEnGestion: true, depuis: '2020-01-01' }], biensEnGestion: 2, mandats: [] }) })]) {
      const html = htmlNouvelleLocation(d);
      expect(html).not.toMatch(/background\s*:/i);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      expect([...doc.querySelectorAll('div, span, p, b, a')].filter((e) => /background/i.test(e.getAttribute('style') ?? ''))).toEqual([]);
      // Toute « background-color » est sur une case qui porte AUSSI l'attribut bgcolor (même couleur).
      for (const e of [...doc.querySelectorAll('[style*="background-color"]')]) {
        expect(['TD', 'BODY', 'TABLE']).toContain(e.tagName);
        expect((e.getAttribute('style') ?? '').toLowerCase()).toContain(`background-color:${(e.getAttribute('bgcolor') ?? 'absent').toLowerCase()}`);
      }
    }
  });
  it('chaque zone colorée du modèle reste une case colorée : en-tête, pastille, bandeaux adresse et GLI, cartes, encadré loyer, bouton Drive, étiquettes', () => {
    const doc = gmail(htmlNouvelleLocation(donnees()));
    const f = fonds(doc);
    for (const [zone, couleur] of [['en-tête sombre', '#1d2433'], ['pastille NOUVEAU PROPRIÉTAIRE', '#2f7d4f'], ['encart du statut', '#e8f4ec'],
      ['bandeau « adresses différentes »', '#fdf3e1'], ['bandeau GLI rouge', '#fdecec'], ['rond ✕ du GLI', '#d64545'], ['cartes grises', '#fafafa'],
      ['encadré loyer', '#fbeaea'], ['bouton Drive', '#9b1c1c'], ['trait des blocs', '#9b1c1c']] as const) {
      expect(f, zone).toContain(couleur);
    }
    // La pastille de statut garde son texte ET son fond (le défaut constaté : blanc sur blanc).
    const pastille = [...doc.querySelectorAll('td[bgcolor="#2f7d4f"]')].find((t) => t.textContent?.includes('NOUVEAU'));
    expect(pastille?.textContent).toBe('NOUVEAUPROPRIÉTAIRE');
    // Les autres statuts : bleu (déjà en gestion), GLI vert ✓ et orange « ! ».
    const autre = fonds(gmail(htmlNouvelleLocation(donnees({ gli: bandeauGli({ assurance: 'gli', precision: 'AXA', garantPhysique: false }, []),
      statut: statutProprietaires({ proprietaires: [{ nom: 'A', dejaEnGestion: true, depuis: null }], biensEnGestion: 2, mandats: [] }) }))));
    expect(autre).toContain('#2f5bb5');
    expect(fonds(gmail(htmlNouvelleLocation(donnees({ gli: bandeauGli(null, []) }))))).toContain('#b7791f');
  });
  it('🔴 aucun texte blanc sans fond garanti : la case la plus proche porte un fond SOMBRE', () => {
    for (const d of [donnees(), donnees({ gli: bandeauGli({ assurance: 'gli', precision: null, garantPhysique: false }, []) })]) {
      const doc = gmail(htmlNouvelleLocation(d));
      const blancs = [...doc.querySelectorAll('[style]')].filter((e) => /(^|;)\s*color\s*:\s*#ffffff/i.test(e.getAttribute('style') ?? ''));
      expect(blancs.length).toBeGreaterThan(2);
      for (const e of blancs) {
        const fond = (e.closest('[bgcolor]')?.getAttribute('bgcolor') ?? '').toLowerCase();
        expect(SOMBRES, `${e.tagName} « ${e.textContent?.slice(0, 30)} »`).toContain(fond);
      }
      // Les textes de l'en-tête (des <div> dont Gmail retire le style) héritent du blanc de leur case sombre.
      const haut = doc.querySelector('td.haut') as HTMLElement;
      expect(haut.getAttribute('bgcolor')).toBe('#1d2433');
      expect(haut.getAttribute('style')).toContain('color:#ffffff');
    }
  });
  it('la fonction des cases colorées pose les DEUX (bgcolor et background-color)', () => {
    expect(caseColoree('#2f7d4f', 'color:#ffffff;', 'X')).toBe('<td bgcolor="#2f7d4f" style="background-color:#2f7d4f;color:#ffffff;">X</td>');
  });
});

describe('🔴 introduction, formule de fin, message d’accompagnement', () => {
  it('l’introduction et « Merci et belle journée, / L’équipe gestion » avant le pied', () => {
    const html = htmlNouvelleLocation(donnees());
    expect(INTRODUCTION).toEqual(['Bonjour,', 'Nous avons le plaisir de vous informer qu’un bien que nous gérons vient d’être loué. Vous trouverez ci-dessous le dossier complet pour l’enregistrer de votre côté. N’hésitez pas à revenir vers nous si une information vous manque.']);
    expect(html).toContain('Bonjour,<br>Nous avons le plaisir de vous informer qu’un bien que nous gérons vient d’être loué.');
    expect(html).not.toContain('Un bien en gestion vient d’être loué');
    expect(html.indexOf('Merci et belle journée,<br>L’équipe gestion')).toBeGreaterThan(html.indexOf('Ouvrir le dossier Drive du bail'));
    expect(html.indexOf('Merci et belle journée,')).toBeLessThan(html.indexOf('Pour toute question'));
    expect(SIGNATURE).toEqual(['Merci et belle journée,', 'L’équipe gestion']);
    const t = texteNouvelleLocation(donnees());
    expect(t).toContain(INTRODUCTION[1]);
    expect(t.indexOf('Merci et belle journée,')).toBeGreaterThan(t.indexOf('Dossier Drive') === -1 ? t.indexOf('Ouvrir le dossier Drive') : t.indexOf('Dossier Drive'));
  });
  it('VIDE (ou absent, ou blancs) : aucun encart', () => {
    for (const message of [undefined, null, { auteur: 'Arnaud Jorel', texte: '' }, { auteur: 'Arnaud Jorel', texte: '  \n ' }]) {
      expect(htmlNouvelleLocation(donnees({ message }))).not.toContain('Message de');
      expect(texteNouvelleLocation(donnees({ message }))).not.toContain('Message de');
    }
  });
  it('REMPLI : « Message de <Prénom Nom> », gris clair à trait gauche, APRÈS l’introduction et AVANT la pastille ; 5 000 caractères et retours à la ligne gardés', () => {
    const lignes = Array.from({ length: 50 }, (_, i) => `Ligne ${String(i + 1).padStart(2, '0')} ${'x'.repeat(91)}`);
    const texte = lignes.join('\n');
    expect(texte.length).toBeGreaterThanOrEqual(5000);
    const html = htmlNouvelleLocation(donnees({ message: { auteur: 'Arnaud Jorel', texte } }));
    const doc = gmail(html);
    const encart = [...doc.querySelectorAll('td[bgcolor="#fafafa"]')].find((t) => t.textContent?.startsWith('Message de Arnaud Jorel'));
    expect(encart).toBeDefined();
    expect(encart?.previousElementSibling?.getAttribute('bgcolor')).toBe('#e5e7eb');
    expect(encart?.querySelectorAll('br').length).toBe(50);
    expect(encart?.textContent).toContain('Ligne 50');
    expect(html.indexOf('Message de Arnaud Jorel')).toBeGreaterThan(html.indexOf('Nous avons le plaisir'));
    expect(html.indexOf('Message de Arnaud Jorel')).toBeLessThan(html.indexOf('NOUVEAU<br>PROPRIÉTAIRE'));
    const t = texteNouvelleLocation(donnees({ message: { auteur: 'Arnaud Jorel', texte } }));
    expect(t).toContain('── Message de Arnaud Jorel ──\nLigne 01');
    expect(t).toContain(lignes[49]);
  });
  it('ÉCHAPPÉ : un texte contenant <b> ou un script n’est jamais interprété', () => {
    const html = htmlNouvelleLocation(donnees({ message: { auteur: 'A <b>B</b>', texte: 'Bonjour <b>gras</b>\n<script>alert(1)</script> & co' } }));
    expect(html).toContain('Bonjour &lt;b&gt;gras&lt;/b&gt;<br>&lt;script&gt;alert(1)&lt;/script&gt; &amp; co');
    expect(html).toContain('Message de A &lt;b&gt;B&lt;/b&gt;');
    expect(html).not.toContain('<b>gras</b>');
    expect(html).not.toContain('<script>');
  });
});
