import type { TranslationOverrides } from '@nocobase/i18n';

// The Agents plugin's copy as NocoReach words it (2026-10-20 and 2026-10-21 user decisions): its runtimes, model
// services and usage pages say what each one is for; the Chinese copy names a runner machine with the Runtimes page's own
// word everywhere instead of the plugin's second term for it; agents on a runtime are local agents; and a runtime is
// shared with the team or owner only. Overrides freeze these strings; recheck them against the plugin's locale after upgrading it.
const PLUGIN = '@nocobase/app-plugin-agents';

export const agentsOverridesZhCN: TranslationOverrides = {
  [PLUGIN]: {
    agents: {
      description:
        '运行环境上报的每个「工具 · 模型」就是一个 agent。项目经理按「擅长什么」把任务的每一步派给它们。',
      fromRunners: '运行环境上报的本地 Agent',
      discovery: {
        provider: '服务商与运行环境',
      },
      filters: {
        unreported: '暂无运行环境 {{count}}',
      },
      emptyDescription:
        '连接一个登录了编码工具的运行环境：它上报的每个模型都会出现在这里，等你启用。',
      howToAdd:
        '想加一个本地 Agent：在运行环境上装好编码工具并登录，它会出现在“新发现”里，写好「擅长什么」即可启用。',
      where: {
        none: '暂无运行环境',
        noneOnline: '现在没有运行环境在线',
        personalOnly: '只给所有者用',
      },
      state: {
        unreported: '暂无运行环境',
      },
      enable: {
        reportedBy_one: '由 {{count}} 个在线运行环境上报：{{names}}。',
        reportedBy_other: '由 {{count}} 个在线运行环境上报：{{names}}。',
        noRunnerNow: '现在没有在线的运行环境有它。',
        personalOnly:
          '只有「只给所有者用」的运行环境能跑：只有这些运行环境的所有者自己发起的任务会派给它。',
      },
    },
    failures: {
      runnerUpgrade: '因运行环境升级中断，运行将继续。',
      runnerDiskFull: '运行环境磁盘空间不足。',
    },
    runtimes: {
      workspaces: {
        oldRunner: '此运行环境尚未提供诊断原因',
      },
      variables: {
        unknown: '未上报：它的运行环境版本较旧。更新运行环境后可以看到。',
      },
      status: {
        updatePending: '运行环境等待升级，暂不接活',
        pruning: '运行环境清理共享缓存，暂不接活',
      },
      emptyDescription:
        '连接运行环境后，本地 Agent 可以在其中使用编码工具执行任务。',
      description:
        '装了 Claude Code 或 Codex 的电脑或服务器，本地 Agent 在上面执行任务，所以要保持开机、联网，编码工具要登录。',
      columns: {
        sharing: '谁能用',
      },
      trust: {
        label: '谁能用',
        team: '团队共用',
        teamHint:
          '任何成员发起的任务都可能在这里运行，用这台电脑登录的账号和额度，也能读写这台电脑上的文件。适合团队共用的服务器或虚拟机。',
        ownerOnly: '只给所有者用',
        ownerOnlyHint:
          '只运行添加它的人自己发起的任务。你自己添加的运行环境默认如此。',
        personalOnly:
          '这个运行环境将只给你自己用：只运行你发起的任务。之后可以再共享给团队。',
      },
    },
    connect: {
      description:
        '在装有编码工具的主机（服务器、虚拟机或个人设备）上运行下面的命令。Agent 在那里以运行 Runner的用户身份完全放开地运行，能读写该用户能访问的一切，包括 SSH 密钥和其他凭证。运行环境不是安全边界：请用专用系统用户、容器或虚拟机来运行它。',
    },
    chat: {
      // Conversations started from Insights (`INSIGHTS_SOURCE`), named as its page is.
      sources: { insights: '洞察' },
      availability: {
        noRunner: '暂无运行环境，选不了',
        othersPersonal: '只有别人的个人运行环境能跑',
      },
      agents: {
        personalOnly: '只给所有者用',
        hint: '列出已启用的 agent，你现在用不了的会写明原因。回答跑在运行环境上，第一条回复要等运行环境领取，通常十几秒。',
      },
    },
    runWait: {
      reasons: {
        updatePending: '运行环境等待升级，暂不接活',
        pruning: '运行环境清理共享缓存，暂不接活',
        toolNotInstalled: '在线运行环境未安装此工具',
        incompatible: '运行环境不支持本次负载，需要升级',
        restricted: '运行环境策略、目录或变量限制',
        noSharedRunner: '仅他人的个人运行环境在线',
        runnersBusy: '可承接的运行环境满载',
      },
    },
    agentSkills: {
      onlineScripts:
        '脚本不会在对话 Agent 中执行：Agent 能读到脚本，但不会运行它们。',
    },
    models: {
      title: '模型服务',
      description: '每日分析和对话栏用这里的模型，按调用量付费给服务商。',
    },
    defaultModel: {
      description:
        '没有指定模型的对话 Agent 使用它回答，例如新建的 Agent 或应用自带的 Agent。',
    },
    services: {
      empty: {
        description: '添加模型服务后，对话 Agent 就能通过它回答。',
      },
      models: {
        counts: {
          chat: '{{count}} 个对话模型',
          embedding: '{{count}} 个向量模型',
          rerank: '{{count}} 个重排序模型',
        },
      },
      service: {
        enabledHint: '只有启用时，对话 Agent 才能使用它的模型。',
      },
    },
    skills: {
      scriptsNote: '含脚本：对话 Agent 只能读取，不会执行',
      entry: {
        conventional: {
          scripts: 'Agent 可以运行的代码；对话 Agent 只读取。',
        },
      },
    },
    usage: {
      description: '各 Agent 和模型消耗的 token，以及按当前价格估算的费用。',
    },
  },
};

export const agentsOverridesEnUS: TranslationOverrides = {
  [PLUGIN]: {
    chat: { sources: { insights: 'Insights' } },
    agents: {
      fromRunners: 'Local agents reported by runtimes',
      howToAdd:
        'To add a local agent, install a coding tool on a runtime and sign in. It then shows up as newly discovered; write what it is good at to enable it.',
    },
    runtimes: {
      description:
        'Computers or servers with Claude Code or Codex where local agents carry out tasks, so they must stay on and online with the coding tool signed in.',
      columns: {
        sharing: 'Who can use it',
      },
      trust: {
        label: 'Who can use it',
        team: 'Shared with the team',
        ownerOnly: 'Owner only',
      },
    },
    agentSkills: {
      onlineScripts:
        'Scripts are not executed for chat agents: the agent can read them, not run them.',
    },
    models: {
      title: 'Model services',
      description:
        'Daily analysis and the chat panel use the models here; the provider bills each call.',
    },
    defaultModel: {
      description:
        'Chat agents with no models of their own answer with it, such as a new agent or one that came with the application.',
    },
    services: {
      empty: {
        description:
          'Once you add a model service, chat agents can answer through it.',
      },
      models: {
        counts: {
          chat: 'Chat models: {{count}}',
          embedding: 'Embedding models: {{count}}',
          rerank: 'Reranking models: {{count}}',
        },
      },
      service: {
        enabledHint: 'Chat agents may use its models only while it is on.',
      },
    },
    skills: {
      scriptsNote: 'Has scripts: chat agents can read them but never run them',
      entry: {
        conventional: {
          scripts: 'Code agents can run. Chat agents only read it.',
        },
      },
    },
    usage: {
      description:
        'Tokens used by each agent and model, with costs estimated at current prices.',
    },
  },
};
