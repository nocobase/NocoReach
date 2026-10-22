import { t, type ChatChannel, type ChatMessage } from './types.js';

const m = (
  at: number,
  author: string,
  zh: string,
  en: string,
  replies: [string, string, string][] = [],
): ChatMessage => ({
  at,
  author,
  text: t(zh, en),
  ...(replies.length
    ? { replies: replies.map(([who, rzh, ren]) => [who, t(rzh, ren)] as const) }
    : {}),
});

/** The partner Slack workspace: implementers and agencies building on NocoBase. */
export const SLACK: ChatChannel[] = [
  {
    name: 'partners-general',
    members: 214,
    messages: [
      m(
        3,
        'qiao-han',
        '2.0.3 已发布，修复了审批退回后附件丢失的问题，建议在客户环境尽快升级。',
        '2.0.3 is out with the fix for attachments lost after approval returns; please upgrade customer environments soon.',
        [
          [
            'marta-k',
            '已经在两个客户环境升级，没问题。',
            'Upgraded two customer environments, all fine.',
          ],
          [
            'sato-k',
            '收到，周末维护窗口升级。',
            'Noted, upgrading in the weekend window.',
          ],
        ],
      ),
      m(
        20,
        '@devrel',
        '下周三有一场合作伙伴线上分享：用工作流 + AI 员工做工单分类，欢迎报名。',
        'Partner session next Wednesday: ticket classification with workflows and AI employees. Sign up below.',
      ),
      m(
        52,
        'pablo-r',
        '有人做过 SAP 的数据同步吗？',
        'Has anyone synced data with SAP?',
        [
          [
            'jonas-bauer',
            '我们用 HTTP 节点每小时拉一次物料数据。',
            'We pull material data hourly with an HTTP node.',
          ],
        ],
      ),
      m(
        98,
        'lucia-m',
        '分享一个模板：带审批的费用报销，需要的可以私信。',
        'Sharing a template: expense claims with approvals. DM me if you want it.',
      ),
      m(
        170,
        'qiao-han',
        '2.0 合作伙伴升级清单已更新到共享文档。',
        'The 2.0 partner upgrade checklist is updated in the shared doc.',
      ),
      m(
        260,
        'kaiwen-li',
        '客户问能不能按部门隔离数据，大家一般怎么实施？',
        'A customer asks about isolating data by department — how do you usually do it?',
        [
          [
            '@devrel',
            '数据范围用「所在部门」，跨部门的汇总给单独的报表角色。',
            'Use the "my department" scope and a separate report role for cross-department totals.',
          ],
          ['kaiwen-li', '好的，谢谢！', 'Great, thanks!'],
        ],
      ),
      m(
        410,
        'marta-k',
        '2.0 的新页面引擎速度确实快很多，大表格不卡了。',
        'The 2.0 page engine really is faster — large tables no longer lag.',
      ),
    ],
  },
  {
    name: 'help',
    members: 188,
    messages: [
      m(
        1,
        'ngoc-anh',
        '子表格里的联动规则不生效，是 bug 吗？',
        'Linkage rules do not work in a sub-table — is that a bug?',
        [
          [
            'aiko-w',
            '能发一个最小复现吗？我看一下。',
            'Can you share a minimal reproduction? I will take a look.',
          ],
        ],
      ),
      m(
        7,
        'dev-ravi',
        'docker 部署后数据库密码错误，改了 .env 也不生效。',
        'Database password error after docker deploy; changing .env did nothing.',
        [
          [
            'jonas-bauer',
            '数据卷里已经初始化过了，要么改回旧密码，要么清空数据卷重新初始化。',
            'The volume was already initialized: either restore the old password or clear the volume and start over.',
          ],
          ['dev-ravi', '清空数据卷后好了。', 'Clearing the volume fixed it.'],
        ],
      ),
      m(
        30,
        'ivy-chen',
        '关系字段显示成 ID 了。',
        'A relation field shows IDs.',
        [
          [
            'aiko-w',
            '在字段设置里重新选一下标题字段。',
            'Pick the title field again in the field settings.',
          ],
        ],
      ),
      m(
        75,
        'ahmed-s',
        'OIDC 登录后用户名为空，有人遇到过吗？',
        'Empty username after OIDC sign-in — anyone seen this?',
      ),
      m(
        140,
        'wei-zhang-88',
        '导入时能不能先看到哪些行会被去重？',
        'Can I see which rows will be de-duplicated before importing?',
        [
          [
            '@devrel',
            '这个需求在 2.1 测试版里预览了。',
            'That is previewed in the 2.1 beta.',
          ],
        ],
      ),
      m(
        220,
        'sato-k',
        '多副本部署定时任务重复执行，怎么加锁？',
        'Scheduled tasks run twice across replicas — how do I lock them?',
      ),
      m(
        330,
        'pablo-r',
        '插件打包后上传报错 invalid package。',
        'Uploading a built plugin says invalid package.',
        [
          [
            'tom-reed',
            '用 yarn build --tar 打包，不要手动压缩。',
            'Build with yarn build --tar rather than zipping by hand.',
          ],
        ],
      ),
    ],
  },
  {
    name: 'feedback',
    members: 96,
    messages: [
      m(
        12,
        'lucia-m',
        '图表希望支持同比环比，客户每周都问。',
        'Charts need year-over-year — customers ask every week.',
      ),
      m(
        64,
        'kaiwen-li',
        '离职交接时批量转移负责人太需要了。',
        'Bulk owner transfer for departures is badly needed.',
      ),
      m(
        150,
        'marta-k',
        '文档里备份部分写得很清楚了，点赞。',
        'The backup section of the docs is very clear now — nice.',
      ),
      m(
        300,
        'ngoc-anh',
        '移动端希望能离线录入。',
        'Offline entry on mobile, please.',
      ),
    ],
  },
];

