import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 🔴🔴 GARDE (Arno, 20/11/2026, « Adresse officielle BAN », lot 7a) — UN SEUL COMPOSANT D'ADRESSE : `ChampAdresseOfficielle`.
 *
 * ① Les quatre champs d'auto-complétion de l'application (`ChampAdresseBan`, `AdresseAutocomplete` du site public, la rue du cabinet syndic, la planche
 *    des parcelles) sont des EMBALLAGES du composant unique.
 * ② Un NOUVEAU champ de saisie d'adresse (un `<input>` qui porte « adresse » hors e-mail, ou que précède un libellé « Adresse… ») fait échouer la suite,
 *    sauf dans un fichier qui emploie le composant unique ou l'un de ses emballages (la saisie libre « Adresse absente de la liste ? », « à l'étranger »)
 *    — et même là, le NOMBRE de champs est figé : en ajouter un se justifie ici. Les saisies libres d'avant le lot 7a qui ne sont pas des adresses à
 *    rattacher à la Base Adresse sont listées avec leur raison ; la liste ne fait que rétrécir.
 */
const RACINE = path.join(process.cwd(), 'app');
const COMPOSANTS = /ChampAdresseOfficielle|ChampAdresseBan|AdresseBien\b|AdresseAutocomplete/;
const COURRIEL = /e-?mail|électronique|\bmail\b|courriel|@|type="email"|inputMode="email"|\bIP\b|url/i;

/** Les champs d'adresse d'un fichier source (repérage par le texte, comme les autres gardes). */
export function champsAdresse(src: string): number[] {
  const lignes: number[] = [];
  const ligne = (i: number) => src.slice(0, i).split('\n').length;
  for (const m of src.matchAll(/<input\b[^>]*>/g)) if (/adress/i.test(m[0]) && !COURRIEL.test(m[0])) lignes.push(ligne(m.index ?? 0));
  for (const m of src.matchAll(/>\s*(Adresse[^<]{0,40})</g)) {
    if (COURRIEL.test(m[1])) continue;
    const suite = src.slice((m.index ?? 0) + m[0].length - 1, (m.index ?? 0) + m[0].length + 300);
    const i = suite.indexOf('<input');
    if (i >= 0 && !COURRIEL.test(suite.slice(0, i + 200))) lignes.push(ligne(m.index ?? 0));
  }
  return [...new Set(lignes)].sort((a, b) => a - b);
}

/** Les fichiers d'avant le lot 7a qui portent un champ d'adresse libre, et combien (la liste ne fait que rétrécir). */
const FIGES: Readonly<Record<string, { n: number; raison: string }>> = {
  // emploient le composant unique : la saisie libre est celle de « Adresse absente de la liste ? », « à l'étranger », et les rappels en lecture seule
  'app/(admin)/admin/(protected)/gestion/CartesPersonnes.tsx': { n: 13, raison: 'hors liste, étranger, rappels du code postal et de la commune' },
  'app/(admin)/admin/(protected)/location/AdresseBien.tsx': { n: 12, raison: 'hors liste, étranger, rappels du code postal et de la commune' },
  'app/(admin)/admin/(protected)/location/CreationBien.tsx': { n: 2, raison: 'le libellé « Adresse » de l’emballage AdresseBien' },
  'app/(admin)/admin/(protected)/transaction/PersonnesDossier.tsx': { n: 1, raison: 'personne sans type : simple champ texte (lot 7d)' },
  'app/page.tsx': { n: 2, raison: 'rappels en lecture seule de l’adresse choisie (site public)' },
  // ne sont PAS des adresses à rattacher à la Base Adresse — ou pas encore : à trancher par Arno (lots 7b à 7e)
  'app/(admin)/admin/(protected)/gestion/BoiteMail.tsx': { n: 1, raison: 'recherche « nom ou adresse » d’un expéditeur (mail)' },
  'app/(admin)/admin/(protected)/gestion/CarteVive.tsx': { n: 2, raison: '« Adresse (texte libre) » d’une carte d’événement — à trancher' },
  'app/(admin)/admin/(protected)/gestion/EncartMonga.tsx': { n: 1, raison: 'recherche d’un bien du portefeuille (pas une saisie)' },
  'app/(admin)/admin/(protected)/gestion/EcranCoproprietes.tsx': { n: 1, raison: 'choix de l’adresse principale parmi celles de la copropriété (pas une saisie)' },
  'app/(admin)/admin/(protected)/gestion/HistoriqueCible.tsx': { n: 1, raison: 'case à cocher d’un interlocuteur (adresse e-mail)' },
  'app/(admin)/admin/(protected)/gestion/PanneauAffecter.tsx': { n: 1, raison: '« ce que le mail indique » : l’adresse lue dans un mail — à trancher' },
  'app/(admin)/admin/(protected)/permis/BlocDemandePieces.tsx': { n: 1, raison: 'case à cocher d’un destinataire (adresse e-mail)' },
  'app/(admin)/admin/(protected)/permis/CaracteristiquesBloc.tsx': { n: 2, raison: '« Adresse de ce bâtiment » d’un permis — à trancher' },
  'app/(admin)/admin/(protected)/permis/EditeurContactCommune.tsx': { n: 2, raison: 'adresse POSTALE d’un service de mairie (avec le nom du service) et sa note' },
  'app/(admin)/admin/(protected)/permis/PermisVue.tsx': { n: 2, raison: 'adresse POSTALE d’un service de mairie (avec le nom du service) et sa note' },
};

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const p = path.join(dossier, n);
    if (statSync(p).isDirectory()) return n === 'node_modules' || n.startsWith('.') ? [] : fichiers(p);
    return /\.tsx$/.test(n) && !/\.(test|itest)\.tsx$/.test(n) ? [p] : [];
  });
}
const rel = (p: string) => path.relative(process.cwd(), p).split(path.sep).join('/');
const lire = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8');

