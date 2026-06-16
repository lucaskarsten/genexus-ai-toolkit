export interface ParsedProperty {
  name: string;
  type: string;
  defaultValue: string;
  start: number;
  end: number;
}

export interface ParsedEvent {
  name: string;
  start: number;
  end: number;
}

export interface ParsedScript {
  name: string;
  when: string;
  bodyStart: number;
  bodyEnd: number;
  tagStart: number;
  tagEnd: number;
}

export interface ParsedUc {
  definitionStart: number;
  definitionEnd: number;
  hasDefinitionAutoFalse: boolean;
  properties: ParsedProperty[];
  events: ParsedEvent[];
  scripts: ParsedScript[];
  styleStart: number;
  styleEnd: number;
  htmlStart: number;
}

const EMPTY: ParsedUc = {
  definitionStart: -1,
  definitionEnd: -1,
  hasDefinitionAutoFalse: false,
  properties: [],
  events: [],
  scripts: [],
  styleStart: -1,
  styleEnd: -1,
  htmlStart: -1,
};

export function parseUc(text: string): ParsedUc {
  const result: ParsedUc = { ...EMPTY, properties: [], events: [], scripts: [] };

  // <Definition ...> block
  const defOpenRe = /<Definition\b([^>]*)>/i;
  const defOpenM = defOpenRe.exec(text);
  if (defOpenM) {
    result.hasDefinitionAutoFalse = /auto\s*=\s*"false"/i.test(defOpenM[1]);
    result.definitionStart = defOpenM.index;
    const defClose = text.indexOf('</Definition>', defOpenM.index);
    result.definitionEnd = defClose >= 0 ? defClose + '</Definition>'.length : text.length;
  }

  // <Property .../>
  const propRe = /<Property\b([^>]*?)\/?>(?:<\/Property>)?/gi;
  let m: RegExpExecArray | null;
  while ((m = propRe.exec(text)) !== null) {
    const attrs = m[1];
    const nameM = /\bName\s*=\s*"([^"]*)"/i.exec(attrs);
    if (nameM) {
      result.properties.push({
        name: nameM[1],
        type: (/\bType\s*=\s*"([^"]*)"/i.exec(attrs) || ['', 'string'])[1],
        defaultValue: (/\bDefault\s*=\s*"([^"]*)"/i.exec(attrs) || ['', ''])[1],
        start: m.index,
        end: m.index + m[0].length,
      });
    }
  }

  // <Event .../>
  const eventRe = /<Event\b([^>]*?)\/?>(?:<\/Event>)?/gi;
  while ((m = eventRe.exec(text)) !== null) {
    const nameM = /\bName\s*=\s*"([^"]*)"/i.exec(m[1]);
    if (nameM) {
      result.events.push({
        name: nameM[1],
        start: m.index,
        end: m.index + m[0].length,
      });
    }
  }

  // <Script ...>...</Script>
  const scriptRe = /<Script\b([^>]*)>([\s\S]*?)<\/Script>/gi;
  while ((m = scriptRe.exec(text)) !== null) {
    const attrs = m[1];
    const openTagEnd = m.index + m[0].indexOf('>') + 1;
    const closeTagStart = m.index + m[0].lastIndexOf('</Script>');
    result.scripts.push({
      name: (/\bName\s*=\s*"([^"]*)"/i.exec(attrs) || ['', ''])[1],
      when: (/\bWhen\s*=\s*"([^"]*)"/i.exec(attrs) || ['', ''])[1],
      bodyStart: openTagEnd,
      bodyEnd: closeTagStart,
      tagStart: m.index,
      tagEnd: m.index + m[0].length,
    });
  }

  // <style>...</style>
  const styleM = /<style\b[^>]*>([\s\S]*?)<\/style>/i.exec(text);
  if (styleM) {
    result.styleStart = styleM.index;
    result.styleEnd = styleM.index + styleM[0].length;
  }

  // HTML tail starts after </Definition>
  if (result.definitionEnd > 0 && result.definitionEnd < text.length) {
    const tail = text.substring(result.definitionEnd);
    if (tail.trim().length > 0) {
      result.htmlStart = result.definitionEnd;
    }
  }

  return result;
}

export function positionAt(text: string, offset: number): { line: number; character: number } {
  const before = text.substring(0, Math.max(0, offset));
  const lines = before.split('\n');
  return { line: lines.length - 1, character: lines[lines.length - 1].length };
}
