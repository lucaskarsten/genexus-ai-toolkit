@echo off
chcp 65001 >nul
title GeneXus AI Toolkit

:: Muda para o diretório do script (funciona com duplo clique)
cd /d "%~dp0"

echo.
echo  ================================================
echo   GeneXus AI Toolkit — gx18-mcp
echo  ================================================
echo.

:: Verifica Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo  [ERRO] Node.js nao encontrado.
    echo.
    echo  Baixe e instale o Node.js em: https://nodejs.org
    echo  Versao recomendada: 18 ou superior
    echo.
    pause
    exit /b 1
)

:: Mostra versao instalada
for /f "tokens=*" %%v in ('node --version 2^>nul') do set NODE_VER=%%v
echo  Node.js: %NODE_VER%

:: Mostra versao do gx18-mcp
for /f "tokens=*" %%v in ('node packages\gx18-mcp\dist\bin\gx18-mcp.js --version 2^>nul') do set GX_VER=%%v
if defined GX_VER echo  gx18-mcp: %GX_VER%

:: Checa atualizacao disponivel (silencioso se sem internet)
echo.
echo  Verificando atualizacoes...
for /f "tokens=*" %%l in ('npm show gx18-mcp version 2^>nul') do set LATEST=%%l
if defined LATEST (
    if "%LATEST%" neq "%GX_VER%" (
        echo  [ATUALIZ.] Versao nova disponivel no npm: %LATEST%
        echo             Para atualizar: npm install -g gx18-mcp
    ) else (
        echo  Versao atual. Nenhuma atualizacao disponivel.
    )
) else (
    echo  Sem acesso ao npm — pulando verificacao de atualizacao.
)

echo.
echo  Abrindo interface de configuracao no browser...
echo  Pressione Ctrl+C para encerrar o servidor.
echo.

node packages\gx18-mcp\dist\bin\gx18-mcp.js ui

echo.
pause
