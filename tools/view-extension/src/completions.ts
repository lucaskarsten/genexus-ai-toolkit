import * as vscode from 'vscode';
import { isUcDocument } from './ucdetect';
import { parseUc, ParsedUc } from './parser';

const GX_API = [
  { label: 'dom.encode',       detail: 'Escape HTML entities safely',           insert: 'dom.encode(' },
  { label: 'dom.setInnerHtml', detail: 'Set innerHTML via safe GX helper',      insert: 'dom.setInnerHtml(' },
  { label: 'dom.getText',      detail: 'Get element text content',              insert: 'dom.getText(' },
  { label: 'evt.attach',       detail: 'Attach a DOM event listener',           insert: 'evt.attach(' },
  { label: 'evt.stopPropagation', detail: 'Stop event propagation',             insert: 'evt.stopPropagation(' },
  { label: 'evt.source',       detail: 'Get the event source element',          insert: 'evt.source(' },
  { label: 'fx.obs',           detail: 'Pub/sub observable (publish/subscribe)', insert: 'fx.obs' },
];

const DATA_PARTS = ['trigger', 'panel', 'label', 'item', 'input', 'icon', 'content'];

export function getCompletions(
  document: vscode.TextDocument,
  position: vscode.Position
): vscode.CompletionItem[] {
  const text = document.getText();
  if (!isUcDocument(text)) { return []; }

  const parsed = parseUc(text);
  const offset = document.offsetAt(position);
  const lineText = document.lineAt(position.line).text;
  const before = lineText.substring(0, position.character);

  // Inside <Definition> block
  if (inRange(offset, parsed.definitionStart, parsed.definitionEnd)) {
    if (/\bType="$/.test(before))  { return typeValues(); }
    if (/\bWhen="$/.test(before))  { return whenValues(); }
    if (/<$/.test(before))         { return definitionChildren(); }
  }

  // Inside a Script body
  for (const script of parsed.scripts) {
    if (inRange(offset, script.bodyStart, script.bodyEnd)) {
      if (/gx\.$/.test(before))   { return gxApiCompletions(); }
      if (/this\.$/.test(before)) { return thisCompletions(parsed); }
    }
  }

  // HTML tail
  if (parsed.htmlStart >= 0 && offset >= parsed.htmlStart) {
    if (/\{\{?$/.test(before))        { return mustacheCompletions(parsed); }
    if (/data-part="$/.test(before))  { return dataPartCompletions(); }
  }

  return [];
}

function inRange(offset: number, start: number, end: number): boolean {
  return start >= 0 && offset >= start && offset <= end;
}

function definitionChildren(): vscode.CompletionItem[] {
  const prop = new vscode.CompletionItem('<Property />', vscode.CompletionItemKind.Property);
  prop.insertText = new vscode.SnippetString(
    '<Property Name="${1:name}" Type="${2|string,numeric,boolean,date|}" Default="${3}" />'
  );
  prop.detail = 'GeneXus UC Property declaration';
  prop.sortText = '0';

  const evt = new vscode.CompletionItem('<Event />', vscode.CompletionItemKind.Event);
  evt.insertText = new vscode.SnippetString('<Event Name="${1:OnEventName}" />');
  evt.detail = 'GeneXus UC Event declaration';
  evt.sortText = '1';

  const script = new vscode.CompletionItem('<Script AfterShow>', vscode.CompletionItemKind.Module);
  script.insertText = new vscode.SnippetString([
    '<Script Name="AfterShow" When="AfterShow">',
    '(function () {',
    "    var el = this.getContainerControl ? this.getContainerControl() : document.querySelector('[data-ucid=\"' + this.ucid + '\"]');",
    "    if (!el) return;",
    "    if (el.getAttribute('data-${1:name}-init') === '1') return;",
    "    el.setAttribute('data-${1:name}-init', '1');",
    '    $0',
    '}).call(this);',
    '</Script>',
  ].join('\n'));
  script.detail = 'AfterShow script with re-init guard (GXV004 compliant)';
  script.sortText = '2';

  return [prop, evt, script];
}

function typeValues(): vscode.CompletionItem[] {
  return ['string', 'numeric', 'boolean', 'date'].map((v, i) => {
    const item = new vscode.CompletionItem(v, vscode.CompletionItemKind.EnumMember);
    item.insertText = v + '"';
    item.sortText = String(i);
    return item;
  });
}

function whenValues(): vscode.CompletionItem[] {
  const item = new vscode.CompletionItem('AfterShow', vscode.CompletionItemKind.EnumMember);
  item.insertText = 'AfterShow"';
  item.detail = 'Runs after page render and on each Refresh/postback';
  return [item];
}

function gxApiCompletions(): vscode.CompletionItem[] {
  return GX_API.map(a => {
    const item = new vscode.CompletionItem(a.label, vscode.CompletionItemKind.Method);
    item.insertText = a.insert;
    item.detail = a.detail;
    return item;
  });
}

function thisCompletions(parsed: ParsedUc): vscode.CompletionItem[] {
  const items: vscode.CompletionItem[] = [];
  for (const p of parsed.properties) {
    const item = new vscode.CompletionItem(p.name, vscode.CompletionItemKind.Property);
    item.detail = `Property (${p.type})`;
    items.push(item);
  }
  for (const e of parsed.events) {
    const item = new vscode.CompletionItem(e.name, vscode.CompletionItemKind.Event);
    item.detail = 'GeneXus UC Event';
    items.push(item);
  }
  return items;
}

function mustacheCompletions(parsed: ParsedUc): vscode.CompletionItem[] {
  return parsed.properties.map(p => {
    const item = new vscode.CompletionItem(`{{${p.name}}}`, vscode.CompletionItemKind.Variable);
    item.insertText = p.name + '}}';
    item.detail = `Property (${p.type})`;
    return item;
  });
}

function dataPartCompletions(): vscode.CompletionItem[] {
  return DATA_PARTS.map(v => {
    const item = new vscode.CompletionItem(v, vscode.CompletionItemKind.EnumMember);
    item.insertText = v + '"';
    return item;
  });
}