describe('🔴🔴 un seul composant d’adresse', () => {
  it('① les champs d’auto-complétion sont des emballages du composant unique', () => {
    for (const f of ['app/(admin)/admin/(protected)/gestion/ChampAdresseBan.tsx', 'app/components/AdresseAutocomplete.tsx',
      'app/(admin)/admin/(protected)/gestion/FicheSyndic.tsx', 'app/(admin)/admin/(protected)/permis/PlancheParcelles.tsx']) {
      expect(lire(f), f).toContain('<ChampAdresseOfficielle');
    }
    // et aucun d'eux ne garde sa propre liste de propositions
    expect(lire('app/(admin)/admin/(protected)/permis/PlancheParcelles.tsx')).not.toContain('setSuggestions(');
    expect(lire('app/(admin)/admin/(protected)/gestion/FicheSyndic.tsx')).not.toContain('chercherAdresses(');
  });
  it('② aucun NOUVEAU champ de saisie d’adresse hors du composant unique (le nombre de champs libres est figé, fichier par fichier)', () => {
    const fautifs: string[] = [];
    for (const p of fichiers(RACINE)) {
      const f = rel(p);
      if (f.startsWith('app/components/adresse/')) continue;
      const n = champsAdresse(readFileSync(p, 'utf8')).length;
      const permis = FIGES[f]?.n ?? 0;
      if (n > permis) fautifs.push(`${f} : ${n} champ(s) d’adresse pour ${permis} permis — employez ChampAdresseOfficielle (ou un de ses emballages)`);
    }
    expect(fautifs).toEqual([]);
  });
  it('les fichiers figés existent, et emploient le composant unique quand ils en ont la saisie libre', () => {
    for (const [f, { raison }] of Object.entries(FIGES)) {
      expect(() => statSync(path.join(process.cwd(), f)), f).not.toThrow();
      if (/hors liste|emballage|rappels/.test(raison)) expect(COMPOSANTS.test(lire(f)), f).toBe(true);
    }
  });
  it('le repérage voit un champ d’adresse, et pas une adresse e-mail', () => {
    expect(champsAdresse('<label>Adresse du bien<input value={a} /></label>')).toEqual([1]);
    expect(champsAdresse('<input aria-label="Adresse à localiser" />')).toEqual([1]);
    expect(champsAdresse('<label>Adresse e-mail<input type="email" /></label>')).toEqual([]);
    expect(champsAdresse('<input placeholder="ex. 12 rue" />')).toEqual([]);
  });
});
