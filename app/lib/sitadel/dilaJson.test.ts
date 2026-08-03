import { describe, it, expect } from 'vitest';
import {
  enregistrementsService, estMairie, codesCommune, extraireContexte, rattacher, type DilaRecord,
} from './dilaJson';

/** Découpe une chaîne en chunks de taille fixe, en flux async (simule la lecture par blocs d'un Readable). */
async function* enChunks(s: string, taille: number): AsyncGenerator<string> {
  for (let i = 0; i < s.length; i += taille) yield s.slice(i, i + taille);
}

// Fixture : 4 guichets — Nanterre (mairie, nom avec accolade + guillemets échappés pour tester le tokenizer),
// un CCAS (à IGNORER), Saint-Denis (mairie principale -01) et Pierrefitte (mairie DÉLÉGUÉE sous le même code 93066).
const FIXTURE = `{
  "service" : [
    {"id":"a","pivot":[{"type_service_local":"mairie","code_insee_commune":["92050"]}],"ancien_code_pivot":"mairie-92050-01","nom":"Mairie - Nanterre {annexe} \\"HdV\\"","categorie":"SL","telephone":[{"valeur":"01 47 29 50 50","description":"9h-12h"}],"adresse_courriel":[],"site_internet":[{"libelle":"","valeur":"https://www.nanterre.fr/"}],"adresse":[{"type_adresse":"Adresse","numero_voie":"1 place du 27 mars 2002","code_postal":"92000","nom_commune":"Nanterre","latitude":"48.892222","longitude":"2.206936"}],"date_creation":"01/01/2020 10:00:00","date_modification":"18/12/2024 17:42:39","date_diffusion":"","code_insee_commune":"92050"},
    {"id":"b","pivot":[{"type_service_local":"ccas","code_insee_commune":["92050"]}],"nom":"CCAS - Nanterre","code_insee_commune":"92050"},
    {"id":"c","pivot":[{"type_service_local":"mairie","code_insee_commune":["93066"]}],"ancien_code_pivot":"mairie-93066-01","nom":"Mairie - Saint-Denis","code_insee_commune":"93066"},
    {"id":"d","pivot":[{"type_service_local":"mairie","code_insee_commune":["93066"]}],"ancien_code_pivot":"mairie-93059-01","nom":"Mairie déléguée - Pierrefitte-sur-Seine","code_insee_commune":"93066"}
  ]
}`;

async function tous(chunkSize: number): Promise<DilaRecord[]> {
  const out: DilaRecord[] = [];
  for await (const r of enregistrementsService(enChunks(FIXTURE, chunkSize))) out.push(r);
  return out;
}

describe('S28 — enregistrementsService : tokenizer incrémental sur { "service": [ … ] }', () => {
  it('émet chaque élément du tableau, quelle que soit la taille des chunks (frontières)', async () => {
    for (const taille of [1, 3, 7, 64, 100000]) {
      const recs = await tous(taille);
      expect(recs).toHaveLength(4);
      expect(recs.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
    }
  });
  it('gère les accolades et guillemets échappés À L’INTÉRIEUR des chaînes (pas de coupe prématurée)', async () => {
    const recs = await tous(5);
    expect(recs[0].nom).toBe('Mairie - Nanterre {annexe} "HdV"');
  });
});

describe('S28 — filtre mairie + extraction de contexte', () => {
  it('estMairie : true pour un pivot mairie, false pour un CCAS', async () => {
    const recs = await tous(64);
    expect(recs.filter(estMairie).map((r) => r.id)).toEqual(['a', 'c', 'd']);
  });
  it('codesCommune : union pivot + top-level', async () => {
    const recs = await tous(64);
    expect(codesCommune(recs[0])).toEqual(['92050']);
  });
  it('extraireContexte : normalise les tableaux (telephone/site/adresse + lat/lon), courriel vide → null', async () => {
    const x = extraireContexte((await tous(64))[0]);
    expect(x.telephone).toBe('01 47 29 50 50');
    expect(x.courriel).toBeNull();                       // adresse_courriel: [] → null (la DILA n'apporte pas d'e-mail ici)
    expect(x.siteInternet).toBe('https://www.nanterre.fr/');
    expect(x.adresseLibelle).toBe('1 place du 27 mars 2002');
    expect(x.adresseCodePostal).toBe('92000');
    expect(x.latitude).toBeCloseTo(48.892222, 5);
    expect(x.longitude).toBeCloseTo(2.206936, 5);
    expect(x.idDila).toBe('a');
    expect(x.ancienCodePivot).toBe('mairie-92050-01');
    expect(x.dateDiffusion).toBeNull();                  // '' → null
  });
});

describe('S28 — rattachement (direct / desambigue_01 / manquant)', () => {
  it('1 mairie → direct ; commune fusionnée (2 mairies) → -01 retenue, déléguée hors_perimetre ; sans mairie → manquant', async () => {
    const recs = (await tous(64)).filter(estMairie);
    const perimetre = ['92050', '93066', '99999'];
    const parCode = new Map<string, DilaRecord[]>();
    for (const r of recs) for (const c of codesCommune(r)) if (perimetre.includes(c)) {
      const l = parCode.get(c); if (l) l.push(r); else parCode.set(c, [r]);
    }
    const rat = rattacher(parCode, perimetre);
    expect(rat.direct).toBe(1);
    expect(rat.desambigue01).toBe(1);
    expect(rat.horsPerimetre).toBe(1);                   // la mairie déléguée de Pierrefitte, non retenue
    expect(rat.manquants).toEqual(['99999']);
    expect(rat.ambigus).toEqual([]);
    const parInsee = Object.fromEntries(rat.retenues.map((r) => [r.codeInsee, r]));
    expect(parInsee['92050'].rapprochement).toBe('direct');
    expect(parInsee['93066'].rapprochement).toBe('desambigue_01');
    expect(parInsee['93066'].rec.id).toBe('c');           // la principale (-01), pas la déléguée
  });
});
