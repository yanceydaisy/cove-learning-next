
import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {timingSafeEqual,createHash} from 'node:crypto';
import type {LearningApplication} from '../core/application.js';
import {AppError,errorPayload,errorStatus} from '../core/errors.js';
import {LearningMcpEndpoint} from './mcp.js';

function equals(a:string,b:string){
 return timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
}
async function parseBody(req:IncomingMessage){
 const chunks:Buffer[]=[];let n=0;
 for await(const chunk of req){
  n+=Buffer.byteLength(chunk);
  if(n>12*1024*1024)throw new AppError('VALIDATION_ERROR','文件或请求过大（开发版限制 8MB 原件）。');
  chunks.push(Buffer.from(chunk));
 }
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}') as unknown;}
 catch{throw new AppError('VALIDATION_ERROR','请求必须是有效 JSON。');}
}
function json(res:ServerResponse,status:number,data:unknown){
 res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
 res.end(JSON.stringify(data));
}
export function createHttp(app:LearningApplication,publicDir:string,accessKey:string='',mcpCapability:string=''){
 const mcp=mcpCapability?new LearningMcpEndpoint(app,mcpCapability):null;
 const server=createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  try{
   const url=new URL(req.url??'/','http://localhost');
   const path=url.pathname.replace(/^\/learning-next(?=\/|$)/,'')||'/';
   if(path==='/mcp'||path.startsWith('/mcp/')){
    if(!mcp||!mcp.matches(path))return json(res,404,{error:{code:'NOT_FOUND',message:'接口不存在。'}});
    await mcp.handle(req,res);return;
   }
   if(path.startsWith('/api/')){
    if(accessKey && !equals(String(req.headers['x-learning-key']??''),accessKey))throw new AppError('UNAUTHORIZED','访问密钥不正确。');
    const method=req.method??'GET',parts=path.split('/').filter(Boolean);
    if(method!=='GET'&&method!=='HEAD'){
     // Prevent other websites from silently mutating the public preview using a visitor's browser.
     const origin=req.headers.origin;
     const fetchSite=req.headers['sec-fetch-site'];
     if(fetchSite==='cross-site')throw new AppError('UNAUTHORIZED','跨站请求不可修改测试数据。');
     if(origin){
      let parsed:URL;try{parsed=new URL(origin);}catch{throw new AppError('UNAUTHORIZED','来源无效。');}
      if(parsed.host!==req.headers.host || !['http:','https:'].includes(parsed.protocol))throw new AppError('UNAUTHORIZED','跨站请求不可修改测试数据。');
     }
     if(!String(req.headers['content-type']??'').toLowerCase().startsWith('application/json'))throw new AppError('VALIDATION_ERROR','请使用 JSON 请求。');
    }
    let result:unknown,status=200;
    if(path==='/api/health'&&method==='GET')result={status:'ok',product:'Cove Learning',stage:'independent-skeleton'};
    else if(path==='/api/today'&&method==='GET')result=app.today.snapshot(url.searchParams.get('local_date')??undefined);
    else if(path==='/api/objects'&&method==='GET')result=app.catalog.list();
    else if(path==='/api/objects'&&method==='POST'){result=app.catalog.create(await parseBody(req));status=201;}
    else if(parts.length===3&&parts[1]==='objects'&&method==='POST')result=app.catalog.update(parts[2]!,await parseBody(req));
    else if(parts.length===4&&parts[1]==='courses'&&parts[3]==='context'&&method==='GET')
     result=app.courseContext.list(parts[2]!);
    else if(parts.length===4&&parts[1]==='courses'&&parts[3]==='context'&&method==='POST'){
     result=app.courseContext.create(parts[2]!,await parseBody(req));status=201;
    }
    else if(parts.length===3&&parts[1]==='course-context'&&method==='POST')
     result=app.courseContext.update(parts[2]!,await parseBody(req));
    else if(parts.length===4&&parts[1]==='course-context'&&parts[3]==='remove'&&method==='POST')
     result=app.courseContext.remove(parts[2]!);
    else if(path==='/api/schedule'&&method==='GET')result=url.searchParams.has('local_date')?app.schedule.forDate(url.searchParams.get('local_date')!):app.schedule.list();
    else if(path==='/api/schedule'&&method==='POST'){result=app.schedule.create(await parseBody(req));status=201;}
    else if(parts.length===3&&parts[1]==='schedule'&&method==='POST')result=app.schedule.update(parts[2]!,await parseBody(req));
    else if(path==='/api/tasks'&&method==='GET')result=app.planning.list();
    else if(path==='/api/tasks'&&method==='POST'){result=app.planning.create(await parseBody(req));status=201;}
    else if(parts.length===4&&parts[1]==='tasks'&&parts[3]==='evidence'&&method==='GET')
     result=app.taskEvidence.list(parts[2]!);
    else if(parts.length===4&&parts[1]==='tasks'&&parts[3]==='evidence'&&method==='POST')
     result=app.taskEvidence.set(parts[2]!,await parseBody(req));
    else if(parts.length===4&&parts[1]==='tasks'&&parts[3]==='importance'&&method==='POST')
     result=app.taskEvidence.setImportance(parts[2]!,await parseBody(req));
    else if(parts.length===4&&parts[1]==='tasks'&&parts[3]==='details'&&method==='POST')
     result=app.planning.updateDetails(parts[2]!,await parseBody(req));
    else if(parts.length===4&&parts[1]==='tasks'&&parts[3]==='preference'&&method==='POST')
     result=app.planning.setPreference(parts[2]!,await parseBody(req));
    else if(parts.length===4&&parts[1]==='tasks'&&parts[3]==='complete'&&method==='POST')result=app.planning.complete(parts[2]!);
    else if(parts.length===4&&parts[1]==='tasks'&&parts[3]==='reopen'&&method==='POST')result=app.planning.reopen(parts[2]!);
    else if(path==='/api/resources'&&method==='GET')result=app.library.list();
    else if(path==='/api/resources'&&method==='POST'){result=app.library.ingest(await parseBody(req));status=201;}
    else if(parts.length===4&&parts[1]==='resources'&&parts[3]==='content'&&method==='GET'){
     const content=app.library.content(parts[2]!);
     res.writeHead(200,{'content-type':'application/octet-stream','content-disposition':'attachment; filename="learning-original"','cache-control':'no-store','content-length':content.bytes.length});
     res.end(content.bytes);return;
    }
    else if(path==='/api/focus/active'&&method==='GET')result=app.activity.active();
    else if(path==='/api/focus/recent'&&method==='GET')result=app.activity.recent();
    else if(path==='/api/focus/history'&&method==='GET')result=app.activity.history();
    else if(path==='/api/focus/start'&&method==='POST'){result=app.activity.start(await parseBody(req));status=201;}
    else if(parts.length===4&&parts[1]==='focus'&&['pause','resume','finish'].includes(parts[3]!)&&method==='POST'){
     const id=parts[2]!,action=parts[3];
     result=action==='pause'?app.activity.pause(id):action==='resume'?app.activity.resume(id):app.activity.finish(id);
    }
    else throw new AppError('NOT_FOUND','接口不存在。');
    return json(res,status,result);
   }
   if(req.method!=='GET'&&req.method!=='HEAD')throw new AppError('VALIDATION_ERROR','不支持的请求方法。');
   const routes:Record<string,string>={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/manifest.webmanifest':'manifest.webmanifest','/sw.js':'sw.js','/glass-lab.html':'glass-lab.html','/glass-lab.css':'glass-lab.css','/glass-lab.js':'glass-lab.js','/morning-letter.html':'morning-letter.html','/morning-letter.css':'morning-letter.css','/morning-letter.js':'morning-letter.js','/icon.svg':'icon.svg','/icon-192.png':'icon-192.png','/icon-512.png':'icon-512.png'};
   const name=routes[path];
   if(!name)return json(res,404,{error:{code:'NOT_FOUND',message:'页面不存在。'}});
   const content=await readFile(join(publicDir,name));
   const contentType=name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':name.endsWith('.webmanifest')?'application/manifest+json':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.png')?'image/png':name.endsWith('.js')?'text/javascript; charset=utf-8':'application/octet-stream';
   res.writeHead(200,{'content-type':contentType,'cache-control':'no-store'});
   res.end(req.method==='HEAD'?undefined:content);
  }catch(error){
   if(res.headersSent){res.end();return;}
   json(res,errorStatus(error),errorPayload(error));
  }
 });
 server.on('close',()=>{void mcp?.close();});
 return server;
}

[executed on device: cove-prod-01 (996ee891-1352-4542-8974-83a3c70e71d0)]