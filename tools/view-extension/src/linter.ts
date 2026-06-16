import * as vscode from 'vscode';
import { isUcDocument } from './ucdetect';
import { parseUc, positionAt } from './parser';

function range(text: string, start: number, end: number): vscode.Range {
  const s = positionAt(text, start);
  const e = positionAt(text, end);
  return new vscode.Range(s.line, s.character, e.line, e.character);
}

export function lint(text: string): vscode.Diagnostic[] {
  if (!isUcDocument(text)) { return []; }
  const parsed = parseUc(text);
  const diags: vscode.Diagnostic[] = [];

  const defRange = parsed.definitionStart >= 0
    ? range(text, parsed.definitionStart, parsed.definitionEnd)
    : new vscode.Range(0, 0, 0, 0);

  // GXV001: <Definition> must have auto="false"
  if (parsed.definitionStart >= 0 && !parsed.hasDefinitionAutoFalse) {
    diags.push(new vscode.Diagnostic(
      defRange,
      'GXV001: <Definition> must have auto="false"',
      vscode.DiagnosticSeverity.Error
    ));
  }

  // GXV002: ucid Property must be declared
  if (!parsed.properties.some(p => p.name.toLowerCase() === 'ucid')) {
    diags.push(new vscode.Diagnostic(
      defRange,
      'GXV002: Property "ucid" must be declared (required for multi-instance identification)',
      vscode.DiagnosticSeverity.Warning
    ));
  }

  // GXV003: AfterShow script should exist when HTML content is present
  const hasAfterShow = parsed.scripts.some(s => s.when === 'AfterShow');
  if (parsed.htmlStart >= 0 && !hasAfterShow) {
    const htmlPos = positionAt(text, parsed.htmlStart);
    diags.push(new vscode.Diagnostic(
      new vscode.Range(htmlPos.line, htmlPos.character, htmlPos.line, htmlPos.character + 1),
      'GXV003: An AfterShow <Script> should exist when DOM content is present',
      vscode.DiagnosticSeverity.Warning
    ));
  }

  // GXV004: AfterShow body must contain re-init guard (getAttribute(…) === '1' shape)
  for (const script of parsed.scripts) {
    if (script.when !== 'AfterShow') { continue; }
    const body = text.substring(script.bodyStart, script.bodyEnd);
    if (!/getAttribute\s*\([^)]+\)\s*===\s*['"]1['"]/.test(body)) {
      diags.push(new vscode.Diagnostic(
        range(text, script.tagStart, script.tagEnd),
        "GXV004: AfterShow body should include a re-init guard: getAttribute('data-*-init') === '1'",
        vscode.DiagnosticSeverity.Warning
      ));
    }
  }

  // GXV005: No <script> tag in HTML tail (never executes in GeneXus)
  if (parsed.htmlStart >= 0) {
    const htmlTail = text.substring(parsed.htmlStart);
    const scriptTagM = /<script\b/i.exec(htmlTail);
    if (scriptTagM) {
      const abs = parsed.htmlStart + scriptTagM.index;
      diags.push(new vscode.Diagnostic(
        range(text, abs, abs + scriptTagM[0].length),
        'GXV005: <script> in HTML template never executes in GeneXus — use <Script When="AfterShow"> inside <Definition>',
        vscode.DiagnosticSeverity.Error
      ));
    }
  }

  // GXV006: ES6 tokens in Script body (let/const/arrow)
  for (const script of parsed.scripts) {
    const body = text.substring(script.bodyStart, script.bodyEnd);
    const es6M = /\b(let |const )|=>/.exec(body);
    if (es6M) {
      diags.push(new vscode.Diagnostic(
        range(text, script.tagStart, script.tagEnd),
        `GXV006: ES6 syntax ("${es6M[0].trim()}") — GeneXus 18 runtime requires ES5. Use var and function() {}`,
        vscode.DiagnosticSeverity.Warning
      ));
    }
  }

  // GXV007: innerHTML assignment without esc()/gx.dom.encode() nearby
  for (const script of parsed.scripts) {
    const body = text.substring(script.bodyStart, script.bodyEnd);
    if (/innerHTML\s*=/.test(body) && !/esc\s*\(|gx\.dom\.encode\s*\(|gx\.dom\.setInnerHtml\s*\(/.test(body)) {
      diags.push(new vscode.Diagnostic(
        range(text, script.tagStart, script.tagEnd),
        'GXV007: innerHTML assignment without esc() or gx.dom.encode() — potential XSS risk',
        vscode.DiagnosticSeverity.Warning
      ));
    }
  }

  // GXV008 (Info): {{Mustache}} references undeclared property
  const declaredProps = new Set(parsed.properties.map(p => p.name.toLowerCase()));
  const mustacheRe = /\{\{([^}]+)\}\}/g;
  let mustacheM: RegExpExecArray | null;
  while ((mustacheM = mustacheRe.exec(text)) !== null) {
    const name = mustacheM[1].trim();
    if (name.toLowerCase() !== 'ucid' && !declaredProps.has(name.toLowerCase())) {
      diags.push(new vscode.Diagnostic(
        range(text, mustacheM.index, mustacheM.index + mustacheM[0].length),
        `GXV008: "{{${name}}}" references a name not declared as a Property`,
        vscode.DiagnosticSeverity.Information
      ));
    }
  }

  // GXV009 (Info): CSS classes with no consistent BEM prefix
  if (parsed.styleStart >= 0) {
    const styleText = text.substring(parsed.styleStart, parsed.styleEnd);
    const classNames = styleText.match(/\.([\w-]+)/g) ?? [];
    const prefixes = new Set(classNames.map(c => c.replace('.', '').split('__')[0].split('--')[0]));
    if (prefixes.size > 4) {
      diags.push(new vscode.Diagnostic(
        range(text, parsed.styleStart, parsed.styleEnd),
        'GXV009: CSS classes use many different prefixes — consider a single BEM component prefix',
        vscode.DiagnosticSeverity.Information
      ));
    }
  }

  // GXV010: Dynamic content in HTML attribute (long string concat inside attribute value)
  if (parsed.htmlStart >= 0) {
    const htmlTail = text.substring(parsed.htmlStart);
    const attrConcatM = /\w+="[^"]{80,}"/.exec(htmlTail);
    if (attrConcatM) {
      const abs = parsed.htmlStart + attrConcatM.index;
      diags.push(new vscode.Diagnostic(
        range(text, abs, abs + attrConcatM[0].length),
        'GXV010: Long content in HTML attribute — consider placing dynamic content in a child element instead',
        vscode.DiagnosticSeverity.Warning
      ));
    }
  }

  return diags;
}
