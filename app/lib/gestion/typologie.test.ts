import { describe, it, expect } from 'vitest';
import {
  destinatairesDe, estAdresseSansReponse, indiceAutomatisme, normaliserObjet, palmares,
  REGLE_ANONYMISATION, REGLE_AUTOMATISME, signauxAutomatisme,
} from './typologie';

/**
 * LOT 0-bis — typologie du flux. Deux exigences sont testées AU MÊME TITRE que le comptage :
 *   · la RÈGLE de classement est énoncée dans le rapport (elle doit être jugeable, pas crue) ;
 *   · l'ANONYMISATION tient : aucun nom, aucune adresse complète ne peut atteindre le rapport.
 */

describe('signaux d’automatisme', () => {
  it('reconnaît les en-têtes qui trahissent un logiciel', () => {
    expect(signauxAutomatisme({ 'list-unsubscribe': '<https://x/y>' })).toEqual(['list-unsubscribe']);
    expect(signauxAutomatisme({ 'X-Mailer': 'PHPMailer 6.8' })).toEqual(['x-mailer']); // nom d'en-tête insensible à la casse
    expect(signauxAutomatisme({ 'auto-submitted': 'auto-generated' })).toEqual(['auto-submitted']);
    expect(signauxAutomatisme({ precedence: 'bulk' })).toEqual(['precedence']);
  });

  it('ne compte PAS une déclaration de NON-automatisme', () => {
    expect(signauxAutomatisme({ 'auto-submitted': 'no' })).toEqual([]);
    expect(signauxAutomatisme({ precedence: 'normal' })).toEqual([]);
    expect(signauxAutomatisme({ 'list-id': '' })).toEqual([]); // en-tête vide = aucun signal
  });

  it('ne compte JAMAIS les en-têtes de redirection : la sonde les a trouvés sur 100 % des messages', () => {
    expect(signauxAutomatisme({ 'delivered-to': 'a@b.fr', 'x-forwarded-for': 'a@b.fr c@d.fr' })).toEqual([]);
  });

  it('reconnaît une adresse sans réponse sur sa PARTIE LOCALE seule', () => {
    for (const a of ['no-reply@x.fr', 'noreply@x.fr', 'ne-pas-repondre@x.fr', 'notification@x.fr', 'MAILER-DAEMON@x.fr']) {
      expect(estAdresseSansReponse(a)).toBe(true);
    }
    expect(estAdresseSansReponse('gestion@criterimmo.fr')).toBe(false);
    expect(estAdresseSansReponse('marie@noreply-immobilier.fr')).toBe(false); // le domaine ne décide de rien
  });
});

describe('indice humain / automatique', () => {
  it('automatique dès UN signal, et dit lequel', () => {
    expect(indiceAutomatisme('a@x.fr', { 'list-unsubscribe': '<u>' })).toEqual({ automatique: true, motifs: ['list-unsubscribe'] });
    expect(indiceAutomatisme('no-reply@x.fr', {})).toEqual({ automatique: true, motifs: ['adresse sans réponse'] });
  });

  it('humain quand aucun signal — un mail ordinaire, même avec pièce jointe et objet criard', () => {
    expect(indiceAutomatisme('locataire@orange.fr', { subject: 'URGENT fuite', to: 'gestion@criterimmo.fr' }))
      .toEqual({ automatique: false, motifs: [] });
  });

  it('cumule les motifs (c’est ce cumul qu’on affiche pour juger la règle)', () => {
    const r = indiceAutomatisme('no-reply@x.fr', { precedence: 'bulk', 'x-mailer': 'Sarbacane' });
    expect(r.automatique).toBe(true);
    expect(r.motifs).toEqual(['precedence', 'x-mailer', 'adresse sans réponse']);
  });

  it('la règle est ÉCRITE, avec ses limites — c’est une exigence, pas du confort', () => {
    const texte = REGLE_AUTOMATISME.join('\n');
    expect(texte).toContain('probablement AUTOMATIQUE');
    expect(texte).toContain('adresse sans réponse');
    expect(texte).toContain('LIMITES CONNUES');
    expect(texte).toContain('PLANCHER'); // la part d'automatique est minorée : dit explicitement
    expect(texte).toContain('Delivered-To'); // pourquoi la redirection est exclue
  });
});

describe('destinataires — comptés, jamais rendus', () => {
  it('extrait les adresses de To et Cc, dédupliquées', () => {
    const d = destinatairesDe({ to: '"Martin, Jean" <j@x.fr>, k@y.fr', cc: 'J@X.FR, l@z.fr' });
    expect(d.sort()).toEqual(['j@x.fr', 'k@y.fr', 'l@z.fr']); // la virgule du nom affiché ne casse rien ; casse ignorée
  });

  it('rend une liste vide quand il n’y a ni To ni Cc lisibles (diffusion, Cci)', () => {
    expect(destinatairesDe({})).toEqual([]);
    expect(destinatairesDe({ to: 'undisclosed-recipients:;' })).toEqual([]);
  });
});

