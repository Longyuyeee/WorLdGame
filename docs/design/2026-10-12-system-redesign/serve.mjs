import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root=resolve(import.meta.dirname);
createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  const path=resolve(root,pathname==='/'?'prototype.html':'.'+pathname);
  if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  const body=await readFile(path);
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.json':'application/json','.md':'text/plain; charset=utf-8'})[extname(path)]||'application/octet-stream');
  res.end(body);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(4396,'127.0.0.1',()=>console.log('Design preview: http://127.0.0.1:4396'));
