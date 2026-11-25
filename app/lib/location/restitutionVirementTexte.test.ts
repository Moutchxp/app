import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 🔴🔴 Arno (25/11/2026, 23h52) — « une demande de virement à la comptabilité ne correspond pas forcément au jour du virement effectif » : aucun texte
 * AUTOMATIQUE (écran, modèles de mail, journal) ne dit « virement effectué » ni n'affirme que le virement a eu lieu ; seule est permise « la demande de
 * virement a été transmise à notre service comptabilité ». GARDE : les textes (chaînes) du code de la Location et de la Gestion sont relus ; les
 * commentaires du code, qui citent Arno, ne comptent pas.
 */
const RACINES = ['app/lib/location', 'app/lib/gestion', 'app/(admin)/admin/(protected)/location', 'app/(admin)/admin/(protected)/gestion', 'app/(admin)/api/admin/location'];
const fichiers = (dossier: string): string[] => readdirSync(dossier).flatMap((n) => {
  const p = join(dossier, n);
  if (statSync(p).isDirectory()) return fichiers(p);
  return /\.(ts|tsx)$/.test(n) && !/\.(test|itest)\.tsx?$/.test(n) ? [p] : [];
});
/** Les chaînes d'un source (entre '…', "…" ou `…`, sur une ligne), hors commentaires. */
const chaines = (src: string): string[] => {
  const sansCommentaires = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  return [...sansCommentaires.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)].map((m) => m[0]);
};
const AFFIRME_LE_VIREMENT = /virement\s+(a\s+(bien\s+)?été\s+)?(effectu|réalis|fait\b|envoy|versé)|virement\s+du\s+\d|avons\s+(effectué|réalisé|procédé\s+au)\s+(le\s+)?virement/i;

describe('🔴🔴 aucun texte automatique n’affirme un virement effectué', () => {
  it('ni à l’écran, ni dans les modèles de mail, ni dans le journal (Location, Gestion)', () => {
    const fautes = RACINES.flatMap(fichiers).flatMap((f) => chaines(readFileSync(f, 'utf8')).filter((c) => AFFIRME_LE_VIREMENT.test(c)).map((c) => `${f} : ${c.slice(0, 120)}`));
    expect(fautes).toEqual([]);
  });
  it('la seule formule permise est dite dans les mails de restitution (locataire et partenaire)', () => {
    const m = readFileSync('app/lib/location/mailRestitutionVingt.ts', 'utf8');
    expect(m).toContain('La demande de virement a été transmise à notre service comptabilité');
    expect(m).toContain('Demande de virement transmise à notre service comptabilité.');
  });
  it('la garde attrape bien les formules interdites (épreuve de la garde elle-même)', () => {
    for (const t of ['Virement effectué le 21/11/2026', 'le virement a été effectué', 'Le virement a bien été réalisé', 'nous avons effectué le virement', 'virement du 21/11/2026'])
      expect(AFFIRME_LE_VIREMENT.test(t)).toBe(true);
    for (const t of ['La demande de virement a été transmise à notre service comptabilité', 'Chèque / Virement / Autre', 'Mode de règlement : Chèque, Virement ou Autre.'])
      expect(AFFIRME_LE_VIREMENT.test(t)).toBe(false);
  });
});
