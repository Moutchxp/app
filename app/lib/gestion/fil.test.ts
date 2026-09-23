import { describe, it, expect } from 'vitest';
import { cleDuFil, cleRacine, cleRepli, identifiantsMessage, pourComparaison } from './fil';

/**
 * LOT 3 — la clé de fil, voie PURE. Ce qui est en jeu : « un échange de six mails ne doit pas prendre six lignes ». Les
 * deux défauts possibles sont testés séparément — SOUS-fusionner (l'échange se coupe en deux) et SUR-fusionner (deux
 * affaires étrangères se mélangent). Le second serait bien plus grave ; aucun cas ne doit le produire.
 */

describe('identifiants d’un message', () => {
  it('prend le sien ET ceux qu’il cite, normalisés et dédupliqués', () => {
    expect(identifiantsMessage({ messageId: '<c@x.fr>', inReplyTo: '<b@x.fr>', references: ['<a@x.fr>', '<b@x.fr>'] }))
      .toEqual(['a@x.fr', 'b@x.fr', 'c@x.fr']); // l'ordre de References (chronologique) est conservé, b n'apparaît qu'une fois
  });

  it('écarte les identifiants vides et tolère les en-têtes absents', () => {
    expect(identifiantsMessage({ messageId: '<a@x.fr>' })).toEqual(['a@x.fr']);
    expect(identifiantsMessage({ messageId: '', inReplyTo: null, references: null })).toEqual([]);
    expect(identifiantsMessage({ messageId: '<a@x.fr>', references: ['', '  '] })).toEqual(['a@x.fr']);
  });
});

describe('clé racine — pourquoi la racine et pas le Message-ID', () => {
  it('prend la PREMIÈRE référence : le plus ancien ancêtre connu de la chaîne', () => {
    expect(cleRacine({ messageId: '<d@x.fr>', inReplyTo: '<c@x.fr>', references: ['<a@x.fr>', '<b@x.fr>', '<c@x.fr>'] }))
      .toBe('a@x.fr');
  });

  it('à défaut l’In-Reply-To, à défaut son propre Message-ID', () => {
    expect(cleRacine({ messageId: '<b@x.fr>', inReplyTo: '<a@x.fr>' })).toBe('a@x.fr');
    expect(cleRacine({ messageId: '<a@x.fr>' })).toBe('a@x.fr');
  });

  it('DEUX réponses à un parent ABSENT de la boîte tombent dans le MÊME fil', () => {
    const r1 = cleRacine({ messageId: '<r1@x.fr>', inReplyTo: '<absent@x.fr>' });
    const r2 = cleRacine({ messageId: '<r2@x.fr>', references: ['<absent@x.fr>'] });
    expect(r1).toBe(r2); // c'est tout l'intérêt de la racine : on n'a jamais vu le parent, elles se rejoignent quand même
  });

  it('et quand le parent arrive ENFIN, sa clé est la même : il rejoint le fil au lieu d’en ouvrir un second', () => {
    expect(cleRacine({ messageId: '<absent@x.fr>' })).toBe('absent@x.fr');
  });

  it('rend une chaîne vide quand le message ne porte aucun identifiant (l’appelant posera un repli)', () => {
    expect(cleRacine({ messageId: '' })).toBe('');
  });
});

describe('forme de comparaison — tolérante à la casse, des DEUX côtés', () => {
  it('retire les chevrons et minuscule tout', () => {
    expect(pourComparaison('<A-1@Exemple.FR>')).toBe('a-1@exemple.fr');
    expect(pourComparaison('A-1@exemple.fr')).toBe('a-1@exemple.fr');
  });

  it('un serveur qui change la casse en route ne coupe PAS l’échange en deux', () => {
    expect(pourComparaison('<ABC@Mail.Gmail.COM>')).toBe(pourComparaison('abc@mail.gmail.com'));
  });

  it('ne rapproche JAMAIS deux identifiants réellement différents (sur-fusion impossible)', () => {
    expect(pourComparaison('<a@x.fr>')).not.toBe(pourComparaison('<b@x.fr>'));
    expect(pourComparaison('<a@x.fr>')).not.toBe(pourComparaison('<a@y.fr>'));
  });
});

describe('message sans aucun identifiant', () => {
  it('reçoit une clé qui n’appartient qu’à lui — jamais fusionné au hasard', () => {
    const a = cleRepli(12, new Date('2026-09-23T10:00:00Z'));
    const b = cleRepli(13, new Date('2026-09-23T10:00:00Z'));
    expect(a).not.toBe(b);
    expect(a).toContain('sans-identifiant');
  });

  it('cleDuFil choisit la racine si elle existe, le repli sinon', () => {
    const le = new Date('2026-09-23T10:00:00Z');
    expect(cleDuFil({ messageId: '<b@x.fr>', inReplyTo: '<a@x.fr>' }, 1, le)).toBe('a@x.fr');
    expect(cleDuFil({ messageId: '' }, 7, le)).toBe(cleRepli(7, le));
  });
});
