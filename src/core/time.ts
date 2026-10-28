// One local-date authority for Today, Plan, and Ephemeris. Instants stay in UTC.
export const DEFAULT_LEARNING_TIME_ZONE='Asia/Shanghai';

export function validateLearningTimeZone(value:string):string {
 const zone=value.trim();
 if(!zone)throw new Error('LEARNING_TIME_ZONE must be an IANA timezone');
 try{new Intl.DateTimeFormat('en-CA',{timeZone:zone});}
 catch{throw new Error('LEARNING_TIME_ZONE must be an IANA timezone');}
 return zone;
}

export function localDateAt(instant:Date,timeZone:string):string {
 const parts=new Intl.DateTimeFormat('en-CA',{
  timeZone,year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(instant);
 const part=(type:string)=>parts.find(item=>item.type===type)!.value;
 return [part('year'),part('month'),part('day')].join('-');
}

// Offset at local noon of the requested date; handles regular DST changes
// without replacing saved UTC instants with local clock strings.
export function offsetMinutesForDate(localDate:string,timeZone:string):number {
 const sample=new Date(localDate+'T12:00:00.000Z');
 if(Number.isNaN(sample.getTime()))throw new Error('Invalid local date');
 const parts=new Intl.DateTimeFormat('en-GB',{
  timeZone,year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
 }).formatToParts(sample);
 const get=(type:string)=>Number(parts.find(part=>part.type===type)!.value);
 const translated=Date.UTC(get('year'),get('month')-1,get('day'),get('hour'),get('minute'),get('second'));
 return Math.round((translated-sample.getTime())/60_000);
}

export function localMonthBounds(instant:Date,timeZone:string){
 const local=localDateAt(instant,timeZone);
 const year=Number(local.slice(0,4)),month=Number(local.slice(5,7));
 const startLocal=local.slice(0,7)+'-01';
 const nextLocal=new Date(Date.UTC(year,month,1)).toISOString().slice(0,10);
 const toUtc=(day:string)=>new Date(Date.parse(day+'T00:00:00.000Z')-offsetMinutesForDate(day,timeZone)*60_000).toISOString();
 return {from:toUtc(startLocal),to:toUtc(nextLocal)};
}
