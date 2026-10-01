const {test}=require('node:test');const assert=require('node:assert/strict');const {execFileSync}=require('node:child_process');const path=require('node:path');const fs=require('node:fs');const os=require('node:os');
execFileSync(process.execPath,[path.resolve(__dirname,'../../apps/agent/build.cjs')]);
const {parseLine,claudeArgs}=require('../../apps/agent/dist/claude');const {contentCheck}=require('../../apps/agent/dist/checks');const {buildPrompt}=require('../../apps/agent/dist/prompt');
test('plan steps cannot edit or run commands; build steps cannot run commands',()=>{
 const deny=a=>a.slice(a.indexOf('--disallowedTools')+1);
 assert.deepEqual(deny(claudeArgs('plan')),['Edit','Write','MultiEdit','NotebookEdit','Bash']);assert.deepEqual(deny(claudeArgs('build')),['Bash','NotebookEdit']);const mode=a=>a[a.indexOf('--permission-mode')+1];assert.equal(mode(claudeArgs('build')),'acceptEdits');assert.equal(mode(claudeArgs('plan')),'default');assert.ok(!claudeArgs('build').includes('bypassPermissions'));
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
