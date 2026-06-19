# GeneXus Knowledge Base — SQL Reference

> **For LLM/agent use**, the canonical token map and PowerShell scripts live in [`skills/genexus-kb-sql.md`](../skills/genexus-kb-sql.md). This document is a human-readable reference — narrative explanations, EntityType context, and examples for reading at a glance. Keep both in sync when making changes.

Direct access to the GeneXus Knowledge Base via SQL. Covers EntityType mapping, GZip blob format, and PowerShell scripts for reading and writing GX source code without opening the IDE.

---

## Connection

Configure these via your `.env` file:

```
Instance : $GX_KB_SERVER   (default: (localdb)\MSSQLLocalDB)
Database : $GX_KB_DATABASE (e.g., GX_KB_YourApp)
Auth     : Windows Authentication (no user/password)
```

```powershell
# sqlcmd
sqlcmd -S "(localdb)\MSSQLLocalDB" -d GX_KB_YourApp -E

# PowerShell
Invoke-Sqlcmd -ServerInstance "(localdb)\MSSQLLocalDB" -Database "GX_KB_YourApp"
```

> **Note**: The `OBJECT` table contains only the data model (Transactions/Tables). All program objects live in the `Entity*` tables.

---

## EntityType Map

| EntityTypeId | Name | Description |
|---|---|---|
| 34 | Procedure | Procedures |
| 35 | Report | Reports |
| 36 | SDT | Structured Data Types |
| 38 | Theme | Themes |
| 39 | Transaction | Transactions |
| 43 | WebPanel | Web Panels and Web Components (Wbc*) |
| 44 | WorkPanel | Work Panels |
| 57 | Conditions | Sub-component: conditions |
| 62 | Documentation | Sub-component: documentation |
| **64** | **Events** | **Sub-component: event source (WebPanel/Wbc)** |
| 65 | Help | Sub-component: help |
| **69** | **Rules** | **Sub-component: rules (WebPanel) OR source (Procedure)** |
| 72 | Variables | Sub-component: variables |
| 74 | WebForm | Sub-component: layout/form |
| 82 | Layout | Layout of Procedure/Report |
| 100 | Module | Modules |
| **147** | **UserControl** | **User Controls** |
| **161** | **DSO** | **Design System Objects** |

---

## Finding Any Object

### 1. Search by name

```sql
-- WebPanel/Wbc by exact name
SELECT e.EntityId, ev.EntityVersionName, ev.EntityVersionTimestamp
FROM Entity e
JOIN EntityVersion ev ON e.EntityTypeId=ev.EntityTypeId AND e.EntityId=ev.EntityId
WHERE e.EntityTypeId=43
  AND ev.EntityVersionName='WbcYourComponent'
ORDER BY ev.EntityVersionId DESC

-- Partial search across all object types
SELECT e.EntityTypeId, et.EntityTypeName, e.EntityId, ev.EntityVersionName
FROM Entity e
JOIN EntityVersion ev ON e.EntityTypeId=ev.EntityTypeId AND e.EntityId=ev.EntityId
JOIN EntityType et ON et.EntityTypeId=e.EntityTypeId
WHERE ev.EntityVersionName LIKE '%YourComponent%'
  AND ev.EntityVersionId=(SELECT MAX(v2.EntityVersionId) FROM EntityVersion v2
      WHERE v2.EntityTypeId=e.EntityTypeId AND v2.EntityId=e.EntityId)
ORDER BY ev.EntityVersionName
```

### 2. View sub-components (composition)

```sql
SELECT evc.ComponentEntityTypeId, et.EntityTypeName,
       evc.ComponentEntityId, evc.ComponentEntityVersionId
FROM EntityVersionComposition evc
JOIN EntityType et ON et.EntityTypeId=evc.ComponentEntityTypeId
WHERE evc.CompoundEntityTypeId=43 AND evc.CompoundEntityId=<your-entity-id>
  AND evc.CompoundEntityVersionId=(
      SELECT MAX(EntityVersionId) FROM EntityVersion
      WHERE EntityTypeId=43 AND EntityId=<your-entity-id>)
```

