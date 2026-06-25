# Changelog

## [2.0.0] — 2026-06-25

### 🚀 Major Release — Usabilidade em Destaque

Esta versão marca a chegada à maturidade do **gx18-mcp**: de um servidor MCP experimental com 19 ferramentas a uma plataforma completa com **47 ferramentas**, UI de chat profissional, round-trip XPZ para scripts de UC, clone SQL de WBC/WBP, suite de benchmark e proteção avançada de integridade de KB.

### Features

* **gx18-mcp:** 47 ferramentas MCP — `gx_clone`, `gx_bulk_modify`, `gx_compare`, `gx_diff`, `gx_lint`, `gx_stats`, `gx_modules`, `gx_attribute`, `gx_dead_code`, `gx_patch_xpz` e mais
* **gx18-mcp:** `gx_modify script:AfterShow` e `script:<Method>` — edita scripts de UC via SQL blob sem abrir o IDE
* **gx18-mcp:** `gx_clone` para WebComponent e WebPanel via SQL 100% — sem NullRef headless
* **gx18-mcp:** Chat UI com Markdown rendering, paste de imagens, animações e streaming
* **gx18-mcp:** 8 MCP Resources embarcados disponíveis via `gx18://docs/<nome>` para qualquer cliente
* **gx18-mcp:** Suite de benchmark completa (47 ferramentas × 12 objetos, drift detection)
* **gx18-mcp:** Nara the labrador como mascote — identidade visual renovada
* **assets:** `icon-source.png` — ícone Nara em alta resolução adicionado ao repositório
* **benchmark:** fixtures de captura para todas as 47 ferramentas com objetos representativos
* **scripts:** pipeline de build de instalador standalone e launcher C#

### Bug Fixes

* **gx18-mcp:** `gx_import` para type=43 (WBP/WBC) bloqueado — previne corrupção de blobs tokenizados
* **gx18-mcp:** `gx_modify events/rules/conditions` para WBP/WBC bloqueado — source bruto corrompia token XML
* **gx18-mcp:** `WriteTextPartBlob` generalizado com `componentEntityTypeId` como parâmetro
* **gx18-mcp:** `NullOutDocumentationBlob` — zera blob de Documentation antes de salvar layout via SDK
* **gx18-mcp:** `PatchUCScriptBlob` — escape correto de `]]>` em CDATA
* **gx18-mcp:** `Decompress` — flag 0x01 = GZip (11 bytes header), flag 0x02 = raw UTF-8 (7 bytes)
* **gx18-mcp:** `resolveTypeKey("webcomponent")` agora encontra alias em `OBJECT_TYPES` corretamente
* **gx18-mcp:** `gx_bulk_modify` continua em falhas individuais — retorna `succeeded[]` + `failed[]`
* **gx18-mcp:** `gx_variable update` rejeita chamada sem campos para atualizar
* **gx18-mcp:** `gx_move` — timeout de 180s no bridge call
* **gx18-mcp:** `gx_find` label na UI corrigida: `'query'` → `'pattern'`
* **gx18-mcp:** dead code `sdk-bridge/guard.ts` removido
* **gx18-mcp:** `protocol.ts` — `PingResult` duplicado removido

---

## [1.5.0](https://github.com/lucaskarsten/genexus-ai-toolkit/compare/v1.4.0...v1.5.0) (2026-06-23)


### Features

* **gx18-mcp:** auto-update on startup for standalone exe ([6272306](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/6272306144896d0ea20b24645b4af975f3a987c9))
* **gx18-mcp:** correct MCP entry for standalone exe + Store Claude path ([5093e10](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/5093e10b5e8664a78397ba95dc37eb6857ee507b))
* **gx18-mcp:** embed anti-pattern guidance in tool descriptions ([a64ddb1](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/a64ddb19e662743b14c33bb377c2d6008aa597fd))
* **gx18-mcp:** extend tools — gx_variable, gx_delete, gx_move, gx_search, gx_analyze, gx_history, gx_doctor ([62c9c04](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/62c9c040cc941087d39a0e9ec110de26e19f0daa))
* **gx18-mcp:** gx_save_config tool + image paste in chat ([de8b672](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/de8b672d2767301bd663c870b186cddd0604dfcf))
* **gx18-mcp:** MCP Resources — embedded docs for any client (v1.5.0) ([f785f67](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/f785f678216ac98697fcbbb56161bef0703b3dcd))
* **gx18-mcp:** setup auto-installs globally + SERVER_ENTRY uses gx18-mcp start (v1.7.1) ([35ac5b9](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/35ac5b903144a53412bf006a10bd449a7cc646bd))
* **gx18-mcp:** show worker startup progress in console and dashboard UI ([9569b50](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/9569b507dbfce0fb128c6da35db7c84d998fd69f))


