import { describe, expect, it } from 'vitest';
import { boutonMailHtml, lienBoutonValide, MOT_SECOURS_BOUTON, ROUGE_BOUTON_MAIL } from './boutonMail';
import { mailPrevisite, paragraphesInvitationCompteRendu, paragraphesRecapAlertes, mailsAuxLocataires } from '../location/previsite';
import { cheminCompteRendu } from '../location/cheminCompteRendu';
import { mailCommun } from '../mon-espace/compromisCommun';

/**
 * 🔴 Arno (15/11/2026) — LE GROS BOUTON des mails internes : table + lien stylé en ligne, rouge de l'application, texte blanc, 48 px, centré ;
 * le lien de secours dessous ; la version texte inchangée ; jamais dans un mail aux clients.
 */
const LIEN = `https://advancement-reserved-overnight-durham.trycloudflare.com${cheminCompteRendu(555)}`;
const LOCS = [{ nom: 'TEST', prenom: 'Alice', emails: ['alice@exemple.test'] }];

describe('le bouton des mails internes', () => {
  it('HTML compatible avec les messageries : tables, lien stylé en ligne, rouge, texte blanc, 48 px (14 + 20 + 14), coins arrondis, centré ; secours dessous', () => {
    const h = boutonMailHtml('Rédiger le compte rendu', LIEN);
    expect(h).toMatch(/^<table role="presentation"/);
    expect(h).toContain(`bgcolor="${ROUGE_BOUTON_MAIL}"`);
    expect(h).toContain(`<a href="${LIEN}" target="_blank" style="display:block;padding:14px 24px;`);
    expect(h).toContain('line-height:20px;color:#ffffff;text-decoration:none;border-radius:12px');
    expect(h).toContain('>Rédiger le compte rendu</a>');
    expect(h).toContain('<td align="center"');
    expect(h).toContain(`${MOT_SECOURS_BOUTON} <a href="${LIEN}"`);
    expect(h).toContain('font-size:12px;line-height:1.5;color:#6b7280');
    expect(boutonMailHtml('X', 'https://a.test/?a=1&b="2"')).toContain('href="https://a.test/?a=1&amp;b=&quot;2&quot;"');
    expect(lienBoutonValide('javascript:alert(1)')).toBe(false);
    expect(lienBoutonValide(LIEN)).toBe(true);
  });
  it('l’invitation « Compte rendu de pré-visite à faire » : le bouton « Rédiger le compte rendu » vers la PAGE du compte rendu ; la version texte garde le lien', () => {
    const p = paragraphesInvitationCompteRendu({ adresse: '1 rue Test', locataires: LOCS, rdv: { jour: '2026-11-15', heure: '10:00' }, lien: LIEN });
    const m = mailPrevisite({ sorte: 'previsite_invitation_cr', de: 'g@exemple.test', a: ['a.jorel@sansvisavis.com'], cc: [], objet: 'o', paragraphes: p, qui: { mention: 'auto' }, signature: { html: '', texte: '' } });
    expect(m.html).toContain(`<a href="${LIEN}" target="_blank" style="display:block;`);
    expect(m.html).toContain('>Rédiger le compte rendu</a>');
    expect(m.html).toContain(MOT_SECOURS_BOUTON);
    expect(LIEN).toContain('/admin/location/previsite/555/compte-rendu');
    // la version texte : le lien seul, à sa place, comme avant
    expect(m.texte).toContain(`(après connexion si nécessaire).\n\n${LIEN}\n\nauto`);
    expect(m.texte).not.toContain('Rédiger le compte rendu');
  });
  it('le récapitulatif des alertes : chaque préavis, sa ligne puis son bouton ; texte inchangé', () => {
    const p = paragraphesRecapAlertes([{ adresse: '1 rue Test', locataires: LOCS, recuLe: '2026-11-01', lien: 'http://localhost:3000/admin/location?previsite=9' }]);
    const m = mailPrevisite({ sorte: 'previsite_alerte', de: 'g@exemple.test', a: ['a@exemple.test'], cc: [], objet: 'o', paragraphes: p, qui: { mention: 'auto' }, signature: { html: '', texte: '' } });
    expect(m.texte).toContain('· Alice TEST — 1 rue Test — reçu le 01/11/2026\n  http://localhost:3000/admin/location?previsite=9');
    expect(m.html).toContain('· Alice TEST — 1 rue Test — reçu le 01/11/2026</p><table role="presentation"');
    expect(m.html).toContain('>Ouvrir la ligne de ce préavis</a>');
  });
  it('les mails aux CLIENTS (locataires) : aucun bouton', () => {
    const m = mailsAuxLocataires({ sorte: 'previsite_compte_rendu', de: 'g@exemple.test', locataires: LOCS, objet: 'o', paragraphesDe: () => ['Bonjour,', LIEN], qui: { mention: null }, signature: { html: '', texte: '' } });
    expect(m[0].html).not.toContain('data-bouton-mail');
    expect(m[0].html).not.toContain(MOT_SECOURS_BOUTON);
  });
  it('« Mon espace » (collaborateurs) : le même bouton « Renseigner mes clients », texte inchangé', () => {
    const lien = 'https://exemple.test/admin/mon-espace?affaire=99&cote=sortie&modifier=1';
    const m = mailCommun({ destinataire: { prenom: 'Pierre', nom: 'Pierre Thevenin' }, createur: 'Arnaud Jorel', quand: '2026-11-05', structure: 'CRITERIMMO',
      mandat: 'M-42', adresse: '12 rue de l’Essai, 75011 Paris', prixVente: 450000, honorairesTtc: 20000, sesCotes: ['sortie'], partage: [], clientsSaisis: 0, lien });
    expect(m.html).toContain(boutonMailHtml('Renseigner mes clients', lien));
    expect(m.texte).toContain(`Renseigner mes clients : ${lien}`);
  });
});
