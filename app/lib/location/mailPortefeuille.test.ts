import { describe, expect, it } from 'vitest';
import { htmlMail, ligneValeur, objetMail, phraseTotaux, texteMail, totaux, type DonneesMail } from './mailPortefeuille';

/** Le mail d'entrée / sortie du portefeuille (Arno, 18/10/2026) — composé sans base ni envoi. */
const base = (o: Partial<DonneesMail> = {}): DonneesMail => ({
  sens: 'sortie', auteur: { nom: 'Arno', email: 'a.jorel@sansvisavis.com' }, quand: '2026-10-18T12:32:00Z', tuile: 'Location',
  proprietaires: [{ nom: 'CAUCHY Thierry et Joyce', telephone: '06 76 26 84 08', email: 'tcauchy@exemple.test', adresse: '1 rue A, 92400 Courbevoie', mandatGestion: 'MG 2020-07', mandatTransaction: null }],
  lots: [
    { lotId: 1, adresse: '54 avenue Puvis de Chavannes, COURBEVOIE', numero: '173', type: 'Studio', famille: 'Logement', surface: 24.5, etage: '3', annexes: ['Cave n° 12'],
      locataires: ['VABRE Damien'], clotureLe: '2026-10-18', valeur: { loyer: 900, taux: 6, mensuelHT: 54 } },
    { lotId: 2, adresse: '54 avenue Puvis de Chavannes, COURBEVOIE', numero: '174', type: 'Studio', famille: 'Logement', surface: null, etage: null, annexes: [],
      locataires: [], clotureLe: null, valeur: { loyer: null, taux: 6, mensuelHT: null } },
  ],
  origine: { motif: 'Mise en vente', sousMotif: 'Par une autre agence', precision: 'Compromis signé le 10/10' },
  tva: 0.2, lienFiche: 'https://exemple.test/admin/location/proprietaire/46', ...o,
});

describe('mail de sortie / d’entrée du portefeuille', () => {
  it('objet : QUOI — QUI — COMBIEN de lots — COMBIEN d’honoraires par mois', () => {
    expect(objetMail(base())).toBe('Sortie de gestion — CAUCHY Thierry et Joyce — 2 lots — −54,00 € HT/mois');
    expect(objetMail(base({ sens: 'entree', origine: null, lots: [base().lots[0]] }))).toBe('Nouveau mandat de gestion — CAUCHY Thierry et Joyce — 1 lot — +54,00 € HT/mois');
    expect(objetMail(base({ sens: 'entree', reactivation: true, origine: null }))).toMatch(/^Retour en gestion — /);
  });

  it('valorisation : loyer × taux = honoraires ; totaux HT / TTC, mois / an ; lot sans loyer exclu et compté', () => {
    expect(totaux(base())).toEqual({ mensuelHT: 54, mensuelTTC: 64.8, annuelHT: 648, annuelTTC: 777.6, lotsSansValeur: 1, lotsValorises: 1 });
    expect(ligneValeur({ loyer: 900, taux: 6, mensuelHT: 54 })).toBe('900,00 € × 6 % = 54,00 € HT / mois');
    expect(ligneValeur({ loyer: null, taux: 6, mensuelHT: null })).toBe('loyer de départ non renseigné — lot exclu du total');
    expect(ligneValeur({ loyer: 800, taux: null, mensuelHT: null })).toContain('taux de gestion non renseigné');
    expect(phraseTotaux(base())).toEqual([
      'Honoraires de gestion perdus : 54,00 € HT / mois (64,80 € TTC) · 648,00 € HT / an (777,60 € TTC)',
      '1 lot sans loyer de départ ou sans taux : exclu du total.',
    ]);
    expect(phraseTotaux(base({ sens: 'entree' }))[0]).toMatch(/^Honoraires de gestion générés/);
  });

  it('contenu complet : qui, propriétaire, lots (location close), origine + précision telle que saisie, lien', () => {
    const t = texteMail(base());
    expect(t).toContain('QUI : Arno <a.jorel@sansvisavis.com>');
    expect(t).toContain('depuis la tuile Location');
    expect(t).toContain('CAUCHY Thierry et Joyce · 06 76 26 84 08 · tcauchy@exemple.test · 1 rue A, 92400 Courbevoie');
    expect(t).toContain('Mandat de gestion : MG 2020-07');
    expect(t).toContain('54 avenue Puvis de Chavannes, COURBEVOIE · lot 173');
    expect(t).toContain('Studio · Logement');
    expect(t).toContain('24,5 m²');
    expect(t).toContain('annexes : Cave n° 12');
    expect(t).toContain('locataire : VABRE Damien — location close le 18/10/2026');
    expect(t).toContain('- Mise en vente — Par une autre agence');
    expect(t).toContain('- Précision : « Compromis signé le 10/10 »');
    expect(t).toContain('Fiche du propriétaire : https://exemple.test/admin/location/proprietaire/46');
    const h = htmlMail(base());
    expect(h).toContain('max-width:600px');
    expect(h).toContain('#a30402');
    expect(h).toContain('Compromis signé le 10/10');
    expect(h).toContain('href="https://exemple.test/admin/location/proprietaire/46"');
    expect(h).toContain('−54,00');
  });

  it('le HTML échappe ce qui a été saisi', () => {
    const h = htmlMail(base({ origine: { motif: 'Litige', sousMotif: null, precision: '<script>x</script> & co' } }));
    expect(h).not.toContain('<script>x');
    expect(h).toContain('&lt;script&gt;x&lt;/script&gt; &amp; co');
  });

  it('sortie d’une ANNEXE seule : objet « Sortie d’annexe — NOM — annexe — logement d’origine », sans valorisation sans loyer propre', () => {
    const annexe = base({ origine: null, annexe: { libelle: 'Parking n° 7 · lot 412', logement: '54 avenue Puvis de Chavannes, COURBEVOIE · lot 173' },
      lots: [{ ...base().lots[1], numero: '412', type: null, famille: null, valeur: { loyer: null, taux: null, mensuelHT: null } }] });
    expect(objetMail(annexe)).toBe('Sortie d’annexe — CAUCHY Thierry et Joyce — Parking n° 7 · lot 412 — 54 avenue Puvis de Chavannes, COURBEVOIE · lot 173');
    expect(texteMail(annexe)).toContain('ANNEXE : Parking n° 7 · lot 412 — logement d’origine : 54 avenue Puvis de Chavannes, COURBEVOIE · lot 173');
    expect(texteMail(annexe)).not.toContain('VALORISATION');
    expect(htmlMail(annexe)).not.toContain('Honoraires de gestion');
    // Avec un loyer propre (un parking loué seul), la valorisation reste.
    const louee = base({ origine: null, annexe: { libelle: 'Parking n° 7 · lot 412', logement: 'lot 173' }, lots: [{ ...base().lots[0], valeur: { loyer: 120, taux: 6, mensuelHT: 7.2 } }] });
    expect(objetMail(louee)).toBe('Sortie d’annexe — CAUCHY Thierry et Joyce — Parking n° 7 · lot 412 — lot 173 — −7,20\u00a0€ HT/mois');
    expect(texteMail(louee)).toContain('VALORISATION');
  });
});
