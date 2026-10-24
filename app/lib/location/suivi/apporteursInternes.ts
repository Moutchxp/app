/**
 * ══ LOCATION — LES APPORTEURS QUI SONT DES COLLÈGUES : PASSAGE EN « INTERNE » (Arno, 24/10/2026, migration 419) ══════════════════
 *
 * « Certains apporteurs actuels sont en réalité des collègues (ex. Jean-Baptiste Pons, Arnaud Jorel, Catherine Tarisse…). Le script
 * propose le passage en INTERNE quand le nom correspond à un compte de l'interface, liste les cas douteux sans les toucher. »
 *
 * LA RÈGLE (prudente : un doute n'est jamais tranché par le script) :
 *   · « à passer » : le nom de l'apporteur (ou « prénom nom » / « nom prénom » de sa fiche) est EXACTEMENT celui d'UN SEUL compte —
 *     accents, casse, tirets et espaces ignorés, prénom et nom dans les deux ordres — et ce compte n'est pas déjà un apporteur interne ;
 *   · « douteux » : plusieurs comptes portent ce nom, ou seul le NOM DE FAMILLE correspond à un compte (« Jorel » : Arnaud ou
 *     Augustin ?), ou le compte est déjà l'apporteur interne d'une autre fiche, ou l'apporteur est de type « Collaborateur » sans aucun
 *     compte à son nom — listé, jamais touché ;
 *   · « forcé » : un couple apporteur → compte donné à la main (`--lier=12:5`), quand Arno a tranché un cas douteux ;
 *   · sinon : aucun compte ne correspond, l'apporteur reste externe (compté, pas listé un à un).
 * Un apporteur archivé ou déjà interne n'est pas examiné. PUR (aucune base) : le script lit, ce module décide.
 */

export interface ApporteurExamine { id: number; nom: string; type: string; nomFamille: string | null; prenom: string | null; compteId: number | null; archive: boolean }
export interface CompteInterface { id: number; prenom: string | null; nom: string | null; identifiant: string | null; actif: boolean }

export type DecisionInterne =
  | { sorte: 'passer'; apporteur: ApporteurExamine; compte: CompteInterface; raison: string }
  | { sorte: 'douteux'; apporteur: ApporteurExamine; comptes: CompteInterface[]; raison: string }
  | { sorte: 'externe'; apporteur: ApporteurExamine };

