"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode3 = __toESM(require("vscode"));

// src/ucdetect.ts
var WBC_PREFIX = /^(Event |Sub |Do Case)/i;
var UC_MARKER = /<(Definition|Property|Event|Script)[\s>/]/;
function isUcDocument(text) {
  const trimmed = text.trimStart();
  if (WBC_PREFIX.test(trimmed)) {
    return false;
  }
  return UC_MARKER.test(text);
}

// src/linter.ts
var vscode = __toESM(require("vscode"));

// src/parser.ts
var EMPTY = {
  definitionStart: -1,
  definitionEnd: -1,
  hasDefinitionAutoFalse: false,
  properties: [],
  events: [],
  scripts: [],
  styleStart: -1,
  styleEnd: -1,
  htmlStart: -1
};
function parseUc(text) {
  const result = { ...EMPTY, properties: [], events: [], scripts: [] };
  const defOpenRe = /<Definition\b([^>]*)>/i;
  const defOpenM = defOpenRe.exec(text);
  if (defOpenM) {
    result.hasDefinitionAutoFalse = /auto\s*=\s*"false"/i.test(defOpenM[1]);
    result.definitionStart = defOpenM.index;
    const defClose = text.indexOf("</Definition>", defOpenM.index);
    result.definitionEnd = defClose >= 0 ? defClose + "</Definition>".length : text.length;
  }
  const propRe = /<Property\b([^>]*?)\/?>(?:<\/Property>)?/gi;
  let m;
  while ((m = propRe.exec(text)) !== null) {
    const attrs = m[1];
    const nameM = /\bName\s*=\s*"([^"]*)"/i.exec(attrs);
    if (nameM) {
      result.properties.push({
        name: nameM[1],
        type: (/\bType\s*=\s*"([^"]*)"/i.exec(attrs) || ["", "string"])[1],
        defaultValue: (/\bDefault\s*=\s*"([^"]*)"/i.exec(attrs) || ["", ""])[1],
        start: m.index,
        end: m.index + m[0].length
      });
    }
  }
  const eventRe = /<Event\b([^>]*?)\/?>(?:<\/Event>)?/gi;
  while ((m = eventRe.exec(text)) !== null) {
    const nameM = /\bName\s*=\s*"([^"]*)"/i.exec(m[1]);
    if (nameM) {
      result.events.push({
        name: nameM[1],
        start: m.index,
        end: m.index + m[0].length
      });
    }
  }
  const scriptRe = /<Script\b([^>]*)>([\s\S]*?)<\/Script>/gi;
  while ((m = scriptRe.exec(text)) !== null) {
    const attrs = m[1];
    const openTagEnd = m.index + m[0].indexOf(">") + 1;
    const closeTagStart = m.index + m[0].lastIndexOf("</Script>");
    result.scripts.push({
      name: (/\bName\s*=\s*"([^"]*)"/i.exec(attrs) || ["", ""])[1],
      when: (/\bWhen\s*=\s*"([^"]*)"/i.exec(attrs) || ["", ""])[1],
      bodyStart: openTagEnd,
      bodyEnd: closeTagStart,
      tagStart: m.index,
      tagEnd: m.index + m[0].length
    });
  }
  const styleM = /<style\b[^>]*>([\s\S]*?)<\/style>/i.exec(text);
  if (styleM) {
    result.styleStart = styleM.index;
    result.styleEnd = styleM.index + styleM[0].length;
  }
  if (result.definitionEnd > 0 && result.definitionEnd < text.length) {
    const tail = text.substring(result.definitionEnd);
    if (tail.trim().length > 0) {
      result.htmlStart = result.definitionEnd;
    }
  }
  return result;
}
function positionAt(text, offset) {
  const before = text.substring(0, Math.max(0, offset));
  const lines = before.split("\n");
  return { line: lines.length - 1, character: lines[lines.length - 1].length };
}

