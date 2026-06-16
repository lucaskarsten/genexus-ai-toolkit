import * as vscode from 'vscode';

export interface EnrichResult {
  diagnostics: vscode.Diagnostic[];
  completions: vscode.CompletionItem[];
}

// SEAM: replace noopEnricher with a gxnext/nexa-backed implementation.
// This is the only place where KB/nexa integration touches the extension.
export interface ViewEnricher {
  enrich(ctx: { text: string; uri: string }): Promise<EnrichResult>;
}

export const noopEnricher: ViewEnricher = {
  enrich: async () => ({ diagnostics: [], completions: [] }),
};
