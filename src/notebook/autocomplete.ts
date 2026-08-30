import { BUILTIN_FUNCTIONS, CONSTANTS } from '../core/parser';
import { Environment } from '../core/types';

export interface AutocompleteItem {
  name: string;
  kind: 'builtin' | 'constant' | 'variable' | 'function';
  detail: string;
}

export class AutocompleteEngine {
  public static getSuggestions(prefix: string, env: Environment): AutocompleteItem[] {
    const cleanPrefix = prefix.toLowerCase();
    const results: AutocompleteItem[] = [];

    // Builtins
    for (const fn of BUILTIN_FUNCTIONS) {
      if (fn.toLowerCase().startsWith(cleanPrefix)) {
        results.push({
          name: fn,
          kind: 'builtin',
          detail: 'Builtin function',
        });
      }
    }

    // Constants
    for (const c of CONSTANTS) {
      if (c.toLowerCase().startsWith(cleanPrefix)) {
        results.push({
          name: c,
          kind: 'constant',
          detail: 'Mathematical constant',
        });
      }
    }

    // User environment
    for (const [key, val] of Object.entries(env)) {
      if (key.toLowerCase().startsWith(cleanPrefix) && !CONSTANTS.has(key) && !BUILTIN_FUNCTIONS.has(key)) {
        if (val && typeof val === 'object' && 'type' in val && val.type === 'function') {
          results.push({
            name: key,
            kind: 'function',
            detail: `User function (${val.params.join(', ')})`,
          });
        } else {
          results.push({
            name: key,
            kind: 'variable',
            detail: `User variable`,
          });
        }
      }
    }

    return results.sort((a, b) => a.name.localeCompare(b.name));
  }
}