Typical sub-components for a WebPanel:
```
Conditions  (57) EntityId=...
Documentation(62) EntityId=...
Events      (64) EntityId=...   ← source of events
Help        (65) EntityId=...
Rules       (69) EntityId=...
Variables   (72) EntityId=...
WebForm     (74) EntityId=...   ← layout
```

### 3. Get current version of a sub-component

```sql
SELECT MAX(EntityVersionId) FROM EntityVersion
WHERE EntityTypeId=64 AND EntityId=<events-entity-id>
```

---

## Reading and Decompressing Source (PowerShell)

GeneXus stores source in `EntityVersionData` as a custom blob: 11-byte header + GZip-compressed XML.

See [`skills/genexus-kb-sql.md`](../skills/genexus-kb-sql.md) for the PowerShell functions `Read-GxSource`, `Get-GxSourceText`, and `Update-GxSource`.

---

## Modifying Source Directly (UPDATE — never INSERT)

**Golden rule**: The IDE manages version creation. Only do UPDATE on the existing blob. When the IDE saves, it creates the new version automatically. Never INSERT new versions manually.

See [`skills/genexus-kb-sql.md`](../skills/genexus-kb-sql.md) for the PowerShell functions `Read-GxSource`, `Get-GxSourceText`, and `Update-GxSource`.

---

## Token Type Map (GeneXus Event Source Format)

See [`skills/genexus-kb-sql.md` — Token Type Map](../skills/genexus-kb-sql.md) for the canonical token reference.

---

## Building Tokens for Insertion

```xml
<!-- Comment -->
<TokenData><Token>25</Token><Word>&#xA;// my comment&#xA;</Word><Id>0</Id></TokenData>

<!-- Assignment: &MyVar = 'value' -->
<TokenData><Token>23</Token><Word>&amp;MyVar</Word><Id>0</Id></TokenData>
<TokenData><Token>25</Token><Word> </Word><Id>0</Id></TokenData>
<TokenData><Token>10</Token><Word>=</Word><Id>0</Id></TokenData>
<TokenData><Token>25</Token><Word> </Word><Id>0</Id></TokenData>
<TokenData><Token>3</Token><Word>'value'</Word><Id>0</Id></TokenData>

<!-- msg('text') -->
<TokenData><Token>141</Token><Word>msg</Word><Id>0</Id></TokenData>
<TokenData><Token>0</Token><Word>(</Word><Id>0</Id></TokenData>
<TokenData><Token>3</Token><Word>'text'</Word><Id>0</Id></TokenData>
<TokenData><Token>4</Token><Word>)</Word><Id>0</Id></TokenData>
```

---

---

## Recovery — dano do gxnext em KB GX18

> Consulte também a seção de aviso em `docs/genexus-for-agents.md`.

O GeneXus Next (gxnext MCP), ao abrir uma KB GeneXus 18, cria novas `EntityVersion` para todos os objetos processados usando um `UserId` interno — mesmo sem alterar conteúdo. Resultado: milhares de revisões espúrias no Team Development.

### Identificação

```sql
-- Confirmar qual UserId é o problema (concentrado em uma data específica)
SELECT UserId, COUNT(*) as Total,
  CONVERT(varchar, MIN(EntityVersionTimestamp), 120) as Primeiro,
  CONVERT(varchar, MAX(EntityVersionTimestamp), 120) as Ultimo
FROM EntityVersion GROUP BY UserId ORDER BY Ultimo DESC;
-- UserId com contagem alta concentrada em 1 dia = gxnext (ex: UserId=322)

-- Ver quais objetos foram afetados
SELECT et.EntityTypeName, ev.EntityVersionName, COUNT(*) as revisoes
FROM EntityVersion ev
JOIN EntityType et ON et.EntityTypeId = ev.EntityTypeId
WHERE ev.UserId = 322  -- substituir pelo UserId ruim
GROUP BY et.EntityTypeName, ev.EntityVersionName
ORDER BY revisoes DESC;
```

