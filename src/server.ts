import {fileURLToPath} from 'node:url';
import {dirname,join,resolve,isAbsolute} from 'node:path';
import {existsSync,lstatSync,unlinkSync} from 'node:fs';
import {LearningApplication} from './core/application.js';
import {createHttp} from './adapters/http.js';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../..');
const host=process.env.LEARNING_HOST??'127.0.0.1';
const port=Number(process.env.LEARNING_PORT??8982);
const socket=process.env.LEARNING_SOCKET?.trim()??'';
const publicPreview=process.env.LEARNING_PREVIEW_PUBLIC==='1';
if(publicPreview&&!socket)throw Error('Unauthenticated preview must use the private Unix socket');
const key=publicPreview?'':process.env.LEARNING_ACCESS_KEY??'';

if(!socket&&host!=='127.0.0.1'&&host!=='::1'&&!key)throw Error('Non-loopback binding requires LEARNING_ACCESS_KEY');
if(!socket&&(!Number.isInteger(port)||port<1||port>65535))throw Error('Invalid port');
if(socket&&!isAbsolute(socket))throw Error('LEARNING_SOCKET must be an absolute path');

process.umask(0o077);
const app=new LearningApplication(process.env.LEARNING_DATA_DIR??join(root,'data'));
const server=createHttp(app,join(root,'public'),key);
if(socket){
  if(existsSync(socket)){
    if(!lstatSync(socket).isSocket())throw Error('Refusing to replace a non-socket at LEARNING_SOCKET');
    unlinkSync(socket); // Stale socket from crash; directory must be private and owned by the service user.
  }
  server.listen(socket,()=>console.log('Cove Learning private socket ready'));
}else{
  server.listen(port,host,()=>console.log('Cove Learning dev at http://'+host+':'+port));
}
const stop=()=>server.close(()=>{app.close();process.exit(0);});
process.once('SIGTERM',stop);process.once('SIGINT',stop);
