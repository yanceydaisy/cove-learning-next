import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {LearningApplication} from './core/application.js';
import {createHttp} from './adapters/http.js';
const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../..');
const host=process.env.LEARNING_HOST??'127.0.0.1';
const port=Number(process.env.LEARNING_PORT??8982);
const key=process.env.LEARNING_ACCESS_KEY??'';
if(host!=='127.0.0.1'&&host!=='::1'&&!key)throw Error('Non-loopback binding requires LEARNING_ACCESS_KEY');
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid port');
process.umask(0o077); // Private user data, original files and local database.
const app=new LearningApplication(process.env.LEARNING_DATA_DIR??join(root,'data'));
const server=createHttp(app,join(root,'public'),key);
server.listen(port,host,()=>console.log('Cove Learning dev at http://'+host+':'+port));
const stop=()=>server.close(()=>{app.close();process.exit(0);});
process.once('SIGTERM',stop);process.once('SIGINT',stop);
