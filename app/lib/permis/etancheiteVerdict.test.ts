import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

/**
 * ETAN-1 — GARDES D'ÉTANCHÉITÉ « verdict réel ↔ projeté/décidé ». La recon a PROUVÉ (§4) qu'un statut « détruit » ou un polygone
 * projeté ne peut pas altérer un verdict SVAV, mais a identifié TROIS zones (§5) qui ne tenaient que par CONVENTION. Ces trois gardes
 * les rendent OPPOSABLES : elles rougissent au CI si quelqu'un branche une décision humaine sur le calcul du verdict. Tests de CONTENU
 * (fichiers de production réels), whitespace-normalisés, jamais la forme complète d'un SQL runtime.
 */

// Racine du dépôt (contient db/ et app/), indépendante du cwd : ce fichier est <racine>/app/lib/permis/… → remonter de 3.
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Sources .ts de PRODUCTION (hors *.test.ts / *.itest.ts) sous `dir`, récursif. Rend {chemin relatif à la racine, contenu}. */
function sourcesProduction(dir: string): { chemin: string; contenu: string }[] {
  const out: { chemin: string; contenu: string }[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sourcesProduction(p));
    else if (/\.ts$/.test(e.name) && !/\.(test|itest)\.ts$/.test(e.name)) out.push({ chemin: path.relative(RACINE, p), contenu: readFileSync(p, 'utf8') });
  }
  return out;
}

/** Retire les commentaires de LIGNE SQL (`-- …`) — pour lire une DDL sans son rollback commenté ni ses annotations. */
const sansCommentairesSql = (sql: string) => sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
/** Normalisation whitespace : minuscules + espaces réduits (jamais la forme exacte d'un SQL). */
const normaliser = (s: string) => s.toLowerCase().replace(/\s+/g, ' ');

describe('ETAN-1 — étanchéité verdict réel ↔ projeté/décidé (les 3 zones jadis « par convention »)', () => {
  it('GARDE 1 — la vue bdtopo_batiment (lue par le moteur) reste une PROJECTION PURE : ni WHERE, ni JOIN, ni table de décision', () => {
    const migDir = path.join(RACINE, 'db/migrations');
    // SOURCE DE VÉRITÉ : la DERNIÈRE migration qui (re)définit la vue (ex. 121 la recrée après une bascule d'édition BD TOPO).
    const definit = readdirSync(migDir).filter((f) => f.endsWith('.sql'))
      .filter((f) => /create\s+(or\s+replace\s+)?view\s+bdtopo_batiment\b/i.test(sansCommentairesSql(readFileSync(path.join(migDir, f), 'utf8'))))
      .sort();
    expect(definit.length, 'aucune migration ne définit la vue bdtopo_batiment').toBeGreaterThan(0);
    const derniere = definit[definit.length - 1];
    const sql = normaliser(sansCommentairesSql(readFileSync(path.join(migDir, derniere), 'utf8')));
    const m = /create (or replace )?view bdtopo_batiment as (.*?);/.exec(sql);
    expect(m, `définition de la vue introuvable dans ${derniere}`).not.toBeNull();
    const corps = m![2]; // le corps de la vue, jusqu'au premier ';'
    const msg = `🔴 la vue bdtopo_batiment lue par le moteur de verdict ne doit JAMAIS dépendre d'une décision humaine (dernière déf. : ${derniere})`;
    expect(corps).toContain('from batiment');                                                     // c'est bien une projection de la table source
    expect(corps, msg).not.toMatch(/\bwhere\b/);                                                  // aucun filtre
    expect(corps, msg).not.toMatch(/\bjoin\b/);                                                   // aucune jointure
    expect(corps, msg).not.toMatch(/permis_polygone_statut|permis_emprise_reconstruite|permis_empreinte/); // aucune table de décision
  });

  it('GARDE 2 — le MOTEUR (app/lib/db, app/lib/svv) ne référence AUCUNE table de décision ni d’altitude injectée', () => {
    const sources = [...sourcesProduction(path.join(RACINE, 'app/lib/db')), ...sourcesProduction(path.join(RACINE, 'app/lib/svv'))];
    expect(sources.length, 'aucune source moteur trouvée (chemin ?)').toBeGreaterThan(0);
    const refs = (re: RegExp) => sources.filter((s) => re.test(s.contenu)).map((s) => s.chemin);
    // (a) tables de DÉCISION (projeté/décidé).
    const decision = refs(/permis_polygone_statut|permis_emprise_reconstruite|permis_empreinte/);
    expect(decision, `🔴 le verdict se calcule sur le bâti RÉEL mesuré, jamais sur une reconstitution ou une décision — référence trouvée dans : ${decision.join(', ')}`).toEqual([]);
    // (b) ETAN-2 — tables d'ALTITUDE INJECTÉE : le moteur ne les lit pas ; ce n'était vrai que par convention, ici c'est figé.
    const altitude = refs(/permis_polygone_altitude|permis_altitude_journal/);
    expect(altitude, `🔴 le verdict certifié se calcule sur le LiDAR d'origine et le bâti réellement mesuré ; une altitude injectée depuis un permis n'y entre pas tant que le branchement conditionnel n'a pas été conçu et gardé — référence trouvée dans : ${altitude.join(', ')}`).toEqual([]);
  });

  it('GARDE 3 — AUCUNE écriture dans batiment (BD TOPO) depuis le module permis (app/lib/permis, app/scripts)', () => {
    const sources = [...sourcesProduction(path.join(RACINE, 'app/lib/permis')), ...sourcesProduction(path.join(RACINE, 'app/scripts'))];
    expect(sources.length, 'aucune source permis/scripts trouvée (chemin ?)').toBeGreaterThan(0);
    // `batiment` NU uniquement (\b) : ni bdtopo_batiment, ni permis_corps_batiment, ni permis_bati_snapshot ne matchent.
    const ecriture = /(insert into|update|delete from|truncate) batiment\b|alter table batiment\b/;
    const fautifs = sources.filter((s) => ecriture.test(normaliser(s.contenu))).map((s) => s.chemin);
    expect(fautifs, `🔴 la donnée SOURCE BD TOPO n'est jamais écrasée par une décision d'interface — écriture trouvée dans : ${fautifs.join(', ')}`).toEqual([]);
  });
});