/** The public Discord server. */
export const DISCORD: ChatChannel[] = [
  {
    name: 'general',
    members: 4210,
    messages: [
      m(
        2,
        'ivy-chen',
        '2.0.3 升级完成，审批附件的问题修好了 🎉',
        'Upgraded to 2.0.3 — the approval attachment issue is fixed 🎉',
      ),
      m(
        9,
        'sato-k',
        'HN 上那篇 AI 工作流的文章讨论挺多的。',
        'The AI workflows post is getting a lot of discussion on HN.',
        [
          [
            'ahmed-s',
            '看了，评论里有人担心数据安全，我们的做法是人工确认后再执行。',
            'Read it; some worry about data safety. We keep a human confirmation before anything runs.',
          ],
        ],
      ),
      m(
        26,
        'pablo-r',
        '有人在用 NocoBase 做进销存吗？',
        'Anyone running inventory on NocoBase?',
      ),
      m(
        80,
        'lucia-m',
        '分享了一个报销模板到 #showcase。',
        'Posted an expense template in #showcase.',
      ),
      m(
        200,
        'kaiwen-li',
        '周末把 4 个客户表合并完了，权限配置比想象中简单。',
        'Merged four customer sheets over the weekend; permissions were simpler than expected.',
      ),
      m(
        420,
        'qiao-han',
        '2.0 正式发布！升级前请先读公告。',
        '2.0 is out! Read the announcement before upgrading.',
      ),
    ],
  },
  {
    name: 'help',
    members: 3980,
    messages: [
      m(
        1,
        'ngoc-anh',
        'Kubernetes 上存储用什么好？',
        'What storage works on Kubernetes?',
        [
          [
            'jonas-bauer',
            '需要 ReadWriteMany，或者直接用 S3 兼容存储。',
            'You need ReadWriteMany, or just S3-compatible storage.',
          ],
        ],
      ),
      m(
        5,
        'dev-ravi',
        '13000 端口被占用了，可以换端口吗？',
        'Port 13000 is taken — can I change it?',
        [
          [
            '@devrel',
            '改 compose 里的端口映射，比如 8080:80。',
            'Change the port mapping in compose, for example 8080:80.',
          ],
        ],
      ),
      m(
        18,
        'ivy-chen',
        '工作流一直在执行中，怎么停？',
        'A workflow execution is stuck in progress — how do I stop it?',
        [
          [
            'chen-river',
            '在执行记录里取消；2.0.2 起 HTTP 节点可以设超时。',
            'Cancel it in executions; from 2.0.2 HTTP nodes can time out.',
          ],
        ],
      ),
      m(
        44,
        'wei-zhang-88',
        '导入时日期格式不对。',
        'Dates import in the wrong format.',
      ),
      m(
        96,
        'ahmed-s',
        'API 密钥能限制只读吗？',
        'Can an API key be read-only?',
        [
          [
            'chen-river',
            '给密钥选一个只有查看权限的角色。',
            'Give the key a role with view permissions only.',
          ],
        ],
      ),
      m(
        180,
        'pablo-r',
        '自定义区块怎么拿到当前记录？',
        'How does a custom block get the current record?',
      ),
    ],
  },
  {
    name: 'showcase',
    members: 3120,
    messages: [
      m(
        10,
        'ahmed-s',
        '售后工单 + AI 分类，截图见下。',
        'Support tickets with AI labelling — screenshots below.',
      ),
      m(
        80,
        'lucia-m',
        '费用报销模板，带两级审批。',
        'An expense claim template with two-level approval.',
      ),
      m(
        320,
        'sato-k',
        '实验室预约系统上线一个月，每天 300+ 预约。',
        'Lab booking has run for a month with 300+ bookings a day.',
      ),
    ],
  },
  {
    name: 'questions',
    members: 3650,
    forum: true,
    messages: [
      m(
        4,
        'ngoc-anh',
        '如何让同一张表在移动端只显示三个字段？',
        'How do I show only three fields of a collection on mobile?',
        [
          [
            'aiko-w',
            '移动端页面单独配置表单字段即可。',
            'Configure the fields separately on the mobile page.',
          ],
          ['ngoc-anh', '找到了，谢谢！', 'Found it, thanks!'],
        ],
      ),
      m(
        28,
        'kaiwen-li',
        '审批节点能根据金额走不同分支吗？',
        'Can an approval branch on the amount?',
        [
          [
            '@devrel',
            '在审批前加条件节点，按金额分支。',
            'Add a condition node before the approval and branch on the amount.',
          ],
        ],
      ),
      m(
        70,
        'jonas-bauer',
        'pageSize 最大可以设多少？',
        'What is the maximum pageSize?',
      ),
      m(
        260,
        'marta-k',
        '备份后怎么验证能恢复？',
        'How do I prove a backup restores?',
        [
          [
            '@devrel',
            '在独立环境恢复，抽查带附件的记录，记录耗时。',
            'Restore in a separate environment, check records with attachments and time it.',
          ],
          [
            'marta-k',
            '已加入我们的季度检查。',
            'Added to our quarterly checks.',
          ],
        ],
      ),
    ],
  },
];
