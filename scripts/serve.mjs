import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.md':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const path=resolve(root,`.${pathname==='/'?'/index.html':pathname}`);
    if(!path.startsWith(root+sep)) {res.writeHead(403).end();return;}
    const body=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(body);
  } catch {res.writeHead(404).end('Not found');}
});
server.listen(4173,'127.0.0.1',()=>console.log('Cayden preview: http://127.0.0.1:4173'));