/** Accents, casse, tirets, apostrophes et espaces multiples ignorés. PUR. */
export const normaliserNom = (t: string | null | undefined): string => (t ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[-'’.]/g, ' ').replace(/\s+/g, ' ').trim();

/** Les écritures d'un nom de compte : « prénom nom » et « nom prénom ». */
function clesCompte(c: CompteInterface): string[] {
  const p = normaliserNom(c.prenom);
  const n = normaliserNom(c.nom);
  if (p === '' && n === '') return [];
  return [...new Set([`${p} ${n}`.trim(), `${n} ${p}`.trim()])];
}
/** Les écritures d'un apporteur : son nom, et « prénom nom » / « nom prénom » de sa fiche. */
function clesApporteur(a: ApporteurExamine): string[] {
  const p = normaliserNom(a.prenom);
  const n = normaliserNom(a.nomFamille);
  return [...new Set([normaliserNom(a.nom), ...(n !== '' ? [`${p} ${n}`.trim(), `${n} ${p}`.trim()] : [])].filter((x) => x !== ''))];
}
/** Le libellé d'un compte (« Prénom Nom », sinon l'identifiant). */
export const libelleCompte = (c: CompteInterface): string => [c.prenom, c.nom].filter((x) => x && x.trim() !== '').join(' ').trim() || c.identifiant || `compte ${c.id}`;

export function planPassageInterne(apporteurs: readonly ApporteurExamine[], comptes: readonly CompteInterface[], forces: ReadonlyMap<number, number> = new Map()): DecisionInterne[] {
  const dejaLies = new Map(apporteurs.filter((a) => a.compteId !== null && !a.archive).map((a) => [a.compteId as number, a]));
  const sortie: DecisionInterne[] = [];
  for (const a of apporteurs) {
    if (a.archive || a.compteId !== null) continue;
    const force = forces.get(a.id);
    if (force !== undefined) {
      const c = comptes.find((x) => x.id === force);
      if (c === undefined) { sortie.push({ sorte: 'douteux', apporteur: a, comptes: [], raison: `compte n° ${force} demandé (--lier) introuvable` }); continue; }
      const autre = dejaLies.get(c.id);
      if (autre !== undefined) { sortie.push({ sorte: 'douteux', apporteur: a, comptes: [c], raison: `ce compte est déjà l’apporteur interne « ${autre.nom} »` }); continue; }
      sortie.push({ sorte: 'passer', apporteur: a, compte: c, raison: 'lien donné à la main (--lier)' });
      continue;
    }
    const cles = clesApporteur(a);
    const exacts = comptes.filter((c) => clesCompte(c).some((k) => cles.includes(k)));
    if (exacts.length === 1) {
      const c = exacts[0];
      const autre = dejaLies.get(c.id);
      if (autre !== undefined) sortie.push({ sorte: 'douteux', apporteur: a, comptes: [c], raison: `ce compte est déjà l’apporteur interne « ${autre.nom} »` });
      else sortie.push({ sorte: 'passer', apporteur: a, compte: c, raison: 'nom identique à celui du compte' });
      continue;
    }
    if (exacts.length > 1) { sortie.push({ sorte: 'douteux', apporteur: a, comptes: exacts, raison: 'plusieurs comptes portent ce nom' }); continue; }
    // Seul le nom de famille correspond : un doute (un parent, un homonyme, un prénom mal écrit).
    const mots = new Set(cles.flatMap((k) => k.split(' ')));
    const parNom = comptes.filter((c) => normaliserNom(c.nom) !== '' && mots.has(normaliserNom(c.nom)));
    if (parNom.length > 0) { sortie.push({ sorte: 'douteux', apporteur: a, comptes: parNom, raison: 'seul le nom de famille correspond à un compte' }); continue; }
    // Marqué « Collaborateur » sans aucun compte à son nom : un collègue sans accès ? (un interne a un compte : à créer, ou il reste externe).
    if (a.type === 'collaborateur') { sortie.push({ sorte: 'douteux', apporteur: a, comptes: [], raison: 'type « Collaborateur » mais aucun compte de l’interface à ce nom' }); continue; }
    sortie.push({ sorte: 'externe', apporteur: a });
  }
  return sortie;
}

/** Les liens donnés à la main : `--lier=12:5,14:7` (apporteur:compte). Illisible → erreur. PUR. */
export function lireLiens(texte: string | null): Map<number, number> {
  const m = new Map<number, number>();
  if (texte === null || texte.trim() === '') return m;
  for (const morceau of texte.split(',')) {
    const r = /^\s*(\d+)\s*:\s*(\d+)\s*$/.exec(morceau);
    if (r === null) throw new Error(`--lier : « ${morceau} » illisible (attendu apporteur:compte, ex. --lier=12:5).`);
    m.set(Number(r[1]), Number(r[2]));
  }
  return m;
}

/** Le rapport, lisible par Arno. PUR. */
export function textePassageInterne(plan: readonly DecisionInterne[], o: { reel: boolean; base: string; lus: number; comptes: number; ecrits: number }): string {
  const passer = plan.filter((d): d is Extract<DecisionInterne, { sorte: 'passer' }> => d.sorte === 'passer');
  const douteux = plan.filter((d): d is Extract<DecisionInterne, { sorte: 'douteux' }> => d.sorte === 'douteux');
  const externes = plan.filter((d) => d.sorte === 'externe');
  const l: string[] = [];
  l.push(`APPORTEURS QUI SONT DES COLLÈGUES — PASSAGE EN « INTERNE » — ${o.reel ? 'RÉEL' : 'ESSAI (aucune écriture)'}`);
  l.push(`base : ${o.base} · apporteurs examinés : ${o.lus} · comptes de l’interface : ${o.comptes} · à passer en interne : ${passer.length} · douteux : ${douteux.length} · restent externes : ${externes.length}`);
  l.push('');
  l.push(passer.length === 0 ? 'À PASSER EN INTERNE : aucun.' : 'À PASSER EN INTERNE :');
  for (const d of passer) {
    l.push(`  · apporteur n° ${d.apporteur.id} « ${d.apporteur.nom} » (${d.apporteur.type}) → compte n° ${d.compte.id} ${libelleCompte(d.compte)}${d.compte.identifiant ? ` <${d.compte.identifiant}>` : ''}${d.compte.actif ? '' : ' (compte désactivé)'} — ${d.raison}${o.reel ? '' : ' — serait passé en interne'}`);
  }
  l.push('');
  l.push(douteux.length === 0 ? 'DOUTEUX (rien n’est touché) : aucun.' : 'DOUTEUX (rien n’est touché — à trancher, puis --lier=apporteur:compte) :');
  for (const d of douteux) {
    l.push(`  · apporteur n° ${d.apporteur.id} « ${d.apporteur.nom} » — ${d.raison}${d.comptes.length > 0 ? ` : ${d.comptes.map((c) => `compte n° ${c.id} ${libelleCompte(c)}${c.identifiant ? ` <${c.identifiant}>` : ''}`).join(' ; ')}` : ''}`);
  }
  l.push('');
  l.push(`RESTENT EXTERNES (aucun compte à ce nom) : ${externes.length}${externes.length > 0 ? ` — ${externes.map((d) => d.apporteur.nom).join(', ')}` : ''}`);
  if (o.reel) l.push('', `écrits : ${o.ecrits} (chaque passage journalisé, entité « location_apporteur »).`);
  return `${l.join('\n')}\n`;
}
