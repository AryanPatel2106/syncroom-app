// Single-file chat bot server
// Run: node simple-bot.js
// Opens a small web UI at http://localhost:3000

const http = require('http');
const url = require('url');

const PORT = process.env.SIMPLE_BOT_PORT || 3000;

function buildHtml() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Simple Chat Bot</title>
    <style>
      body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;margin:0;background:#f6f7fb}
      .app{max-width:720px;margin:28px auto;background:#fff;border-radius:8px;padding:18px;box-shadow:0 6px 24px rgba(20,20,40,.08)}
      header{font-weight:600;font-size:18px;margin-bottom:8px}
      #log{height:420px;overflow:auto;border:1px solid #eee;padding:12px;background:#fbfcff;border-radius:6px}
      .msg{margin:6px 0;padding:10px;border-radius:6px;display:inline-block}
      .user{background:#e8f0ff;color:#0b3a74}
      .bot{background:#f5f6f9;color:#222}
      form{display:flex;margin-top:12px}
      input[type=text]{flex:1;padding:10px;border:1px solid #ddd;border-radius:6px}
      button{margin-left:8px;padding:10px 14px;border-radius:6px;border:none;background:#2563eb;color:#fff}
      footer{font-size:12px;color:#666;margin-top:10px}
    </style>
  </head>
  <body>
    <div class="app">
      <header>Simple Chat Bot</header>
      <div id="log"></div>
      <form id="f">
        <input id="m" type="text" placeholder="Say something..." autocomplete="off" />
        <button type="submit">Send</button>
      </form>
      <footer>Local demo — no external APIs. Run <code>node simple-bot.js</code> and open this page.</footer>
    </div>

    <script>
      const log = document.getElementById('log');
      const form = document.getElementById('f');
      const input = document.getElementById('m');

      function addMsg(text, cls){
        const div = document.createElement('div');
        div.className = 'msg ' + cls;
        div.textContent = text;
        log.appendChild(div);
        log.scrollTop = log.scrollHeight;
      }

      form.addEventListener('submit', async (e)=>{
        e.preventDefault();
        const text = input.value.trim();
        if(!text) return;
        addMsg(text, 'user');
        input.value = '';
        addMsg('…', 'bot'); // placeholder
        try{
          const res = await fetch('/api/chat', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({message:text})
          });
          const data = await res.json();
          // remove last placeholder
          const last = log.querySelectorAll('.bot');
          if(last.length) last[last.length-1].remove();
          addMsg(data.reply, 'bot');
        }catch(err){
          const last = log.querySelectorAll('.bot');
          if(last.length) last[last.length-1].remove();
          addMsg('Error communicating with server', 'bot');
        }
      });
    </script>
  </body>
</html>`;
}

function jsonResponse(res, obj, status=200){
  const s = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(s) });
  res.end(s);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if(body.length > 1e6) req.connection.destroy(); });
    req.on('end', () => {
      try{ resolve(JSON.parse(body || '{}')); }
      catch(e){ reject(e); }
    });
    req.on('error', reject);
  });
}

function generateReply(message){
  if(!message || typeof message !== 'string') return "I didn't get that. Say something!";
  const m = message.toLowerCase();
  // simple intent heuristics
  if(/^(hi|hello|hey)\b/.test(m)) return 'Hello! I am a simple local chat bot. How can I help?';
  if(m.includes('help')) return 'You can ask me for the time, say hello, or say anything and I will echo back with a friendly twist.';
  if(m.includes('time')) return `The server time is ${new Date().toLocaleString()}.`;
  if(m.includes('joke')){
    const jokes = [
      'Why did the developer go broke? Because they used up all their cache.',
      'I would tell you a UDP joke, but you might not get it.'
    ];
    return jokes[Math.floor(Math.random()*jokes.length)];
  }
  // simple transformation / echo
  if(m.length < 40) return `You said: "${message}" — tell me more.`;
  return `Nice message — I hear you. (length ${message.length} chars)`;
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  // Basic routing
  if(req.method === 'GET' && (parsed.pathname === '/' || parsed.pathname === '/index.html')){
    const html = buildHtml();
    res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Length': Buffer.byteLength(html) });
    res.end(html);
    return;
  }

  if(parsed.pathname === '/api/chat' && req.method === 'POST'){
    try{
      const body = await parseBody(req);
      const msg = body.message || '';
      const reply = generateReply(msg);
      jsonResponse(res, { reply });
    }catch(err){
      jsonResponse(res, { error: 'invalid JSON' }, 400);
    }
    return;
  }

  // static fallback for common files
  if(req.method === 'GET'){
    // very small static asset support for favicon
    if(parsed.pathname === '/favicon.ico'){
      res.writeHead(204);
      res.end();
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Chat bot running: http://localhost:${PORT}/`);
});

// Graceful shutdown
process.on('SIGINT', ()=>{ console.log('\nShutting down'); server.close(()=>process.exit(0)); });