### Pré-requisitos

1. **Fechar completamente o GeneXus 18 IDE** (locks impedem as queries)
2. **Fazer backup antes de qualquer operação:**

```powershell
sqlcmd -S "(localdb)\MSSQLLocalDB" -Q "BACKUP DATABASE [GX_KB_SeuBanco] TO DISK='C:\tmp\backup_pre_fix.bak' WITH INIT"
```

3. **Restaurar backup como banco temporário** para consultas de comparação/recuperação:

```sql
RESTORE DATABASE [GX_KB_SeuBanco_restore]
FROM DISK='C:\tmp\backup_pre_fix.bak'
WITH MOVE 'GX_KB_SeuBanco' TO 'C:\...\GX_KB_SeuBanco_restore.mdf',
     MOVE 'GX_KB_SeuBanco_log' TO 'C:\...\GX_KB_SeuBanco_restore_log.ldf'
```

### Passo 1 — Reverter ModelEntityVersion e deletar EntityVersions do gxnext

```sql
BEGIN TRANSACTION;

-- 1a. Reverter MEV para a revisão anterior (ParentVersionId)
-- CRÍTICO: JOIN com os 3 campos da PK — EntityVersionId não é globalmente único
UPDATE mev
SET
    mev.EntityVersionId = ev.ParentVersionId,
    mev.ModelUserId = ev_parent.UserId,
    mev.ModelEntityVersionTimestamp = ev_parent.EntityVersionTimestamp,
    mev.ModelEntityVersionName = ev_parent.EntityVersionName,
    mev.ModelEntityVersionDescription = ev_parent.EntityVersionDescription
FROM ModelEntityVersion mev
JOIN EntityVersion ev
    ON mev.EntityTypeId = ev.EntityTypeId
    AND mev.EntityId = ev.EntityId
    AND mev.EntityVersionId = ev.EntityVersionId
    AND ev.UserId = 322  -- UserId ruim
JOIN EntityVersion ev_parent
    ON ev.EntityTypeId = ev_parent.EntityTypeId
    AND ev.EntityId = ev_parent.EntityId
    AND ev.ParentVersionId = ev_parent.EntityVersionId;
SELECT 'MEV revertidos:', @@ROWCOUNT;

-- 1b. Deletar histórico do gxnext
DELETE FROM ModelEntityHistory WHERE HistoryUserId = 322;
SELECT 'ModelEntityHistory:', @@ROWCOUNT;

-- 1c. Deletar EntityVersions do gxnext
DELETE FROM EntityVersion WHERE UserId = 322;
SELECT 'EntityVersions deletadas:', @@ROWCOUNT;

COMMIT;
```

### Passo 2 — Restaurar EntityVersionComposition do backup

> **Armadilha crítica**: `EntityVersionId` é **local** a cada `(EntityTypeId, EntityId)` — não é globalmente único. Um DELETE/UPDATE usando apenas `EntityVersionId` sem os campos de tipo e entidade vai atingir objetos completamente diferentes. Use sempre todos os 6 campos da PK.

