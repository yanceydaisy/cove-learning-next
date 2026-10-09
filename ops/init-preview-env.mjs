import {mkdirSync,existsSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const directory=resolve(import.meta.dirname,'../data');
const path=resolve(directory,'preview.env');
mkdirSync(directory,{recursive:true,mode:0o700});
if(existsSync(path)){console.log('Preview environment exists (not overwritten).');process.exit(0);}
const content=[
 'LEARNING_HOST=172.18.0.1',
 'LEARNING_PORT=18982',
 'LEARNING_DATA_DIR='+directory,
 'LEARNING_PREVIEW_PUBLIC=1',
 ''
].join('\n');
writeFileSync(path,content,{flag:'wx',mode:0o600});
console.log('Unauthenticated public preview configured; only use disposable test data.');
