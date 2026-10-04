// Data source catalog (SPEC §11). Planned sources are listed for transparency but cannot be connected.
export type Availability='available'|'soon'|'planned';
export type SourceState='connected'|'partial'|'ready'|'soon'|'planned'|'needs-admin';
// uses: 'analyze' = data is read for analysis; 'modify' = the local Agent changes it (opens PRs there).
export type Use='analyze'|'modify';
export const useLabels:Record<Use,string>={analyze:'用于分析',modify:'可修改'};
export type CatalogSource={id:string;category:string;name:string;detects:string;signals:string[];uses:Use[];priority:'P0'|'P1'|'P2';availability:Availability;guide:{intro:string;needs:string[];questions:string[]}};
export const categories=['自有网站','开源项目','用户社区','使用量','外部讨论','市场需求','竞品'] as const;
export const catalog:CatalogSource[]=[
 {id:'gsc',category:'自有网站',name:'Google Search Console',detects:'哪些页面点击率低、排名接近首页、搜索词没有对应页面',signals:['页面表现','缺口','变化'],uses:['analyze'],priority:'P0',availability:'available',guide:{intro:'我会带你完成 Google 授权，并选择要分析的 Search Console 站点。授权只读取数据，不会修改你的网站或 Google 账号设置。',needs:['能访问该站点 Search Console 的 Google 账号'],questions:['授权会获取哪些权限？','为什么数据要晚几天？','同一个账号有多个站点怎么选？']}},
 {id:'ga4',category:'自有网站',name:'GA4',detects:'访问从哪里来、哪些页面在增长或下滑、文档到下载或注册的转化',signals:['变化','转化'],uses:['analyze'],priority:'P0',availability:'available',guide:{intro:'GA4 与 Search Console 使用同一次 Google 授权。授权后选择对应网站的 GA4 属性，我会开始首次同步。',needs:['能访问该 GA4 属性的 Google 账号'],questions:['找不到我的 GA4 属性怎么办？','首次同步会拉取多久的数据？','关键事件应该怎么设置？']}},
 {id:'site',category:'自有网站',name:'网站内容',detects:'全部页面清单与类型、内容陈旧、孤立页面、文档没覆盖的问题',signals:['页面表现','缺口'],uses:['analyze'],priority:'P0',availability:'available',guide:{intro:'把官网地址发给我。我会读取网站的 sitemap，识别博客、文档、落地页各有多少页，列给你确认后开始采集。文档站在单独的域名时（如 docs.example.com），可以再添加一个网址。不需要仓库或密钥。',needs:['官网首页地址，例如 https://example.com','文档站地址（如果在单独的域名）'],questions:['会读取哪些页面？频率是多少？','没有 sitemap 怎么办？','类型识别错了怎么办？']}},
 {id:'repo',category:'自有网站',name:'网站源码（Git 仓库）',detects:'本机 Agent 在这里修改内容、开 PR 给你审核；之后还会把网址对应到源文件',signals:[],uses:['analyze','modify'],priority:'P0',availability:'available',guide:{intro:'告诉我网站源码放在哪个 GitHub 仓库。任务由本机 Agent 在这个仓库里分析和修改，改动开 PR 给你审核；PR 只会开在这个仓库里，不会开到上游。',needs:['网站源码所在的 GitHub 仓库链接','一台已添加的电脑（AI 团队 → Agent），它用电脑上的 GitHub 登录推送，需要对仓库有写权限'],questions:['它和“GitHub 仓库”数据源有什么不同？','Agent 会直接改到线上网站吗？','私有仓库可以吗？']}},
 {id:'cms',category:'自有网站',name:'CMS',detects:'页面内容与发布状态；之后可以把修改写成 CMS 草稿，在这里审核后发布',signals:['页面表现'],uses:['analyze','modify'],priority:'P2',availability:'planned',guide:{intro:'',needs:[],questions:[]}},
 {id:'github',category:'开源项目',name:'GitHub 仓库',detects:'Star 和 Fork 每日增长、新版本发布、Issues 里的高频问题',signals:['变化','时机','缺口'],uses:['analyze'],priority:'P0',availability:'available',guide:{intro:'把 GitHub 仓库链接发给我。公开仓库不需要任何凭据，我会先读取预览，你确认后接入；之后每天记录 Star、Fork、Release，并整理近 90 天讨论最多的 Issues。',needs:['公开仓库地址，例如 https://github.com/org/repo'],questions:['会读取哪些数据？','私有仓库可以接吗？','Star 增长怎么计算？']}},
 {id:'github-traffic',category:'开源项目',name:'GitHub Traffic',detects:'仓库浏览与克隆、从哪些网站访问仓库、热门页面',signals:['变化'],uses:['analyze'],priority:'P0',availability:'available',guide:{intro:'Traffic 需要仓库的只读管理权限。我会一步步教你创建一个只授权这个仓库、只读的细粒度 token。GitHub 只保留最近 14 天的数据，接入后我每天归档，越早接入历史越完整。',needs:['仓库管理员账号','只读细粒度 token（我会教你创建）'],questions:['为什么需要管理权限？','token 会保存在哪里？','以后可以换成 GitHub App 吗？']}},
 {id:'packages',category:'使用量',name:'npm、PyPI、Docker Hub 下载量',detects:'真实采用趋势，比 Star 更接近实际使用',signals:['变化'],uses:['analyze'],priority:'P1',availability:'available',guide:{intro:'告诉我你的包叫什么（npm、PyPI 或 Docker Hub，可以贴包的页面地址）。这些都是公开数据，不需要账号；我先读出来给你确认，之后每天记录下载量。',needs:['包名或包的页面地址，最多 10 个'],questions:['PyPI 为什么只有半年？','Docker 的拉取次数怎么算？','下载量会算进每日分析吗？']}},
 {id:'discourse',category:'用户社区',name:'Discourse 论坛',detects:'社区里反复出现的问题、讨论量变化、热门话题与未解决的求助',signals:['缺口','变化','时机'],uses:['analyze'],priority:'P0',availability:'available',guide:{intro:'把社区论坛地址发给我。目前支持 Discourse 论坛的公开分类，不需要账号；我只读取帖子内容与互动数据，不保存用户名。首次同步需要一两分钟，会在后台完成。',needs:['论坛首页地址，例如 https://forum.example.com'],questions:['会读取哪些帖子？','私有分类可以接入吗？','多久同步一次？']}},
 {id:'github-discussions',category:'用户社区',name:'GitHub Discussions',detects:'仓库讨论区的高频问题与话题',signals:['缺口','变化'],uses:['analyze'],priority:'P1',availability:'available',guide:{intro:'Discussions 和 GitHub Traffic 用同一个只读 token：接入仓库并填好 token 后，我每天读取近 90 天的讨论，整理讨论最多和还没解决的问题。不需要另外的权限。',needs:['已接入的 GitHub 仓库','GitHub Traffic 的只读 token'],questions:['仓库没开 Discussions 会怎样？','为什么需要 token？','讨论会算进每日分析吗？']}},
 {id:'discord-slack',category:'用户社区',name:'Discord、Slack',detects:'聊天社区里的高频问题与讨论热度',signals:['缺口','变化'],uses:['analyze'],priority:'P2',availability:'planned',guide:{intro:'',needs:[],questions:[]}},
 {id:'mentions',category:'外部讨论',name:'Hacker News 提及',detects:'哪里在讨论你的产品、讨论热度的变化',signals:['时机','变化'],uses:['analyze'],priority:'P1',availability:'available',guide:{intro:'告诉我产品名或网站域名（最多 5 个词），我在 Hacker News 上找提到它们的帖子和评论。这是公开数据，不需要账号，也不保存作者；先读最近 30 天给你看，确认后补读一年，之后每天更新。',needs:['产品名或网站域名，例如 nocobase、nocobase.com'],questions:['会搜到同名但不相关的内容吗？','为什么最多只读到一年？','提及会算进每日分析吗？']}},
 {id:'reddit',category:'外部讨论',name:'Reddit 讨论',detects:'Reddit 上哪些帖子在聊你的产品、在哪些版块',signals:['时机','变化'],uses:['analyze'],priority:'P1',availability:'available',guide:{intro:'告诉我产品名（最多 5 个词），我每周在 Google 里搜一次 Reddit 上提到它的帖子，记下标题、版块和链接。Reddit 官方接口用于品牌监测要签付费的商业协议，所以走 Google；这样只看得到 Google 收录了的帖子，也看不到点赞和评论数。需要先接入 DataForSEO，每次搜索约 $0.002。',needs:['已接入的 DataForSEO','产品名，例如 NocoBase'],questions:['为什么不用 Reddit 官方接口？','一个月大概花多少钱？','新帖子会进每日分析吗？']}},
 {id:'social',category:'外部讨论',name:'X',detects:'社交媒体上的提及与传播',signals:['时机','变化'],uses:['analyze'],priority:'P2',availability:'planned',guide:{intro:'',needs:[],questions:[]}},
 {id:'keywords',category:'市场需求',name:'DataForSEO（关键词、竞品、AI 搜索）',detects:'任何关键词的搜索量、难度与搜索结果，竞品网站排名的词，AI 回答里有没有提到你；关键词每周跟踪排名',signals:['缺口','变化'],uses:['analyze'],priority:'P1',availability:'available',guide:{intro:'DataForSEO 按查询次数收费。我会带你填写 API 账号并设置每月预算上限；之后在关键词、竞品、AI 搜索里点查询就查，不再逐次弹出费用，花了多少在这里看，花到预算就停；30 天内同样的查询不重复收费。',needs:['DataForSEO 的 API 登录名和密码','每月预算上限（美元）'],questions:['一次查询大概多少钱？','预算上限是怎么生效的？','查询结果会保存多久？']}},
 {id:'trends',category:'市场需求',name:'Google Trends',detects:'产品和竞品在 Google 的关注度变化、正在上升的相关搜索',signals:['时机','变化'],uses:['analyze'],priority:'P2',availability:'available',guide:{intro:'告诉我产品名和最多 4 个竞品，我每周查一次 Google Trends：过去 12 个月大家对它们的关注度，以及和产品相关、正在上升的搜索。Google 官方的 Trends 接口还在内测、要申请，所以通过已接入的 DataForSEO 查，每次约 $0.022，算进月度预算。',needs:['已接入的 DataForSEO','产品名和竞品名，例如 NocoBase, Retool'],questions:['关注度的数字是什么意思？','选哪个地区比较好？','上升的相关搜索能拿来做什么？']}},
 {id:'ai-visibility',category:'市场需求',name:'AI 搜索可见度',detects:'ChatGPT、Google AI 概览等 AI 的回答里有没有提到你、引用了谁',signals:['缺口'],uses:['analyze'],priority:'P2',availability:'available',guide:{intro:'AI 搜索用已接入的 DataForSEO 查，不用另外接：在“搜索 → AI 搜索”里查品牌提及或问 AI，点了才查，花费算进 DataForSEO 的月度预算。',needs:['已接入的 DataForSEO'],questions:['一次查询大概多少钱？','和关键词研究有什么不同？']}},
 {id:'competitors',category:'竞品',name:'竞品动态',detects:'竞品的仓库、博客更新与关键词覆盖',signals:['变化','缺口'],uses:['analyze'],priority:'P2',availability:'planned',guide:{intro:'',needs:[],questions:[]}},
];
export type StatusInput={packages?:{connected:boolean}|null;hackernews?:{connected:boolean}|null;reddit?:{connected:boolean}|null;trends?:{connected:boolean}|null;community?:{connected:boolean;lastSync?:{ok:boolean}|null}|null;github?:{connected:boolean;token?:{error:string|null}|null;discussions?:{enabled:boolean;total:number}|null}|null;keyword?:{configured:boolean;verifiedAt:string|null}|null;google?:{configured:boolean;authorized:boolean;connection:{ga4PropertyId?:string|null;gscSiteUrl?:string|null}|null}|null;publicSources?:{kind:string;status:string;error?:string}[];site?:{pages:number}|null;repo?:{repo:string}|null};
// Status shown on each catalog card; derived only from saved connection state, never assumed.
export function sourceState(source:CatalogSource,input:StatusInput):SourceState{
 if(source.availability==='planned')return 'planned';
 if(source.availability==='soon')return 'soon';
 const g=input.google;
 if(source.id==='gsc'||source.id==='ga4'){if(!g)return 'ready';if(!g.configured)return 'needs-admin';const picked=source.id==='gsc'?g.connection?.gscSiteUrl:g.connection?.ga4PropertyId;return g.authorized&&picked?'connected':g.authorized?'partial':'ready';}
 if(source.id==='github'){if(input.github?.connected)return 'connected';const repos=(input.publicSources||[]).filter(s=>s.kind==='github'&&s.status!=='disconnected');return repos.length?'partial':'ready';}
 if(source.id==='github-discussions'){const g=input.github;if(!g?.connected)return 'ready';if(!g.token)return 'partial';return g.discussions?.enabled?'connected':'ready';}
 if(source.id==='github-traffic'){const t=input.github?.token;return !input.github?.connected||!t?'ready':t.error?'partial':'connected';}
 if(source.id==='site')return input.site?.pages?'connected':'ready';
 if(source.id==='repo')return input.repo?.repo?'connected':'ready';
 if(source.id==='discourse'){const c=input.community;return !c?.connected?'ready':c.lastSync&&!c.lastSync.ok?'partial':'connected';}
 if(source.id==='packages')return input.packages?.connected?'connected':'ready';
 if(source.id==='mentions')return input.hackernews?.connected?'connected':'ready';
 if(source.id==='reddit')return input.reddit?.connected?'connected':'ready';
 if(source.id==='trends')return input.trends?.connected?'connected':'ready';
 if(source.id==='keywords')return input.keyword?.configured?(input.keyword.verifiedAt?'connected':'partial'):'ready';
 if(source.id==='ai-visibility')return input.keyword?.verifiedAt?'connected':'ready';
 return 'ready';
}
export const stateLabels:Record<SourceState,string>={connected:'已接入',partial:'部分完成',ready:'可接入','needs-admin':'需管理员配置',soon:'即将支持',planned:'规划中'};
