import { describe, it, expect, vi, afterEach } from 'vitest';
import { analyserLiensReponse, extraireExpiration, hoteExclu, parserHotesNonFort } from './extractionLiens';

/**
 * L1 — extraction PURE des liens + expiration. Fondé sur le message RÉEL de la mairie de Paris, mais le jeton d'accès est
 * FACTICE (un vrai jeton ne doit jamais entrer dans le dépôt). Prouve aussi qu'AUCUN appel réseau sortant n'a lieu.
 */

// Jeton FACTICE (opaque : ≥16 car., lettres+chiffres, pas un slug) — jamais un vrai jeton d'accès.
const JETON = 'aB3x9Kf2mNqR7wZ1tYcV0pL5s8Dh';
const LIEN_GED = `https://ged-pcpr.apps.paris.fr/share/s/${JETON}/folder`;
const RECU = new Date('2026-08-10T13:24:00Z');

const PARIS_TEXTE = [
  'Bonjour,',
  'Vous trouverez ci-dessous le lien vous permettant de consulter le dossier demandé :',
  LIEN_GED,
  'A réception, nous vous invitons à télécharger les documents, le lien étant valable 7 jours.',
  '',
  'https://opendata.paris.fr',
  'https://teleservices.paris.fr/demarcheurbanisme/',
  'https://www.paris.fr/pages/le-plan-local-d-urbanisme-plu-2329',
  'https://www.paris.fr/pages/demarches-2094',
  'https://regles-urbanisme.paris.fr',
].join('\n');

afterEach(() => vi.restoreAllMocks());

describe('L1 — extraireExpiration : date absolue, durée relative EXPLICITE, approximatif → nul', () => {
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

  it('date ABSOLUE : jusqu’au JJ/MM/AAAA · « JJ mois AAAA » · AAAA-MM-JJ', () => {
    expect(extraireExpiration("Le lien est valable jusqu'au 17/08/2026.", RECU)).toMatchObject({ source: 'absolue' });
    expect(iso(extraireExpiration("valable jusqu'au 17/08/2026", RECU).expireLe)).toBe('2026-08-17');
    expect(iso(extraireExpiration('Ce lien expire le 17 août 2026.', RECU).expireLe)).toBe('2026-08-17');
    expect(iso(extraireExpiration('Date limite : 2026-08-17', RECU).expireLe)).toBe('2026-08-17');
  });

  it('durée RELATIVE explicite : ancrée sur la réception, jours/semaines/mois', () => {
    const j = extraireExpiration('le lien étant valable 7 jours.', RECU);
    expect(j).toMatchObject({ source: 'relative', indice: '7 jours' });
    expect(iso(j.expireLe)).toBe('2026-08-17'); // 10/08 + 7 j
    expect(iso(extraireExpiration('valable 2 semaines', RECU).expireLe)).toBe('2026-08-24'); // 10/08 + 14 j
    expect(iso(extraireExpiration('valable 1 mois', RECU).expireLe)).toBe('2026-09-10');
  });

  it('APPROXIMATIF → expiration NULLE (jamais devinée) : « environ 7 jours », « une semaine », rien', () => {
    expect(extraireExpiration('valable environ 7 jours', RECU)).toEqual({ expireLe: null, source: null, indice: null });
    expect(extraireExpiration('valable une semaine', RECU)).toEqual({ expireLe: null, source: null, indice: null });
    expect(extraireExpiration('Vous trouverez les documents ci-joints.', RECU)).toEqual({ expireLe: null, source: null, indice: null });
  });

  it('date IMPOSSIBLE (31/02) → rejetée, pas d’expiration inventée', () => {
    expect(extraireExpiration("valable jusqu'au 31/02/2026", RECU).expireLe).toBeNull();
  });
});

