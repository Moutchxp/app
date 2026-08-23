import { describe, it, expect } from 'vitest';
import {
  executerDetection, detecterBdtopo, detecterDila, detecterPrada, maxDateIso,
  URL_BDTOPO, URL_CADASTRE, URL_PRADA, type DepsDetection, type ResultatDetection,
} from './detectionSources';

/**
 * FRAÎCHEUR lot 2 — détection par métadonnées. Vérifie : détection réussie (édition juste), ISOLATION (l'échec d'une source
 * n'empêche pas les autres), aucun téléchargement de donnée (test négatif), réglage désactivé (source non interrogée),
 * cadence (source vérifiée récemment ignorée). Aucune I/O réelle : tout est injecté.
 */

const MAINTENANT = new Date('2026-08-23T09:00:00Z');

const HTML_BDTOPO = `
  <entry><title>BDTOPO_3-5_TOUSTHEMES_GPKG_LAMB93_D092_2026-03-15</title></entry>
  <entry><title>BDTOPO_3-5_TOUSTHEMES_GPKG_LAMB93_D092_2026-06-15</title></entry>
`;
const HTML_CADASTRE = `
  <a href="/data/etalab-cadastre/2026-03-01/">2026-03-01/</a>
  <a href="/data/etalab-cadastre/2026-06-01/">2026-06-01/</a>
`;
const HTML_PRADA = `<a href=/sites/default/files/annuaire_08_26.csv>Annuaire</a>`;
const LAST_MODIFIED_DILA = 'Fri, 21 Aug 2026 06:06:13 GMT';

interface Faux {
  deps: DepsDetection;
  enregistrements: Array<{ source: string } & ResultatDetection>;
  urlsTexte: string[];
  urlsEntete: string[];
}

function fauxDeps(over: Partial<DepsDetection> = {}): Faux {
  const enregistrements: Array<{ source: string } & ResultatDetection> = [];
  const urlsTexte: string[] = [];
  const urlsEntete: string[] = [];
  const deps: DepsDetection = {
    maintenant: () => MAINTENANT,
    config: async () => ({ active: true, intervalleHeures: 24 }),
    etats: async () => new Map(),
    enregistrer: async (source, r) => { enregistrements.push({ source, ...r }); },
    lireTexte: async (url) => {
      urlsTexte.push(url);
      if (url.includes('geopf')) return HTML_BDTOPO;
      if (url.includes('cadastre.data')) return HTML_CADASTRE;
      if (url.includes('cada.fr')) return HTML_PRADA;
      throw new Error(`URL texte inattendue : ${url}`);
    },
    lireEntete: async (url) => { urlsEntete.push(url); return { lastModified: LAST_MODIFIED_DILA }; },
    urlDila: async () => 'https://www.data.gouv.fr/api/1/datasets/r/73302880-e4df-4d4c-8676-1a61bb997f3d',
    ...over,
  };
  return { deps, enregistrements, urlsTexte, urlsEntete };
}

const par = (e: Array<{ source: string } & ResultatDetection>, s: string) => e.find((x) => x.source === s);

describe('detecteurs unitaires', () => {
  it('maxDateIso prend la date la plus récente (ordre lexical = chronologique)', () => {
    expect(maxDateIso(['2026-03-15', '2026-06-15', '2026-01-01'])).toBe('2026-06-15');
    expect(maxDateIso([])).toBeNull();
  });
  it('BD TOPO → dernière édition GPKG D092', async () => {
    expect(await detecterBdtopo(fauxDeps().deps)).toEqual({ editionDistante: '2026-06-15', dateDistante: '2026-06-15' });
  });
  it('DILA → date du Last-Modified', async () => {
    expect(await detecterDila(fauxDeps().deps)).toEqual({ editionDistante: '2026-08-21', dateDistante: '2026-08-21' });
  });
  it('PRADA → millésime du .csv lié', async () => {
    expect(await detecterPrada(fauxDeps().deps)).toEqual({ editionDistante: '2026-08', dateDistante: '2026-08-01' });
  });
});

