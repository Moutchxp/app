import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { creerMemoireSonde, DELAI_RESONDE_MS } from './sondeSchema';

/**
 * CORRECTIF DU 24/09/2026 — LA SONDE QUI DISAIT « NON » POUR TOUJOURS.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 L'INCIDENT, ET POURQUOI IL ÉTAIT INVISIBLE. Arno applique les migrations 239 à 241, recharge la page, et l'écran
 * continue d'annoncer « mise à jour de la base à appliquer ». Aucune erreur, aucune trace dans un journal : une
 * fonctionnalité simplement absente, sans que rien ne dise pourquoi. La cause : la mémoire des sondes retenait AUSSI
 * les réponses négatives, pour la vie du processus — et le serveur tournait depuis deux jours avant la migration.
 *
 * C'est le pire genre de défaut : il n'apparaît QUE chez celui qui applique une migration sur un serveur déjà démarré,
 * c'est-à-dire exactement la situation de ce dépôt, où les migrations sont livrées non appliquées.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Une horloge qu'on avance à la main : sans elle, éprouver cinq secondes prendrait cinq secondes. */
function horloge(depart = 1_000_000) {
  let t = depart;
  return { maintenant: () => t, avancer: (ms: number) => { t += ms; } };
}

describe('🔴 LE CŒUR DU CORRECTIF : un « non » ne se mémorise jamais', () => {
  it('sonde ABSENTE puis PRÉSENTE : la réponse change, SANS redémarrage', async () => {
    const h = horloge();
    const { memoiser } = creerMemoireSonde(h.maintenant);
    let presente = false;
    const sonder = () => memoiser('table.x', async () => presente);

    expect(await sonder()).toBe(false);          // la migration n'est pas passée
    presente = true;                              // …Arno l'applique dans son Terminal…
    h.avancer(DELAI_RESONDE_MS);                  // …le temps qu'une page se recharge…
    expect(await sonder()).toBe(true);            // 🔴 et l'écran le voit. C'est tout l'objet du correctif.
  });

  it('un « oui » est DÉFINITIF : plus aucune requête n’est émise ensuite', async () => {
    const h = horloge();
    const { memoiser } = creerMemoireSonde(h.maintenant);
    const calcul = vi.fn(async () => true);
    expect(await memoiser('t', calcul)).toBe(true);
    h.avancer(DELAI_RESONDE_MS * 100);
    expect(await memoiser('t', calcul)).toBe(true);
    expect(await memoiser('t', calcul)).toBe(true);
    expect(calcul).toHaveBeenCalledTimes(1); // une table ne se dé-crée pas : inutile de redemander
  });

  it('un « non » se TAIT quelques secondes, puis redemande — jamais une requête par affichage', async () => {
    const h = horloge();
    const { memoiser } = creerMemoireSonde(h.maintenant);
    const calcul = vi.fn(async () => false);
    await memoiser('t', calcul);
    await memoiser('t', calcul);
    h.avancer(DELAI_RESONDE_MS - 1);
    await memoiser('t', calcul);
    expect(calcul).toHaveBeenCalledTimes(1);  // dans la fenêtre de calme : aucune requête de plus
    h.avancer(1);
    await memoiser('t', calcul);
    expect(calcul).toHaveBeenCalledTimes(2);  // la fenêtre écoulée : on redemande
  });

  it('la fenêtre de calme est COURTE : un rechargement de page doit suffire à voir le changement', () => {
    expect(DELAI_RESONDE_MS).toBeGreaterThanOrEqual(1_000);
    expect(DELAI_RESONDE_MS).toBeLessThanOrEqual(15_000);
  });
});

describe('ce que la mémoire fait d’autre, et qu’elle doit continuer de faire', () => {
  it('dix questions SIMULTANÉES ne font qu’une requête — la sonde en cours est partagée', async () => {
    const h = horloge();
    const { memoiser } = creerMemoireSonde(h.maintenant);
    let resoudre: (v: boolean) => void = () => {};
    const calcul = vi.fn(() => new Promise<boolean>((r) => { resoudre = r; }));
    const dix = Array.from({ length: 10 }, () => memoiser('t', calcul));
    resoudre(true);
    expect(await Promise.all(dix)).toEqual(Array(10).fill(true));
    expect(calcul).toHaveBeenCalledTimes(1);
  });

  it('chaque question a sa propre mémoire : une table absente n’en cache pas une autre', async () => {
    const h = horloge();
    const { memoiser } = creerMemoireSonde(h.maintenant);
    expect(await memoiser('a', async () => true)).toBe(true);
    expect(await memoiser('b', async () => false)).toBe(false);
    expect(await memoiser('a', async () => false)).toBe(true); // 'a' reste « oui »
  });

  it('🔴 une sonde qui JETTE n’est pas une réponse : elle est traitée comme un « non », donc redemandée', async () => {
    const h = horloge();
    const { memoiser } = creerMemoireSonde(h.maintenant);
    await expect(memoiser('t', async () => { throw new Error('base injoignable'); })).rejects.toThrow('injoignable');
    h.avancer(DELAI_RESONDE_MS);
    expect(await memoiser('t', async () => true)).toBe(true); // la base est revenue : on le voit
  });

  it('`oublier` remet tout à zéro, « oui » compris — pour les tests, jamais pour la production', async () => {
    const h = horloge();
    const { memoiser, oublier } = creerMemoireSonde(h.maintenant);
    const calcul = vi.fn(async () => true);
    await memoiser('t', calcul);
    oublier();
    await memoiser('t', calcul);
    expect(calcul).toHaveBeenCalledTimes(2);
  });
});

describe('🔴 LA MÊME FAUTE N’EXISTE PLUS AILLEURS', () => {
  it('aucun module ne garde sa propre mémoire de sondes : tous passent par celle-ci', () => {
    const fichiers = readdirSync('app', { recursive: true })
      .map((p) => `app/${String(p).split(/[\\/]/).join('/')}`)
      .filter((p) => /\.tsx?$/.test(p) && !/\.test\./.test(p) && !p.endsWith('sondeSchema.ts'));
    for (const f of fichiers) {
      const src = readFileSync(f, 'utf8');
      // C'est la forme EXACTE qui portait le défaut : une carte de promesses booléennes, gardée pour la vie du module.
      expect(src.includes('new Map<string, Promise<boolean>>'), f).toBe(false);
    }
  });

  it('les deux modules de sondes du dépôt l’utilisent bien', () => {
    for (const f of ['app/lib/gestion/schema.ts', 'app/lib/admin/schemaDroits.ts']) {
      expect(readFileSync(f, 'utf8'), f).toContain('creerMemoireSonde()');
    }
  });

  it('module PUR : aucun import, donc aucune base et aucun réseau', () => {
    const src = readFileSync('app/lib/db/sondeSchema.ts', 'utf8');
    expect(src.split('\n').filter((l) => /^\s*import\b/.test(l))).toEqual([]);
  });
});
