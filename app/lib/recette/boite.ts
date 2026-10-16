/**
 * ══ MODE RECETTE — LA « BOÎTE DE TEST » (lot RECETTE-MAC) ═════════════════════════════════════════════════════════════
 *
 * Tout ce qui AURAIT eu un effet réel (mail SMTP ou Gmail, écriture Gmail, Agenda, Drive) est noté ici au lieu de partir :
 * une ligne dans le journal du serveur (`[RECETTE] …`) et un fichier JSON dans `.recette/boite/` (hors git), lus par la
 * page /admin/recette. JAMAIS de jeton, d'en-tête d'autorisation ni de mot de passe : seulement le canal, l'adresse
 * appelée (sans paramètres), les destinataires, l'objet et un aperçu du texte.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface EntreeBoite {
  quand: string;
  canal: 'smtp' | 'gmail_envoi' | 'gmail_ecriture' | 'agenda' | 'drive' | 'google_lot';
  issue: 'intercepte' | 'simule' | 'refuse';
  a?: string | null;
  objet?: string | null;
  apercu?: string | null;
  pieces?: string[];
  requete?: string | null; // « POST https://hote/chemin » — sans paramètres ni en-têtes
}

export function dossierBoite(): string {
  return path.join(process.cwd(), '.recette', 'boite');
}

let compteur = 0;

/** Dépose une entrée (fichier + ligne de journal). Ne lève jamais : la boîte ne doit pas casser l'écran testé. */
export function deposerDansBoite(e: Omit<EntreeBoite, 'quand'>): void {
  const entree: EntreeBoite = { quand: new Date().toISOString(), ...e };
  const resume = [entree.canal, entree.issue, entree.a ? `à ${entree.a}` : null, entree.objet ? `« ${entree.objet} »` : null, entree.requete]
    .filter(Boolean).join(' — ');
  console.info(`[RECETTE] aucun effet réel : ${resume}`);
  try {
    mkdirSync(dossierBoite(), { recursive: true });
    const nom = `${entree.quand.replace(/[:.]/g, '-')}-${process.pid}-${++compteur}.json`;
    writeFileSync(path.join(dossierBoite(), nom), JSON.stringify(entree, null, 2));
  } catch (err) {
    console.error('[RECETTE] boîte de test indisponible', (err as Error)?.message);
  }
}

/** Les entrées de la boîte, la plus récente d'abord (au plus `max`). */
export function lireBoite(max = 200): EntreeBoite[] {
  let fichiers: string[] = [];
  try { fichiers = readdirSync(dossierBoite()).filter((f) => f.endsWith('.json')).sort().reverse().slice(0, max); } catch { return []; }
  const entrees: EntreeBoite[] = [];
  for (const f of fichiers) {
    try { entrees.push(JSON.parse(readFileSync(path.join(dossierBoite(), f), 'utf8')) as EntreeBoite); } catch { /* fichier illisible : ignoré */ }
  }
  return entrees;
}

/** « POST https://hote/chemin » — jamais les paramètres (ils peuvent porter un identifiant). PUR. */
export function requeteLisible(url: string, methode: string): string {
  try { const u = new URL(url); return `${methode.toUpperCase()} ${u.origin}${u.pathname}`; } catch { return methode.toUpperCase(); }
}