describe('L1 — analyserLiensReponse : cas RÉEL Paris (jeton factice)', () => {
  it('capte les 6 URL ; le lien GED (chemin à jeton) est FORT, les 5 pieds de page FAIBLES ; forts en tête', () => {
    const { liens } = analyserLiensReponse({ corpsTexte: PARIS_TEXTE, recuLe: RECU });
    expect(liens).toHaveLength(6);
    const forts = liens.filter((l) => l.fort);
    expect(forts).toHaveLength(1);
    expect(forts[0].url).toBe(LIEN_GED);
    expect(liens[0].fort).toBe(true); // forts en tête
    expect(liens.filter((l) => !l.fort).map((l) => l.url)).toEqual(expect.arrayContaining([
      'https://opendata.paris.fr', 'https://www.paris.fr/pages/le-plan-local-d-urbanisme-plu-2329',
    ]));
  });

  it('l’expiration (relative « 7 jours ») est portée par le lien FORT, nulle sur les faibles', () => {
    const { liens } = analyserLiensReponse({ corpsTexte: PARIS_TEXTE, recuLe: RECU });
    const ged = liens.find((l) => l.url === LIEN_GED)!;
    expect(ged.expirationSource).toBe('relative');
    expect(ged.expirationIndice).toBe('7 jours');
    expect(ged.expireLe?.toISOString().slice(0, 10)).toBe('2026-08-17');
    for (const faible of liens.filter((l) => !l.fort)) {
      expect(faible.expireLe).toBeNull();
      expect(faible.expirationSource).toBeNull();
    }
  });

  it('même lien reçu en HTML (href) → capté et marqué FORT', () => {
    const html = `<p>Votre dossier : <a href="${LIEN_GED}">cliquez ici</a> — valable 7 jours.</p>`;
    const { liens } = analyserLiensReponse({ corpsHtml: html, recuLe: RECU });
    expect(liens.some((l) => l.url === LIEN_GED && l.fort)).toBe(true);
  });

  it('lien FORT SANS date → capté, expiration NULLE + source nulle (mention « non précisée » côté vue)', () => {
    const { liens } = analyserLiensReponse({ corpsTexte: `Votre dossier : ${LIEN_GED}`, recuLe: RECU });
    const ged = liens.find((l) => l.url === LIEN_GED)!;
    expect(ged.fort).toBe(true);
    expect(ged.expireLe).toBeNull();
    expect(ged.expirationSource).toBeNull();
  });
});

describe('L1 — opacité du jeton : le TIRET ne déclasse plus (régression du 20/08)', () => {
  // Jeton FACTICE de MÊME FORME que le réel (Paris : 22 car., UN tiret, casse mixte + chiffres) — jamais la vraie valeur.
  const JETON_TIRET = 'Kp7mTQxLa2-Ht8WvY9Cb3z';
  const GED_TIRET = `https://ged-pcpr.apps.paris.fr/share/s/${JETON_TIRET}/folder`;

  it('un jeton AVEC tiret (casse mixte) est FORT — l’ancienne garde le lisait « slug » et le déclassait', () => {
    const { liens } = analyserLiensReponse({ corpsTexte: `Votre dossier : ${GED_TIRET}, valable 7 jours.`, recuLe: RECU });
    const ged = liens.find((l) => l.url === GED_TIRET)!;
    expect(ged.fort).toBe(true);
    expect(ged.expirationSource).toBe('relative'); // l'expiration se rattache désormais au lien (fort)
    expect(ged.expireLe?.toISOString().slice(0, 10)).toBe('2026-08-17');
  });

  it('un jeton SANS tiret (casse mixte) reste FORT', () => {
    const lien = `https://ged-pcpr.apps.paris.fr/share/s/${JETON}/folder`;
    const { liens } = analyserLiensReponse({ corpsTexte: lien, recuLe: RECU });
    expect(liens.find((l) => l.url === lien)?.fort).toBe(true);
  });

  it('un slug kebab lisible (minuscules), même long et chiffré, reste FAIBLE', () => {
    const slug = 'https://www.paris.fr/pages/le-plan-local-d-urbanisme-plu-2329';
    const { liens } = analyserLiensReponse({ corpsTexte: slug, recuLe: RECU });
    expect(liens.find((l) => l.url === slug)?.fort).toBe(false);
  });

  it('les 5 URL parasites/pieds de page RÉELLES du mail de Paris restent toutes FAIBLES', () => {
    const { liens } = analyserLiensReponse({ corpsTexte: PARIS_TEXTE, recuLe: RECU });
    for (const u of [
      'https://opendata.paris.fr',
      'https://teleservices.paris.fr/demarcheurbanisme/',
      'https://www.paris.fr/pages/le-plan-local-d-urbanisme-plu-2329',
      'https://www.paris.fr/pages/demarches-2094',
      'https://regles-urbanisme.paris.fr',
    ]) {
      expect(liens.find((l) => l.url === u)?.fort).toBe(false);
    }
  });
});

