import { describe, it, expect } from 'vitest';
import { analyserListeAdresses, decoderMotsEncodes, destinatairesSepares } from './adresses';

/**
 * LOT 5-0 — LIRE LES DESTINATAIRES SÉPARÉMENT. Ce module décide qui recevra un « Répondre à tous » : une erreur ici
 * n'est pas un défaut d'affichage, c'est un mail envoyé à la mauvaise personne. D'où l'insistance sur les trois pièges
 * qui font échouer les analyseurs d'adresses : la virgule DANS un nom, les noms accentués (encodés à la source), et les
 * en-têtes mal formés qu'il ne faut surtout pas « réparer » au jugé.
 */

describe('découper une liste — la virgule ne sépare pas toujours', () => {
  it('deux destinataires ordinaires', () => {
    expect(analyserListeAdresses('Jean <j@d.fr>, Marie <m@d.fr>')).toEqual([
      { nom: 'Jean', adresse: 'j@d.fr' },
      { nom: 'Marie', adresse: 'm@d.fr' },
    ]);
  });

  it('🔴 UN nom contenant une virgule fait UN destinataire, pas deux', () => {
    expect(analyserListeAdresses('"Dupont, Jean" <j@d.fr>, Marie <m@d.fr>')).toEqual([
      { nom: 'Dupont, Jean', adresse: 'j@d.fr' },
      { nom: 'Marie', adresse: 'm@d.fr' },
    ]);
  });

  it('adresses nues, sans nom', () => {
    expect(analyserListeAdresses('a@b.fr, c@d.fr')).toEqual([
      { nom: null, adresse: 'a@b.fr' },
      { nom: null, adresse: 'c@d.fr' },
    ]);
  });

  it('le point-virgule sépare aussi (certains clients l’emploient)', () => {
    expect(analyserListeAdresses('a@b.fr; c@d.fr').map((x) => x.adresse)).toEqual(['a@b.fr', 'c@d.fr']);
  });

  it('un même destinataire deux fois n’apparaît qu’une, avec sa PREMIÈRE écriture', () => {
    expect(analyserListeAdresses('Jean <Jean.D@d.fr>, <jean.d@d.fr>')).toEqual([
      { nom: 'Jean', adresse: 'Jean.D@d.fr' },
    ]);
  });

  it('la casse de l’adresse est CONSERVÉE : ces adresses serviront de destinataires réels', () => {
    expect(analyserListeAdresses('Contact.Gestion@Criterimmo.FR')[0].adresse).toBe('Contact.Gestion@Criterimmo.FR');
  });
});

describe('noms accentués — ils arrivent ENCODÉS, et doivent ressortir lisibles', () => {
  it('quoted-printable (le cas courant en français)', () => {
    expect(analyserListeAdresses('=?UTF-8?Q?Ga=C3=ABlle_Fran=C3=A7ois?= <g@d.fr>')).toEqual([
      { nom: 'Gaëlle François', adresse: 'g@d.fr' },
    ]);
  });

  it('base64', () => {
    const encode = `=?UTF-8?B?${Buffer.from('Hélène Müller', 'utf8').toString('base64')}?=`;
    expect(analyserListeAdresses(`${encode} <h@d.fr>`)[0].nom).toBe('Hélène Müller');
  });

  it('latin-1 (vieux clients)', () => {
    const encode = `=?ISO-8859-1?Q?Beno=EEt?= <b@d.fr>`;
    expect(analyserListeAdresses(encode)[0].nom).toBe('Benoît');
  });

  it('deux mots encodés qui se suivent sont COLLÉS — sinon un prénom prend un espace en trop', () => {
    expect(decoderMotsEncodes('=?UTF-8?Q?Ga=C3=ABl?= =?UTF-8?Q?le?=')).toBe('Gaëlle');
  });

  it('un jeu de caractères inconnu est rendu TEL QUEL — jamais du texte faux', () => {
    const exotique = '=?KOI8-R?B?3g==?=';
    expect(decoderMotsEncodes(exotique)).toBe(exotique);
  });

  it('une donnée corrompue est rendue telle quelle, sans faire échouer l’analyse', () => {
    const r = analyserListeAdresses('=?UTF-8?B?%%%pas-du-base64%%%?= <x@d.fr>');
    expect(r).toHaveLength(1);
    expect(r[0].adresse).toBe('x@d.fr');
  });

  it('et une virgule DANS un nom encodé ne coupe toujours rien', () => {
    const encode = `=?UTF-8?B?${Buffer.from('Dupont, Gaëlle', 'utf8').toString('base64')}?=`;
    expect(analyserListeAdresses(`"${encode}" <g@d.fr>, m@d.fr`)).toEqual([
      { nom: 'Dupont, Gaëlle', adresse: 'g@d.fr' },
      { nom: null, adresse: 'm@d.fr' },
    ]);
  });
});

