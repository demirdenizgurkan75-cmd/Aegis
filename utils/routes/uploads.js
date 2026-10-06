// ─── Dosya yükleme + yüklenen görselleri sunma + panel.html ────────────────
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { sendJSON, getBearerToken, verifyToken, uploadsDir } = require('./helpers');

const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

function handleUpload(req, res) {
  const ct = req.headers['content-type']||'';
  if (!ct.includes('multipart/form-data')) return sendJSON(res,400,{error:'multipart needed'});
  const bnd = ct.split('boundary=')[1];
  if (!bnd) return sendJSON(res,400,{error:'no boundary'});
  const ch=[]; let totalSize = 0;
  req.on('data',c=>{ch.push(c); totalSize += c.length; if(totalSize > MAX_FILE_SIZE) {req.destroy();}});
  req.on('end',()=>{
    try{
      if(totalSize > MAX_FILE_SIZE) return sendJSON(res,413,{error:'File too large'});
      const buf=Buffer.concat(ch), parts=buf.toString('binary').split('--'+bnd);
      for(const p of parts){const m=p.match(/filename="([^"]+)"/);if(!m)continue;
        const ext=path.extname(m[1]).toLowerCase();
        if(!ALLOWED_EXTENSIONS.includes(ext)) return sendJSON(res,400,{error:'Invalid file type'});
        const nm='up_'+crypto.randomBytes(16).toString('hex')+ext;
        const s=p.indexOf('\r\n\r\n')+4, e=p.lastIndexOf('\r\n');
        fs.writeFileSync(path.join(uploadsDir,nm),p.substring(s,e),'binary');
        return sendJSON(res,200,{url:'/uploads/'+nm,filename:nm});}
      return sendJSON(res,400,{error:'no file'});
    }catch(e){return sendJSON(res,500,{error:'upload failed'});}
  });
}

module.exports = {
  name: 'uploads',
  async handle(ctx) {
    const { req, res, url } = ctx;

    if (url.pathname === '/api/upload' && req.method === 'POST') {
      const t=getBearerToken(req);
      if(!verifyToken(t)) return sendJSON(res,401,{error:'Oturum gecersiz'});
      handleUpload(req,res);
      return true;
    }

    // ─── GET /uploads/* — yüklenen bot görsellerini sun ─────────────────────
    if (url.pathname.startsWith('/uploads/') && req.method === 'GET') {
      const fname = path.basename(url.pathname);
      const filePath = path.join(uploadsDir, fname);
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return sendJSON(res, 404, { error: 'Dosya bulunamadı' });
      const ext = path.extname(fname).toLowerCase();
      const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.writeHead(200);
      res.end(fs.readFileSync(filePath));
      return true;
    }

    // ─── GET /assets/* — site assetlerini sun (avatar, banner, icons, css, js) ─────
    if (url.pathname.startsWith('/assets/') && req.method === 'GET') {
      const fname = path.basename(url.pathname);
      // Site assetlerinin klasörü .env'deki ASSETS_DIR ile ayarlanır (yoksa yerel ./assets)
      const assetsDir = process.env.ASSETS_DIR || path.join(__dirname, '..', '..', 'assets');
      const filePath = path.join(assetsDir, fname);
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return sendJSON(res, 404, { error: 'Dosya bulunamadı' });
      const ext = path.extname(fname).toLowerCase();
      const mime = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.ico': 'image/x-icon',
        '.json': 'application/json',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2'
      }[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.writeHead(200);
      res.end(fs.readFileSync(filePath));
      return true;
    }

    // ─── GET /panel — dashboard ön yüzü (tehdit ağı + sunucu ayarları) ──────
    if (url.pathname === '/panel' && req.method === 'GET') {
      const panelPath = path.join(__dirname, '..', '..', 'public', 'panel.html');
      try {
        const html = fs.readFileSync(panelPath, 'utf8');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.writeHead(200);
        res.end(html);
      } catch {
        return sendJSON(res, 500, { error: 'panel.html bulunamadı' });
      }
      return true;
    }

    // ─── GET /mod-panel/* — Embedded App frontend (main domain) ────────────────
    if (url.pathname.startsWith('/mod-panel/') && req.method === 'GET') {
      const filePath = path.join(__dirname, '..', '..', 'public', 'mod-panel', url.pathname.replace('/mod-panel/', ''));
      // Security: prevent directory traversal
      const resolved = path.resolve(filePath);
      const publicDir = path.resolve(__dirname, '..', '..', 'public', 'mod-panel');
      if (!resolved.startsWith(publicDir) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        // SPA fallback: serve index.html for client-side routing
        const indexPath = path.join(publicDir, 'index.html');
        if (fs.existsSync(indexPath)) {
          const html = fs.readFileSync(indexPath, 'utf8');
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('X-Frame-Options', 'ALLOWALL');
          res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://discord.com https://*.discord.com;");
          res.writeHead(200);
          res.end(html);
          return true;
        }
        return sendJSON(res, 404, { error: 'Not found' });
      }
      const ext = path.extname(resolved).toLowerCase();
      const mime = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
      }[ext] || 'application/octet-stream';
      if (ext === '.html') {
        res.setHeader('X-Frame-Options', 'ALLOWALL');
        res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://discord.com https://*.discord.com;");
      }
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.writeHead(200);
      res.end(fs.readFileSync(resolved));
      return true;
    }

    // ─── GET /mod-panel — SPA entry point (main domain) ─────────────────────
    if (url.pathname === '/mod-panel' && req.method === 'GET') {
      const indexPath = path.join(__dirname, '..', '..', 'public', 'mod-panel', 'index.html');
      if (fs.existsSync(indexPath)) {
        const html = fs.readFileSync(indexPath, 'utf8');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('X-Frame-Options', 'ALLOWALL');
        res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://discord.com https://*.discord.com;");
        res.writeHead(200);
        res.end(html);
        return true;
      }
      return sendJSON(res, 404, { error: 'Mod panel not found' });
    }

    // ─── GET /* — Mod Panel for panel.betterwithaegis.com subdomain ──────
    const host = req.headers.host || '';
    const isPanelSubdomain = host.includes('panel.betterwithaegis.com');
    if (isPanelSubdomain && req.method === 'GET') {
      // Allow Discord iframe embedding
      res.setHeader('X-Frame-Options', 'ALLOWALL');
      res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://discord.com https://*.discord.com;");

      // Skip API/auth routes - let activity.js handle them
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
        return false; // not handled here, let next route handler process
      }

      // Serve static assets from /assets/, /vite.svg, etc. or SPA fallback
      let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
      const fullPath = path.join(__dirname, '..', '..', 'public', 'mod-panel', filePath.replace(/^\//, ''));
      const resolved = path.resolve(fullPath);
      const publicDir = path.resolve(__dirname, '..', '..', 'public', 'mod-panel');
      if (resolved.startsWith(publicDir) && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        const ext = path.extname(resolved).toLowerCase();
        const mime = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon',
        }[ext] || 'application/octet-stream';
        if (ext === '.html') {
          res.setHeader('X-Frame-Options', 'ALLOWALL');
          res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://discord.com https://*.discord.com;");
        }
        res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.writeHead(200);
        res.end(fs.readFileSync(resolved));
        return true;
      }
      // SPA fallback: serve index.html for client-side routing
      const indexPath = path.join(publicDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        const html = fs.readFileSync(indexPath, 'utf8');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('X-Frame-Options', 'ALLOWALL');
        res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://discord.com https://*.discord.com;");
        res.writeHead(200);
        res.end(html);
        return true;
      }
      return sendJSON(res, 404, { error: 'Not found' });
    }

    return false;
  },
};