describe('executerDetection — détection réussie', () => {
  it('les 5 sources sondées sont enregistrées avec leur édition distante', async () => {
    const f = fauxDeps();
    const resume = await executerDetection(f.deps);
    expect(resume.active).toBe(true);
    expect(resume.verifiees.sort()).toEqual(['bdtopo_adresse', 'bdtopo_bati', 'cadastre', 'dila', 'prada']);
    expect(par(f.enregistrements, 'bdtopo_bati')).toMatchObject({ succes: true, editionDistante: '2026-06-15' });
    expect(par(f.enregistrements, 'bdtopo_adresse')).toMatchObject({ succes: true, editionDistante: '2026-06-15' });
    expect(par(f.enregistrements, 'cadastre')).toMatchObject({ succes: true, editionDistante: '2026-06-01' });
    expect(par(f.enregistrements, 'dila')).toMatchObject({ succes: true, editionDistante: '2026-08-21' });
    expect(par(f.enregistrements, 'prada')).toMatchObject({ succes: true, editionDistante: '2026-08' });
  });
  it('les DEUX sources BD TOPO partagent UNE seule requête', async () => {
    const f = fauxDeps();
    await executerDetection(f.deps);
    expect(f.urlsTexte.filter((u) => u === URL_BDTOPO)).toHaveLength(1);
  });
});

describe('ISOLATION — l’échec d’une source n’empêche pas les autres', () => {
  it('cadastre en échec réseau → cadastre persiste un échec, les autres réussissent', async () => {
    const f = fauxDeps({
      lireTexte: async (url) => {
        if (url === URL_CADASTRE) throw new Error('réseau coupé');
        if (url.includes('geopf')) return HTML_BDTOPO;
        if (url.includes('cada.fr')) return HTML_PRADA;
        throw new Error(`inattendu ${url}`);
      },
    });
    await executerDetection(f.deps);
    expect(par(f.enregistrements, 'cadastre')).toMatchObject({ succes: false });
    expect(par(f.enregistrements, 'cadastre')!.motif).toContain('réseau coupé');
    // Les autres sources ont bien été vérifiées malgré l'échec du cadastre (isolation prouvée).
    expect(par(f.enregistrements, 'bdtopo_bati')).toMatchObject({ succes: true });
    expect(par(f.enregistrements, 'dila')).toMatchObject({ succes: true });
    expect(par(f.enregistrements, 'prada')).toMatchObject({ succes: true });
  });
});

describe('AUCUN téléchargement de donnée (test négatif)', () => {
  it('les URLs interrogées sont des métadonnées ; jamais un fichier .7z/.zip/.csv/.tar.bz2', async () => {
    const f = fauxDeps();
    await executerDetection(f.deps);
    for (const url of f.urlsTexte) {
      expect(url).not.toMatch(/\.(7z|zip|tar\.bz2)(\?|#|$)/i);
      expect(url).not.toMatch(/cadastre-\d+-parcelles-shp\.zip/i); // jamais la donnée cadastre
    }
    // DILA passe par un HEAD (en-tête), jamais un GET du corps de 364 Mo : son URL n'apparaît QUE dans les en-têtes.
    expect(f.urlsEntete.length).toBe(1);
    expect(f.urlsTexte.some((u) => u.includes('all_latest') || u.includes('datasets/r/'))).toBe(false);
  });
});

describe('RÉGLAGE désactivé → source non interrogée', () => {
  it('cadastre actif=false → jamais fetché, absent des vérifiées, présent dans les ignorées', async () => {
    const f = fauxDeps({ etats: async () => new Map([['cadastre', { actif: false, verifieLe: null }]]) });
    const resume = await executerDetection(f.deps);
    expect(f.urlsTexte).not.toContain(URL_CADASTRE);
    expect(resume.verifiees).not.toContain('cadastre');
    expect(resume.ignorees).toContain('cadastre');
    expect(par(f.enregistrements, 'cadastre')).toBeUndefined();
  });
});

describe('CADENCE — une source vérifiée récemment est ignorée', () => {
  it('prada vérifiée il y a 3 h (< 24 h) → non ré-interrogée', async () => {
    const f = fauxDeps({ etats: async () => new Map([['prada', { actif: true, verifieLe: new Date('2026-08-23T06:00:00Z') }]]) });
    const resume = await executerDetection(f.deps);
    expect(f.urlsTexte).not.toContain(URL_PRADA);
    expect(resume.ignorees).toContain('prada');
  });
});

describe('interrupteur global', () => {
  it('detection_active=false → rien n’est interrogé', async () => {
    const f = fauxDeps({ config: async () => ({ active: false, intervalleHeures: 24 }) });
    const resume = await executerDetection(f.deps);
    expect(resume.active).toBe(false);
    expect(f.enregistrements).toHaveLength(0);
    expect(f.urlsTexte).toHaveLength(0);
  });
});
