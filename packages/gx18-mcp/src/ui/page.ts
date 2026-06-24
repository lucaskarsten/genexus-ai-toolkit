// Single self-contained page served by the UI server. Embedded as a string so it
// is bundled by esbuild (no asset folder, no `files` change, no runtime path lookup).
// The token is read from the URL fragment (location.hash) — never sent to the server
// as a query (no log leakage) — and echoed on every /api call as x-gx18-token.
// Exception: the SSE log endpoint uses ?token= because EventSource cannot set headers.

export const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>gx18-mcp</title>
<style>
:root {
  --bg:#0f1115; --panel:#171a21; --sidebar:#13151c; --line:#2a2f3a;
  --fg:#e6e9ef; --muted:#9aa3b2; --accent:#4f8cff;
  --ok:#3fb950; --warn:#d29922; --fail:#f85149;
  --font:system-ui,'Segoe UI',Roboto,sans-serif;
  --mono:ui-monospace,Consolas,'Cascadia Code',monospace;
}
*{box-sizing:border-box;margin:0;padding:0;}
body{background:var(--bg);color:var(--fg);font:14px/1.5 var(--font);
     height:100vh;overflow:hidden;display:flex;flex-direction:column;}

/* Login */
#gx-login{position:fixed;inset:0;background:var(--bg);z-index:200;
           display:flex;align-items:center;justify-content:center;}
.lbox{background:var(--panel);border:1px solid var(--line);border-radius:14px;
      padding:36px 40px;width:400px;max-width:90vw;}
.lbox-logo{font-size:22px;font-weight:700;color:var(--accent);letter-spacing:-.5px;margin-bottom:6px;}
.lbox-sub{color:var(--muted);font-size:13px;margin-bottom:18px;}

/* App layout */
#gx-app{display:flex;flex-direction:column;flex:1;overflow:hidden;}
header#gx-header{display:flex;align-items:center;gap:10px;padding:0 18px;
                 height:48px;border-bottom:1px solid var(--line);
                 background:var(--panel);flex-shrink:0;}
.hd-title{font-size:15px;font-weight:700;color:var(--accent);letter-spacing:-.3px;}
.spacer{flex:1;}
.layout{display:flex;flex:1;overflow:hidden;}

/* Sidebar */
nav#gx-nav{width:190px;background:var(--sidebar);border-right:1px solid var(--line);
           padding:10px 0;flex-shrink:0;display:flex;flex-direction:column;gap:1px;overflow-y:auto;}
nav#gx-nav button{display:flex;align-items:center;gap:9px;width:100%;background:transparent;
                  color:var(--muted);border:none;padding:10px 18px;cursor:pointer;
                  font:13px/1.4 var(--font);text-align:left;border-left:2px solid transparent;
                  transition:background .1s,color .1s;}
nav#gx-nav button:hover{background:#1c1f2b;color:var(--fg);}
nav#gx-nav button.active{color:var(--accent);border-left-color:var(--accent);background:#1a2040;}
.nav-ico{font-size:14px;width:18px;text-align:center;flex-shrink:0;}
.nav-sep{height:1px;background:var(--line);margin:6px 10px;}

/* Content */
#gx-content{flex:1;overflow-y:auto;padding:22px 24px;}
.sec{display:none;} .sec.active{display:block;}
.sec-hdr{display:flex;align-items:center;gap:12px;margin-bottom:18px;flex-wrap:wrap;}
.sec-hdr h2{font-size:16px;font-weight:600;}

