import type { ClasseurLu, CelluleLue } from './lectureExcel';

/**
 * Un classeur exceljs → `ClasseurLu` (valeur ou résultat de formule, et la formule). Typé par sa FORME, sans importer
 * exceljs : le script d'import et les captures l'utilisent, la lecture reste pure.
 */
interface CelluleExcelJs { address: string; value: unknown; formula?: string | null }
interface FeuilleExcelJs { name: string; eachRow: (o: { includeEmpty: boolean }, f: (row: { eachCell: (o: { includeEmpty: boolean }, g: (c: CelluleExcelJs) => void) => void }) => void) => void }

const valeurDe = (v: unknown): CelluleLue['v'] => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: string };
    if ('result' in o || 'formula' in o || 'sharedFormula' in o) return typeof o.result === 'number' || typeof o.result === 'string' ? o.result : null;
    if (Array.isArray(o.richText)) return o.richText.map((x) => x.text).join('');
    if (typeof o.text === 'string') return o.text;
  }
  return null;
};

export function depuisExcelJs(classeur: { worksheets: FeuilleExcelJs[] }): ClasseurLu {
  return {
    feuilles: classeur.worksheets.map((ws) => {
      const cellules: Record<string, CelluleLue> = {};
      ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => {
        const f = typeof c.formula === 'string' && c.formula !== '' ? c.formula : undefined;
        cellules[c.address] = f === undefined ? { v: valeurDe(c.value) } : { v: valeurDe(c.value), f };
      }));
      return { nom: ws.name, cellules };
    }),
  };
}