describe('normalisation d’un objet — c’est la porte d’entrée de l’anonymisation', () => {
  it('retire les préfixes de réponse EN CASCADE → un échange entier tombe dans UN gabarit', () => {
    expect(normaliserObjet('Re: TR: Re : Demande d’intervention')).toBe('Demande d’intervention');
    expect(normaliserObjet('Fwd: Re[2]: Demande d’intervention')).toBe('Demande d’intervention');
  });

  it('COUPE à la première séparation : en gérance le gabarit est en tête, l’identité dans la queue', () => {
    expect(normaliserObjet('Quittance de loyer — Mme Martin, 53 avenue des Ternes')).toBe('Quittance de loyer');
    expect(normaliserObjet('Avis d’échéance : Jean Dupont')).toBe('Avis d’échéance');
    expect(normaliserObjet('Intervention | plombier Durand')).toBe('Intervention');
  });

  it('remplace civilité + nom, adresses, dates, montants, références et chiffres', () => {
    expect(normaliserObjet('Fuite chez M. Durand')).toBe('Fuite chez <nom>');
    expect(normaliserObjet('Relance Madame De La Tour')).toBe('Relance <nom>');
    expect(normaliserObjet('Écrire à jean.dupont@orange.fr')).toBe('Écrire à <adresse>');
    expect(normaliserObjet('Quittance septembre 2026')).toBe('Quittance <date>');
    expect(normaliserObjet('Loyer du 01/09/2026')).toBe('Loyer du <date>');
    expect(normaliserObjet('Solde 1 250,50 €')).toBe('Solde <montant>');
    expect(normaliserObjet('Intervention MNG-23987')).toBe('Intervention <ref>');
    expect(normaliserObjet('Appartement 12 bis')).toBe('Appartement <n> bis');
  });

  it('tronque les objets longs (la queue porte le détail, donc le risque d’identité)', () => {
    const long = normaliserObjet(`Objet très long ${'blabla '.repeat(20)}`);
    expect(long.length).toBeLessThanOrEqual(71); // 70 + le caractère de troncature
    expect(long.endsWith('…')).toBe(true);
  });

  it('un objet vide ou absent devient un gabarit explicite, jamais une chaîne vide', () => {
    expect(normaliserObjet(null)).toBe('(sans objet)');
    expect(normaliserObjet('   ')).toBe('(sans objet)');
    expect(normaliserObjet('Re: ')).toBe('(sans objet)');
  });

  it('AUCUN objet normalisé ne laisse passer une adresse e-mail (garantie, pas intention)', () => {
    for (const o of ['contact jean@x.fr svp', 'RE: facture de a.b+c@sous.domaine.fr', 'x@y.fr']) {
      expect(normaliserObjet(o)).not.toMatch(/@/);
    }
  });
});

describe('palmarès sous seuil d’occurrences (k-anonymat)', () => {
  const valeurs = ['A', 'A', 'A', 'B', 'B', 'B', 'B', 'C', 'C', 'D'];

  it('n’affiche que ce qui revient au moins 3 fois, et ANNONCE ce qui est masqué', () => {
    const p = palmares(valeurs);
    expect(p.lignes).toEqual([{ valeur: 'B', nb: 4 }, { valeur: 'A', nb: 3 }]);
    expect(p.masquees).toBe(2);            // C (2 fois) et D (1 fois)
    expect(p.masqueesOccurrences).toBe(3); // jamais escamotées : comptées et dites
  });

  it('borne le classement et dit combien restent au-dessus du seuil', () => {
    const beaucoup = Array.from({ length: 20 }, (_, i) => Array(3).fill(`V${i}`)).flat();
    const p = palmares(beaucoup, 15);
    expect(p.lignes).toHaveLength(15);
    expect(p.restantes).toBe(5);
  });

  it('est DÉTERMINISTE à égalité de fréquence (deux passes, même rapport)', () => {
    expect(palmares(['B', 'B', 'B', 'A', 'A', 'A']).lignes).toEqual([{ valeur: 'A', nb: 3 }, { valeur: 'B', nb: 3 }]);
  });

  it('un seuil de 1 montre tout — réservé aux DOMAINES, qui n’identifient personne', () => {
    expect(palmares(['orange.fr', 'monga.io'], 15, 1).lignes).toEqual([{ valeur: 'monga.io', nb: 1 }, { valeur: 'orange.fr', nb: 1 }]);
  });

  it('la règle d’anonymisation est ÉCRITE et nomme le seuil', () => {
    const texte = REGLE_ANONYMISATION.join('\n');
    expect(texte).toContain('AU MOINS 3 FOIS');
    expect(texte).toContain('réduits à leur DOMAINE');
    expect(texte).toContain('seulement COMPTÉS');
  });
});