/* Tags */
.tag{font-size:11px;padding:2px 8px;border-radius:10px;background:#222733;color:var(--muted);white-space:nowrap;}
.tag.ok{background:#163020;color:var(--ok);}
.tag.warn{background:#2e2010;color:var(--warn);}
.tag.fail{background:#2a1318;color:var(--fail);}
.tag.ro{background:#3a2a12;color:var(--warn);}

/* Cards */
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px;margin-bottom:14px;}
.card h3{font-size:13px;font-weight:600;margin-bottom:12px;}

/* Forms */
label{display:block;font-size:12px;color:var(--muted);margin:10px 0 4px;}
label .req{color:var(--fail);}
input[type=text],input[type=number],input[type=password],select,textarea{
  width:100%;background:#0e1014;color:var(--fg);border:1px solid var(--line);
  border-radius:6px;padding:8px 10px;font:inherit;outline:none;transition:border-color .15s;}
input[type=text]:focus,input[type=number]:focus,input[type=password]:focus,
select:focus,textarea:focus{border-color:var(--accent);}
textarea{min-height:90px;resize:vertical;font-family:var(--mono);}
.row{display:flex;gap:12px;flex-wrap:wrap;}
.row>div{flex:1;min-width:200px;}
details{background:var(--panel);border:1px solid var(--line);border-radius:10px;margin-bottom:14px;}
details>summary{padding:12px 16px;cursor:pointer;font-weight:600;font-size:13px;}
details[open]>summary{border-bottom:1px solid var(--line);}
.toolbody{padding:14px;}

/* Buttons */
.btns{margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
button.act{background:var(--accent);color:#fff;border:none;padding:8px 16px;
           border-radius:7px;cursor:pointer;font:inherit;font-size:13px;white-space:nowrap;}
button.act.sec{background:#222733;color:var(--fg);border:1px solid var(--line);}
button.act.sm{padding:5px 12px;font-size:12px;}
button.act:hover{opacity:.85;}
button.act:disabled{opacity:.4;cursor:not-allowed;}

/* Banners */
.banner{padding:10px 14px;border-radius:8px;margin-bottom:14px;border:1px solid;font-size:13px;}
.banner.fail{background:#2a1416;border-color:var(--fail);color:#ffb4ae;}
.banner.warn{background:#2a2310;border-color:var(--warn);color:#f0cd7a;}

/* Output */
pre.out{background:#0a0c10;border:1px solid var(--line);border-radius:6px;padding:10px;
        white-space:pre-wrap;word-break:break-word;max-height:320px;overflow:auto;
        margin-top:10px;font:12px var(--mono);line-height:1.5;}
pre.out.err{border-color:var(--fail);color:#ffb4ae;}

/* Confirm box */
.confirmbox{border:1px solid var(--warn);background:#241c0c;border-radius:8px;padding:10px;
            margin-top:12px;display:flex;gap:8px;align-items:flex-start;}
.confirmbox input[type=checkbox]{margin-top:3px;flex-shrink:0;}

/* Dashboard stat cards */
.stat-row{display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;}
.stat-card{background:var(--panel);border:1px solid var(--line);border-radius:10px;
           padding:16px 18px;min-width:130px;flex:1;}
.stat-card.ok{border-color:#1f4028;} .stat-card.fail{border-color:#4a1820;} .stat-card.warn{border-color:#3a2c10;}
.slabel{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;}
.sval{font-size:20px;font-weight:700;}
.stat-card.ok .sval{color:var(--ok);} .stat-card.fail .sval{color:var(--fail);} .stat-card.warn .sval{color:var(--warn);}
.dr-row{display:flex;align-items:baseline;gap:10px;padding:6px 0;border-bottom:1px solid #1e2230;font-size:13px;}
.dr-row:last-child{border-bottom:none;}
.dr-mark{font-size:14px;width:16px;text-align:center;flex-shrink:0;}
.dr-mark.ok{color:var(--ok);} .dr-mark.warn{color:var(--warn);} .dr-mark.fail{color:var(--fail);}
.dr-name{font-weight:500;min-width:170px;}
.dr-detail{color:var(--muted);font-size:12px;font-family:var(--mono);}

/* Logs */
.log-wrap{background:#080b0f;border:1px solid var(--line);border-radius:8px;
          height:calc(100vh - 196px);overflow-y:auto;padding:6px 4px;
          font:12px/1.6 var(--mono);}
.log-line{padding:1px 8px;border-radius:3px;display:flex;gap:8px;}
.log-line:hover{background:#1a1e28;}
.log-line .ts{color:#3d4a5c;flex-shrink:0;}
.log-line .lvl{flex-shrink:0;width:40px;font-weight:600;}
.log-line.info .lvl{color:#6b8cff;} .log-line.warn .lvl{color:var(--warn);}
.log-line.error .lvl{color:var(--fail);} .log-line.debug .lvl{color:#5a6477;}
.log-line .msg{color:var(--fg);word-break:break-all;}
.log-line.error .msg{color:#ffb4ae;} .log-line.warn .msg{color:#f0cd7a;} .log-line.debug .msg{color:#6a7280;}
.log-ctl{display:flex;align-items:center;gap:10px;}
.log-ctl label{margin:0;display:flex;align-items:center;gap:5px;color:var(--muted);font-size:12px;cursor:pointer;}

/* Connections */
.client-card{background:var(--panel);border:1px solid var(--line);border-radius:10px;
             padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;gap:14px;}
.client-card input[type=checkbox]{width:16px;height:16px;flex-shrink:0;cursor:pointer;}
.cc-label{font-weight:600;font-size:13px;margin-bottom:3px;}
.cc-path{font-size:11px;color:var(--muted);font-family:var(--mono);word-break:break-all;}

/* Tools history */
.hist-item{padding:8px 12px;border-bottom:1px solid var(--line);font-size:12px;}
.hist-item:last-child{border-bottom:none;}
.hi-hdr{display:flex;justify-content:space-between;margin-bottom:4px;}
.hi-name{font-weight:600;color:var(--accent);}
.hi-ts{color:var(--muted);}
.hi-out{background:#0a0c10;border-radius:4px;padding:5px 8px;font-family:var(--mono);
        white-space:pre-wrap;max-height:70px;overflow:hidden;font-size:11px;}
.hi-out.err{color:#ffb4ae;}

.muted{color:var(--muted);}

/* Chat — full-height split layout */
#gx-content.for-chat{padding:0;overflow:hidden;}
#sec-chat.active{display:flex;flex:1;height:100%;}
.chat-sidebar{width:220px;background:var(--sidebar);border-right:1px solid var(--line);
              display:flex;flex-direction:column;flex-shrink:0;}
.chat-new{padding:10px;border-bottom:1px solid var(--line);}
.chat-new button{width:100%;}
.conv-list{flex:1;overflow-y:auto;}
.conv-item{padding:9px 13px;cursor:pointer;border-bottom:1px solid #1c2030;font-size:12px;}
.conv-item:hover{background:#1c1f2b;}
.conv-item.active{background:#1a2040;border-left:2px solid var(--accent);}
.conv-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--fg);margin-bottom:3px;}
.conv-item.active .conv-title{color:var(--accent);}
.conv-meta{display:flex;justify-content:space-between;align-items:center;}
.conv-date{font-size:10px;color:var(--muted);}
.conv-del{font-size:11px;color:var(--muted);padding:0 2px;line-height:1;}
.conv-del:hover{color:var(--fail);}
.chat-main{flex:1;display:flex;flex-direction:column;overflow:hidden;padding:16px;}
.chat-msgs{flex:1;overflow-y:auto;display:flex;flex-direction:column;
           gap:14px;padding:4px 2px;margin-bottom:12px;}
.chat-bubble{max-width:90%;padding:12px 16px;border-radius:12px;font-size:13px;line-height:1.6;
             white-space:pre-wrap;word-break:break-word;}
.chat-bubble.user{background:#1a2a50;border:1px solid #2a4080;align-self:flex-end;color:#ccd9ff;}
.chat-bubble.assistant{background:var(--panel);border:1px solid var(--line);align-self:flex-start;
                       color:var(--fg);max-width:95%;}
.chat-bubble.thinking{color:var(--muted);font-style:italic;}
.chat-tool{background:#0f1a10;border:1px solid #1a3020;border-radius:8px;margin:6px 0;
           font-size:12px;overflow:hidden;}
.chat-tool summary{padding:6px 10px;cursor:pointer;color:var(--ok);font-family:var(--mono);}
.chat-tool .tool-body{padding:8px 10px;border-top:1px solid #1a3020;font-family:var(--mono);
                      white-space:pre-wrap;word-break:break-all;max-height:200px;overflow-y:auto;
                      color:var(--muted);font-size:11px;}
.chat-tool .tool-body.err{color:#ffb4ae;}
.chat-input-row{display:flex;gap:8px;align-items:flex-end;}
.chat-input{flex:1;background:#0e1014;color:var(--fg);border:1px solid var(--line);
            border-radius:8px;padding:10px 12px;font:13px/1.5 var(--font);
            resize:none;outline:none;transition:border-color .15s;}
.chat-input:focus{border-color:var(--accent);}
.chat-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
            color:var(--muted);gap:8px;font-size:13px;min-height:0;}
.chat-msgs{flex:1;overflow-y:auto;display:flex;flex-direction:column;
           gap:14px;padding:4px 2px;margin-bottom:12px;min-height:0;}

/* ── Chat status banner ── */
#chat-status {
  display:flex;align-items:center;gap:8px;padding:6px 12px;
  border-radius:7px;font-size:12px;border:1px solid transparent;
  flex-shrink:0;transition:opacity .4s;margin-bottom:6px;
}
#chat-status.state-thinking{background:#1a1f2e;border-color:var(--line);color:var(--muted);}
#chat-status.state-tool{background:#111e12;border-color:#1a3020;color:var(--ok);}
#chat-status.state-done{background:#0f1e12;border-color:#1f4028;color:var(--ok);}
#chat-status.state-error{background:#2a1316;border-color:var(--fail);color:#ffb4ae;}
#chat-status.fading{opacity:0;}

/* ── Typing indicator dots ── */
.typing-dots{display:inline-flex;gap:3px;align-items:center;margin-left:4px;vertical-align:middle;}
.typing-dots span{width:4px;height:4px;border-radius:50%;background:var(--muted);
                  animation:dot-pulse 1.2s infinite ease-in-out both;}
.typing-dots span:nth-child(2){animation-delay:.2s;}
.typing-dots span:nth-child(3){animation-delay:.4s;}
@keyframes dot-pulse{0%,80%,100%{transform:scale(.7);opacity:.4;}40%{transform:scale(1);opacity:1;}}

/* ── Running tool highlight ── */
.chat-tool.running{border-color:#2a5030;animation:tool-pulse 1.4s infinite ease-in-out;}
@keyframes tool-pulse{0%,100%{box-shadow:inset 3px 0 0 var(--ok);}50%{box-shadow:inset 3px 0 0 #2a5030;}}

/* ── Spinner icon ── */
.tool-spinner{display:inline-block;width:10px;height:10px;border:1.5px solid #2a5030;
              border-top-color:var(--ok);border-radius:50%;animation:spin .8s linear infinite;
              margin-right:5px;vertical-align:middle;flex-shrink:0;}
@keyframes spin{to{transform:rotate(360deg);}}
</style>
</head>
<body>

<!-- ── Login screen ─────────────────────────────────── -->
<div id="gx-login">
  <div class="lbox">
    <div class="lbox-logo">gx18&#8209;mcp</div>
    <p class="lbox-sub">Open the URL from your terminal in this browser — or paste the token (or the full URL) below.</p>
    <label style="margin-top:0">Token</label>
    <input type="text" id="tok-in" autocomplete="off" spellcheck="false"
           placeholder="Token or full URL from terminal" />
    <div class="btns" style="margin-top:14px">
      <button class="act" onclick="doLogin()">Connect</button>
    </div>
    <div id="login-err" style="margin-top:10px"></div>
  </div>
</div>

<!-- ── App (hidden until authenticated) ─────────────── -->
<div id="gx-app" style="display:none">
  <header id="gx-header">
    <span class="hd-title">gx18&#8209;mcp</span>
    <span id="hd-version" class="tag muted" style="font-size:11px"></span>
    <span id="hd-mode" class="tag">loading</span>
    <span class="tag muted" style="font-size:11px">127.0.0.1</span>
    <span class="spacer"></span>
    <span id="hd-worker" class="muted" style="font-size:12px">&#9679; unknown</span>
  </header>

  <div class="layout">
    <nav id="gx-nav">
      <button onclick="nav('dashboard')" data-sec="dashboard" class="active">
        <span class="nav-ico">&#11041;</span>Dashboard</button>
      <button onclick="nav('logs')" data-sec="logs">
        <span class="nav-ico">&#9783;</span>Logs</button>
      <div class="nav-sep"></div>
      <button onclick="nav('connections')" data-sec="connections">
        <span class="nav-ico">&#9636;</span>Connections</button>
      <button onclick="nav('tools')" data-sec="tools">
        <span class="nav-ico">&#9881;</span>Tools</button>
      <div class="nav-sep"></div>
      <button onclick="nav('config')" data-sec="config">
        <span class="nav-ico">&#9965;</span>Config</button>
      <button onclick="nav('chat')" data-sec="chat">
        <span class="nav-ico">&#9671;</span>Chat</button>
    </nav>

    <div id="gx-content">

      <!-- Dashboard -->
      <section id="sec-dashboard" class="sec active">
        <div class="sec-hdr">
          <h2>Dashboard</h2>
          <span class="spacer"></span>
          <button class="act sec sm" onclick="loadDashboard()">Refresh</button>
        </div>
        <div class="stat-row">
          <div class="stat-card" id="sc-worker">
            <div class="slabel">Worker</div>
            <div class="sval" id="sc-worker-val">&#8212;</div>
          </div>
          <div class="stat-card" id="sc-pid-card">
            <div class="slabel">PID</div>
            <div class="sval" id="sc-pid">&#8212;</div>
          </div>
          <div class="stat-card" id="sc-uptime-card">
            <div class="slabel">Uptime</div>
            <div class="sval" id="sc-uptime">&#8212;</div>
          </div>
          <div class="stat-card" id="sc-ev-card">
            <div class="slabel">EntityVersions</div>
            <div class="sval" id="sc-ev">&#8212;</div>
          </div>
        </div>
        <div class="card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
            <h3 style="margin:0">Health checks</h3>
            <span id="dr-badge" class="tag" style="display:none"></span>
          </div>
          <div id="dr-checks"><span class="muted" style="font-size:13px">Click Refresh to run checks.</span></div>
        </div>
        <div class="card">
          <h3>Worker control</h3>
          <div class="btns">
            <button class="act sec" id="btn-restart" onclick="restartWorker()">&#8635; Restart worker</button>
          </div>
          <div id="worker-out"></div>
        </div>
      </section>

      <!-- Logs -->
      <section id="sec-logs" class="sec">
        <div class="sec-hdr">
          <h2>Logs</h2>
          <span class="spacer"></span>
          <div class="log-ctl">
            <select id="log-filter" onchange="filterLogs()">
              <option value="">All levels</option>
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
            </select>
            <label><input type="checkbox" id="log-scroll" checked /> Auto-scroll</label>
            <button class="act sec sm" onclick="clearLogs()">Clear</button>
            <span id="log-conn" class="tag">disconnected</span>
          </div>
        </div>
        <div id="log-wrap" class="log-wrap"></div>
      </section>

      <!-- Connections -->
      <section id="sec-connections" class="sec">
        <div class="sec-hdr">
          <h2>Connections</h2>
          <span class="spacer"></span>
          <button class="act sec sm" onclick="loadConnections()">Refresh</button>
        </div>
        <div id="conn-list"><span class="muted">Loading&#8230;</span></div>
        <div class="card" style="margin-top:12px">
          <div class="btns">
            <button class="act" onclick="registerSelected()">Register selected</button>
          </div>
          <div id="conn-out"></div>
        </div>
      </section>

      <!-- Tools -->
      <section id="sec-tools" class="sec">
        <div class="sec-hdr">
          <h2>Tools</h2>
          <span class="spacer"></span>
          <input type="text" id="tool-search" placeholder="Search tools&#8230;"
                 oninput="filterTools()" style="width:200px;margin:0" />
        </div>
        <div id="tool-history" class="card" style="display:none">
          <h3>Recent runs</h3>
          <div id="tool-hist-list"></div>
        </div>
        <div id="toolList"><span class="muted">Loading tools&#8230;</span></div>
      </section>

      <!-- Config -->
      <section id="sec-config" class="sec">
        <div class="sec-hdr"><h2>Config</h2></div>
        <div id="cfg-banners"></div>
        <div class="card">
          <h3>Knowledge Base</h3>
          <label>KB path <span class="muted">(folder containing the .gxw file)</span></label>
          <input type="text" id="kbPath" />
          <div class="row">
            <div>
              <label>SQL Server <span class="muted">(keep the parentheses)</span></label>
              <input type="text" id="kbServer" placeholder="(localdb)\\MSSQLLocalDB" />
            </div>
            <div>
              <label>KB database</label>
              <input type="text" id="kbDatabase" />
            </div>
          </div>
          <label>GeneXus 18 install dir</label>
          <input type="text" id="gx18Dir" />
          <label>Output path <span class="muted">(default for gx_export)</span></label>
          <input type="text" id="outputPath" />
          <div class="btns" style="margin-top:12px">
            <button class="act sec sm" onclick="detectKbs()">&#9670; Auto-detectar KBs</button>
          </div>
          <div id="kbDetect-out" style="margin-top:8px;font-size:12px"></div>
          <div id="kbDetect-list" style="display:none;margin-top:10px">
            <label>KBs encontradas — selecione uma:</label>
            <select id="kbSelect" onchange="applyDetectedKb()" style="width:100%">
              <option value="">— selecione —</option>
            </select>
          </div>
        </div>
        <details id="oracleCard">
          <summary>Oracle connection <span class="muted" style="font-weight:400">(optional)</span></summary>
          <div class="toolbody">
            <div class="row">
              <div><label>Host</label><input type="text" id="oraHost" /></div>
              <div><label>Port</label><input type="number" id="oraPort" /></div>
            </div>
            <label>Service</label><input type="text" id="oraService" />
            <div class="row">
              <div><label>User</label><input type="text" id="oraUser" /></div>
              <div><label>Password</label><input type="text" id="oraPassword" /></div>
            </div>
            <p class="muted" style="margin-top:10px;font-size:12px">Saved values are masked. Leave the mask to preserve the stored password. ORACLE_* env vars override saved values at runtime.</p>
          </div>
        </details>
        <details id="chatCliCard">
          <summary>Claude CLI <span class="muted" style="font-weight:400">(for the Chat tab)</span></summary>
          <div class="toolbody">
            <div id="chat-detect-status" class="muted" style="font-size:12px;margin-bottom:10px">Click Detect to auto-discover settings.</div>
            <div class="row">
              <div style="flex:2">
                <label>Claude binary path <span class="muted">(leave blank to use PATH)</span></label>
                <input type="text" id="chatCliBin" placeholder="e.g. C:\\Users\\you\\AppData\\Roaming\\npm\\claude.cmd" />
              </div>
              <div style="flex:0;align-self:flex-end">
                <button class="act sec sm" onclick="detectChatCli()" style="margin-bottom:0">Detect</button>
              </div>
            </div>
            <label>Project root <span class="muted">(cwd for claude subprocess — loads .mcp.json, CLAUDE.md)</span></label>
            <input type="text" id="chatProjectRoot" placeholder="e.g. C:\\Repos\\genexus-ai-toolkit" />
            <label>Nexa skills dir <span class="muted">(passed as --add-dir; leave blank to disable)</span></label>
            <input type="text" id="chatNexaDir" placeholder="e.g. skills/nexa/nexa" />
            <label>Extra --add-dir paths <span class="muted">(one per line)</span></label>
            <textarea id="chatAddDirs" rows="2" style="font-family:monospace;font-size:12px;width:100%;box-sizing:border-box"></textarea>
            <div class="btns" style="margin-top:8px">
              <button class="act" onclick="saveChatConfig()">Save Claude CLI config</button>
            </div>
            <div id="chatCliOut"></div>
          </div>
        </details>
        <div class="card">
          <div class="btns">
            <button class="act" onclick="saveConfig()">Save config</button>
            <button class="act sec" onclick="validate()">Validate worker</button>
            <button class="act sec" onclick="doctorConfig()">Doctor</button>
          </div>
          <div id="setupOut"></div>
        </div>
      </section>

      <!-- Chat -->
      <section id="sec-chat" class="sec">
        <!-- Conversation sidebar -->
        <div class="chat-sidebar">
          <div class="chat-new">
            <button class="act sm" onclick="newConv()" style="width:100%">&#43; New conversation</button>
          </div>
          <div id="conv-list" class="conv-list"></div>
        </div>
        <!-- Main chat area -->
        <div class="chat-main">
          <div id="chat-status" style="display:none"></div>
          <div class="chat-empty" id="chat-empty">
            <span style="font-size:24px">&#9671;</span>
            <span>Ask anything about the GeneXus KB</span>
            <span style="font-size:11px">Claude Code CLI &nbsp;&#183;&nbsp; gx18 + gxnext tools</span>
          </div>
          <div id="chat-msgs" class="chat-msgs" style="display:none"></div>
          <div id="chat-img-preview" style="display:none;padding:6px 0;font-size:12px;color:var(--muted)">
            <span id="chat-img-label"></span>
            <button onclick="clearChatImage()" style="margin-left:8px;background:none;border:none;color:var(--fail);cursor:pointer;font-size:12px">&#10005; remover</button>
          </div>
          <div class="chat-input-row">
            <textarea id="chat-in" class="chat-input" rows="2"
              placeholder="Ask anything about the GeneXus KB&#10;e.g. What web panels exist in the VEN module?&#10;Ctrl+V to paste a screenshot"
              onkeydown="chatKey(event)" onpaste="chatPaste(event)"></textarea>
            <button class="act" id="chat-send" onclick="chatSend()">Send</button>
            <button class="act sec" id="chat-cancel" onclick="chatCancel()" style="display:none">Cancel</button>
          </div>
          <p class="muted" style="font-size:11px;margin-top:6px">
            Shift+Enter = new line &nbsp;&#183;&nbsp; Enter = send &nbsp;&#183;&nbsp; Ctrl+V = colar imagem &nbsp;&#183;&nbsp; uses local <code>claude</code> CLI
          </p>
        </div>
      </section>

    </div><!-- /gx-content -->
  </div><!-- /layout -->
</div><!-- /gx-app -->

<script>
// ── State ──────────────────────────────────────────────────────
var TOKEN = '';
var READONLY = false;
var _logEs = null;
var _allTools = [];
var _convs = [];       // [{ id, title, sessionId, msgs, createdAt, updatedAt }]
var _convId = null;    // active conversation id
var _dashTimer = null;
var _pendingImagePath = null;  // path of a pasted image saved to temp (cleared after send)

// ── Bootstrap ─────────────────────────────────────────────────
(function init() {
  var frag = new URLSearchParams(location.hash.slice(1));
  var fragTok = frag.get('token') || '';
  if (fragTok) {
    TOKEN = fragTok;
    try { sessionStorage.setItem('gx18-token', fragTok); } catch(e) {}
    history.replaceState(null, '', location.pathname);
    showApp();
  } else {
    var stored = '';
    try { stored = sessionStorage.getItem('gx18-token') || ''; } catch(e) {}
    if (stored) { TOKEN = stored; showApp(); } else { showLogin(); }
  }
})();

function showLogin() { el('gx-login').style.display = ''; el('gx-app').style.display = 'none'; }
function showApp()  { el('gx-login').style.display = 'none'; el('gx-app').style.display = 'flex'; bootApp(); }

// ── Helpers ────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }
function setVal(id, v) { var e = el(id); if (e) e.value = (v == null ? '' : String(v)); }
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/\u003c/g,'&lt;').replace(/>/g,'&gt;');
}
function fmtUptime(ms) {
  var s = Math.floor(ms / 1000);
  if (s < 60) return s + 's';
  var m = Math.floor(s / 60);
  if (m < 60) return m + 'm ' + (s % 60) + 's';
  return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
}
function api(method, path, body) {
  return fetch(path, {
    method: method,
    headers: { 'x-gx18-token': TOKEN, 'content-type': 'application/json' },
    body: (body !== undefined) ? JSON.stringify(body) : undefined
  }).then(function(r) {
    if (r.status === 401) {
      try { sessionStorage.removeItem('gx18-token'); } catch(e) {}
      showLogin();
      return { status: 401, body: {} };
    }
    return r.json().then(function(j) { return { status: r.status, body: j }; });
  });
}
function outBox(container, text, isErr) {
  container.innerHTML = '';
  var pre = document.createElement('pre');
  pre.className = 'out' + (isErr ? ' err' : '');
  pre.textContent = text;
  container.appendChild(pre);
}

// ── Login ──────────────────────────────────────────────────────
el('tok-in').addEventListener('keydown', function(e) { if (e.key === 'Enter') doLogin(); });
function doLogin() {
  var raw = (el('tok-in').value || '').trim();
  var tok = raw;
  var fragIdx = raw.indexOf('#token=');
  if (fragIdx !== -1) tok = raw.slice(fragIdx + 7).split('&')[0];
  if (!tok) return;
  fetch('/api/config', { headers: { 'x-gx18-token': tok } })
    .then(function(r) {
      if (r.ok) {
        TOKEN = tok;
        try { sessionStorage.setItem('gx18-token', tok); } catch(e) {}
        el('login-err').innerHTML = '';
        showApp();
      } else {
        el('login-err').innerHTML = '<div class="banner fail">Invalid token. Open the URL your terminal printed — it contains the token as <code>#token=…</code>.</div>';
      }
    })
    .catch(function() {
      el('login-err').innerHTML = '<div class="banner fail">Could not connect to the server.</div>';
    });
}

// ── App boot ───────────────────────────────────────────────────
function bootApp() {
  api('GET', '/api/config').then(function(r) {
    if (r.status === 401) {
      try { sessionStorage.removeItem('gx18-token'); } catch(e) {}
      showLogin(); return;
    }
    if (r.status !== 200) return;
    READONLY = !!r.body.readonly;
    if (r.body.version) el('hd-version').textContent = 'v' + r.body.version;
    el('hd-mode').textContent = READONLY ? 'read-only' : 'read-write';
    el('hd-mode').className = 'tag' + (READONLY ? ' ro' : '');
    var c = r.body.config || {};
    setVal('kbPath', c.kbPath); setVal('kbServer', c.kbServer);
    setVal('kbDatabase', c.kbDatabase); setVal('gx18Dir', c.gx18Dir);
    setVal('outputPath', c.outputPath);
    if (c.oracle) {
      el('oracleCard').open = true;
      setVal('oraHost', c.oracle.host); setVal('oraPort', c.oracle.port);
      setVal('oraService', c.oracle.service); setVal('oraUser', c.oracle.user);
      setVal('oraPassword', c.oracle.password);
    }
    if (c.chat) {
      setVal('chatCliBin', c.chat.claudeCliPath||'');
      setVal('chatProjectRoot', c.chat.projectRoot||'');
      setVal('chatNexaDir', c.chat.nexaSkillsDir||'');
      setVal('chatAddDirs', (c.chat.addDirs||[]).join('\\n'));
    }
    var b = el('cfg-banners'); b.innerHTML = '';
    if (!r.body.workerExists) b.innerHTML += '<div class="banner fail">Worker not built. Run <b>npm run build:worker</b>.</div>';
    if (READONLY)             b.innerHTML += '<div class="banner warn">Read-only mode (GX18_READONLY): write tools are hidden.</div>';
    renderConnections(r.body.clients || []);
  });
  loadDashboard();
  loadTools();
  startLogs();
  loadConvs();
  renderConvList();
}

// ── Navigation ─────────────────────────────────────────────────
function nav(sec) {
  document.querySelectorAll('#gx-nav button[data-sec]').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-sec') === sec);
  });
  document.querySelectorAll('.sec').forEach(function(s) {
    s.classList.toggle('active', s.id === 'sec-' + sec);
  });
  // Chat needs full-height zero-padding layout
  el('gx-content').classList.toggle('for-chat', sec === 'chat');
  if (sec === 'chat') { el('chat-in').focus(); renderConvList(); }
}

// ── Dashboard ──────────────────────────────────────────────────
function loadDashboard() {
  api('GET', '/api/worker/status').then(function(r) {
    if (r.status !== 200) return;
    var s = r.body;
    var alive = !!s.alive;
    var starting = !!s.starting;
    var wClass = alive ? 'ok' : (starting ? 'warn' : 'fail');
    el('sc-worker').className = 'stat-card ' + wClass;
    el('sc-worker-val').textContent = alive ? 'Running' : (starting ? 'Iniciando...' : 'Stopped');
    el('sc-pid').textContent = s.pid != null ? String(s.pid) : '—';
    el('sc-uptime').textContent = s.uptimeMs ? fmtUptime(s.uptimeMs) : '—';
    var hw = el('hd-worker');
    hw.textContent = alive ? '● Running' : (starting ? '◌ Iniciando...' : '● Stopped');
    hw.style.color = alive ? 'var(--ok)' : (starting ? 'var(--warn)' : 'var(--fail)');
    // Auto-poll every 3s while starting so the dashboard updates when ready.
    if (starting && !window['_workerPoll']) {
      window['_workerPoll'] = setInterval(function() {
        api('GET', '/api/worker/status').then(function(pr) {
          if (pr.status !== 200) return;
          if (pr.body.alive || !pr.body.starting) {
            clearInterval(window['_workerPoll']); window['_workerPoll'] = null;
            loadDashboard();
          }
        });
      }, 3000);
    } else if (!starting && window['_workerPoll']) {
      clearInterval(window['_workerPoll']); window['_workerPoll'] = null;
    }
  });
  api('POST', '/api/doctor').then(function(r) {
    if (r.status !== 200) {
      el('dr-checks').innerHTML = '<span style="color:var(--fail)">Error: ' + escHtml(String(r.body.error || r.status)) + '</span>';
      return;
    }
    var checks = r.body.checks || [];
    var ok = !!r.body.ok;
    var badge = el('dr-badge');
    badge.style.display = '';
    badge.textContent = ok ? 'All OK' : 'Issues found';
    badge.className = 'tag ' + (ok ? 'ok' : 'fail');
    var evCheck = null;
    for (var i = 0; i < checks.length; i++) {
      if (checks[i].name === 'SQL EntityVersion rows') { evCheck = checks[i]; break; }
    }
    if (evCheck) {
      el('sc-ev').textContent = evCheck.detail;
      el('sc-ev-card').className = 'stat-card ' + (evCheck.status === 'ok' ? 'ok' : 'warn');
    }
    var div = el('dr-checks'); div.innerHTML = '';
    checks.forEach(function(c) {
      var row = document.createElement('div'); row.className = 'dr-row';
      var mark = c.status === 'ok' ? '✓' : c.status === 'warn' ? '⚠' : '✗';
      row.innerHTML =
        '<span class="dr-mark ' + c.status + '">' + mark + '</span>' +
        '<span class="dr-name">' + escHtml(c.name) + '</span>' +
        '<span class="dr-detail">' + escHtml(c.detail) + '</span>';
      div.appendChild(row);
    });
  });
  if (_dashTimer) clearTimeout(_dashTimer);
  _dashTimer = setTimeout(function() {
    if (el('sec-dashboard').classList.contains('active')) loadDashboard();
  }, 30000);
}

function restartWorker() {
  var out = el('worker-out');
  var btn = el('btn-restart');
  btn.disabled = true;
  out.innerHTML = '<span class="muted">Restarting worker…</span>';
  api('POST', '/api/worker/restart').then(function(r) {
    btn.disabled = false;
    if (r.status === 200) { outBox(out, 'Worker restarted.', false); loadDashboard(); }
    else outBox(out, 'Error: ' + (r.body.error || String(r.status)), true);
  }).catch(function(e) { btn.disabled = false; outBox(out, 'Error: ' + String(e), true); });
}

// ── Logs ───────────────────────────────────────────────────────
function startLogs() {
  if (_logEs) return;
  var tag = el('log-conn');
  tag.textContent = 'connecting…'; tag.className = 'tag warn';
  var es = new EventSource('/api/logs?token=' + encodeURIComponent(TOKEN));
  _logEs = es;
  es.onopen  = function() { tag.textContent = 'live'; tag.className = 'tag ok'; };
  es.onerror = function() {
    tag.textContent = 'disconnected'; tag.className = 'tag fail';
    es.close();
    _logEs = null;
    setTimeout(function() { if (!_logEs) startLogs(); }, 3000);
  };
  es.onmessage = function(e) {
    try { appendLogEntry(JSON.parse(e.data)); } catch(err) {}
  };
}

function appendLogEntry(entry) {
  var filter = (el('log-filter') || {}).value || '';
  var wrap = el('log-wrap');
  var line = document.createElement('div');
  var lv = entry.level || 'info';
  line.className = 'log-line ' + lv;
  line.setAttribute('data-level', lv);
  if (filter && lv !== filter) line.style.display = 'none';
  var ts = (entry.ts || '').slice(11, 23);
  line.innerHTML =
    '<span class="ts">' + ts + '</span>' +
    '<span class="lvl">' + lv.toUpperCase() + '</span>' +
    '<span class="msg">' + escHtml(entry.msg || '') + '</span>';
  wrap.appendChild(line);
  while (wrap.children.length > 500) wrap.removeChild(wrap.firstChild);
  var sc = el('log-scroll');
  if (sc && sc.checked) wrap.scrollTop = wrap.scrollHeight;
}

function filterLogs() {
  var filter = (el('log-filter') || {}).value || '';
  el('log-wrap').querySelectorAll('.log-line').forEach(function(l) {
    var lv = l.getAttribute('data-level') || '';
    l.style.display = (filter && lv !== filter) ? 'none' : '';
  });
}
function clearLogs() { el('log-wrap').innerHTML = ''; }

// ── Connections ─────────────────────────────────────────────────
function loadConnections() {
  api('GET', '/api/config').then(function(r) {
    if (r.status !== 200) return;
    renderConnections(r.body.clients || []);
  });
}
function renderConnections(clients) {
  var div = el('conn-list'); div.innerHTML = '';
  if (!clients.length) { div.innerHTML = '<p class="muted">No AI clients detected.</p>'; return; }
  clients.forEach(function(c) {
    var cmd = c.command ? escHtml(c.command + ' ' + (c.args||[]).join(' ')) : '';
    var card = document.createElement('div'); card.className = 'client-card';
    card.innerHTML =
      '<input type="checkbox" id="cc_' + escHtml(c.id) + '" value="' + escHtml(c.id) + '">' +
      '<div style="flex:1">' +
        '<div class="cc-label">' + escHtml(c.label) + '</div>' +
        '<div class="cc-path">' + escHtml(c.path || '') + '</div>' +
        (cmd ? '<div class="cc-path" style="margin-top:3px;opacity:.7">&#9656; ' + cmd + '</div>' : '') +
      '</div>';
    div.appendChild(card);
  });
}
function registerSelected() {
  var out = el('conn-out');
  var ids = [];
  document.querySelectorAll('#conn-list input[type=checkbox]:checked').forEach(function(c) { ids.push(c.value); });
  if (!ids.length) { outBox(out, 'Select at least one client.', true); return; }
  api('POST', '/api/register', { clients: ids }).then(function(r) {
    if (r.status !== 200) { outBox(out, 'Error: ' + (r.body.error || r.status), true); return; }
    var lines = (r.body.results || []).map(function(x) {
      return (x.ok ? '[OK] ' : '[FAIL] ') + x.id + ': ' + (x.path || x.error || '');
    });
    outBox(out, lines.join('\\n'), false);
  });
}

// ── Tools ──────────────────────────────────────────────────────
var CODE_SECTIONS = ['source','events','rules','layout','variables','conditions','template',
  'properties','tokens','styles','elements','content','query'];
var SECTION_OPTIONS = {
  gx_read:   ['source','events','rules','layout','variables','conditions','template','properties','tokens','styles','elements','content'],
  gx_modify: ['source','events','rules','layout','variables','conditions','template','properties','tokens','styles','elements','content']
};

function loadTools() {
  api('GET', '/api/tools').then(function(r) {
    if (r.status !== 200) { el('toolList').textContent = r.body.error || 'Unauthorized'; return; }
    _allTools = r.body.tools || [];
    renderToolList(_allTools);
    renderToolHistory();
  });
}
function filterTools() {
  var q = ((el('tool-search') || {}).value || '').toLowerCase();
  var filtered = q ? _allTools.filter(function(t) {
    return t.name.toLowerCase().indexOf(q) >= 0 || (t.description || '').toLowerCase().indexOf(q) >= 0;
  }) : _allTools;
  renderToolList(filtered);
}
function renderToolList(tools) {
  var list = el('toolList'); list.innerHTML = '';
  if (!tools.length) { list.innerHTML = '<p class="muted">No tools match your search.</p>'; return; }
  tools.forEach(function(tool) { list.appendChild(renderTool(tool)); });
}
function renderToolHistory() {
  var hist = getToolHistory();
  var container = el('tool-history');
  if (!hist.length) { container.style.display = 'none'; return; }
  container.style.display = '';
  var listEl = el('tool-hist-list'); listEl.innerHTML = '';
  hist.slice(-6).reverse().forEach(function(h) {
    var item = document.createElement('div'); item.className = 'hist-item';
    var ts = ''; try { ts = new Date(h.ts).toLocaleTimeString(); } catch(e) {}
    var preview = String(h.text || '').substring(0, 200) + (String(h.text||'').length > 200 ? '…' : '');
    item.innerHTML =
      '<div class="hi-hdr"><span class="hi-name">' + escHtml(h.name) + '</span><span class="hi-ts">' + ts + '</span></div>' +
      '<pre class="hi-out' + (h.isError ? ' err' : '') + '">' + escHtml(preview) + '</pre>';
    listEl.appendChild(item);
  });
}
function getToolHistory() { try { return JSON.parse(sessionStorage.getItem('gx18-hist')||'[]'); } catch(e) { return []; } }
function addToolHistory(entry) {
  var hist = getToolHistory(); hist.push(entry);
  if (hist.length > 20) hist = hist.slice(-20);
  try { sessionStorage.setItem('gx18-hist', JSON.stringify(hist)); } catch(e) {}
}
function widgetFor(toolName, propName, prop) {
  if (propName === 'confirm') return null;
  var schema = prop || {};
  var wrap = document.createElement('div');
  var lbl = document.createElement('label'); lbl.textContent = propName;
  if (schema.description) { var s=document.createElement('span'); s.className='muted'; s.textContent=' — '+schema.description; lbl.appendChild(s); }
  wrap.appendChild(lbl);
  var input;
  var opts = (SECTION_OPTIONS[toolName] && propName==='section') ? SECTION_OPTIONS[toolName] : schema.enum;
  if (opts) {
    input = document.createElement('select');
    var blank=document.createElement('option'); blank.value=''; blank.textContent='—'; input.appendChild(blank);
    opts.forEach(function(o){ var op=document.createElement('option'); op.value=o; op.textContent=o; input.appendChild(op); });
  } else if (schema.type==='boolean') {
    input=document.createElement('input'); input.type='checkbox';
  } else if (schema.type==='number') {
    input=document.createElement('input'); input.type='number';
  } else if (schema.type==='array') {
    input=document.createElement('textarea'); input.placeholder='JSON array, e.g. [{"name":"X","type":"Character","length":40}]';
  } else if (CODE_SECTIONS.indexOf(propName)>=0) {
    input=document.createElement('textarea');
  } else {
    input=document.createElement('input'); input.type='text';
  }
  input.setAttribute('data-prop', propName);
  input.setAttribute('data-jtype', schema.type||'string');
  wrap.appendChild(input);
  return wrap;
}
function renderTool(tool) {
  var d=document.createElement('details');
  var sum=document.createElement('summary'); sum.textContent=tool.name; d.appendChild(sum);
  var body=document.createElement('div'); body.className='toolbody';
  var desc=document.createElement('p'); desc.className='muted'; desc.textContent=tool.description||''; body.appendChild(desc);
  var props=(tool.inputSchema&&tool.inputSchema.properties)||{};
  var required=(tool.inputSchema&&tool.inputSchema.required)||[];
  var hasConfirm=!!props.confirm;
  Object.keys(props).forEach(function(name){
    var w=widgetFor(tool.name,name,props[name]); if(!w) return;
    if (required.indexOf(name)>=0){var l=w.querySelector('label');if(l){var r=document.createElement('span');r.className='req';r.textContent=' *';l.appendChild(r);}}
    body.appendChild(w);
  });
  if (hasConfirm) {
    var cb=document.createElement('div'); cb.className='confirmbox';
    cb.innerHTML='<input type="checkbox" data-prop="confirm" data-jtype="boolean"><div><b>I understand this writes to the live KB.</b><br><span class="muted">Required — the call is rejected without it.</span></div>';
    body.appendChild(cb);
  }
  var btns=document.createElement('div'); btns.className='btns';
  var runBtn=document.createElement('button'); runBtn.className='act'; runBtn.textContent='Run';
  var copyBtn=document.createElement('button'); copyBtn.className='act sec'; copyBtn.textContent='Copy result';
  btns.appendChild(runBtn); btns.appendChild(copyBtn); body.appendChild(btns);
  var out=document.createElement('div'); body.appendChild(out);
  runBtn.onclick=function(){ runToolUI(tool.name,body,out); };
  copyBtn.onclick=function(){ var pre=out.querySelector('pre'); if(pre&&navigator.clipboard) navigator.clipboard.writeText(pre.textContent).catch(function(){}); };
  d.appendChild(body); return d;
}
function collectArgs(body) {
  var args={};
  body.querySelectorAll('[data-prop]').forEach(function(input){
    var name=input.getAttribute('data-prop'), jtype=input.getAttribute('data-jtype');
    if (jtype==='boolean'){ if(input.checked) args[name]=true; return; }
    var v=input.value; if(v==null||v==='') return;
    if (jtype==='number') args[name]=Number(v);
    else if (jtype==='array') args[name]=JSON.parse(v);
    else args[name]=v;
  });
  return args;
}
function runToolUI(name, body, out) {
  var args; try { args=collectArgs(body); } catch(e){ outBox(out,'Invalid JSON in array field: '+e.message,true); return; }
  outBox(out,'Running…',false);
  api('POST','/api/tool/'+encodeURIComponent(name),{args:args}).then(function(r){
    if (r.status===503){ outBox(out,r.body.error,true); return; }
    if (r.status!==200){ outBox(out,'Error: '+(r.body.error||String(r.status)),true); return; }
    outBox(out,r.body.text,!!r.body.isError);
    addToolHistory({name:name,ts:new Date().toISOString(),text:r.body.text||'',isError:!!r.body.isError});
    renderToolHistory();
  });
}

// ── Config ─────────────────────────────────────────────────────
function collectOracle() {
  var host=(el('oraHost').value||'').trim(); if(!host) return null;
  return { host:host, port:parseInt(el('oraPort').value,10)||1521,
           service:(el('oraService').value||'').trim(), user:(el('oraUser').value||'').trim(),
           password:el('oraPassword').value };
}
function saveConfig() {
  var patch={
    kbPath:(el('kbPath').value||'').trim(), kbServer:(el('kbServer').value||'').trim(),
    kbDatabase:(el('kbDatabase').value||'').trim(), gx18Dir:(el('gx18Dir').value||'').trim(),
    outputPath:(el('outputPath').value||'').trim(), oracle:collectOracle()
  };
  api('POST','/api/config',patch).then(function(r){
    outBox(el('setupOut'), r.status===200?'Config saved.':'Error: '+(r.body.error||r.status), r.status!==200);
  });
}
function validate() {
  outBox(el('setupOut'),'Validating…',false);
  api('POST','/api/validate').then(function(r){
    if (r.status!==200){ outBox(el('setupOut'),'Error: '+(r.body.error||r.status),true); return; }
    var p=r.body.ping||{}, w=r.body.whoami||{};
    outBox(el('setupOut'),
      'user: '+p.user+'\\nkbPath: '+p.kbPath+'\\nsdkReady: '+p.sdkReady+
      '\\nsqlReady: '+p.sqlReady+'\\nwhoami: '+w.windowsUser+' -> UserId '+
      (w.kbUserId==null?'(not found)':w.kbUserId), false);
  });
}
function doctorConfig() {
  outBox(el('setupOut'),'Running doctor…',false);
  api('POST','/api/doctor').then(function(r){
    if (r.status!==200){ outBox(el('setupOut'),'Error: '+(r.body.error||r.status),true); return; }
    var lines=(r.body.checks||[]).map(function(c){
      var mark=c.status==='ok'?'[OK]':c.status==='warn'?'[WARN]':'[FAIL]';
      return mark+' '+c.name+': '+c.detail;
    });
    outBox(el('setupOut'),lines.join('\\n'),!r.body.ok);
  });
}

// ── KB auto-detect ─────────────────────────────────────────────
var _detectedKbs = [];
function detectKbs() {
  var out = el('kbDetect-out');
  out.innerHTML = '<span class="muted">Detectando…</span>';
  api('GET', '/api/detect').then(function(r) {
    if (r.status !== 200) {
      out.innerHTML = '<span style="color:var(--fail)">Erro: ' + escHtml(String(r.body.error || r.status)) + '</span>';
      return;
    }
    _detectedKbs = r.body.kbs || [];
    var dirs = r.body.gx18Dirs || [];
    if (dirs.length && !el('gx18Dir').value) setVal('gx18Dir', dirs[0]);
    if (!_detectedKbs.length) {
      out.innerHTML = '<span class="muted">Nenhuma KB encontrada. Preencha os campos manualmente.</span>';
      el('kbDetect-list').style.display = 'none';
      return;
    }
    if (_detectedKbs.length === 1) {
      applyKb(_detectedKbs[0]);
      out.innerHTML = '<span style="color:var(--ok)">&#10003; KB detectada e campos preenchidos.</span>';
      el('kbDetect-list').style.display = 'none';
    } else {
      var sel = el('kbSelect');
      sel.innerHTML = '<option value="">— selecione —</option>';
      _detectedKbs.forEach(function(kb, i) {
        var op = document.createElement('option');
        op.value = String(i);
        op.textContent = kb.gxwFile + '  (' + kb.dbName + ')  — ' + kb.kbPath;
        sel.appendChild(op);
      });
      el('kbDetect-list').style.display = '';
      out.innerHTML = '<span class="muted">' + _detectedKbs.length + ' KBs encontradas — selecione uma abaixo.</span>';
    }
  });
}
function applyKb(kb) {
  setVal('kbPath', kb.kbPath);
  setVal('kbDatabase', kb.dbName);
  setVal('kbServer', kb.kbServer);
}
function applyDetectedKb() {
  var idx = parseInt((el('kbSelect') || {}).value || '', 10);
  if (isNaN(idx) || !_detectedKbs[idx]) return;
  applyKb(_detectedKbs[idx]);
  el('kbDetect-out').innerHTML = '<span style="color:var(--ok)">&#10003; Campos preenchidos.</span>';
}

// ── Conversations (localStorage) ────────────────────────────────
var _chatSessionId = null;
var _chatBusy = false;
var _chatAbort = null;

var CONV_KEY = 'gx18_convs';
function loadConvs() {
  try { _convs = JSON.parse(localStorage.getItem(CONV_KEY) || '[]'); } catch(e) { _convs = []; }
  api('GET', '/api/conversations').then(function(r) {
    if (r.status === 200 && Array.isArray(r.body.convs)) {
      if (r.body.convs.length > 0) {
        // Server has data — merge: prefer whichever copy of each conv is newer
        var serverMap = {};
        r.body.convs.forEach(function(c) { serverMap[c.id] = c; });
        _convs.forEach(function(c) {
          if (!serverMap[c.id] || c.updatedAt > serverMap[c.id].updatedAt) serverMap[c.id] = c;
        });
        _convs = Object.values(serverMap);
        try { localStorage.setItem(CONV_KEY, JSON.stringify(_convs)); } catch(e) {}
        saveConvs(); // push merged result back to server
      } else if (_convs.length > 0) {
        // Server empty (fresh restart, no conversations.json) — restore from localStorage
        saveConvs();
      }
      renderConvList();
    }
  }).catch(function(){});
}
function saveConvs() {
  try { localStorage.setItem(CONV_KEY, JSON.stringify(_convs)); } catch(e) {}
  api('POST', '/api/conversations', { convs: _convs }).catch(function(){});
}
// Flush to server when closing the tab (guards against losing the last turn)
window.addEventListener('beforeunload', function() { if (_convs.length) saveConvs(); });
function currentConv() {
  return _convs.find(function(c) { return c.id === _convId; }) || null;
}
function showEmpty() {
  el('chat-empty').style.display = '';
  el('chat-msgs').style.display = 'none';
  el('chat-msgs').innerHTML = '';
}
function showMsgs() {
  el('chat-empty').style.display = 'none';
  el('chat-msgs').style.display = '';
}
function newConv() {
  if (_chatBusy) return;
  _convId = null;
  _chatSessionId = null;
  showEmpty();
  el('chat-in').focus();
  renderConvList();
}
function switchConv(id) {
  if (_chatBusy) return;
  _convId = id;
  var conv = currentConv();
  _chatSessionId = conv ? (conv.sessionId || null) : null;
  showMsgs();
  el('chat-msgs').innerHTML = '';
  if (conv && (conv.msgs||[]).length) {
    (conv.msgs || []).forEach(function(m) { renderStoredMsg(m); });
  } else {
    showEmpty();
  }
  renderConvList();
  chatScrollBottom();
}
function deleteConv(id) {
  _convs = _convs.filter(function(c) { return c.id !== id; });
  saveConvs();
  if (_convId === id) newConv();
  else renderConvList();
}
function renderConvList() {
  var list = el('conv-list'); if (!list) return;
  if (_convs.length === 0) {
    list.innerHTML = '<div style="padding:14px 12px;font-size:12px;color:var(--muted)">No conversations yet</div>';
    return;
  }
  var sorted = _convs.slice().sort(function(a,b){ return b.updatedAt - a.updatedAt; });
  list.innerHTML = sorted.map(function(c) {
    var act = c.id === _convId ? ' active' : '';
    var d = new Date(c.updatedAt);
    var now = new Date();
    var dateStr = d.toDateString() === now.toDateString() ? d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : d.toLocaleDateString();
    return '<div class="conv-item'+act+'" onclick="switchConv(&#39;'+c.id+'&#39;)">' +
      '<div class="conv-title">'+escHtml(c.title||'New conversation')+'</div>' +
      '<div class="conv-meta">' +
        '<span class="conv-date">'+dateStr+'</span>' +
        '<span class="conv-del" onclick="event.stopPropagation();deleteConv(&#39;'+c.id+'&#39;)">&#10005;</span>' +
      '</div>' +
    '</div>';
  }).join('');
}
function renderStoredMsg(m) {
  var div = chatAppendBubble(m.role, m.content || '');
  if (m.tools && m.tools.length) {
    m.tools.forEach(function(t) {
      var det = document.createElement('details');
      det.className = 'chat-tool';
      det.innerHTML = '<summary>&#9881; '+escHtml(toolLabel(t.name, {}))+'</summary>' +
        '<div class="tool-body'+(t.isError?' err':'')+'">'+escHtml(t.result||'')+'</div>';
      div.parentNode.insertBefore(det, div.nextSibling);
    });
  }
}

// ── Chat ────────────────────────────────────────────────────────
function chatKey(e) {
  if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); chatSend(); }
}

function chatPaste(e) {
  var items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (var i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') === -1) continue;
    e.preventDefault();
    var file = items[i].getAsFile();
    if (!file) continue;
    var reader = new FileReader();
    reader.onload = function(ev) {
      var dataUrl = ev.target.result;
      var base64 = dataUrl.split(',')[1];
      var mime = dataUrl.split(';')[0].split(':')[1];
      api('POST', '/api/chat/image', { data: base64, mimeType: mime }).then(function(r) {
        if (r.status !== 200) return;
        _pendingImagePath = r.body.path;
        el('chat-img-label').textContent = '&#128247; ' + r.body.path.split(/[\/\\]/).pop();
        el('chat-img-preview').style.display = '';
      });
    };
    reader.readAsDataURL(file);
    break;
  }
}

function clearChatImage() {
  _pendingImagePath = null;
  el('chat-img-preview').style.display = 'none';
  el('chat-img-label').textContent = '';
}

function chatSend() {
  if (_chatBusy) return;
  var text = (el('chat-in').value||'').trim();
  if (!text && !_pendingImagePath) return;
  // Append image reference so Claude can Read() it
  if (_pendingImagePath) {
    text = (text ? text + '\n\n' : '') + '[Imagem anexada: ' + _pendingImagePath + ']';
    clearChatImage();
  }
  el('chat-in').value = '';
  _chatBusy = true;
  _chatAbort = new AbortController();
  el('chat-send').style.display = 'none';
  el('chat-cancel').style.display = '';

  // Create conversation on first message
  if (!_convId) {
    _convId = 'conv-' + Date.now();
    var ts = Date.now();
    _convs.push({ id: _convId, title: text.slice(0,60), sessionId: null, msgs: [], createdAt: ts, updatedAt: ts });
    saveConvs();
  }
  var _pendingTools = [];  // tool calls accumulating during this turn

  // Hide empty state, show message area
  showMsgs();
  chatAppendBubble('user', text);

  // Placeholder assistant bubble (streaming target)
  var aDiv = chatAppendBubble('assistant', '');
  aDiv.classList.add('thinking');
  aDiv.textContent = 'Thinking…';

  var toolsContainer = document.createElement('div');

  chatStatus('thinking', 'Claude está pensando…');

  fetch('/api/chat', {
    method: 'POST',
    signal: _chatAbort ? _chatAbort.signal : undefined,
    headers: { 'x-gx18-token': TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify({ message: text, sessionId: _chatSessionId })
  }).then(function(resp) {
    if (!resp.ok) {
      return resp.json().then(function(j) {
        aDiv.classList.remove('thinking');
        aDiv.textContent = 'Error: ' + (j.error || resp.status);
        chatDone();
      });
    }

    var reader = resp.body.getReader();
    var decoder = new TextDecoder();
    var buf = '';
    var fullText = '';
    var firstChunk = true;

    function read() {
      reader.read().then(function(chunk) {
        if (chunk.done) { chatDone(); return; }
        buf += decoder.decode(chunk.value, { stream: true });
        var parts = buf.split('\\n\\n');
        buf = parts.pop() || '';
        parts.forEach(function(part) {
          var line = part.replace(/^data: /, '').trim();
          if (!line) return;
          var ev;
          try { ev = JSON.parse(line); } catch(e) { return; }
          if (ev.type === 'delta') {
            if (firstChunk) { aDiv.classList.remove('thinking'); aDiv.textContent = ''; firstChunk = false; }
            fullText += ev.text;
            aDiv.textContent = fullText;
            typingStart(aDiv);
            chatStatus('thinking', 'Claude está pensando…');
            chatScrollBottom();
          } else if (ev.type === 'tool_call') {
            typingStop(aDiv);
            var label = toolLabel(ev.name, ev.args || {});
            var td = document.createElement('details');
            td.className = 'chat-tool running';
            td.setAttribute('data-tool-id', ev.id);
            td.innerHTML = '<summary><span class="tool-spinner"></span>' + escHtml(label) + '</summary>' +
              '<div class="tool-body muted">Executando…</div>';
            toolsContainer.appendChild(td);
            if (!toolsContainer.parentNode) aDiv.insertAdjacentElement('afterend', toolsContainer);
            _pendingTools.push({ id: ev.id, name: ev.name, result: '', isError: false });
            chatStatus('tool', label);
          } else if (ev.type === 'tool_result') {
            var existing = toolsContainer.querySelector('[data-tool-id="'+ev.id+'"]');
            if (existing) {
              existing.classList.remove('running');
              var sp = existing.querySelector('.tool-spinner');
              if (sp) sp.remove();
              var tb = existing.querySelector('.tool-body');
              if (tb) { tb.textContent = ev.result||''; tb.className = 'tool-body'+(ev.isError?' err':''); }
            }
            var pt = _pendingTools.find(function(t){ return t.id === ev.id; });
            if (pt) { pt.result = ev.result||''; pt.isError = !!ev.isError; }
            chatStatus('thinking', 'Claude está pensando…');
          } else if (ev.type === 'error') {
            aDiv.classList.remove('thinking');
            aDiv.textContent = 'Error: ' + (ev.message||'unknown');
            typingStop(aDiv);
            chatStatus('error', ev.message || 'Erro desconhecido');
            chatDone(); return;
          } else if (ev.type === 'done') {
            typingStop(aDiv);
            chatStatus('done', 'Pronto');
            if (firstChunk) { aDiv.classList.remove('thinking'); aDiv.textContent = ev.fullText||'(no response)'; }
            if (ev.sessionId) _chatSessionId = ev.sessionId;
            // Persist this turn to the conversation
            var conv = currentConv();
            if (conv) {
              conv.sessionId = _chatSessionId;
              conv.updatedAt = Date.now();
              conv.msgs = conv.msgs || [];
              conv.msgs.push({ role: 'user', content: text });
              conv.msgs.push({ role: 'assistant', content: ev.fullText||'', tools: _pendingTools.slice() });
              saveConvs();
              renderConvList();
            }
            chatDone(); return;
          }
        });
        read();
      }).catch(function(e) {
        aDiv.classList.remove('thinking');
        aDiv.textContent = 'Stream error: ' + String(e);
        typingStop(aDiv);
        chatStatus('error', String(e));
        chatDone();
      });
    }
    read();
  }).catch(function(e) {
    aDiv.classList.remove('thinking');
    aDiv.textContent = 'Network error: ' + String(e);
    typingStop(aDiv);
    chatStatus('error', String(e));
    chatDone();
  });
}

function chatScrollBottom() {
  var msgs = el('chat-msgs');
  if (msgs) requestAnimationFrame(function() { msgs.scrollTop = msgs.scrollHeight; });
}
function chatAppendBubble(role, text) {
  var msgs = el('chat-msgs');
  var div = document.createElement('div');
  div.className = 'chat-bubble ' + role;
  div.textContent = text;
  msgs.appendChild(div);
  chatScrollBottom();
  return div;
}

function chatDone() {
  chatStatus(null, '');
  _chatBusy = false;
  _chatAbort = null;
  el('chat-send').style.display = '';
  el('chat-send').disabled = false;
  el('chat-cancel').style.display = 'none';
  el('chat-in').focus();
}

function chatCancel() {
  if (_chatAbort) { _chatAbort.abort(); _chatAbort = null; }
  chatDone();
}

// ── Tool label mapping ──────────────────────────────────────────
function toolLabel(name, args) {
  var a = args || {};
  function firstArg() {
    var keys = Object.keys(a);
    for (var i = 0; i < keys.length; i++) {
      var v = a[keys[i]];
      if (v && typeof v === 'string' && v.length > 0) return v;
      if (typeof v === 'number') return String(v);
    }
    return '';
  }
  function trunc(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }
  var lower = name.toLowerCase();
  if (lower === 'bash' || lower === 'powershell') {
    var cmd = (a.command || a.input || firstArg() || '').replace(/^\s*-+\S+\s*/g, '').trim();
    return trunc(cmd, 70) || name;
  }
  var gxMap = {
    'mcp__gx18__gx_export':    ['Exportando',         'name'],
    'mcp__gx18__gx_read':      ['Lendo',              'name'],
    'mcp__gx18__gx_find':      ['Buscando',           'query'],
    'mcp__gx18__gx_modify':    ['Modificando',        'name'],
    'mcp__gx18__gx_import':    ['Importando',         'name'],
    'mcp__gx18__gx_get':       ['Obtendo',            'name'],
    'mcp__gx18__gx_list':      ['Listando',           'type'],
    'mcp__gx18__gx_rename':    ['Renomeando',         'name'],
    'mcp__gx18__gx_build':     ['Compilando',         'name'],
    'mcp__gx18__gx_validate':  ['Validando',          'name'],
    'mcp__gx18__gx_create':    ['Criando',            'name'],
    'mcp__gx18__gx_structure': ['Estrutura de',       'name'],
    'mcp__gx18__gx_properties':['Propriedades de',    'name'],
    'mcp__gx18__gx_set_property':['Setando prop. em', 'name'],
    'mcp__gx18__gx_whoami':    ['Whoami',             ''],
  };
  if (name === 'mcp__gx18__gx_sql' || name === 'mcp__gx18__gx_db_query') {
    var q = (a.query || a.sql || firstArg() || '').replace(/\s+/g, ' ').trim();
    return 'SQL: ' + trunc(q, 55);
  }
  if (gxMap[name]) {
    var entry = gxMap[name];
    var val = entry[1] ? (a[entry[1]] || firstArg() || '') : '';
    return val ? entry[0] + ': ' + trunc(val, 55) : entry[0];
  }
  var clean = name.replace(/^mcp__gx18__/, '').replace(/_/g, ' ');
  var fa = firstArg();
  return fa ? clean + ': ' + trunc(fa, 45) : clean;
}

// ── Status banner ───────────────────────────────────────────────
var _statusFadeTimer = null;
function chatStatus(state, text) {
  var el_s = el('chat-status');
  if (!el_s) return;
  if (_statusFadeTimer) { clearTimeout(_statusFadeTimer); _statusFadeTimer = null; }
  el_s.classList.remove('fading','state-thinking','state-tool','state-done','state-error');
  if (!state) { el_s.style.display = 'none'; el_s.innerHTML = ''; return; }
  el_s.style.display = 'flex';
  el_s.style.opacity = '1';
  el_s.classList.add('state-' + state);
  var icons = { thinking:'🤔', tool:'⚙️', done:'✅', error:'❌' };
  el_s.innerHTML = '<span>'+(icons[state]||'')+'</span><span>'+escHtml(text)+'</span>';
  if (state === 'done') {
    _statusFadeTimer = setTimeout(function() {
      el_s.classList.add('fading');
      _statusFadeTimer = setTimeout(function() { el_s.style.display='none'; el_s.innerHTML=''; }, 450);
    }, 2000);
  }
}

// ── Typing indicator ────────────────────────────────────────────
function typingStart(bubbleEl) {
  if (!bubbleEl || bubbleEl.querySelector('.typing-dots')) return;
  var dots = document.createElement('span');
  dots.className = 'typing-dots';
  dots.innerHTML = '<span></span><span></span><span></span>';
  bubbleEl.appendChild(dots);
}
function typingStop(bubbleEl) {
  var dots = bubbleEl ? bubbleEl.querySelector('.typing-dots') : null;
  if (dots) dots.remove();
}

// ── Chat CLI Config ─────────────────────────────────────────────
function detectChatCli() {
  el('chat-detect-status').textContent = 'Detecting…';
  el('chatCliCard').open = true;
  api('GET','/api/chat/detect').then(function(r) {
    if (r.status !== 200) { el('chat-detect-status').textContent = 'Detection failed: '+(r.body.error||r.status); return; }
    var d = r.body;
    var icon = d.claudeOk ? '✓' : '✗';
    el('chat-detect-status').innerHTML =
      '<b>'+icon+' '+d.claudeVersion+'</b>' +
      ' &nbsp;|&nbsp; Auth: '+d.authInfo +
      ' &nbsp;|&nbsp; Nexa: '+(d.nexaExists?'✓ found':'✗ not found at detected path');
    setVal('chatCliBin', d.claudeCliPath||'');
    setVal('chatProjectRoot', d.projectRoot||'');
    if (!el('chatNexaDir').value) setVal('chatNexaDir', d.nexaExists ? d.nexaSkillsDir : '');
  });
}

function saveChatConfig() {
  var addDirs = (el('chatAddDirs').value||'').split('\\n').map(function(s){return s.trim();}).filter(Boolean);
  var patch = { chat: {
    claudeCliPath: (el('chatCliBin').value||'').trim(),
    projectRoot:   (el('chatProjectRoot').value||'').trim(),
    nexaSkillsDir: (el('chatNexaDir').value||'').trim(),
    addDirs: addDirs
  }};
  api('POST','/api/config', patch).then(function(r){
    outBox(el('chatCliOut'), r.status===200 ? 'Claude CLI config saved.' : 'Error: '+(r.body.error||r.status), r.status!==200);
  });
}
</script>
</body>
</html>`;