```sql
BEGIN TRANSACTION;

-- Limpar composições (podem estar inconsistentes após o Passo 1)
DELETE FROM EntityVersionComposition;

-- Restaurar do backup apenas composições legítimas
-- (nem compound nem component é do gxnext)
INSERT INTO [GX_KB_SeuBanco].dbo.EntityVersionComposition
  (ComponentEntityTypeId, ComponentEntityId, ComponentEntityVersionId,
   CompoundEntityTypeId, CompoundEntityId, CompoundEntityVersionId)
SELECT evc.ComponentEntityTypeId, evc.ComponentEntityId, evc.ComponentEntityVersionId,
       evc.CompoundEntityTypeId, evc.CompoundEntityId, evc.CompoundEntityVersionId
FROM [GX_KB_SeuBanco_restore].dbo.EntityVersionComposition evc
JOIN [GX_KB_SeuBanco_restore].dbo.EntityVersion ev_comp
  ON ev_comp.EntityTypeId = evc.CompoundEntityTypeId
  AND ev_comp.EntityId = evc.CompoundEntityId
  AND ev_comp.EntityVersionId = evc.CompoundEntityVersionId
JOIN [GX_KB_SeuBanco_restore].dbo.EntityVersion ev_cmp
  ON ev_cmp.EntityTypeId = evc.ComponentEntityTypeId
  AND ev_cmp.EntityId = evc.ComponentEntityId
  AND ev_cmp.EntityVersionId = evc.ComponentEntityVersionId
WHERE ev_comp.UserId <> 322 AND ev_cmp.UserId <> 322;

SELECT 'Composições restauradas:', @@ROWCOUNT;
COMMIT;
```

### Passo 3 — Corrigir MEV com cadeia longa de versões gxnext

O gxnext às vezes cria dezenas de versões em sequência (ex: 107 versões de um atributo). O Passo 1 reverte para o pai direto — que também pode ser gxnext. Execute para corrigir os casos em que o pai direto não existe mais:

```sql
-- 3a. Re-inserir MEVs que sumiram (pai direto também era gxnext)
BEGIN TRANSACTION;
INSERT INTO [GX_KB_SeuBanco].dbo.ModelEntityVersion
  (ModelId, EntityTypeId, EntityId, EntityVersionId, ModelEntityVersionTimestamp,
   ModelEntityVersionName, ModelEntityVersionDescription,
   ModelParentEntityTypeId, ModelParentEntityId, ModelUserId)
SELECT mev_b.ModelId, mev_b.EntityTypeId, mev_b.EntityId,
  ev_parent.EntityVersionId, ev_parent.EntityVersionTimestamp,
  ev_parent.EntityVersionName, ev_parent.EntityVersionDescription,
  mev_b.ModelParentEntityTypeId, mev_b.ModelParentEntityId, ev_parent.UserId
FROM [GX_KB_SeuBanco_restore].dbo.ModelEntityVersion mev_b
JOIN [GX_KB_SeuBanco_restore].dbo.EntityVersion ev_bad
  ON ev_bad.EntityTypeId = mev_b.EntityTypeId AND ev_bad.EntityId = mev_b.EntityId
  AND ev_bad.EntityVersionId = mev_b.EntityVersionId AND ev_bad.UserId = 322
JOIN [GX_KB_SeuBanco_restore].dbo.EntityVersion ev_parent
  ON ev_parent.EntityTypeId = ev_bad.EntityTypeId AND ev_parent.EntityId = ev_bad.EntityId
  AND ev_parent.EntityVersionId = ev_bad.ParentVersionId
WHERE NOT EXISTS (
  SELECT 1 FROM [GX_KB_SeuBanco].dbo.ModelEntityVersion p
  WHERE p.ModelId = mev_b.ModelId AND p.EntityTypeId = mev_b.EntityTypeId AND p.EntityId = mev_b.EntityId
);
SELECT 'MEV reinseridas:', @@ROWCOUNT;
COMMIT;

-- 3b. Corrigir MEVs que ainda apontam para versão inexistente
BEGIN TRANSACTION;
UPDATE mev
SET
  mev.EntityVersionId = ev_correct.EntityVersionId,
  mev.ModelUserId = ev_correct.UserId,
  mev.ModelEntityVersionTimestamp = ev_correct.EntityVersionTimestamp,
  mev.ModelEntityVersionName = ev_correct.EntityVersionName,
  mev.ModelEntityVersionDescription = ev_correct.EntityVersionDescription
FROM [GX_KB_SeuBanco].dbo.ModelEntityVersion mev
JOIN (
  SELECT ev.EntityTypeId, ev.EntityId, MAX(ev.EntityVersionId) as EntityVersionId
  FROM [GX_KB_SeuBanco].dbo.EntityVersion ev
  WHERE ev.UserId <> 322
  GROUP BY ev.EntityTypeId, ev.EntityId
) latest ON latest.EntityTypeId = mev.EntityTypeId AND latest.EntityId = mev.EntityId
JOIN [GX_KB_SeuBanco].dbo.EntityVersion ev_correct
  ON ev_correct.EntityTypeId = latest.EntityTypeId AND ev_correct.EntityId = latest.EntityId
  AND ev_correct.EntityVersionId = latest.EntityVersionId
WHERE NOT EXISTS (
  SELECT 1 FROM [GX_KB_SeuBanco].dbo.EntityVersion ev
  WHERE ev.EntityTypeId = mev.EntityTypeId AND ev.EntityId = mev.EntityId
    AND ev.EntityVersionId = mev.EntityVersionId
);
SELECT 'MEV corrigidas:', @@ROWCOUNT;
COMMIT;
```

