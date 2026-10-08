const {test}=require('node:test');const assert=require('node:assert/strict');const {execFileSync}=require('node:child_process');const path=require('node:path');const fs=require('node:fs');const os=require('node:os');
execFileSync(process.execPath,[path.resolve(__dirname,'../../apps/agent/build.cjs')]);
const {parseLine,claudeArgs}=require('../../apps/agent/dist/claude');const {contentCheck}=require('../../apps/agent/dist/checks');const {buildPrompt}=require('../../apps/agent/dist/prompt');
test('plan steps cannot edit or run commands; build steps cannot run commands',()=>{
 const deny=a=>a.slice(a.indexOf('--disallowedTools')+1);
 assert.deepEqual(deny(claudeArgs('plan')),['Edit','Write','MultiEdit','NotebookEdit','Bash']);assert.deepEqual(deny(claudeArgs('build')),['Bash','NotebookEdit']);const mode=a=>a[a.indexOf('--permission-mode')+1];assert.equal(mode(claudeArgs('build')),'acceptEdits');assert.equal(mode(claudeArgs('plan')),'default');assert.ok(!claudeArgs('build').includes('bypassPermissions'));
 const allow=a=>a.includes('--allowedTools')?a.slice(a.indexOf('--allowedTools')+1,a.indexOf('--disallowedTools')):[];
 assert.deepEqual(allow(claudeArgs('plan')),['WebSearch','WebFetch'],'read-only steps may read public pages');assert.deepEqual(allow(claudeArgs('build')),[]);
});
test('an analysis without a repository says so and works from the material only',()=>{
 const p=buildPrompt({mode:'plan',step:'analyze',repo:null,stage:{instruction:'写调研报告'},title:'调研'});
 assert.match(p,/没有接入网站源码仓库/);assert.match(p,/空的临时目录/);assert.doesNotMatch(p,/工作副本/);
 const {scratchDir}=require('../../apps/agent/dist/repo');const home=fs.mkdtempSync(path.join(os.tmpdir(),'nr-agent-'));
 const dir=scratchDir(home,'7');fs.writeFileSync(path.join(dir,'left.md'),'x');assert.equal(scratchDir(home,'7'),dir);assert.deepEqual(fs.readdirSync(dir),[],'emptied before each run');
});
test('Claude Code stream lines become progress events and a final result',()=>{
 const st={errors:[]};
 assert.match(parseLine(JSON.stringify({type:'system',subtype:'init',model:'claude-x'}),st)[0].text,/claude-x/);
 const ev=parseLine(JSON.stringify({type:'assistant',message:{content:[{type:'text',text:'Reading files'},{type:'tool_use',name:'Read',input:{file_path:'content/a/index.md'}}]}}),st);
 assert.deepEqual(ev.map(e=>[e.type,e.text]),[['text','Reading files'],['tool','Read content/a/index.md']]);
 assert.deepEqual(parseLine(JSON.stringify({type:'result',subtype:'success',result:'## Plan'}),st),[]);assert.equal(st.done,true);assert.equal(st.result,'## Plan');assert.ok(!st.error);
 const bad={errors:[]};assert.equal(parseLine(JSON.stringify({type:'result',subtype:'error_max_turns',is_error:true}),bad)[0].type,'error');assert.equal(parseLine('not json',bad).length,0);
});
test('content check: invalid JSON and empty Markdown fail, partial language updates warn',()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'nr-check-'));const page=path.join(d,'content/articles/a');fs.mkdirSync(page,{recursive:true});
 for(const [f,c] of [['index.md','# A'],['index.cn.md','# 甲'],['index.ja.md','# エー'],['metadata.json','{"title":"A"}']])fs.writeFileSync(path.join(page,f),c);
 let r=contentCheck(d,['content/articles/a/index.md']);assert.equal(r.ok,true);assert.match(r.summary,/未改 index\.cn\.md、index\.ja\.md/);
 fs.writeFileSync(path.join(page,'metadata.json'),'{bad');fs.writeFileSync(path.join(page,'index.cn.md'),'  ');
 r=contentCheck(d,['content/articles/a/metadata.json','content/articles/a/index.cn.md']);assert.equal(r.ok,false);assert.match(r.summary,/不是有效的 JSON/);assert.match(r.summary,/空文件/);
});
test('the brief says what this step may do and carries the approved plan, feedback and memory',()=>{
 const base={repo:{repo:'estheryo/website',allowedPaths:[]},branch:'nocoreach/task-7',title:'加长 docker 文档',task:{brief:'补充命令'},stage:{instruction:'按方案修改'},project:{writingStyle:'简洁'},evidence:{insight:{title:'内容太短',suggestion:'补充示例'},signals:[{title:'正文 92 字',facts:['曝光 5848']}]}};
 const analysis=buildPrompt({...base,mode:'plan',step:'analyze',stage:{instruction:'对比竞品'}});assert.match(analysis,/只做分析，不要修改任何文件/);assert.match(analysis,/先写结论/);assert.doesNotMatch(analysis,/具体方案/);
 const plan=buildPrompt({...base,mode:'plan',stage:{instruction:'先写方案'}});assert.match(plan,/不要修改任何文件/);assert.match(plan,/曝光 5848/);assert.match(plan,/writingStyle: 简洁/);
 const build=buildPrompt({...base,mode:'build',previousStages:[{stage:'出方案',output:'改 content/a/index.md'}],feedback:['保留原标题'],rejectedDraft:'上一版'});
 assert.match(build,/提交、推送和创建 PR 由程序完成/);assert.match(build,/允许修改的范围：整个仓库/);assert.match(build,/改 content\/a\/index\.md/);assert.match(build,/保留原标题/);assert.match(build,/nocoreach\/task-7/);
});

