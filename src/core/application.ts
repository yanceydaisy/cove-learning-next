import {join} from 'node:path';
import {Database} from './database.js';
import {CatalogService} from '../modules/catalog/service.js';
import {CourseContextService} from '../modules/catalog/course-context.js';
import {PlanningService} from '../modules/planning/service.js';
import {ScheduleService} from '../modules/planning/schedule.js';
import {TaskEvidenceService} from '../modules/planning/task-evidence.js';
import {LibraryService} from '../modules/library/service.js';
import {ResourceLinksService} from '../modules/library/resource-links.js';
import {RagService} from '../modules/library/rag.js';
import {ActivityService} from '../modules/activity/service.js';
import {TraceService} from '../modules/activity/trace.js';
import {LearningRecordsService} from '../modules/activity/records.js';
import {TodayService} from '../modules/today/service.js';
import {DEFAULT_LEARNING_TIME_ZONE,validateLearningTimeZone} from './time.js';
export class LearningApplication {
 readonly database:Database;
 readonly timeZone:string;
 readonly catalog:CatalogService;
 readonly courseContext:CourseContextService;
 readonly planning:PlanningService;
 readonly schedule:ScheduleService;
 readonly taskEvidence:TaskEvidenceService;
 readonly library:LibraryService;
 readonly resourceLinks:ResourceLinksService;
 readonly rag:RagService;
 readonly activity:ActivityService;
 readonly records:LearningRecordsService;
 readonly trace:TraceService;
 readonly today:TodayService;
 constructor(dataDir:string,memory=false,clock=()=>new Date(),timeZone=process.env.LEARNING_TIME_ZONE??DEFAULT_LEARNING_TIME_ZONE){
  this.timeZone=validateLearningTimeZone(timeZone);
  this.database=new Database(memory?':memory:':join(dataDir,'learning.sqlite'));
  const now=()=>clock().toISOString();
  this.catalog=new CatalogService(this.database,now);
  this.courseContext=new CourseContextService(this.database,this.catalog,now);
  this.planning=new PlanningService(this.database,this.catalog,now);
  this.schedule=new ScheduleService(this.database,this.catalog,now);
  this.taskEvidence=new TaskEvidenceService(this.database,now);
  this.library=new LibraryService(this.database,join(dataDir,'originals'),now);
  this.resourceLinks=new ResourceLinksService(this.database,now);
  this.rag=new RagService(this.database,this.library,now);
  this.activity=new ActivityService(this.database,this.catalog,clock);
  this.records=new LearningRecordsService(this.database,this.catalog,now);
  this.trace=new TraceService(this.database,clock,this.timeZone);
  this.today=new TodayService(this.database,clock,this.timeZone);
 }
 close(){this.database.close();}
}