### Passo 4 — Limpar ModelEntityOutput

```sql
-- ModelEntityOutput com órfãos causa NullReferenceException ao abrir KB
-- GeneXus regenera esta tabela automaticamente ao abrir — pode deletar com segurança
DELETE FROM ModelEntityOutput
WHERE NOT EXISTS (
  SELECT 1 FROM EntityVersion ev
  WHERE ev.EntityTypeId = ModelEntityOutput.EntityTypeId
    AND ev.EntityId = ModelEntityOutput.EntityId
    AND ev.EntityVersionId = ModelEntityOutput.OutputEntityVersionId
);
SELECT 'ModelEntityOutput órfãos removidos:', @@ROWCOUNT;
```

> Repita este passo após cada operação de restauração de EntityVersions.

### Passo 5 — Recuperar objetos criados apenas pelo gxnext

Se objetos novos (importados via MCP antes do incidente) foram deletados junto com as EntityVersions do gxnext, eles aparecem no backup com `ParentVersionId=0` e `UserId=322`:

```sql
-- Identificar no banco de restore
SELECT ev.EntityTypeId, et.EntityTypeName, ev.EntityId, ev.EntityVersionName
FROM [GX_KB_SeuBanco_restore].dbo.EntityVersion ev
JOIN [GX_KB_SeuBanco_restore].dbo.EntityType et ON et.EntityTypeId = ev.EntityTypeId
WHERE ev.UserId = 322 AND ev.ParentVersionId = 0
ORDER BY ev.EntityTypeId, ev.EntityId;

-- Para cada objeto a recuperar, restaurar EntityVersion + ModelEntityVersion + EVC:
BEGIN TRANSACTION;

INSERT INTO [GX_KB_SeuBanco].dbo.EntityVersion (EntityTypeId, EntityId, EntityVersionId,
  EntityVersionName, EntityVersionDescription, UserId, EntityVersionTimestamp, ParentVersionId,
  EntityVersionComment, EntityVersionCategories, EntityVersionProperties, TypeVersionId, EntityVersionData)
SELECT EntityTypeId, EntityId, EntityVersionId, EntityVersionName, EntityVersionDescription,
  UserId, EntityVersionTimestamp, ParentVersionId, EntityVersionComment,
  EntityVersionCategories, EntityVersionProperties, TypeVersionId, EntityVersionData
FROM [GX_KB_SeuBanco_restore].dbo.EntityVersion
WHERE EntityTypeId = <tipo> AND EntityId = <id>;

INSERT INTO [GX_KB_SeuBanco].dbo.ModelEntityVersion (ModelId, EntityTypeId, EntityId,
  EntityVersionId, ModelEntityVersionTimestamp, ModelEntityVersionName, ModelEntityVersionDescription,
  ModelParentEntityTypeId, ModelParentEntityId, ModelUserId)
SELECT ModelId, EntityTypeId, EntityId, EntityVersionId, ModelEntityVersionTimestamp,
  ModelEntityVersionName, ModelEntityVersionDescription, ModelParentEntityTypeId, ModelParentEntityId, ModelUserId
FROM [GX_KB_SeuBanco_restore].dbo.ModelEntityVersion
WHERE EntityTypeId = <tipo> AND EntityId = <id>;

INSERT INTO [GX_KB_SeuBanco].dbo.EntityVersionComposition (ComponentEntityTypeId, ComponentEntityId,
  ComponentEntityVersionId, CompoundEntityTypeId, CompoundEntityId, CompoundEntityVersionId)
SELECT ComponentEntityTypeId, ComponentEntityId, ComponentEntityVersionId,
  CompoundEntityTypeId, CompoundEntityId, CompoundEntityVersionId
FROM [GX_KB_SeuBanco_restore].dbo.EntityVersionComposition
WHERE CompoundEntityTypeId = <tipo> AND CompoundEntityId = <id>;

COMMIT;
```