### Bug Fixes

* **ci:** add --allow-same-version to npm version in release workflow ([3a2b083](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/3a2b083599f53c499c458d2bc3314e01ba6d9e9d))
* **ci:** commit dist/worker binaries so GitHub Actions release can package them ([c6be6b7](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/c6be6b7710989f4f061ca9cc3b24e9d525d01f6a))
* **ci:** use npm install + npm rebuild to fix esbuild native binary on Windows runner ([399f015](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/399f015b12f2dc418beb8cc31e5344623c030ed2))
* **gx18-mcp:** auto-detect Claude Desktop Microsoft Store config path ([c1c0222](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/c1c022246874574fc25a5a6fad0a6a8c156f8319))
* **gx18-mcp:** exe now opens UI on double-click instead of stdio mode ([9626447](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/96264470585ce24192634e157eaca4f761c1c24b))
* **gx18-mcp:** fix UI token login on new install (v1.7.2) ([d32ea20](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/d32ea20970d198f281bd1d4d8f4c7f11d75d0fea))
* **gx18-mcp:** gx_search procedure source + gx_validate no crash headless ([7610a46](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/7610a46d52c1b2809c44443ce232c1fabdbe4141))
* **gx18-mcp:** remove TypeScript casts from inline browser JS in page.ts ([747c034](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/747c034044d4125101d698027a98893e2a610e8d))
* **gx18-mcp:** resolve worker path correctly inside pkg standalone exe ([7192f10](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/7192f106615fa03e838a75069cd72045fb6f2b50))
* **gx18-mcp:** sentinel guard prevents update loop on fresh launch ([935fcfd](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/935fcfd96d80a9425308a3f8a88130d0b2ab96c3))
* **gx18-mcp:** fix progressive slowdown — worker auto-recycle + resource leak fixes (v1.7.0) ([51ae47d](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/51ae47d969e36ef3ce0a1e0d0aeecf37718318ce))

## [1.4.0](https://github.com/lucaskarsten/genexus-ai-toolkit/compare/v1.3.0...v1.4.0) (2026-06-22)


### Features

* **gx18-mcp:** add UI server, dispatch, clients, and doctor modules ([0549f4a](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/0549f4ac38c4e83ac2d2edbc21e1b5cdb398eb64))
* **gx18-mcp:** KB auto-detect, standalone exe with icon, and GitHub Release workflow ([97e55e5](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/97e55e5c899fd46dc4b4bc2413ee2b5a82188dfb))


### Bug Fixes

* **gx18-mcp:** prepublishOnly skip build:worker (worker binary already in dist) ([342511a](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/342511af38c41228484d27e79cf2b423f44300e7))

## [1.3.0](https://github.com/lucaskarsten/genexus-ai-toolkit/compare/v1.2.1...v1.3.0) (2026-06-22)


### Features

* **gx18-mcp:** MCP server + C# worker, npm packaging, and gx_import ([#22](https://github.com/lucaskarsten/genexus-ai-toolkit/issues/22)) ([3d0e9ca](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/3d0e9ca87a18d7a27a3663529efa831e7e352990))

## [1.2.1](https://github.com/lucaskarsten/genexus-ai-toolkit/compare/v1.2.0...v1.2.1) (2026-06-19)


### Documentation

* warn about gxnext + GX18 KB incompatibility ([6fd41aa](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/6fd41aa))
* add complete SQL recovery procedure for gxnext damage on GX18 KB ([6fd41aa](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/6fd41aa))
* document gxnext operational pitfalls ([6fd41aa](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/6fd41aa))
* document DSO cross-DSO scoped selector silent removal ([6fd41aa](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/6fd41aa))

## [1.2.0](https://github.com/lucaskarsten/genexus-ai-toolkit/compare/v1.1.0...v1.2.0) (2026-06-18)


### Features

* add VS Code extension for GeneXus .view files ([525f421](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/525f421b778e776ee08f60ab158201954a2d0a6c))
* update agents, skills, examples and view-extension v0.1.0 ([d5a1edc](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/d5a1edcdc64915d2d12d4108ee3be5ad1086b89e))

## [1.1.0](https://github.com/lucaskarsten/genexus-ai-toolkit/compare/v1.0.0...v1.1.0) (2026-06-12)


### Features

* expand toolkit with specialized agents, WBP coverage, and consistency pass ([4a52caf](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/4a52cafc61b9f2f74862fb9cf9af4bd981fbcc9d))
* plug-and-play MCP setup, LLM engineering best practices, full English docs ([e4f3601](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/e4f3601f40e76ec33fd160d011007d0e47d9731f))