describe('en-têtes absents ou mal formés — on n’invente rien', () => {
  it('absent, vide, ou fait d’espaces → liste VIDE, jamais une erreur', () => {
    for (const brut of [null, undefined, '', '   ', ',,,', ';']) {
      expect(analyserListeAdresses(brut)).toEqual([]);
    }
  });

  it('un groupe sans adresse (« Undisclosed recipients: ») ne produit aucun destinataire', () => {
    expect(analyserListeAdresses('Undisclosed recipients:;')).toEqual([]);
  });

  it('un jeton qui n’est pas une adresse est ignoré, les valides passent quand même', () => {
    expect(analyserListeAdresses('pas-une-adresse, bon@d.fr, encore n’importe quoi')).toEqual([
      { nom: null, adresse: 'bon@d.fr' },
    ]);
  });

  it('un chevron jamais refermé n’empêche pas de lire ce qui précède', () => {
    expect(analyserListeAdresses('a@b.fr, Jean <tronque').map((x) => x.adresse)).toEqual(['a@b.fr']);
  });

  it('un préfixe mailto: est retiré', () => {
    expect(analyserListeAdresses('Jean <mailto:j@d.fr>')).toEqual([{ nom: 'Jean', adresse: 'j@d.fr' }]);
  });

  it('un nom vide ou réduit à des guillemets vaut « pas de nom »', () => {
    expect(analyserListeAdresses('"" <j@d.fr>')).toEqual([{ nom: null, adresse: 'j@d.fr' }]);
  });

  it('les échappements d’un nom entre guillemets sont défaits', () => {
    expect(analyserListeAdresses('"Jean \\"Jojo\\" D." <j@d.fr>')[0].nom).toBe('Jean "Jojo" D.');
  });
});

describe('les quatre en-têtes, séparés', () => {
  const entetes = {
    to: 'Jean <j@d.fr>, Marie <m@d.fr>',
    cc: 'Comptabilité <compta@adhoc.fr>',
    bcc: 'archive@criterimmo.fr',
    'reply-to': 'Service Gestion <gestion@criterimmo.fr>',
  };

  it('À, Cc, Cci et Reply-To ne se mélangent plus', () => {
    const d = destinatairesSepares(entetes);
    expect(d.a.map((x) => x.adresse)).toEqual(['j@d.fr', 'm@d.fr']);
    expect(d.cc.map((x) => x.adresse)).toEqual(['compta@adhoc.fr']);
    expect(d.cci.map((x) => x.adresse)).toEqual(['archive@criterimmo.fr']);
    expect(d.repondreA.map((x) => x.adresse)).toEqual(['gestion@criterimmo.fr']);
  });

  it('le nom des en-têtes est lu sans tenir compte de la casse', () => {
    const d = destinatairesSepares({ To: 'j@d.fr', CC: 'c@d.fr', 'Reply-To': 'r@d.fr' });
    expect(d.a.map((x) => x.adresse)).toEqual(['j@d.fr']);
    expect(d.cc.map((x) => x.adresse)).toEqual(['c@d.fr']);
    expect(d.repondreA.map((x) => x.adresse)).toEqual(['r@d.fr']);
  });

  it('aucun en-tête du tout → QUATRE listes vides (« on a regardé, il n’y avait personne »)', () => {
    expect(destinatairesSepares({})).toEqual({ a: [], cc: [], cci: [], repondreA: [] });
  });

  it('un mail sans Cc ni Reply-To rend bien des listes vides, pas des absences', () => {
    const d = destinatairesSepares({ to: 'j@d.fr' });
    expect(d.cc).toEqual([]);
    expect(d.repondreA).toEqual([]);
  });
});

describe('garantie STATIQUE — ce module ne fait aucune I/O', () => {
  it('il n’importe ni base, ni réseau, ni imapflow : il est rejouable sur des en-têtes déjà capturés', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('app/lib/gestion/adresses.ts', 'utf8');
    const imports = src.split('\n').filter((l) => /^\s*import\b/.test(l));
    expect(imports).toEqual([]); // aucun import : la propriété est celle du graphe, pas une promesse
    expect(/query\(|pool|fetch\(|imapflow/.test(src)).toBe(false);
  });
});
