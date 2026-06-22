# Changelog

## [1.3.0](https://github.com/lucaskarsten/genexus-ai-toolkit/compare/v1.2.1...v1.3.0) (2026-06-22)


### Features

* **gx18-mcp:** MCP server + C# worker, npm packaging, and gx_import ([#22](https://github.com/lucaskarsten/genexus-ai-toolkit/issues/22)) ([3d0e9ca](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/3d0e9ca87a18d7a27a3663529efa831e7e352990))

## [1.2.1](https://github.com/lucaskarsten/genexus-ai-toolkit/compare/v1.2.0...v1.2.1) (2026-06-19)


### Documentation

* warn about gxnext + GX18 KB incompatibility — `open_knowledge_base` and all write tools create false revisions under the wrong username; includes safe/forbidden tool table and alternatives ([6fd41aa](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/6fd41aa))
* add complete SQL recovery procedure for gxnext damage on GX18 KB — 5-step guide with identification queries, MEV revert, EVC restore from backup, orphan cleanup, and 7-error diagnostic table ([6fd41aa](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/6fd41aa))
* document gxnext operational pitfalls — server startup troubleshooting, `import_text_to_kb` rootDirectory pattern ([6fd41aa](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/6fd41aa))
* document DSO cross-DSO scoped selector silent removal — compiler discards `.classA .classB` when classes belong to different DSOs, with correct alternatives ([6fd41aa](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/6fd41aa))

## [1.2.0](https://github.com/lucaskarsten/genexus-ai-toolkit/compare/v1.1.0...v1.2.0) (2026-06-18)


### Features

* add VS Code extension for GeneXus .view files ([525f421](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/525f421b778e776ee08f60ab158201954a2d0a6c))
* update agents, skills, examples and view-extension v0.1.0 ([d5a1edc](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/d5a1edcdc64915d2d12d4108ee3be5ad1086b89e))

## [1.1.0](https://github.com/lucaskarsten/genexus-ai-toolkit/compare/v1.0.0...v1.1.0) (2026-06-12)


### Features

* expand toolkit with specialized agents, WBP coverage, and consistency pass ([4a52caf](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/4a52cafc61b9f2f74862fb9cf9af4bd981fbcc9d))
* plug-and-play MCP setup, LLM engineering best practices, full English docs ([e4f3601](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/e4f3601f40e76ec33fd160d011007d0e47d9731f))
* plug-and-play MCP, LLM engineering best practices, full English docs ([35fd26e](https://github.com/lucaskarsten/genexus-ai-toolkit/commit/35fd26e8139b7e0a92652d8599e8a4a8932180ef))