describe('L1 — filtrage des parasites + garde d’ambiguïté', () => {
  it('réseaux sociaux, tracking, désabonnement, assets → AUCUNE capture abusive', () => {
    const html = [
      '<a href="https://www.facebook.com/mairie">fb</a>',
      '<a href="https://x.com/mairie">x</a>',
      '<a href="https://mairie.fr/newsletter/unsubscribe?u=42">se désabonner</a>',
      '<img src="https://track.mairie.fr/pixel.gif?id=9">',
      '<a href="https://cdn.mairie.fr/logo.png">logo</a>',
      '<a href="https://www.googletagmanager.com/gtm.js?id=GTM-X">t</a>',
    ].join('\n');
    const { liens } = analyserLiensReponse({ corpsHtml: html, recuLe: RECU });
    expect(liens).toHaveLength(0);
  });

  it('parasites + un vrai lien faible → seul le vrai lien est capté (faible)', () => {
    const html = `<a href="https://www.facebook.com/x">fb</a> <a href="https://mairie.fr/mon-dossier">dossier</a>`;
    const { liens } = analyserLiensReponse({ corpsHtml: html, recuLe: RECU });
    expect(liens.map((l) => l.url)).toEqual(['https://mairie.fr/mon-dossier']);
    expect(liens[0].fort).toBe(false);
  });

  it('AMBIGUÏTÉ : deux liens à jeton → les DEUX marqués forts, AUCUN choisi automatiquement', () => {
    const a = 'https://ged.paris.fr/share/s/Zk91Ab34Cd56Ef78Gh/folder';
    const b = 'https://ged.paris.fr/share/s/Xy12Wv34Ut56Rs78Qp/folder';
    const { liens } = analyserLiensReponse({ corpsTexte: `${a}\n${b}`, recuLe: RECU });
    expect(liens.filter((l) => l.fort).map((l) => l.url).sort()).toEqual([a, b].sort());
  });
});

describe('PART-1 — un hôte à nous (ou hébergeur de nos actifs) n’est JAMAIS « fort »', () => {
  // URL réelle d'une signature Gmail citée par la mairie d'Aubervilliers (chemin à jeton → « fort » sans garde-fou).
  const LIEN_SIGNATURE = 'https://lh5.googleusercontent.com/zNSXg6CXm2pRhJxXw_i24RLy5PaBcDeFgHiJk';
  const LIEN_MAIRIE = 'https://ged.paris.fr/share/s/Zk91Ab34Cd56Ef78Gh/folder';

  it('parserHotesNonFort : virgules/espaces, minuscules, sans vide', () => {
    expect(parserHotesNonFort('googleusercontent.com, sansvisavis.com')).toEqual(['googleusercontent.com', 'sansvisavis.com']);
    expect(parserHotesNonFort('')).toEqual([]);
    expect(parserHotesNonFort(null)).toEqual([]);
  });

  it('hoteExclu : correspondance par SUFFIXE de domaine (sous-domaine inclus), pas ailleurs', () => {
    expect(hoteExclu('lh5.googleusercontent.com', ['googleusercontent.com'])).toBe(true);
    expect(hoteExclu('googleusercontent.com', ['googleusercontent.com'])).toBe(true);
    expect(hoteExclu('ged.paris.fr', ['googleusercontent.com', 'sansvisavis.com'])).toBe(false);
    expect(hoteExclu('notgoogleusercontent.com', ['googleusercontent.com'])).toBe(false); // pas un vrai suffixe de domaine
  });

  it('lien vers NOTRE hôte → jamais fort ; lien de mairie → toujours fort (non-régression Paris)', () => {
    const hotes = ['googleusercontent.com', 'sansvisavis.com'];
    const { liens } = analyserLiensReponse({ corpsTexte: `${LIEN_SIGNATURE}\n${LIEN_MAIRIE}`, recuLe: RECU }, hotes);
    const sig = liens.find((l) => l.url === LIEN_SIGNATURE)!;
    const mairie = liens.find((l) => l.url === LIEN_MAIRIE)!;
    expect(sig.fort).toBe(false); // notre signature citée
    expect(mairie.fort).toBe(true); // vrai lien de téléchargement de mairie
  });

  it('sans liste d’exclusion (défaut []) → comportement inchangé (la signature resterait « forte »)', () => {
    const { liens } = analyserLiensReponse({ corpsTexte: LIEN_SIGNATURE, recuLe: RECU });
    expect(liens[0].fort).toBe(true); // non-régression : aucun hôte écarté par défaut
  });
});

describe('L1 — RÈGLE DURE : aucun appel réseau sortant', () => {
  it('analyser un corps plein de liens ne déclenche AUCUN fetch', () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    analyserLiensReponse({ corpsTexte: PARIS_TEXTE, corpsHtml: `<a href="${LIEN_GED}">x</a>`, recuLe: RECU });
    extraireExpiration(PARIS_TEXTE, RECU);
    expect(spy).not.toHaveBeenCalled();
  });
});