test('the change note is read from the end of the summary; preview links are found in statuses and comments',()=>{
 const {parseNote,pickPreview}=require('../../apps/agent/dist/repo');
 const n=parseNote('改了商业页的入口。\n没有改英文页。\n发布说明：在商业服务页新增体验入口\n核对文字：“立即体验 Demo”\n页面：/cn/commercial, /cn/solutions/all-in-one，not-a-path');
 assert.equal(n.body,'改了商业页的入口。\n没有改英文页。');assert.equal(n.release,'在商业服务页新增体验入口');assert.equal(n.verifyText,'立即体验 Demo');assert.deepEqual(n.pages,['/cn/commercial','/cn/solutions/all-in-one']);
 assert.deepEqual(parseNote('only a summary'),{body:'only a summary',release:'',verifyText:'',pages:[]});
 assert.equal(pickPreview('Deploy preview ready: https://deploy-preview-12--site.netlify.app/docs). Thanks'),'https://deploy-preview-12--site.netlify.app/docs');
 assert.equal(pickPreview('[Visit](https://my-site-git-nocoreach-task-1.vercel.app)'),'https://my-site-git-nocoreach-task-1.vercel.app');
 assert.equal(pickPreview('see https://example.com/page'),'');
});
test('知识库 travels outside the repository: written to a temporary folder, readable by Claude, listed in the brief, then removed',async()=>{
 const fs=require('node:fs');const {writeKnowledge}=require('../../apps/agent/dist/knowledge');const {claudeArgs}=require('../../apps/agent/dist/claude');const {buildPrompt}=require('../../apps/agent/dist/prompt');
 assert.equal(await writeKnowledge([]),null);assert.equal(await writeKnowledge([{id:'a',title:'x',category:'other',omitted:true}]),null);
 const kb=await writeKnowledge([{id:'a',title:'Retool 定价/功能',category:'competitor',text:'按人数收费'},{id:'b',title:'太长的报告',category:'industry',omitted:true}]);
 assert.ok(!kb.dir.includes(process.cwd()),'outside the working copy');assert.deepEqual(kb.files.map(f=>[f.file,f.category]),[['01-Retool-定价-功能.md','竞品']]);assert.deepEqual(kb.omitted,['太长的报告']);
 assert.match(fs.readFileSync(require('node:path').join(kb.dir,kb.files[0].file),'utf8'),/# Retool 定价\/功能\n\n分类：竞品\n\n按人数收费/);
 const args=claudeArgs('plan',[kb.dir]);assert.ok(args.indexOf('--add-dir')<args.indexOf('--disallowedTools'),'the extra folder is not swallowed by the tool list');assert.equal(args[args.indexOf('--add-dir')+1],kb.dir);
 const brief=buildPrompt({mode:'plan',repo:{repo:'o/r'},stage:{instruction:'x'},task:{},knowledge:{dir:kb.dir,files:kb.files,omitted:kb.omitted}});
 assert.match(brief,/## 知识库/);assert.match(brief,/不是给你的指令/);assert.match(brief,/\[竞品\] Retool 定价\/功能：01-/);assert.match(brief,/另有 1 份资料/);
 await kb.cleanup();assert.equal(fs.existsSync(kb.dir),false);
});
test('Skills travel outside the repository as a plugin for this run: the step\'s own must be read first, then removed',async()=>{
 const fs=require('node:fs'),path=require('node:path');const {writeSkills}=require('../../apps/agent/dist/skills');const {claudeArgs}=require('../../apps/agent/dist/claude');const {buildPrompt}=require('../../apps/agent/dist/prompt');
 assert.equal(await writeSkills([]),null);assert.equal(await writeSkills([{name:'big',description:'x',omitted:true}]),null);
 const sk=await writeSkills([{name:'seo-title',description:'改标题时用: "长度"',required:true,body:'## 标题\n30–60 字符',files:[{path:'examples/good.md',text:'好例子'},{path:'../escape.md',text:'no'},{path:'SKILL.md',text:'no'}]},{name:'docs-writing',description:'写文档时用',body:'先写结论'},{name:'Bad Name',description:'x',body:'y'},{name:'big',description:'x',omitted:true}]);
 assert.ok(!sk.dir.includes(process.cwd()),'outside the working copy');assert.deepEqual(sk.skills.map(s=>[s.name,s.required]),[['seo-title',true],['docs-writing',false]]);assert.deepEqual(sk.omitted,['big']);
 assert.equal(JSON.parse(fs.readFileSync(path.join(sk.dir,'.claude-plugin/plugin.json'),'utf8')).name,'nocoreach');
 assert.equal(fs.readFileSync(path.join(sk.dir,'skills/seo-title/SKILL.md'),'utf8'),'---\nname: seo-title\ndescription: "改标题时用: \\"长度\\""\n---\n\n## 标题\n30–60 字符\n');
 assert.equal(fs.readFileSync(path.join(sk.dir,'skills/seo-title/examples/good.md'),'utf8'),'好例子');assert.ok(!fs.existsSync(path.join(sk.dir,'skills/escape.md')),'paths cannot leave the Skill folder');
 const args=claudeArgs('plan',['/kb',sk.dir],[sk.dir]);assert.ok(args.indexOf('--plugin-dir')<args.indexOf('--disallowedTools'));assert.equal(args[args.indexOf('--plugin-dir')+1],sk.dir);assert.deepEqual(args.filter(a=>a==='--add-dir').length,2);
 const brief=buildPrompt({mode:'build',repo:{repo:'o/r'},branch:'b',stage:{instruction:'x'},task:{},skills:{dir:sk.dir,list:sk.skills,omitted:sk.omitted}});
 assert.match(brief,/## Skills/);assert.match(brief,/这一步必须用下面的 Skill：动手前先读它的 SKILL\.md[\s\S]*- seo-title：改标题时用/);assert.match(brief,/在合适时使用：\n- docs-writing/);assert.match(brief,/以任务说明为准/);assert.match(brief,/附带的脚本不要运行/);assert.match(brief,/另有 1 个 Skill/);
 assert.doesNotMatch(buildPrompt({mode:'plan',repo:{repo:'o/r'},stage:{instruction:'x'},task:{}}),/## Skills/);
 await sk.cleanup();assert.equal(fs.existsSync(sk.dir),false);
});
test('撤回 opens GitHub\'s revert of the merged PR once; an open revert PR is reused; an unmerged PR is refused',async()=>{
 const {revertPullRequest}=require('../../apps/agent/dist/repo');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nr-gh-')),log=path.join(dir,'calls');
 // A stand-in gh: answers pr view / pr list / api graphql from files the test writes.
 fs.writeFileSync(path.join(dir,'gh'),`#!/bin/sh\necho "$@" >> "${log}"\ncase "$1 $2" in\n "pr view") cat "${dir}/view.json";;\n "pr list") cat "${dir}/list.json";;\n "api graphql") cat "${dir}/revert.json";;\nesac\n`,{mode:0o755});
 const old=process.env.PATH;process.env.PATH=`${dir}:${old}`;
 try{
  const cfg={repo:'o/site',baseBranch:'main',allowedPaths:[],contentCheck:false};
  fs.writeFileSync(path.join(dir,'view.json'),'{"id":"PR_1","state":"MERGED"}');fs.writeFileSync(path.join(dir,'list.json'),'[{"number":3,"url":"https://github.com/o/site/pull/3","headRefName":"nocoreach/task-9"}]');
  fs.writeFileSync(path.join(dir,'revert.json'),'{"data":{"revertPullRequest":{"revertPullRequest":{"number":4,"url":"https://github.com/o/site/pull/4"}}}}');
  assert.deepEqual(await revertPullRequest(cfg,1,'改首页'),{number:4,url:'https://github.com/o/site/pull/4'});
  assert.match(fs.readFileSync(log,'utf8'),/api graphql .*revertPullRequest.*id=PR_1/);
  fs.writeFileSync(path.join(dir,'list.json'),'[{"number":4,"url":"https://github.com/o/site/pull/4","headRefName":"revert-1-nocoreach/task-9"}]');fs.writeFileSync(log,'');
  assert.deepEqual(await revertPullRequest(cfg,1,'改首页'),{number:4,url:'https://github.com/o/site/pull/4'});assert.doesNotMatch(fs.readFileSync(log,'utf8'),/graphql/,'reused, not opened twice');
  fs.writeFileSync(path.join(dir,'view.json'),'{"id":"PR_1","state":"OPEN"}');await assert.rejects(revertPullRequest(cfg,1,'改首页'),/还没有合并/);
  fs.writeFileSync(path.join(dir,'view.json'),'{"id":"PR_1","state":"MERGED"}');fs.writeFileSync(path.join(dir,'list.json'),'[]');fs.writeFileSync(path.join(dir,'revert.json'),'{"data":{"revertPullRequest":{"revertPullRequest":{"number":5,"url":"https://github.com/other/site/pull/5"}}}}');
  await assert.rejects(revertPullRequest(cfg,1,'改首页'),/地址异常/);
 }finally{process.env.PATH=old;}
});

test('English project: the brief asks for English notes, and the closing lines may come with English labels',()=>{
 const {buildPrompt}=require('../../apps/agent/dist/prompt');const {parseNote}=require('../../apps/agent/dist/repo');
 const p=buildPrompt({mode:'build',language:'en-US',repo:{repo:'org/site',allowedPaths:[]},branch:'b',stage:{instruction:'改标题'},title:'T'});
 assert.match(p,/Write your plan, report, summary and notes for the reviewer in English/);assert.match(p,/keep each page in its own language/);
 assert.doesNotMatch(buildPrompt({mode:'build',repo:{repo:'org/site',allowedPaths:[]},branch:'b',stage:{instruction:'改标题'},title:'T'}),/in English/);
 const n=parseNote('Changed the pricing title.\nRelease notes: The pricing page now says what the trial includes.\nVerify text: Start your free trial\nPages: /pricing, /cn/pricing');
 assert.equal(n.body,'Changed the pricing title.');assert.equal(n.release,'The pricing page now says what the trial includes.');assert.equal(n.verifyText,'Start your free trial');assert.deepEqual(n.pages,['/pricing','/cn/pricing']);
});
test('background service (macOS): the LaunchAgent runs start --service with this Node, PATH and language, never the key',()=>{
 const {servicePlist,serviceEnv,stableNode,parsePrint}=require('../../apps/agent/dist/service');
 const env=serviceEnv({PATH:'/opt/homebrew/bin:/usr/bin',LANG:'zh_CN.UTF-8',NOCOREACH_AGENT_KEY:'secret',NOCOREACH_CLAUDE_PATH:'/x/claude',HOME:'/Users/a'});
 assert.deepEqual(env,[['PATH','/opt/homebrew/bin:/usr/bin'],['LANG','zh_CN.UTF-8'],['NOCOREACH_CLAUDE_PATH','/x/claude']],'the connection key stays in config.json');
 const xml=servicePlist({label:'com.nocoreach.agent',node:'/opt/homebrew/opt/node@22/bin/node',cli:'/Users/a/R&D <x>/apps/agent/dist/cli.js',cwd:'/Users/a/.nocoreach-agent',env,log:'/Users/a/.nocoreach-agent/logs/agent.log'});
 assert.match(xml,/<string>\/opt\/homebrew\/opt\/node@22\/bin\/node<\/string>\n {4}<string>\/Users\/a\/R&amp;D &lt;x&gt;\/apps\/agent\/dist\/cli.js<\/string>\n {4}<string>start<\/string>\n {4}<string>--service<\/string>/);
 assert.match(xml,/<key>RunAtLoad<\/key>\n {2}<true\/>/);assert.match(xml,/<key>SuccessfulExit<\/key>\n {4}<false\/>/,'restarted only when it stops by failing');
 assert.equal((xml.match(/agent\.log/g)||[]).length,2,'output and errors go to one log');assert.doesNotMatch(xml,/secret/);
 if(process.platform==='darwin'){const f=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'nr-plist-')),'a.plist');fs.writeFileSync(f,xml);execFileSync('plutil',['-lint',f]);}
 // A Homebrew Node resolves to a versioned Cellar path; the service keeps the stable link in PATH that points to it.
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'nr-node-')),cellar=path.join(d,'Cellar/node/22.1/bin'),link=path.join(d,'opt/node/bin');fs.mkdirSync(cellar,{recursive:true});fs.mkdirSync(link,{recursive:true});fs.writeFileSync(path.join(cellar,'node'),'');fs.symlinkSync(path.join(cellar,'node'),path.join(link,'node'));
 assert.equal(stableNode(path.join(cellar,'node'),`/nowhere:${link}`),path.join(link,'node'));assert.equal(stableNode(path.join(cellar,'node'),'/nowhere'),path.join(cellar,'node'));
 assert.deepEqual(parsePrint('com.nocoreach.agent = {\n\tstate = running\n\tpid = 9986\n\tlast exit code = (never exited)\n}'),{running:true,pid:9986,lastExit:'(never exited)'});
 assert.deepEqual(parsePrint('\tstate = not running\n\tlast exit code = 1'),{running:false,lastExit:'1'});
});
test('background service: stops that need the user exit 0 so launchd leaves them stopped; a second Agent home gets its own service; the log is trimmed',()=>{
 const {spawnSync}=require('node:child_process');const cli=path.resolve(__dirname,'../../apps/agent/dist/cli.js'),home=fs.mkdtempSync(path.join(os.tmpdir(),'nr-home-')),env={...process.env,NOCOREACH_AGENT_HOME:home};
 assert.equal(spawnSync(process.execPath,[cli,'start','--service'],{env}).status,0,'not logged in: stays stopped');assert.equal(spawnSync(process.execPath,[cli,'start'],{env}).status,2);
 const label=execFileSync(process.execPath,['-e',`console.log(require(${JSON.stringify(path.resolve(__dirname,'../../apps/agent/dist/service'))}).LABEL)`],{env}).toString().trim();assert.match(label,/^com\.nocoreach\.agent-[0-9a-f]{8}$/);
 const {trimLog}=require('../../apps/agent/dist/service');const log=path.join(home,'agent.log');fs.writeFileSync(log,Array.from({length:200},(_,i)=>`line ${i}`).join('\n')+'\n');
 assert.equal(trimLog(log,1e6,100),false);assert.equal(trimLog(log,1000,100),true);const kept=fs.readFileSync(log,'utf8');
 assert.ok(kept.length<=100);assert.match(kept,/^line \d+\n/,'starts at a line');assert.match(kept,/line 199\n$/,'keeps the latest');assert.equal(trimLog(path.join(home,'none.log')),false);
});