// src/linter.ts
function range(text, start, end) {
  const s = positionAt(text, start);
  const e = positionAt(text, end);
  return new vscode.Range(s.line, s.character, e.line, e.character);
}
function lint(text) {
  if (!isUcDocument(text)) {
    return [];
  }
  const parsed = parseUc(text);
  const diags = [];
  const defRange = parsed.definitionStart >= 0 ? range(text, parsed.definitionStart, parsed.definitionEnd) : new vscode.Range(0, 0, 0, 0);
  if (parsed.definitionStart >= 0 && !parsed.hasDefinitionAutoFalse) {
    diags.push(new vscode.Diagnostic(
      defRange,
      'GXV001: <Definition> must have auto="false"',
      vscode.DiagnosticSeverity.Error
    ));
  }
  if (!parsed.properties.some((p) => p.name.toLowerCase() === "ucid")) {
    diags.push(new vscode.Diagnostic(
      defRange,
      'GXV002: Property "ucid" must be declared (required for multi-instance identification)',
      vscode.DiagnosticSeverity.Warning
    ));
  }
  const hasAfterShow = parsed.scripts.some((s) => s.when === "AfterShow");
  if (parsed.htmlStart >= 0 && !hasAfterShow) {
    const htmlPos = positionAt(text, parsed.htmlStart);
    diags.push(new vscode.Diagnostic(
      new vscode.Range(htmlPos.line, htmlPos.character, htmlPos.line, htmlPos.character + 1),
      "GXV003: An AfterShow <Script> should exist when DOM content is present",
      vscode.DiagnosticSeverity.Warning
    ));
  }
  for (const script of parsed.scripts) {
    if (script.when !== "AfterShow") {
      continue;
    }
    const body = text.substring(script.bodyStart, script.bodyEnd);
    if (!/getAttribute\s*\([^)]+\)\s*===\s*['"]1['"]/.test(body)) {
      diags.push(new vscode.Diagnostic(
        range(text, script.tagStart, script.tagEnd),
        "GXV004: AfterShow body should include a re-init guard: getAttribute('data-*-init') === '1'",
        vscode.DiagnosticSeverity.Warning
      ));
    }
  }
  if (parsed.htmlStart >= 0) {
    const htmlTail = text.substring(parsed.htmlStart);
    const scriptTagM = /<script\b/i.exec(htmlTail);
    if (scriptTagM) {
      const abs = parsed.htmlStart + scriptTagM.index;
      diags.push(new vscode.Diagnostic(
        range(text, abs, abs + scriptTagM[0].length),
        'GXV005: <script> in HTML template never executes in GeneXus \u2014 use <Script When="AfterShow"> inside <Definition>',
        vscode.DiagnosticSeverity.Error
      ));
    }
  }
  for (const script of parsed.scripts) {
    const body = text.substring(script.bodyStart, script.bodyEnd);
    const es6M = /\b(let |const )|=>/.exec(body);
    if (es6M) {
      diags.push(new vscode.Diagnostic(
        range(text, script.tagStart, script.tagEnd),
        `GXV006: ES6 syntax ("${es6M[0].trim()}") \u2014 GeneXus 18 runtime requires ES5. Use var and function() {}`,
        vscode.DiagnosticSeverity.Warning
      ));
    }
  }
  for (const script of parsed.scripts) {
    const body = text.substring(script.bodyStart, script.bodyEnd);
    if (/innerHTML\s*=/.test(body) && !/esc\s*\(|gx\.dom\.encode\s*\(|gx\.dom\.setInnerHtml\s*\(/.test(body)) {
      diags.push(new vscode.Diagnostic(
        range(text, script.tagStart, script.tagEnd),
        "GXV007: innerHTML assignment without esc() or gx.dom.encode() \u2014 potential XSS risk",
        vscode.DiagnosticSeverity.Warning
      ));
    }
  }
  const declaredProps = new Set(parsed.properties.map((p) => p.name.toLowerCase()));
  const mustacheRe = /\{\{([^}]+)\}\}/g;
  let mustacheM;
  while ((mustacheM = mustacheRe.exec(text)) !== null) {
    const name = mustacheM[1].trim();
    if (name.toLowerCase() !== "ucid" && !declaredProps.has(name.toLowerCase())) {
      diags.push(new vscode.Diagnostic(
        range(text, mustacheM.index, mustacheM.index + mustacheM[0].length),
        `GXV008: "{{${name}}}" references a name not declared as a Property`,
        vscode.DiagnosticSeverity.Information
      ));
    }
  }
  if (parsed.styleStart >= 0) {
    const styleText = text.substring(parsed.styleStart, parsed.styleEnd);
    const classNames = styleText.match(/\.([\w-]+)/g) ?? [];
    const prefixes = new Set(classNames.map((c) => c.replace(".", "").split("__")[0].split("--")[0]));
    if (prefixes.size > 4) {
      diags.push(new vscode.Diagnostic(
        range(text, parsed.styleStart, parsed.styleEnd),
        "GXV009: CSS classes use many different prefixes \u2014 consider a single BEM component prefix",
        vscode.DiagnosticSeverity.Information
      ));
    }
  }
  if (parsed.htmlStart >= 0) {
    const htmlTail = text.substring(parsed.htmlStart);
    const attrConcatM = /\w+="[^"]{80,}"/.exec(htmlTail);
    if (attrConcatM) {
      const abs = parsed.htmlStart + attrConcatM.index;
      diags.push(new vscode.Diagnostic(
        range(text, abs, abs + attrConcatM[0].length),
        "GXV010: Long content in HTML attribute \u2014 consider placing dynamic content in a child element instead",
        vscode.DiagnosticSeverity.Warning
      ));
    }
  }
  return diags;
}

// src/completions.ts
var vscode2 = __toESM(require("vscode"));
var GX_API = [
  { label: "dom.encode", detail: "Escape HTML entities safely", insert: "dom.encode(" },
  { label: "dom.setInnerHtml", detail: "Set innerHTML via safe GX helper", insert: "dom.setInnerHtml(" },
  { label: "dom.getText", detail: "Get element text content", insert: "dom.getText(" },
  { label: "evt.attach", detail: "Attach a DOM event listener", insert: "evt.attach(" },
  { label: "evt.stopPropagation", detail: "Stop event propagation", insert: "evt.stopPropagation(" },
  { label: "evt.source", detail: "Get the event source element", insert: "evt.source(" },
  { label: "fx.obs", detail: "Pub/sub observable (publish/subscribe)", insert: "fx.obs" }
];
var DATA_PARTS = ["trigger", "panel", "label", "item", "input", "icon", "content"];
function getCompletions(document, position) {
  const text = document.getText();
  if (!isUcDocument(text)) {
    return [];
  }
  const parsed = parseUc(text);
  const offset = document.offsetAt(position);
  const lineText = document.lineAt(position.line).text;
  const before = lineText.substring(0, position.character);
  if (inRange(offset, parsed.definitionStart, parsed.definitionEnd)) {
    if (/\bType="$/.test(before)) {
      return typeValues();
    }
    if (/\bWhen="$/.test(before)) {
      return whenValues();
    }
    if (/<$/.test(before)) {
      return definitionChildren();
    }
  }
  for (const script of parsed.scripts) {
    if (inRange(offset, script.bodyStart, script.bodyEnd)) {
      if (/gx\.$/.test(before)) {
        return gxApiCompletions();
      }
      if (/this\.$/.test(before)) {
        return thisCompletions(parsed);
      }
    }
  }
  if (parsed.htmlStart >= 0 && offset >= parsed.htmlStart) {
    if (/\{\{?$/.test(before)) {
      return mustacheCompletions(parsed);
    }
    if (/data-part="$/.test(before)) {
      return dataPartCompletions();
    }
  }
  return [];
}
function inRange(offset, start, end) {
  return start >= 0 && offset >= start && offset <= end;
}
function definitionChildren() {
  const prop = new vscode2.CompletionItem("<Property />", vscode2.CompletionItemKind.Property);
  prop.insertText = new vscode2.SnippetString(
    '<Property Name="${1:name}" Type="${2|string,numeric,boolean,date|}" Default="${3}" />'
  );
  prop.detail = "GeneXus UC Property declaration";
  prop.sortText = "0";
  const evt = new vscode2.CompletionItem("<Event />", vscode2.CompletionItemKind.Event);
  evt.insertText = new vscode2.SnippetString('<Event Name="${1:OnEventName}" />');
  evt.detail = "GeneXus UC Event declaration";
  evt.sortText = "1";
  const script = new vscode2.CompletionItem("<Script AfterShow>", vscode2.CompletionItemKind.Module);
  script.insertText = new vscode2.SnippetString([
    '<Script Name="AfterShow" When="AfterShow">',
    "(function () {",
    `    var el = this.getContainerControl ? this.getContainerControl() : document.querySelector('[data-ucid="' + this.ucid + '"]');`,
    "    if (!el) return;",
    "    if (el.getAttribute('data-${1:name}-init') === '1') return;",
    "    el.setAttribute('data-${1:name}-init', '1');",
    "    $0",
    "}).call(this);",
    "</Script>"
  ].join("\n"));
  script.detail = "AfterShow script with re-init guard (GXV004 compliant)";
  script.sortText = "2";
  return [prop, evt, script];
}
function typeValues() {
  return ["string", "numeric", "boolean", "date"].map((v, i) => {
    const item = new vscode2.CompletionItem(v, vscode2.CompletionItemKind.EnumMember);
    item.insertText = v + '"';
    item.sortText = String(i);
    return item;
  });
}
function whenValues() {
  const item = new vscode2.CompletionItem("AfterShow", vscode2.CompletionItemKind.EnumMember);
  item.insertText = 'AfterShow"';
  item.detail = "Runs after page render and on each Refresh/postback";
  return [item];
}
function gxApiCompletions() {
  return GX_API.map((a) => {
    const item = new vscode2.CompletionItem(a.label, vscode2.CompletionItemKind.Method);
    item.insertText = a.insert;
    item.detail = a.detail;
    return item;
  });
}
function thisCompletions(parsed) {
  const items = [];
  for (const p of parsed.properties) {
    const item = new vscode2.CompletionItem(p.name, vscode2.CompletionItemKind.Property);
    item.detail = `Property (${p.type})`;
    items.push(item);
  }
  for (const e of parsed.events) {
    const item = new vscode2.CompletionItem(e.name, vscode2.CompletionItemKind.Event);
    item.detail = "GeneXus UC Event";
    items.push(item);
  }
  return items;
}
function mustacheCompletions(parsed) {
  return parsed.properties.map((p) => {
    const item = new vscode2.CompletionItem(`{{${p.name}}}`, vscode2.CompletionItemKind.Variable);
    item.insertText = p.name + "}}";
    item.detail = `Property (${p.type})`;
    return item;
  });
}
function dataPartCompletions() {
  return DATA_PARTS.map((v) => {
    const item = new vscode2.CompletionItem(v, vscode2.CompletionItemKind.EnumMember);
    item.insertText = v + '"';
    return item;
  });
}

// src/enricher.ts
var noopEnricher = {
  enrich: async () => ({ diagnostics: [], completions: [] })
};

// src/extension.ts
var LANGUAGE_ID = "genexus-view";
var TRIGGER_CHARS = ["<", '"', ".", "{"];
function activate(context) {
  const diagnostics = vscode3.languages.createDiagnosticCollection(LANGUAGE_ID);
  context.subscriptions.push(diagnostics);
  async function refresh(doc) {
    if (doc.languageId !== LANGUAGE_ID) {
      return;
    }
    const text = doc.getText();
    const local = lint(text);
    const enriched = await noopEnricher.enrich({ text, uri: doc.uri.toString() });
    diagnostics.set(doc.uri, [...local, ...enriched.diagnostics]);
  }
  context.subscriptions.push(
    vscode3.workspace.onDidOpenTextDocument(refresh),
    vscode3.workspace.onDidChangeTextDocument((e) => refresh(e.document)),
    vscode3.workspace.onDidCloseTextDocument((doc) => diagnostics.delete(doc.uri))
  );
  vscode3.workspace.textDocuments.forEach(refresh);
  context.subscriptions.push(
    vscode3.languages.registerCompletionItemProvider(
      { language: LANGUAGE_ID },
      {
        async provideCompletionItems(doc, pos) {
          const text = doc.getText();
          if (!isUcDocument(text)) {
            return [];
          }
          const local = getCompletions(doc, pos);
          const enriched = await noopEnricher.enrich({ text, uri: doc.uri.toString() });
          return [...local, ...enriched.completions];
        }
      },
      ...TRIGGER_CHARS
    )
  );
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
