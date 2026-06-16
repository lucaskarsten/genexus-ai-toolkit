import * as vscode from 'vscode';
import { isUcDocument } from './ucdetect';
import { lint } from './linter';
import { getCompletions } from './completions';
import { noopEnricher } from './enricher';

const LANGUAGE_ID = 'genexus-view';
const TRIGGER_CHARS = ['<', '"', '.', '{'];

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection(LANGUAGE_ID);
  context.subscriptions.push(diagnostics);

  async function refresh(doc: vscode.TextDocument): Promise<void> {
    if (doc.languageId !== LANGUAGE_ID) { return; }
    const text = doc.getText();
    const local = lint(text);
    const enriched = await noopEnricher.enrich({ text, uri: doc.uri.toString() });
    diagnostics.set(doc.uri, [...local, ...enriched.diagnostics]);
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument(e => refresh(e.document)),
    vscode.workspace.onDidCloseTextDocument(doc => diagnostics.delete(doc.uri))
  );

  // Lint already-open documents on activation
  vscode.workspace.textDocuments.forEach(refresh);

  // Completion provider
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: LANGUAGE_ID },
      {
        async provideCompletionItems(doc, pos) {
          const text = doc.getText();
          if (!isUcDocument(text)) { return []; }
          const local = getCompletions(doc, pos);
          const enriched = await noopEnricher.enrich({ text, uri: doc.uri.toString() });
          return [...local, ...enriched.completions];
        },
      },
      ...TRIGGER_CHARS
    )
  );
}

export function deactivate(): void {
  // nothing — subscriptions disposed automatically via context.subscriptions
}
