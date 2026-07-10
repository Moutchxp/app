import { describe, it, expect } from 'vitest';
import {
  deviceType,
  navigateurFamille,
  refererHote,
  bucketUtm,
  scoreTranche,
  communeInsee,
  estBot,
} from './contexte';

/**
 * M2 — LOT 2. Preuve d'ANONYMAT À L'ÉMISSION : chaque helper réduit une entrée brute (UA, referer, UTM,
 * score, commune) en un token non ré-identifiant OU `null`. On teste explicitement qu'une donnée SENSIBLE
 * en amont (email dans une URL, chemin de webmail, coordonnée, score exact) N'ATTEINT PAS la sortie.
 */

describe('deviceType — UA classé en famille grossière (jamais l’UA brut)', () => {
  it('mobile / tablette / desktop / inconnu', () => {
    expect(deviceType('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148')).toBe('mobile');
    expect(deviceType('Mozilla/5.0 (Linux; Android 13; Pixel) Mobile Safari')).toBe('mobile');
    expect(deviceType('Mozilla/5.0 (iPad; CPU OS 17_0) Safari')).toBe('tablette');
    expect(deviceType('Mozilla/5.0 (Linux; Android 13; SM-T500) Safari')).toBe('tablette'); // Android sans "Mobile"
    expect(deviceType('Mozilla/5.0 (Windows NT 10.0; Win64) Chrome/120')).toBe('desktop');
    expect(deviceType('')).toBe('inconnu');
    expect(deviceType(null)).toBe('inconnu');
  });
});

describe('navigateurFamille — famille grossière, conforme au CHECK, jamais la version', () => {
  it('classe les principaux navigateurs (dérivés avant génériques)', () => {
    expect(navigateurFamille('… Edg/120 …')).toBe('Edge');
    expect(navigateurFamille('… OPR/100 …')).toBe('Opera');
    expect(navigateurFamille('… SamsungBrowser/23 …')).toBe('Samsung');
    expect(navigateurFamille('… Firefox/119 …')).toBe('Firefox');
    expect(navigateurFamille('… Chrome/120 Safari/537 …')).toBe('Chrome');
    expect(navigateurFamille('… Version/17 Safari/605 …')).toBe('Safari');
    expect(navigateurFamille('un-truc-inconnu')).toBe('Autre');
    expect(navigateurFamille(null)).toBeNull();
  });
  it('la sortie respecte toujours le charset du CHECK 018', () => {
    for (const ua of ['Edg/1', 'OPR/1', 'Firefox', 'Chrome', 'Safari', 'x']) {
      const f = navigateurFamille(ua);
      if (f !== null) expect(f).toMatch(/^[A-Za-z0-9 ._-]{1,32}$/);
    }
  });
});

describe('refererHote — HÔTE seul, jamais chemin/requête (anti PII smuggling)', () => {
  it('extrait l’hôte et JETTE le path/query (token de webmail)', () => {
    expect(refererHote('https://mail.google.com/mail/u/0/?token=SECRET&email=jean@x.com')).toBe('mail.google.com');
    expect(refererHote('https://instagram.com/p/abc/')).toBe('instagram.com');
    expect(refererHote('https://mon-site.fr/page')).toBe('mon-site.fr'); // tiret licite
  });
  it('auto-référence (notre hôte, sous-domaines) → null (Direct/inconnu)', () => {
    expect(refererHote('https://sansvisavis.com/x', 'sansvisavis.com')).toBeNull();
    expect(refererHote('https://www.sansvisavis.com/x', 'sansvisavis.com')).toBeNull();
    expect(refererHote('https://autre.fr/x', 'sansvisavis.com')).toBe('autre.fr');
  });
  it('absent / non parsable → null', () => {
    expect(refererHote(null)).toBeNull();
    expect(refererHote('')).toBeNull();
    expect(refererHote('pas une url')).toBeNull();
  });
});

describe('bucketUtm — allowlist charset, aucune PII ne passe', () => {
  it('un email en paramètre de campagne ressort SANS @, espace ni =', () => {
    const out = bucketUtm('Jean Dupont <jean@mail.com>');
    expect(out).not.toBeNull();
    expect(out).not.toMatch(/[@ =<>]/); // ni arobase, ni espace, ni = ni chevrons
    expect(out).toMatch(/^[a-z0-9._-]{1,64}$/);
  });
  it('minuscule, tronqué à 64, null si vide après nettoyage', () => {
    expect(bucketUtm('Instagram')).toBe('instagram');
    expect(bucketUtm('a'.repeat(100))).toHaveLength(64);
    expect(bucketUtm('@@@')).toBeNull();
    expect(bucketUtm(null)).toBeNull();
  });
});

describe('scoreTranche — tranche grossière 1-4, jamais le score exact', () => {
  it('quartiles /100, borné [1,4]', () => {
    expect(scoreTranche(0)).toBe(1);
    expect(scoreTranche(24.9)).toBe(1);
    expect(scoreTranche(25)).toBe(2);
    expect(scoreTranche(49)).toBe(2);
    expect(scoreTranche(50)).toBe(3);
    expect(scoreTranche(74.99)).toBe(3);
    expect(scoreTranche(75)).toBe(4);
    expect(scoreTranche(100)).toBe(4);
    expect(scoreTranche(null)).toBeNull();
    expect(scoreTranche(NaN)).toBeNull();
  });
});

describe('communeInsee — 5 car INSEE, JAMAIS une coordonnée/adresse', () => {
  it('valide un code INSEE, rejette tout le reste', () => {
    expect(communeInsee('92004')).toBe('92004');
    expect(communeInsee('2A004')).toBe('2A004'); // Corse
    expect(communeInsee('75056')).toBe('75056');
    expect(communeInsee('48.9044,2.2701')).toBeNull(); // une coordonnée → rejetée
    expect(communeInsee('12 rue de Paris')).toBeNull(); // une adresse → rejetée
    expect(communeInsee('9200')).toBeNull(); // 4 car
    expect(communeInsee(null)).toBeNull();
  });
});

describe('estBot — filtre UA (règle 2), fail-open sur motif invalide', () => {
  it('détecte un bot, laisse passer un vrai navigateur', () => {
    const motif = 'bot|crawl|facebookexternalhit|slackbot';
    expect(estBot('facebookexternalhit/1.1', motif)).toBe(true);
    expect(estBot('Slackbot-LinkExpanding 1.0', motif)).toBe(true);
    expect(estBot('Mozilla/5.0 (iPhone) Mobile Safari', motif)).toBe(false);
    expect(estBot('Mozilla/5.0', null)).toBe(false); // pas de motif → jamais bot
    expect(estBot('Mozilla/5.0', '(((')).toBe(false); // motif invalide → fail-open (ne bloque personne)
  });
});
