# Changelog

## [2.1.2](https://github.com/lucaskarsten/genexus-ai-toolkit/compare/gx18-mcp-v2.1.1...gx18-mcp-v2.1.2) (2026-06-29)


### Bug Fixes

* **gx18-mcp:** clear error on SDK EntityId-allocation collision in create ([e703864](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/e7038647be68948253d80714a78b9fce04b3d568))

## [2.1.1](https://github.com/lucaskarsten/genexus-ai-toolkit/compare/gx18-mcp-v2.1.0...gx18-mcp-v2.1.1) (2026-06-26)


### Bug Fixes

* **gx18-mcp:** resolve headless KnowledgeBase.Open failure ([2dea074](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/2dea074e6b0d1c5ed1d2b17d096eddc63366b914))
* **gx18-mcp:** resolve headless KnowledgeBase.Open failure (App.config + assembly resolver) ([605a16b](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/605a16b93e818dddb56f465af44962f7bbb9550a))

## [2.1.0](https://github.com/lucaskarsten/genexus-ai-toolkit/compare/gx18-mcp-v2.0.0...gx18-mcp-v2.1.0) (2026-06-26)


### Features

* **gx18-mcp:** chat com seletor de modelo/effort, comandos slash, uso/custo e streaming ([0d482f1](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/0d482f1f3d28c39be811414b4ada360373f29077))
* **gx18-mcp:** create and modify WebPanel/WebComponent (type 43) via the SDK ([6529d4c](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/6529d4c8276c899e31bfa36006e26650ba52edfe))
* **gx18-mcp:** create and modify WebPanel/WebComponent (type 43) via the SDK ([2d131ec](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/2d131ecafb0b4edb09d0f9c7dcfc0158835c22ed))


### Bug Fixes

* **gx18-mcp:** normalize future SDK timestamps and surface real KB Open errors ([dd89e6a](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/dd89e6a88490183aa866c9d899cea7fa74445b61))

## [1.9.4](https://github.com/lucaskarsten/genexus-ai-toolkit/compare/gx18-mcp-v1.9.3...gx18-mcp-v1.9.4) (2026-06-24)


### Bug Fixes

* **gx18-mcp:** retry copy in auto-update PS1 if exe is locked ([604de64](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/604de646809e40f2d44030281443f9482016afd9))

## [1.9.3](https://github.com/lucaskarsten/genexus-ai-toolkit/compare/gx18-mcp-v1.9.2...gx18-mcp-v1.9.3) (2026-06-24)


### Bug Fixes

* **gx18-mcp:** fix SyntaxError in chat image path — use String.fromCharCode(92) ([098ac9d](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/098ac9d6d5f385946610f065823c39e99740cbe6))

## [1.9.2](https://github.com/lucaskarsten/genexus-ai-toolkit/compare/gx18-mcp-v1.9.1...gx18-mcp-v1.9.2) (2026-06-24)


### Bug Fixes

* **gx18-mcp:** fix auto-update broken by tag format change ([0cdfefb](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/0cdfefb3b078dd8ad82e82a013de5a423be2428d))
* replace /^gx18-mcp[-\/]/ to handle both formats. ([0cdfefb](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/0cdfefb3b078dd8ad82e82a013de5a423be2428d))

## [1.9.1](https://github.com/lucaskarsten/genexus-ai-toolkit/compare/gx18-mcp-v1.9.0...gx18-mcp-v1.9.1) (2026-06-24)


### Bug Fixes

* **gx18-mcp:** escape forward slash in chat image path regex ([04b2162](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/04b2162727b3977179c24041c95fe3b8692289bc))

## [1.9.0](https://github.com/lucaskarsten/genexus-ai-toolkit/compare/gx18-mcp-v1.8.0...gx18-mcp-v1.9.0) (2026-06-24)


### Features

* **gx18-mcp:** add gx_read_xpz/gx_patch_xpz tools and module/exclude filters ([fb6c795](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/fb6c795be8b85edec3b08efb271b4bb16e0b5a87))
* **gx18-mcp:** harden gx_modify, add analysis/integration tools and examples ([671c7cc](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/671c7cc391e88c449a0e23d44b2b711f6de81fe3))


### Bug Fixes

* **gx18-mcp:** improve error messages and input validation in gx_modify and gx_import ([9a7e9f7](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/9a7e9f77c6d104532ffcec703afa8722e1c32aa3))


### Documentation

* **gx18-mcp:** add xpz-workflow and genexus-knowledge resources, expand server instructions ([baf8667](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/baf8667ad5654d801e21316dfb69aaf7926fdc45))

## [1.8.0](https://github.com/lucaskarsten/genexus-ai-toolkit/compare/gx18-mcp-v1.7.3...gx18-mcp-v1.8.0) (2026-06-23)


### Features