**Atenção:** Ao recuperar objetos compostos (Transaction, WebPanel, Procedure, SDT), os sub-objetos também precisam ser restaurados. Verifique a EVC e restaure cada componente (Structure, Events, Rules, Variables, WebForm, etc.) incluindo seus sub-componentes recursivos. Para Transactions, os Attributes novos (EntityTypeId=24) são objetos independentes com seus próprios MEVs — não são sub-componentes da EVC e precisam ser restaurados separadamente.

### Diagnóstico de erros pós-fix

| Erro | Causa | Fix |
|---|---|---|
| `NullReferenceException (Artech.Architecture.Common)` ao abrir KB | `ModelEntityOutput` com órfãos | DELETE conforme Passo 4 — GX regenera ao abrir |
| `Unable to Deserialize Data. Attribute 'N' in 'TrnX' does not exist` (atributo pré-existente) | MEV do atributo aponta para versão inexistente | Passo 3b — corrigir MEVs com cadeia gxnext longa |
| `Unable to Deserialize Data. Attribute 'N' in 'TrnX' does not exist` (atributo novo) | Atributo (EntityTypeId=24) era novo e não foi restaurado no Passo 5 | Restaurar EntityVersion + MEV do atributo do backup + limpar ModelEntityOutput |
| Objeto sem WebForm / Events após fix | EVC foi deletada com EntityVersionId não qualificado (Passo 2 errado) | Restaurar EVC do backup com os 6 campos da PK |
| MEV apontando para versão deletada (cadeia gxnext) | ParentVersionId do gxnext também é gxnext | Passo 3 — reinserir e corrigir MEVs |
| Locks bloqueando queries | Sessões órfãs do período de investigação | `SELECT session_id FROM sys.dm_exec_requests WHERE database_id = DB_ID('...')` + `KILL <id>` |
| `DELETE EntityVersionComposition` apagou entradas legítimas | `EntityVersionId` não é globalmente único — DELETE sem `EntityTypeId`+`EntityId` atinge objetos errados | Restaurar EVC do backup filtrando pelos 3 campos de cada lado |

---

## Documented Pitfalls

| Error | Cause | Fix |
|---|---|---|
| `Memory stream is not expandable` | Header bytes 7-10 don't reflect new decompressed size | Update bytes 7-10 with `[System.BitConverter]::GetBytes([uint32]$newLen)` |
| `Record already exists` on IDE save | Version was manually pre-created | Never INSERT versions; only UPDATE existing blob |
| Modification hits all events | `.Replace()` replaces all occurrences of a generic token | Use the neighboring token as unique anchor (e.g., `<Word>Start</Word>` only exists once) |
| Blob truncated / GZip corrupted silently | `Invoke-Sqlcmd` without `-MaxBinaryLength` truncates at 1024 bytes | Always use `-MaxBinaryLength 1000000` |
| Decompress produces empty output | Blob smaller than 12 bytes (sub-component with no data) | Check `$bytes.Length -gt 11` before decompressing |
