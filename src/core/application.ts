import {join} from 'node:path';
import {Database} from './database.js';
import {CatalogService} from '../modules/catalog/service.js';
import {PlanningService} from '../modules/planning/service.js';
import {LibraryService} from '../modules/library/service.js';
import {ActivityService} from '../modules/activity/service.js';
import {TodayService} from '../modules/today/service.js';
export class LearningApplication {
 readonly database:Database;
 readonly catalog:CatalogService;
 readonly planning:PlanningService;
 readonly library:LibraryService;
 readonly activity:ActivityService;
 readonly today:TodayService;
 constructor(dataDir:string,memory=false,clock=()=>new Date()){
  this.database=new Database(memory?':memory:':join(dataDir,'learning.sqlite'));
  const now=()=>clock().toISOString();
  this.catalog=new CatalogService(this.database,now);
  this.planning=new PlanningService(this.database,this.catalog,now);
  this.library=new LibraryService(this.database,join(dataDir,'originals'),now);
  this.activity=new ActivityService(this.database,this.catalog,clock);
  this.today=new TodayService(this.database);
 }
 close(){this.database.close();}
}
