import {randomBytes} from 'node:crypto';
import {mkdirSync,existsSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const directory=resolve(import.meta.dirname,'../data');
const path=resolve(directory,'preview.env');
mkdirSync(directory,{recursive:true,mode:0o700});
if(existsSync(path)){console.log('Preview access key already exists (not rotated).');process.exit(0);}
const secret=randomBytes(24).toString('base64url');
const content=['LEARNING_HOST=172.18.0.1','LEARNING_PORT=18982','LEARNING_DATA_DIR='+directory,'LEARNING_ACCESS_KEY='+secret,''].join('\n');
writeFileSync(path,content,{flag:'wx',mode:0o600});
console.log('Private preview environment prepared (key not printed).');
