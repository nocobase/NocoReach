import {describe,it,expect} from 'vitest';
import {parseTaskReply} from '../src/pages/task-work-model';
describe('task artifacts',()=>{it('preserves multiline prose, quotes and sources without JSON escaping',()=>{const content='# 成果\n\n包含 "引用" 和多行正文\n来源：https://example.com';expect(parseTaskReply('```task-result\n'+content+'\n```')?.taskResult?.content).toBe(content);});it('accepts valid plan followed by discussion and rejects partial plan',()=>{const p={deliverable:'报告',verification:'审核',steps:[{title:'分析',owner:'ai',instruction:'核实',acceptance:'有依据'}]};expect(parseTaskReply(JSON.stringify({workPlan:p})+'\n请确认')?.workPlan).toEqual(p);expect(parseTaskReply('{"workPlan":')).toBeNull();});});

import {currentStep,stepsFor,scopeDraft} from '../src/pages/task-work-model';
it('work detail shows exactly one current step derived from saved state',()=>{
 const w=(stage:string,results:({rejectedAt?:string}|null)[]=[],kind?:string)=>({stage,step:0,kind,results});
 expect(currentStep(w('plan'),false,false)).toEqual({key:'scope',complete:false});
 expect(currentStep(w('work'),false,false).key).toBe('change');
 expect(currentStep(w('work',[{}]),true,false).key).toBe('change');
 expect(currentStep(w('work',[{rejectedAt:'t'}]),false,false).key).toBe('change');
 expect(currentStep(w('work',[{}]),false,false).key).toBe('review');
 expect(currentStep(w('execution',[{}]),false,false).key).toBe('publish');
 expect(currentStep(w('verification',[{}]),false,false)).toEqual({key:'observe',complete:false});
 expect(currentStep(w('done',[{}]),false,false)).toEqual({key:'observe',complete:true});
 expect(currentStep(w('execution',[{}],'research'),false,true)).toEqual({key:'publish',complete:true});
 expect(stepsFor('research').map(s=>s[0])).not.toContain('observe');
});
it('scope draft uses the suggestion line and falls back to brief or title',()=>{
 expect(scopeDraft('建议：改写标题与描述\n\n观察：CTR 低','T')).toBe('改写标题与描述');
 expect(scopeDraft('Free text brief','T')).toBe('Free text brief');
 expect(scopeDraft('','Title')).toBe('Title');
});