* **gx18-mcp:** add UI server, dispatch, clients, and doctor modules ([0549f4a](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/0549f4ac38c4e83ac2d2edbc21e1b5cdb398eb64))
* **gx18-mcp:** auto-update on startup for standalone exe ([6272306](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/6272306144896d0ea20b24645b4af975f3a987c9))
* **gx18-mcp:** correct MCP entry for standalone exe + Store Claude path ([5093e10](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/5093e10b5e8664a78397ba95dc37eb6857ee507b))
* **gx18-mcp:** embed anti-pattern guidance in tool descriptions ([a64ddb1](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/a64ddb19e662743b14c33bb377c2d6008aa597fd))
* **gx18-mcp:** extend tools — gx_variable, gx_delete, gx_move, gx_search, gx_analyze, gx_history, gx_doctor ([62c9c04](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/62c9c040cc941087d39a0e9ec110de26e19f0daa))
* **gx18-mcp:** gx_save_config tool + image paste in chat ([de8b672](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/de8b672d2767301bd663c870b186cddd0604dfcf))
* **gx18-mcp:** KB auto-detect, standalone exe with icon, and GitHub Release workflow ([97e55e5](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/97e55e5c899fd46dc4b4bc2413ee2b5a82188dfb))
* **gx18-mcp:** MCP Resources — embedded docs for any client (v1.5.0) ([f785f67](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/f785f678216ac98697fcbbb56161bef0703b3dcd))
* **gx18-mcp:** MCP server + C# worker, npm packaging, and gx_import ([#22](https://github.com/lucaskarsten/genexus-ai-toolkit/issues/22)) ([3d0e9ca](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/3d0e9ca87a18d7a27a3663529efa831e7e352990))
* **gx18-mcp:** setup auto-installs globally + SERVER_ENTRY uses gx18-mcp start (v1.7.1) ([35ac5b9](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/35ac5b903144a53412bf006a10bd449a7cc646bd))
* **gx18-mcp:** show worker startup progress in console and dashboard UI ([9569b50](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/9569b507dbfce0fb128c6da35db7c84d998fd69f))


### Bug Fixes

* **ci:** commit dist/worker binaries so GitHub Actions release can package them ([c6be6b7](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/c6be6b7710989f4f061ca9cc3b24e9d525d01f6a))
* **gx18-mcp:** auto-detect Claude Desktop Microsoft Store config path ([c1c0222](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/c1c022246874574fc25a5a6fad0a6a8c156f8319))
* **gx18-mcp:** exe now opens UI on double-click instead of stdio mode ([9626447](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/96264470585ce24192634e157eaca4f761c1c24b))
* **gx18-mcp:** fix UI token login on new install (v1.7.2) ([d32ea20](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/d32ea20970d198f281bd1d4d8f4c7f11d75d0fea))
* **gx18-mcp:** gx_search procedure source + gx_validate no crash headless ([7610a46](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/7610a46d52c1b2809c44443ce232c1fabdbe4141))
* **gx18-mcp:** gx_search procedure source + gx_validate no crash headless ([02685f8](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/02685f8146804cbb5e86e0ccbfcf47817defb381))
* **gx18-mcp:** prepublishOnly skip build:worker (worker binary already in dist) ([342511a](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/342511af38c41228484d27e79cf2b423f44300e7))
* **gx18-mcp:** remove TypeScript casts from inline browser JS in page.ts ([747c034](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/747c034044d4125101d698027a98893e2a610e8d))
* **gx18-mcp:** resolve worker path correctly inside pkg standalone exe ([7192f10](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/7192f106615fa03e838a75069cd72045fb6f2b50))
* **gx18-mcp:** sentinel guard prevents update loop on fresh launch ([935fcfd](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/935fcfd96d80a9425308a3f8a88130d0b2ab96c3))
* **gx18-mcp:** v1.4.6 — stop update loop, hide swap window`n`nBump version to 1.4.6 to match tag series (1.0.0 was always older than`nany tag, causing infinite download loop on every startup).`n`nReplace bat+tasklist loop with hidden PowerShell script: sleeps 3s,`ncopies new exe, relaunches, self-deletes. No visible cmd windows.`n`nCo-Authored-By: Claude Sonnet 4.6 &lt;noreply@anthropic.com&gt; ([6b607ec](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/6b607ec5490af80205de4b1b93e0a48a11ad83d9))
* **gx18-mcp:** v1.4.9 — CI auto-syncs version from tag, breaking update loop ([9c79dc6](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/9c79dc659841200443e0ec4596551e7565b61cd5))
* **gx18-mcp:** worker build error + onboarding docs + server version ([15ca632](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/15ca632933db418f5740dba1dca96ed287a283c7))


### Documentation

* **gx18-mcp:** FAQ + setup improvements + bump 1.6.0 ([3cbc491](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/3cbc491916f9dd859f4bc00b4ef4ff670f5816fb))
* reorganize toolkit — gx18-mcp as primary package ([ac06a50](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/ac06a507ea82de6a87af614d0e844aaacddb6a20))
* tool selection guide — ferramenta certa para cada tarefa ([a560c2b](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/a560c2b7925809d0ceb53b66fdf7d9098c2fb582))
