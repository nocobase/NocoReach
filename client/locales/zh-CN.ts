import schedules from './schedules/zh-CN.js';
import businessMessages from '../../shared/i18n/zh.json';
import systemZhCN from './system/zh-CN.js';
import agentChat from '../extensions/nocobase-agent-chat/locales/zh-CN.js';
import type { AppResource } from './en-US.js';

const zhCN: AppResource = {
  ...businessMessages,
  schedules,
  ...systemZhCN,
  ...agentChat,
  'agentSetup.title': '在 agent 中使用 NocoReach',
  'agentSetup.description':
    '将下面的指引复制到 Claude Code、Codex 或其他编程 agent，连接 NocoReach。',
  'agentSetup.prompt':
    '请帮助我在当前编程 agent 中使用 NocoReach。\n\n1. 安装 NocoReach CLI：\n{{install}}\n\n2. 发起浏览器登录：\n{{login}}\n向我展示验证地址和验证码，等待我在浏览器中核对并批准，不要替我批准。\n\n3. 我批准后，运行 `nocoreach whoami` 核对登录账号，再运行 `nocoreach docs` 了解可用命令。使用这些命令，在我现有的权限范围内完成我的请求。不要索要我的密码，也不要将下载令牌用作 API Key。',
  'agentSetup.identity':
    '下载令牌仅用于安装 CLI。浏览器登录经你批准后，agent 将以你的账号身份操作，沿用现有权限。',
  'agentSetup.expiry':
    '安装令牌有效期为 30 分钟，最多可下载 3 次。请勿公开这些指引；过期后可重新生成。',
  'agentSetup.runtime':
    '需要 macOS 或 Linux 及 Node.js 24+；Windows 请使用 WSL。仅安装 CLI。',
  'agentSetup.preparing': '正在准备安装指引…',
  'agentSetup.promptLabel': 'Agent 配置指引',
  'agentSetup.failed': '无法准备安装指引，请重试。',
  'agentSetup.signedOut': '登录已过期，请重新登录后继续。',
  'agentSetup.forbidden': '你没有生成安装指引的权限，请联系管理员。',
  'agentSetup.expired': '此安装令牌已过期，请重新生成后继续。',
  'agentSetup.regenerate': '重新生成令牌',
  'agentSetup.copy': '复制指引',
  'agentSetup.copied': '已复制',
  'agentSetup.copyFailed': '复制失败，请选中指引后手动复制。',
  'agentSetup.signIn': '重新登录',
  'agentSetup.signInFailed': '无法刷新登录状态，请重试。',
  'nocoreach.agentCapabilities.group': 'NocoReach 任务',
  'nocoreach.agentCapabilities.read': '读取当前任务资料',
  'nocoreach.agentCapabilities.readDescription':
    '读取当前任务快照：指标、关键词、页面、审计、知识、Skills 和论坛正文。',
  'nocoreach.agentCapabilities.draft': '暂存候选草稿',
  'nocoreach.agentCapabilities.draftDescription':
    '保存当前运行的草稿，不执行审核或发布。',
  'nocoreach.agentCapabilities.research': 'NocoReach 研究',
  'nocoreach.agentCapabilities.community': 'NocoReach 社区回复',
  'nocoreach.agentCapabilities.presetDescription':
    '基于项目资料完成研究或回复草稿，交给人工审核。',
  'nocoreach.nav.insights': '洞察',
  'nocoreach.nav.opportunities': '机会',
  'nocoreach.nav.tasks': '任务',
  'nocoreach.nav.results': '成果',
  'nocoreach.nav.site': '网站与产品',
  'nocoreach.nav.pages': '页面',
  'nocoreach.nav.traffic': '访问',
  'nocoreach.nav.audit': '审计',
  'nocoreach.nav.github': 'GitHub',
  'nocoreach.nav.downloads': '下载量',
  'nocoreach.nav.search': '搜索与市场',
  'nocoreach.nav.searchPerformance': '搜索表现',
  'nocoreach.nav.keywords': '关键词',
  'nocoreach.nav.trends': '趋势',
  'nocoreach.nav.competitors': '竞品',
  'nocoreach.nav.aiSearch': 'AI 搜索',
  'nocoreach.nav.community': '社区',
  'nocoreach.nav.forum': '论坛',
  'nocoreach.nav.hackerNews': 'Hacker News',
  'nocoreach.nav.reddit': 'Reddit',
  'nocoreach.nav.x': 'X',
  'nocoreach.nav.discord': 'Discord',
  'nocoreach.nav.slack': 'Slack',
  'nocoreach.nav.aiTeam': 'AI 团队',
  'nocoreach.nav.agent': 'Agent',
  'nocoreach.nav.runners': 'Runner',
  'nocoreach.nav.models': '模型',
  'nocoreach.nav.usage': '用量',
  'nocoreach.nav.playbooks': '做法',
  'nocoreach.nav.skills': 'Skills',
  'nocoreach.nav.projectKnowledge': '项目知识',
  'nocoreach.nav.analysisRules': '分析规则',
  'nocoreach.nav.settings': '设置',
  'nocoreach.nav.connections': '数据接入',
  'nocoreach.nav.proxyProfiles': '网络',
  'nocoreach.nav.members': '成员',
  'auth.platform': 'AI 增长团队',
  'auth.marketingTitleFirst': '从数据里找机会，',
  'auth.marketingTitleSecond': '交给 Agent',
  'auth.marketingTitleThird': '改到上线。',
  'auth.marketingDescription':
    'NocoReach 每天读你的搜索、访问、社区和 GitHub 数据，找出值得做的事；你点头后，Agent 在你的仓库里改好并开 PR。',
  'auth.frontend': '每日分析',
  'auth.frontendDescription': '在线 AI 每天看数据，提出有依据的机会。',
  'auth.foundation': '仓库原生',
  'auth.foundationDescription': 'Agent 改仓库、开 PR，改动由你审核。',
  'auth.marketingFooter': '找机会，做出来，看效果。',
  'navigation.brandHome': 'NocoReach 首页',
  'navigation.brandApps': 'NocoReach 应用',
  shell: {
    templateVersionUnknown: '版本未知',
    buildFreely: '从数据里找机会。',
    reliability: '<brand>NocoReach</brand> 帮你做出来。',
  },
  app: {
    title: 'NocoReach',
  },
};

export default zhCN;
