# GeneXus .view Tools

VSCode extension providing syntax highlighting, linting, and autocomplete for GeneXus `.view` files (User Controls).

## Features

- **Syntax highlighting** — XML `<Definition>` block, embedded JavaScript in `<Script>`, CSS in `<style>`, HTML template with `{{Mustache}}` placeholders
- **Linting** — 10 rules (GXV001–010) sourced from the UC Laws in `docs/user-controls-guide.md`
- **Autocomplete** — Property/Event/Script snippets, `Type=` values, `gx.*` API, `this.*` from declared properties, `{{PropertyName}}` mustache completions

Activates on all `.view` files. Linting silently skips non-UC files (WBC event code, etc.).

## Lint Rules

| ID | Severity | Description |
|----|----------|-------------|
| GXV001 | Error | `<Definition>` must have `auto="false"` |
| GXV002 | Warning | `ucid` Property must be declared |
| GXV003 | Warning | AfterShow `<Script>` should exist when HTML is present |
| GXV004 | Warning | AfterShow body must contain re-init guard (`getAttribute(…) === '1'`) |
| GXV005 | Error | `<script>` in HTML template never executes in GeneXus |
| GXV006 | Warning | ES6 syntax (`let`, `const`, `=>`) — GX18 requires ES5 |
| GXV007 | Warning | `innerHTML` assignment without `esc()` or `gx.dom.encode()` |
| GXV008 | Info | `{{Mustache}}` references undeclared Property |
| GXV009 | Info | CSS classes with no consistent BEM prefix |
| GXV010 | Warning | Long content placed in an HTML attribute |

## Development (Extension Host)

```powershell
cd tools/view-extension
npm install
node esbuild.config.js
# Press F5 in VSCode to launch Extension Host
```

Open any UC `.view` file in the Extension Host window to test.

## Production (install via vsix)

```powershell
cd tools/view-extension
npx vsce package
code --install-extension genexus-view-tools-0.1.0.vsix
```

## Extending with nexa/gxnext

Replace `noopEnricher` in `src/extension.ts` with a custom `ViewEnricher` implementation:

```ts
import { ViewEnricher } from './enricher';

const myEnricher: ViewEnricher = {
  async enrich({ text, uri }) {
    // Call gxnext MCP or KB SQL here
    return { diagnostics: [], completions: [] };
  },
};
```

This is the only integration point — parsing, linting, and completions are unaffected.
