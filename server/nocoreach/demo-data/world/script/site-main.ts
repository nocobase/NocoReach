import { t, type Page, type Site } from './types.js';

/**
 * nocobase.example: the main demo project's website. Changes line up with the demo's tasks and opportunities — the
 * rewritten getting-started guide gained clicks twelve days ago, the charts guide lost position while impressions grew,
 * the 2.0 release and a Hacker News thread brought bursts, and two new pages are still being picked up.
 */
const pages: Page[] = [
  {
    path: '/',
    title: t(
      'NocoBase：数据模型驱动的开源无代码平台',
      'NocoBase: the open-source, data-first no-code platform',
    ),
    description: t(
      'NocoBase 是数据模型驱动的开源无代码平台：先设计数据结构，再拼装页面、权限与工作流，可以私有部署，并用插件扩展任何能力。',
      'Design the data first, then assemble pages, permissions and workflows. Self-host NocoBase and extend anything with plugins.',
    ),
    sections: [
      [
        t('从数据模型开始', 'Start from the data model'),
        t(
          '用数据表、字段和关系描述业务，再把同一份数据放进不同的页面、表单和看板，界面变化不会打乱数据。',
          'Describe the business with collections, fields and relations, then put the same data into different pages, forms and dashboards without reshaping it.',
        ),
      ],
      [
        t('权限细到每一条记录', 'Permissions down to each record'),
        t(
          '按角色控制菜单、操作、字段和数据范围，例如销售只能查看自己负责的客户，主管查看整个团队。',
          'Control menus, actions, fields and data scope by role — a sales rep sees only their own accounts, a manager sees the whole team.',
        ),
      ],
      [
        t('工作流与审批', 'Workflows and approvals'),
        t(
          '数据变化、定时任务或人工审批都可以触发流程，在流程里更新记录、发送通知或调用 HTTP 接口。',
          'Record changes, schedules or approvals start workflows that update records, notify people or call HTTP endpoints.',
        ),
      ],
      [
        t('一切皆插件', 'Everything is a plugin'),
        t(
          '内核保持精简，数据源、字段类型、区块和认证方式都由插件提供，团队可以开发自己的插件。',
          'A small core: data sources, field types, blocks and sign-in methods all come from plugins, and teams write their own.',
        ),
      ],
    ],
    weight: 9,
    published: 900,
    updated: 18,
    links: [
      '/docs/getting-started',
      '/tutorials/first-app',
      '/solutions/crm',
      '/pricing',
      '/blog/release-v2',
    ],
  },
  {
    path: '/pricing',
    title: t('版本与价格', 'Editions and pricing'),
    description: t(
      '社区版免费开源，可用于商业项目；专业版和企业版提供审批、审计日志等商业插件与技术支持。在这里比较各版本能力，并联系销售确认报价。',
      'The community edition is free and open source; professional and enterprise add commercial plugins and support. Compare editions and get a quote.',
    ),
    sections: [
      [
        t('社区版', 'Community edition'),
        t(
          '包含数据建模、页面搭建、权限、工作流核心节点和全部开源插件，可用于商业项目。',
          'Data modeling, page building, permissions, core workflow nodes and every open-source plugin, usable in commercial projects.',
        ),
      ],
      [
        t('专业版与企业版', 'Professional and enterprise'),
        t(
          '增加审批、审计日志、多应用管理等商业插件，以及按响应时间约定的技术支持。具体价格以销售确认的报价为准。',
          'Adds commercial plugins such as approvals, audit logs and multi-app management, with support on agreed response times. Prices are confirmed in a quote from sales.',
        ),
      ],
      [
        t('常见问题', 'Questions'),
        t(
          '开发、测试环境是否另行计费，以及商业插件能否单独购买，请在采购前与销售确认。',
          'Ask sales before purchase whether development and test environments are billed separately and whether commercial plugins can be bought one by one.',
        ),
      ],
    ],
    weight: 3.5,
    published: 700,
    updated: 33,
    links: ['/commercial-plugins', '/enterprise', '/contact'],
  },
  {
    path: '/commercial-plugins',
    title: t('商业插件', 'Commercial plugins'),
    description: t(
      '审批、审计日志、多应用管理和高级字段等商业插件的能力说明、适用版本与数据库要求，以及采购前需要在测试环境验证的事项。',
      'What the commercial plugins — approvals, audit logs, multi-app, advanced fields — do and which editions include them.',
    ),
    sections: [
      [
        t('审批', 'Approvals'),
        t(
          '支持多级审批、会签、或签、退回到任意节点和代理审批，审批记录保留完整轨迹。',
          'Multi-level approval, all-or-any sign-off, return to any step and delegation, with a full trail of every decision.',
        ),
      ],
      [
        t('审计日志', 'Audit logs'),
        t(
          '记录谁在什么时候修改了哪些字段，可以按用户、数据表和时间筛选。',
          'Records who changed which fields and when, filterable by user, collection and time.',
        ),
      ],
      [
        t('适用前提', 'Before you buy'),
        t(
          '部分插件依赖特定版本或数据库，请先在测试环境验证，再确认授权范围。',
          'Some plugins need a particular edition or database. Verify them in a test environment before confirming the licence scope.',
        ),
      ],
    ],
    weight: 2.2,
    published: 420,
    updated: 61,
    links: ['/pricing', '/docs/workflow/approval'],
  },
  {
    path: '/enterprise',
    title: t('企业版', 'Enterprise'),
    description: t(
      '面向集团和大型团队的企业版：每个部门独立应用与数据库，统一管理升级和插件，支持单点登录、审计日志，并提供上线评审与专属支持。',
      'For groups and large teams: isolated apps, single sign-on, auditing and dedicated support.',
    ),
    sections: [
      [
        t('多应用隔离', 'Isolated applications'),
        t(
          '每个部门一个独立应用和数据库，统一在主应用里管理升级与插件。',
          'One application and database per department, upgraded and given plugins from a main application.',
        ),
      ],
      [
        t('专属支持', 'Dedicated support'),
        t(
          '上线前评审部署架构，上线后按约定时效响应问题。',
          'A review of the deployment before launch and agreed response times afterwards.',
        ),
      ],
    ],
    weight: 0.8,
    published: 380,
    links: ['/pricing', '/docs/sso', '/contact'],
  },
  {
    path: '/contact',
    title: t('联系销售', 'Contact sales'),
    description: t('', ''),
    sections: [
      [
        t('留下联系方式', 'Leave your details'),
        t(
          '告诉我们团队规模和要解决的问题，销售会在两个工作日内联系你。',
          'Tell us your team size and the problem you are solving; sales replies within two working days.',
        ),
      ],
    ],
    weight: 0.5,
    published: 600,
    flags: ['thin'],
  },
  {
    path: '/about',
    title: t('关于 NocoBase', 'About NocoBase'),
    description: t(
      'NocoBase 团队与开源社区的故事：我们为什么从数据模型出发做无代码平台，以及如何与全球贡献者一起维护这个开源项目。',
      'The story of the NocoBase team and its open-source community, and why we build no-code from the data model.',
    ),
    sections: [
      [
        t('我们在做什么', 'What we do'),
        t(
          '让懂业务的人能自己搭建内部系统，同时让开发者保有完全的控制权。',
          'Let people who know the business build their own internal systems while developers keep full control.',
        ),
      ],
    ],
    weight: 0.6,
    published: 800,
    flags: ['thin'],
  },
  {
    path: '/showcase',
    title: t('客户案例', 'Customer stories'),
    description: t(
      '制造、教育、零售和专业服务团队如何用 NocoBase 替换共享表格与旧系统：青屿设备三周上线带权限的客户台账，北岸学院用审批和日历管理四十间实验室的预约与设备借用，还有更多来自全球用户的真实案例与配置经验分享。',
      'How manufacturing, education, retail and services teams replaced spreadsheets and legacy systems with NocoBase, from a permissioned customer ledger to booking for forty labs.',
    ),
    sections: [
      [
        t('青屿设备：客户台账上线', 'Qingyu Equipment: a customer ledger'),
        t(
          '三周内把 4 个 Excel 客户表合并成一个带权限的台账，销售只看自己的客户。',
          'Four customer spreadsheets merged into one permissioned ledger in three weeks; reps see only their own accounts.',
        ),
      ],
      [
        t('北岸学院：实验室预约', 'Northshore College: lab booking'),
        t(
          '用审批和日历区块管理 40 间实验室的预约与设备借用。',
          'Approvals and calendar blocks run bookings and equipment loans for 40 labs.',
        ),
      ],
    ],
    weight: 1,
    published: 500,
    updated: 26,
    flags: ['missing-alt'],
  },
  {
    path: '/docs/getting-started',
    title: t('快速开始', 'Getting started'),
    description: t(
      '十五分钟完成第一次上手：选择安装方式，创建第一张数据表，搭一个带新增和编辑操作的页面，再给同事配置只看自己数据的角色。',
      'Install, create your first collection, build a page and invite a colleague in fifteen minutes.',
    ),
    sections: [
      [
        t('选择安装方式', 'Choose how to install'),
        t(
          '想最快体验就用 Docker；需要二次开发时用 create-nocobase-app；参与内核开发再从源码安装。',
          'Use Docker for the quickest start, create-nocobase-app when you will customize, and the source code to work on the core.',
        ),
      ],
      [
        t('创建第一张数据表', 'Create your first collection'),
        t(
          '在数据源管理里新建「客户」表，添加名称、电话、负责人三个字段，负责人关联到用户表。',
          'In data sources, create a Customers collection with name, phone and owner fields, the owner linked to users.',
        ),
      ],
      [
        t('搭一个页面', 'Build a page'),
        t(
          '新建菜单页面，添加表格区块并选择客户表，再加上新增和编辑操作。',
          'Add a menu page, drop in a table block for Customers, then add create and edit actions.',
        ),
      ],
      [
        t('下一步', 'What next'),
        t(
          '给销售角色配置「只看自己负责的客户」，再试试用工作流在新增客户时通知负责人。',
          'Give the sales role "own customers only", then try a workflow that notifies the owner when a customer is added.',
        ),
      ],
    ],
    weight: 7,
    published: 640,
    updated: 12,
    changes: [{ kind: 'step', at: 12, to: 1.32, over: 4 }],
    links: [
      '/docs/installation/docker',
      '/docs/data-modeling',
      '/docs/permissions',
      '/tutorials/first-app',
    ],
  },
  {
    path: '/docs/installation/docker',
    title: t('使用 Docker 安装', 'Install with Docker'),
    description: t(
      '用 docker compose 启动 NocoBase 与数据库，修改 APP_KEY 和密码并挂载数据目录；页面打不开时，按容器、端口、日志、数据库四步排查。',
      'Start NocoBase and its database with docker compose, then check ports, logs and volumes.',
    ),
    sections: [
      [
        t('准备 docker-compose.yml', 'Prepare docker-compose.yml'),
        t(
          '选择 PostgreSQL、MySQL 或 SQLite 模板，修改 APP_KEY 和数据库密码，挂载 storage 目录。',
          'Pick the PostgreSQL, MySQL or SQLite template, change APP_KEY and the database password, and mount the storage directory.',
        ),
      ],
      [
        t('启动并确认', 'Start and verify'),
        t(
          '执行 docker compose up -d，看到日志里出现 app started 后访问 13000 端口。',
          'Run docker compose up -d and open port 13000 once the log shows app started.',
        ),
      ],
      [
        t('打不开页面时', 'When the page does not open'),
        t(
          '依次检查容器状态、端口占用、应用日志和数据库连接，每一步都有对应的命令和正常输出。',
          'Check container status, port conflicts, the application log and the database connection in turn; each step has a command and the output to expect.',
        ),
      ],
    ],
    weight: 6.5,
    published: 610,
    updated: 47,
    links: ['/docs/installation/upgrade', '/guides/backup-restore'],
  },
  {
    path: '/docs/installation/create-app',
    title: t(
      '使用 create-nocobase-app 安装',
      'Install with create-nocobase-app',
    ),
    description: t(
      '用 create-nocobase-app 在本地生成项目目录，适合需要开发插件、修改配置或参与二次开发的团队，包含创建、安装与启动的完整命令。',
      'Generate a project locally — for teams that will write plugins or change configuration.',
    ),
    sections: [
      [
        t('创建项目', 'Create the project'),
        t(
          '执行 yarn create nocobase-app my-app，选择数据库并填写连接信息。',
          'Run yarn create nocobase-app my-app, choose a database and enter its connection details.',
        ),
      ],
      [
        t('安装与启动', 'Install and start'),
        t(
          '进入目录执行 yarn install、yarn nocobase install，然后 yarn dev。',
          'In the directory run yarn install, yarn nocobase install, then yarn dev.',
        ),
      ],
    ],
    weight: 2.5,
    published: 600,
    updated: 90,
  },
  {
    path: '/docs/installation/upgrade',
    title: t('升级 NocoBase', 'Upgrade NocoBase'),
    description: t(
      '升级 NocoBase 前要备份数据库和 storage 目录、记录当前版本；按 Docker 或本地项目执行升级命令，失败时按步骤回退到原版本。',
      'Back up first, run the upgrade for your install method, and roll back if it fails.',
    ),
    sections: [
      [
        t('先备份', 'Back up first'),
        t(
          '备份数据库和 storage 目录，记录当前版本号，确认可以恢复。',
          'Back up the database and the storage directory, note the current version and make sure you can restore.',
        ),
      ],
      [
        t('执行升级', 'Upgrade'),
        t(
          'Docker 部署修改镜像标签后重新拉取；本地项目执行 yarn nocobase upgrade。',
          'For Docker, change the image tag and pull again; for a local project run yarn nocobase upgrade.',
        ),
      ],
    ],
    weight: 2.8,
    published: 560,
    updated: 18,
    changes: [{ kind: 'spike', at: 18, size: 2.5, halfLife: 4 }],
    links: ['/guides/backup-restore', '/changelog'],
  },
  {
    path: '/docs/installation/kubernetes',
    title: t('部署到 Kubernetes', 'Deploy to Kubernetes'),
    description: t(
      '用 Helm Chart 在 Kubernetes 上部署多副本 NocoBase：准备外部数据库、ReadWriteMany 共享存储和 Redis，并避免定时任务重复执行。',
      'Deploy NocoBase with replicas using the Helm chart, with shared storage and Redis.',
    ),
    sections: [
      [
        t('前提条件', 'Prerequisites'),
        t(
          '准备外部数据库、ReadWriteMany 存储和 Redis，多副本需要它们共享状态。',
          'An external database, ReadWriteMany storage and Redis: replicas share state through them.',
        ),
      ],
    ],
    weight: 0.6,
    published: 30,
    index: 'unknown',
    flags: ['orphan'],
  },
  {
    path: '/docs/data-modeling',
    title: t('数据建模概览', 'Data modeling overview'),
    description: t(
      '数据建模是搭建应用的第一步：了解普通表、树表、日历表、文件表和继承表的区别，以及常用字段类型、关系字段和字段标识的命名建议。',
      'Collections, field types, relations and inheritance: describe the business structure first.',
    ),
    sections: [
      [
        t('数据表类型', 'Collection types'),
        t(
          '普通表、树表、日历表、文件表和继承表各自适合不同场景，创建后类型不可更改。',
          'General, tree, calendar, file and inherited collections suit different needs; the type cannot change later.',
        ),
      ],
      [
        t('字段', 'Fields'),
        t(
          '除了文本和数字，还有公式、序列号、地理位置和关系字段，字段标识创建后不要随意修改。',
          'Besides text and numbers there are formulas, sequences, locations and relations. Avoid renaming a field identifier later.',
        ),
      ],
    ],
    weight: 3.2,
    published: 620,
    updated: 70,
    links: ['/docs/data-modeling/relations', '/docs/data-sources/mysql'],
  },
  {
    path: '/docs/data-modeling/relations',
    title: t(
      '关系字段：一对多、多对多',
      'Relation fields: one-to-many and many-to-many',
    ),
    description: t(
      '用客户、联系人和订单三张表讲清一对多与多对多关系：外键保存在哪一侧、什么时候需要中间表，以及删除记录时的级联、置空与禁止规则。',
      'Customers, contacts and orders explain foreign keys and through tables.',
    ),
    sections: [
      [
        t('一对多', 'One-to-many'),
        t(
          '一个客户有多个联系人：外键保存在联系人表，删除客户时可以选择级联或禁止。',
          'One customer has many contacts: the foreign key lives on contacts, and deleting a customer can cascade or be refused.',
        ),
      ],
      [
        t('多对多', 'Many-to-many'),
        t(
          '订单与产品通过中间表关联，需要记录数量和单价时就在中间表上加字段。',
          'Orders and products meet in a through table; add quantity and unit price as fields on it.',
        ),
      ],
    ],
    weight: 2.1,
    published: 590,
    updated: 120,
  },
  {
    path: '/docs/data-sources/mysql',
    title: t('连接外部 MySQL 数据库', 'Connect an external MySQL database'),
    description: t(
      '把已有的 MySQL 数据库作为外部数据源接入 NocoBase：用只读账号连接、选择要同步的表、检查字段类型映射，原系统的表结构保持不变。',
      'Bring an existing MySQL database into NocoBase, read its tables and use them on pages.',
    ),
    sections: [
      [
        t('添加数据源', 'Add the data source'),
        t(
          '填写主机、端口和只读账号，选择要同步的表，字段类型会自动映射。',
          'Enter host, port and a read-only account and pick the tables to load; field types map automatically.',
        ),
      ],
      [
        t('注意事项', 'Things to know'),
        t(
          '外部表的结构仍由原系统维护，NocoBase 只同步元数据，不会修改表结构。',
          'The original system still owns the table structure; NocoBase loads metadata and never alters tables.',
        ),
      ],
    ],
    weight: 1.8,
    published: 400,
    updated: 52,
  },
  {
    path: '/docs/permissions',
    title: t('角色与权限', 'Roles and permissions'),
    description: t(
      '配置角色的菜单、操作、字段和数据范围权限，例如销售只看自己负责的客户、主管查看整个部门，并用不同账号验证每个角色实际看到的内容。',
      "Configure a role's menus, actions, fields and data scope, then check what each role really sees.",
    ),
    sections: [
      [
        t('三层权限', 'Three layers'),
        t(
          '菜单决定能进入哪些页面，操作权限决定能做什么，数据范围决定能看到哪些记录。',
          'Menus decide which pages open, action permissions what can be done, and data scope which records appear.',
        ),
      ],
      [
        t('销售只看自己的客户', 'Reps see only their own customers'),
        t(
          '给销售角色的客户表查看权限设置数据范围「负责人 = 当前用户」，主管角色设置为「所在部门」。',
          'Set the sales role\'s view scope on customers to "owner = current user" and the manager role\'s to "my department".',
        ),
      ],
      [
        t('用户有多个角色时', 'Users with several roles'),
        t(
          '多个角色的权限取并集；需要严格隔离时，让用户切换角色而不是同时拥有。',
          'Permissions from several roles add up; for strict separation, let users switch roles instead of holding them together.',
        ),
      ],
    ],
    weight: 4,
    published: 630,
    updated: 9,
    links: ['/docs/permissions/data-scope', '/docs/permissions/faq'],
  },
  {
    path: '/docs/permissions/data-scope',
    title: t('数据范围', 'Data scope'),
    description: t(
      '用条件限制角色可以查看和修改的记录：当前用户、所在部门、创建人，以及关系字段上的条件都可以组合，适合按负责人或区域隔离数据。',
      'Limit the records a role views and edits with conditions, including conditions on relations.',
    ),
    sections: [
      [
        t('常用条件', 'Common conditions'),
        t(
          '当前用户、当前用户所在部门、创建人，以及关系字段的任意条件都可以组合使用。',
          "Current user, current user's department, creator and any condition on relations combine freely.",
        ),
      ],
    ],
    weight: 1.6,
    published: 410,
    updated: 9,
  },
  {
    path: '/docs/permissions/faq',
    title: t('权限常见问题', 'Permission FAQ'),
    description: t(
      '权限常见问题汇总：为什么配置了权限仍然能看到数据，多个角色叠加时如何生效，以及修改权限后需要重新登录或切换角色才能看到变化。',
      'Why can someone still see data after you set permissions? Common mix-ups about combined roles, inheritance and caching.',
    ),
    sections: [
      [
        t('改了权限没生效', 'A change did not apply'),
        t(
          '用户需要重新登录或切换角色才能拿到新的权限快照。',
          'The user needs to sign in again or switch roles to get the new permission snapshot.',
        ),
      ],
    ],
    weight: 0.7,
    published: 16,
    index: 'crawled',
  },
  {
    path: '/docs/workflows',
    title: t('工作流概览', 'Workflows overview'),
    description: t(
      '工作流把重复操作自动化：了解数据表事件、定时任务、操作后事件和审批四种触发方式，常用节点，以及如何通过执行记录定位失败的节点。',
      'Triggers, nodes and executions: automate repeated work with workflows.',
    ),
    sections: [
      [
        t('触发方式', 'Triggers'),
        t(
          '数据表事件、定时任务、操作后事件和审批是最常用的四种触发方式。',
          'Collection events, schedules, post-action events and approvals are the four most used triggers.',
        ),
      ],
      [
        t('执行记录', 'Executions'),
        t(
          '每次执行都会保留节点输入输出，排查问题时先看失败的节点。',
          "Every execution keeps each node's input and output; start troubleshooting at the failed node.",
        ),
      ],
    ],
    weight: 3.6,
    published: 600,
    updated: 12,
    links: ['/docs/workflow/approval', '/docs/workflow/triggers'],
  },
  {
    path: '/docs/workflow/approval',
    title: t('审批', 'Approvals'),
    description: t(
      '配置审批流程：选择审批人、设置会签或或签、退回到发起人后允许修改哪些字段、重新提交从哪一步开始，以及休假时如何代理审批。',
      'Approvers, return and resubmit, all-or-any sign-off, and who may edit data during approval.',
    ),
    sections: [
      [
        t('退回后能改什么', 'What can change after a return'),
        t(
          '退回到发起人时，可以在审批配置里指定允许修改的字段，重新提交后从第一个审批节点开始。',
          'When returned to the requester, the approval settings list the fields that may change; resubmitting starts again at the first approver.',
        ),
      ],
      [
        t('代理审批', 'Delegation'),
        t(
          '审批人可以转交给他人，转交记录会出现在审批历史里。',
          'Approvers can hand a task to someone else; the handover appears in the approval history.',
        ),
      ],
    ],
    weight: 2.4,
    published: 380,
    updated: 40,
    links: ['/solutions/purchase-approval', '/commercial-plugins'],
  },
  {
    path: '/docs/workflow/triggers',
    title: t('工作流触发器', 'Workflow triggers'),
    description: t(
      '逐一说明每种工作流触发器的触发时机、可用变量和注意事项，例如限定只在某些字段变化时触发，避免更新记录的工作流反复触发自己。',
      'When each trigger fires, the variables it offers and what to watch for.',
    ),
    sections: [
      [
        t('数据表事件', 'Collection events'),
        t(
          '新增、更新或删除后触发；可以限定只有某些字段变化时才触发，避免循环。',
          'Fires after create, update or delete; restrict it to changes in certain fields to avoid loops.',
        ),
      ],
    ],
    weight: 1.2,
    published: 370,
    updated: 140,
    links: ['/docs/workflow/loops-old'],
    flags: ['broken-link'],
  },
  {
    path: '/docs/reporting',
    title: t('图表与报表', 'Charts and reports'),
    description: t(
      '用图表区块汇总业务数据：选择度量和维度、设置筛选和时间范围，用一个筛选区块联动多张图表，并让同一张图表比较本周与上周。',
      'Summarize data with chart blocks: choose measures and dimensions, set filters and date ranges.',
    ),
    sections: [
      [
        t('添加图表', 'Add a chart'),
        t(
          '在页面中添加图表区块，选择数据表，拖入度量和维度，预览后保存。',
          'Add a chart block, choose a collection, drag in measures and dimensions, preview and save.',
        ),
      ],
      [
        t('时间对比', 'Period comparison'),
        t(
          '筛选区块可以联动多个图表，时间范围变量让同一张图表比较本周与上周。',
          'A filter block drives several charts; date range variables let one chart compare this week with last.',
        ),
      ],
    ],
    weight: 2,
    published: 450,
    updated: 12,
    flags: ['missing-alt'],
  },
  {
    path: '/docs/api',
    title: t('HTTP API 概览', 'HTTP API overview'),
    description: t(
      'NocoBase HTTP API 概览：资源与操作的 URL 规则、关系资源的写法、用 API 密钥或用户令牌认证，以及列表接口常用的筛选、排序和分页参数。',
      'URL rules for resources and actions, authentication and common parameters.',
    ),
    sections: [
      [
        t('URL 规则', 'URL rules'),
        t(
          '/api/<资源>:<操作>，例如 /api/customers:list；关系资源写作 /api/customers/1/contacts:list。',
          '/api/<resource>:<action>, for example /api/customers:list; relations read /api/customers/1/contacts:list.',
        ),
      ],
      [
        t('认证', 'Authentication'),
        t(
          '在请求头里带上 API 密钥或用户令牌，接口按令牌所属角色检查权限。',
          "Send an API key or user token in the header; each call is checked against the token's role.",
        ),
      ],
    ],
    weight: 2.2,
    published: 520,
    updated: 80,
    links: ['/docs/api/pagination', '/docs/api/authentication'],
  },
  {
    path: '/docs/api/pagination',
    title: t('列表接口的分页与筛选', 'Paging and filtering list endpoints'),
    description: t(
      '列表接口为什么默认只返回 20 条：page、pageSize、filter 和 sort 参数的用法，以及按 meta.totalPage 逐页读取全部数据的方法。',
      'The page, pageSize, filter and sort parameters, and why only 20 records come back by default.',
    ),
    sections: [
      [
        t('默认分页', 'Default paging'),
        t(
          '列表接口默认 pageSize 为 20；读取全部数据时按 meta.totalPage 逐页请求。',
          'List endpoints default to pageSize 20; read everything by requesting each page up to meta.totalPage.',
        ),
      ],
    ],
    weight: 1.1,
    published: 300,
    updated: 150,
    flags: ['thin'],
  },
  {
    path: '/docs/api/authentication',
    title: t('API 密钥与认证', 'API keys and authentication'),
    description: t(
      '创建 API 密钥并为它选择合适的角色、设置过期时间，在脚本和集成里调用接口；密钥继承角色权限，建议为集成单独建一个最小权限角色。',
      'Create an API key, pick its role, set an expiry and use it from scripts.',
    ),
    sections: [
      [
        t('选择合适的角色', 'Pick the right role'),
        t(
          '密钥继承所选角色的权限，集成脚本应使用只包含必要权限的专用角色。',
          "A key carries its role's permissions; integrations should use a dedicated role with only what they need.",
        ),
      ],
    ],
    weight: 1,
    published: 290,
    updated: 95,
  },
  {
    path: '/docs/plugins/development',
    title: t('插件开发入门', 'Writing your first plugin'),
    description: t(
      '插件开发入门：用命令创建插件，注册数据表和接口，在前端添加自定义区块，最后打包成压缩包，在插件管理器里上传安装和升级。',
      'Create a plugin, register collections and endpoints, add a frontend block, then build and publish.',
    ),
    sections: [
      [
        t('创建插件', 'Create the plugin'),
        t(
          'yarn pm create @my/plugin-hello 会生成服务端和客户端入口。',
          'yarn pm create @my/plugin-hello generates the server and client entry points.',
        ),
      ],
      [
        t('打包', 'Build'),
        t(
          'yarn build @my/plugin-hello --tar 生成可以在插件管理器上传的压缩包。',
          'yarn build @my/plugin-hello --tar makes an archive the plugin manager can upload.',
        ),
      ],
    ],
    weight: 1.9,
    published: 500,
    updated: 60,
  },
  {
    path: '/docs/ai-employees',
    title: t('AI 员工', 'AI employees'),
    description: t(
      '让 AI 员工读取页面上下文、填写表单、整理数据，并在工作流里调用大模型；AI 员工以当前用户身份读取数据，看不到无权访问的记录。',
      'Let AI employees read page context, fill forms, tidy data and call models inside workflows.',
    ),
    sections: [
      [
        t('配置模型服务', 'Configure a model service'),
        t(
          '先在设置里添加模型服务和密钥，再为每个 AI 员工选择模型与可用技能。',
          'Add a model service and key in settings, then give each AI employee a model and its skills.',
        ),
      ],
      [
        t('数据权限', 'Data permissions'),
        t(
          'AI 员工以当前用户的身份读取数据，看不到用户无权访问的记录。',
          'AI employees read data as the current user and never see records the user cannot access.',
        ),
      ],
    ],
    weight: 2.6,
    published: 120,
    updated: 25,
    changes: [{ kind: 'step', at: 25, to: 1.7, over: 10 }],
    links: ['/blog/ai-workflows'],
  },
  {
    path: '/docs/files',
    title: t('文件存储', 'File storage'),
    description: t(
      '配置文件存储：单机部署可以用本地存储，多副本部署需要 S3 兼容的对象存储；同时说明文件大小、类型限制和附件字段的常见用法。',
      'Local, S3-compatible and object storage, with size and type limits.',
    ),
    sections: [
      [
        t('选择存储', 'Choose storage'),
        t(
          '单机部署可以使用本地存储；多副本部署必须使用共享的对象存储。',
          'A single server can use local storage; several replicas must share object storage.',
        ),
      ],
    ],
    weight: 0.8,
    published: 470,
    updated: 200,
  },
  {
    path: '/docs/mobile',
    title: t('移动端', 'Mobile'),
    description: t(
      '为手机单独配置页面和底部导航，让外勤人员直接录入和查看数据；移动端页面与桌面端分开配置，但共用同一份数据、角色和权限。',
      'Configure separate phone pages and a tab bar so field staff can enter data directly.',
    ),
    sections: [
      [
        t('移动端页面', 'Mobile pages'),
        t(
          '移动端页面与桌面端分开配置，但共用同一份数据与权限。',
          'Mobile pages are configured apart from desktop ones but share the same data and permissions.',
        ),
      ],
    ],
    weight: 0.9,
    published: 330,
    updated: 110,
  },
  {
    path: '/docs/sso',
    title: t('单点登录', 'Single sign-on'),
    description: t(
      '通过 OIDC、SAML 或 LDAP 接入企业账号体系，实现单点登录；说明各协议的适用场景、字段映射，以及常见身份提供商的配置要点。',
      'Connect company accounts through OIDC, SAML or LDAP.',
    ),
    sections: [
      [
        t('选择协议', 'Choose a protocol'),
        t(
          '大多数身份提供商支持 OIDC；只有 Active Directory 时可以用 LDAP。',
          'Most identity providers support OIDC; use LDAP when only Active Directory is available.',
        ),
      ],
    ],
    weight: 0.7,
    published: 350,
    updated: 160,
  },
  {
    path: '/guides/customer-import',
    title: t('从 Excel 迁移客户数据', 'Moving customer data from Excel'),
    description: t(
      '从 Excel 迁移客户数据：导入前规范化电话和公司名称、准备唯一编号，先用三十行试导入并预览重复记录，再分批导入并保留回滚方案。',
      'Normalize phones and company names, preview duplicates, import in batches and keep a way back.',
    ),
    sections: [
      [
        t('先清理', 'Clean first'),
        t(
          '统一电话格式，合并公司简称，给每一行准备唯一的客户编号。',
          'Standardize phone formats, merge company short names and give every row a unique customer number.',
        ),
      ],
      [
        t('分批导入', 'Import in batches'),
        t(
          '先导入 30 行试跑，核对关联的联系人与订单，再导入其余数据。导入细节见导入数据文档。',
          'Try 30 rows first, check the linked contacts and orders, then import the rest. See the data import docs for details.',
        ),
      ],
    ],
    weight: 1.4,
    published: 200,
    updated: 31,
    links: ['/docs/import-data', '/docs/data-modeling/relations'],
    flags: ['broken-link'],
  },
  {
    path: '/guides/backup-restore',
    title: t('备份与恢复', 'Backup and restore'),
    description: t(
      '定时备份数据库、storage 附件目录和环境变量文件，并每季度在独立环境做一次恢复演练，抽查带附件的记录、记录恢复耗时与失败处理。',
      'Back up the database and attachments on a schedule and rehearse restores in a test environment.',
    ),
    sections: [
      [
        t('备份什么', 'What to back up'),
        t(
          '数据库、storage 目录和环境变量文件缺一不可，只备份数据库会丢失附件。',
          'The database, the storage directory and the environment file — back up only the database and attachments are lost.',
        ),
      ],
      [
        t('恢复演练', 'Rehearse restores'),
        t(
          '每季度在独立环境恢复一次，抽查三条带附件的记录并记录耗时。',
          'Restore in a separate environment every quarter, spot-check three records with attachments and time it.',
        ),
      ],
    ],
    weight: 1.3,
    published: 260,
    updated: 74,
  },
  {
    path: '/guides/production-checklist',
    title: t('生产环境上线清单', 'Production launch checklist'),
    description: t(
      '生产环境上线前的检查清单：更换默认 APP_KEY 和管理员密码，确认数据库备份，配置反向代理、持久化日志和健康检查，关闭不需要的注册。',
      'Check APP_KEY, database backups, reverse proxy, logs and monitoring before launch.',
    ),
    sections: [
      [
        t('安全', 'Security'),
        t(
          '更换默认 APP_KEY 和管理员密码，关闭不需要的注册入口。',
          'Change the default APP_KEY and administrator password and close sign-up if you do not need it.',
        ),
      ],
      [
        t('可观测性', 'Observability'),
        t(
          '把应用日志写到持久目录，并为 13000 端口配置健康检查。',
          'Write application logs to a persistent directory and add a health check on port 13000.',
        ),
      ],
    ],
    weight: 0.9,
    published: 5,
    changes: [{ kind: 'launch', at: 5, ramp: 10 }],
    index: 'discovered',
  },
  {
    path: '/tutorials/first-app',
    title: t('十分钟搭建第一个应用', 'Build your first app in ten minutes'),
    description: t(
      '跟着视频完成三个十分钟的练习：用示例数据创建客户表，添加带必填项的录入表单，再新建销售角色并用另一个账号验证只看到自己的客户。',
      'Follow the video through three exercises: a customer table, an entry form and role permissions.',
    ),
    sections: [
      [
        t('练习一：客户表', 'Exercise 1: the customer table'),
        t(
          '用示例数据创建客户表，确认表格里能看到 12 条记录。',
          'Create the customer collection from sample data and check that the table shows 12 records.',
        ),
      ],
      [
        t('练习二：录入表单', 'Exercise 2: the entry form'),
        t(
          '添加新增表单并设置必填项，保存一条新客户。',
          'Add a create form, mark the required fields and save a new customer.',
        ),
      ],
      [
        t('练习三：角色权限', 'Exercise 3: role permissions'),
        t(
          '新建销售角色，用另一个账号登录验证只能看到自己的客户。',
          'Create a sales role and sign in with another account to check that it sees only its own customers.',
        ),
      ],
    ],
    weight: 2.4,
    published: 330,
    updated: 58,
    links: ['/docs/getting-started', '/docs/permissions'],
  },
  {
    path: '/tutorials/ticketing',
    title: t('搭建售后工单系统', 'Build an after-sales ticketing system'),
    description: t(
      '用工单、客户、设备三张表搭建售后工单系统，配置按区域自动分派给值班工程师的工作流，并在工单四小时未处理时自动提醒主管。',
      'Tickets, customers and devices, plus assignment rules and overdue reminders.',
    ),
    sections: [
      [
        t('分派规则', 'Assignment rules'),
        t(
          '用工作流按区域把新工单分配给值班工程师，并在 4 小时未处理时提醒主管。',
          'A workflow assigns new tickets to the on-duty engineer by region and alerts a manager after four idle hours.',
        ),
      ],
    ],
    weight: 1,
    published: 150,
    updated: 44,
  },
  {
    path: '/solutions/crm',
    title: t('用 NocoBase 自建 CRM', 'Build your own CRM with NocoBase'),
    description: t(
      '用 NocoBase 自建 CRM：客户、联系人、商机与跟进记录的数据模型，用看板管理销售漏斗、用图表统计各阶段金额，以及从模板试用到上线的步骤。',
      'A data model for accounts, contacts, deals and activities, and the steps from trial to launch.',
    ),
    sections: [
      [
        t('数据模型', 'The data model'),
        t(
          '客户一对多联系人与商机，商机一对多跟进记录，负责人关联用户。',
          'An account has many contacts and deals, a deal has many activities, and owners link to users.',
        ),
      ],
      [
        t('销售漏斗', 'The sales funnel'),
        t(
          '用看板区块按阶段展示商机，图表区块统计各阶段金额。',
          'A kanban block shows deals by stage, and a chart block sums the amount in each stage.',
        ),
      ],
      [
        t('从模板开始', 'Start from the template'),
        t(
          '导入 CRM 模板后替换示例数据，再按团队流程调整阶段和字段。',
          'Import the CRM template, replace the sample data, then adjust stages and fields to your process.',
        ),
      ],
    ],
    weight: 2.6,
    published: 280,
    updated: 20,
    changes: [{ kind: 'step', at: 20, to: 1.45, over: 8 }],
    links: ['/templates/crm', '/blog/self-hosted-crm', '/docs/permissions'],
  },
  {
    path: '/solutions/purchase-approval',
    title: t('采购审批', 'Purchase approval'),
    description: t(
      '一个完整的采购审批示例：金额分级审批、财务复核，退回后申请人只能修改金额和说明，重新提交从部门主管开始，每一步都标注操作人。',
      'Request, approve, return and resubmit: a complete purchase approval example.',
    ),
    sections: [
      [
        t('流程', 'The process'),
        t(
          '金额小于 5000 元由部门主管审批，超过时增加财务审批。',
          'Under 5,000 the department head approves; above it, finance approves as well.',
        ),
      ],
      [
        t('退回与重提', 'Return and resubmit'),
        t(
          '退回后申请人只能修改金额和说明，重新提交从部门主管开始。',
          'After a return the requester may change only the amount and notes, and resubmission starts with the department head.',
        ),
      ],
    ],
    weight: 1.2,
    published: 240,
    updated: 40,
    links: ['/docs/workflow/approval'],
  },
  {
    path: '/solutions/project-management',
    title: t('项目管理', 'Project management'),
    description: t(
      '用项目、任务、工时和里程碑四张表管理项目进度，在甘特图上拖动调整任务日期，用看板跟踪状态，并按成员统计每周投入的工时。',
      'Projects, tasks, time entries and milestones, tracked with Gantt and kanban views.',
    ),
    sections: [
      [
        t('甘特图', 'Gantt'),
        t(
          '任务的开始与结束日期直接在甘特图上拖动调整。',
          "Drag a task's start and end dates directly on the Gantt chart.",
        ),
      ],
    ],
    weight: 1,
    published: 230,
    updated: 100,
  },
  {
    path: '/solutions/inventory',
    title: t('进销存管理', 'Inventory management'),
    description: t(
      '搭建进销存管理：商品、仓库和出入库单的数据结构，出库后由工作流检查库存，低于安全库存时自动通知采购，并按仓库汇总库存。',
      'Products, warehouses, stock movements and low-stock alerts.',
    ),
    sections: [
      [
        t('库存预警', 'Low-stock alerts'),
        t(
          '出库后用工作流检查库存，低于安全库存时通知采购。',
          'After each shipment a workflow checks stock and alerts purchasing below the safety level.',
        ),
      ],
    ],
    weight: 0.9,
    published: 210,
    updated: 130,
  },
  {
    path: '/templates/crm',
    title: t('CRM 模板', 'CRM template'),
    description: t(
      '一键导入的 CRM 应用模板：包含客户、商机、报价和跟进记录等 12 张数据表、6 个页面、3 个角色和 2 条工作流，并附带示例数据。',
      'A CRM application to import in one step: accounts, deals, quotes and activities.',
    ),
    sections: [
      [
        t('包含内容', "What's inside"),
        t(
          '12 张数据表、6 个页面、3 个角色和 2 条工作流，附带示例数据。',
          '12 collections, 6 pages, 3 roles and 2 workflows, with sample data.',
        ),
      ],
    ],
    weight: 0.8,
    published: 90,
    updated: 2,
  },
  {
    path: '/templates/customer-success',
    title: t('客户成功模板', 'Customer success template'),
    description: t(
      '一键导入的 CRM 应用模板：包含客户、商机、报价和跟进记录等 12 张数据表、6 个页面、3 个角色和 2 条工作流，并附带示例数据。',
      'A CRM application to import in one step: accounts, deals, quotes and activities.',
    ),
    sections: [
      [
        t('包含内容', "What's inside"),
        t('客户、续约与健康度评分。', 'Accounts, renewals and health scores.'),
      ],
    ],
    weight: 0.3,
    published: 85,
    index: 'duplicate',
    canonical: '/templates/crm',
  },
  {
    path: '/blog/release-v2',
    title: t('NocoBase 2.0 正式发布', 'NocoBase 2.0 is here'),
    description: t(
      'NocoBase 2.0 正式发布：新的页面引擎让大表格渲染快约三倍，新增 AI 员工，工作流执行更快；文中列出从 1.x 升级时需要检查的事项。',
      'A new page engine, AI employees, faster workflows, and what to know when upgrading from 1.x.',
    ),
    sections: [
      [
        t('新的页面引擎', 'A new page engine'),
        t(
          '区块可以自由组合和嵌套，大表格的渲染速度提升约三倍。',
          'Blocks combine and nest freely, and large tables render about three times faster.',
        ),
      ],
      [
        t('从 1.x 升级', 'Upgrading from 1.x'),
        t(
          '先在测试环境升级并检查自定义插件，数据结构无需迁移。',
          'Upgrade a test environment first and check custom plugins; the data structure needs no migration.',
        ),
      ],
    ],
    weight: 2,
    published: 18,
    changes: [
      { kind: 'launch', at: 18, ramp: 1 },
      { kind: 'spike', at: 18, size: 6, halfLife: 2 },
    ],
    links: ['/docs/installation/upgrade', '/docs/ai-employees', '/changelog'],
  },
  {
    path: '/blog/ai-workflows',
    title: t(
      '在工作流里调用 AI：三个真实例子',
      'Calling AI from workflows: three real examples',
    ),
    description: t(
      '三个在工作流里调用 AI 的真实例子：新工单自动分类和判断紧急程度、从邮件正文提取订单、为周报生成摘要，每一步都保留人工确认。',
      'Classifying tickets, extracting orders from email and summarizing weekly reports.',
    ),
    sections: [
      [
        t('自动分类工单', 'Classifying tickets'),
        t(
          '新工单创建后调用模型判断类别和紧急程度，人工确认后再分派。',
          'A model labels each new ticket with a category and urgency, and a person confirms before it is assigned.',
        ),
      ],
      [
        t('从邮件提取订单', 'Orders from email'),
        t(
          '把邮件正文交给模型提取客户、产品和数量，生成待确认的订单。',
          'The model pulls customer, product and quantity from an email and drafts an order to confirm.',
        ),
      ],
    ],
    weight: 1.6,
    published: 11,
    changes: [
      { kind: 'launch', at: 11, ramp: 1 },
      { kind: 'spike', at: 9, size: 9, halfLife: 1.2 },
    ],
    links: ['/docs/ai-employees', '/docs/workflows'],
  },
  {
    path: '/blog/low-code',
    title: t('什么是低代码？', 'What is low-code?'),
    description: t(
      '什么是低代码？对比低代码与无代码的区别：无代码面向业务人员，低代码在可视化之外保留写代码的扩展点，以及它们各自适合解决的问题。',
      'How low-code differs from no-code, and the problems each suits.',
    ),
    sections: [
      [
        t('低代码与无代码', 'Low-code and no-code'),
        t(
          '无代码面向业务人员，低代码在可视化之外保留写代码的扩展点。',
          'No-code serves business people; low-code keeps places to write code beyond the visual tools.',
        ),
      ],
    ],
    weight: 1.2,
    published: 700,
    updated: 400,
    changes: [{ kind: 'step', at: 45, to: 0.68, over: 20 }],
  },
  {
    path: '/blog/what-is-no-code',
    title: t('无代码平台入门', 'An introduction to no-code platforms'),
    description: t(
      '无代码平台入门：无代码平台能做什么、不能做什么，适合结构化数据、明确流程和中等规模团队的场景，以及挑选平台时要比较的关键能力。',
      'What no-code platforms can and cannot do, and how to choose one.',
    ),
    sections: [
      [
        t('适合的场景', 'Where it fits'),
        t(
          '结构化数据、明确的流程和中等规模的团队最适合无代码。',
          'Structured data, clear processes and mid-sized teams suit no-code best.',
        ),
      ],
    ],
    weight: 0.8,
    published: 520,
    updated: 380,
    flags: ['two-h1'],
  },
  {
    path: '/blog/nocobase-vs-spreadsheets',
    title: t(
      '什么时候该把共享表格换成真正的业务系统：五个信号与一份迁移前检查清单',
      'When should a team replace its shared spreadsheets with a real business system? Five signals and a pre-migration checklist',
    ),
    description: t(
      '多人同时编辑冲突、权限无法细分、同一张表有好几个版本、公式经常被误改……出现这五个信号，就该考虑把共享表格迁移到业务系统了。',
      'Edit conflicts, permissions you cannot split, duplicated data: the signals that it is time to move.',
    ),
    sections: [
      [
        t('五个信号', 'Five signals'),
        t(
          '同一张表有三个以上版本；需要按人隐藏行；公式经常被误改；需要审批；需要和其他系统同步。',
          'Three or more copies of one sheet; rows to hide per person; formulas often broken; approvals; syncing with other systems.',
        ),
      ],
    ],
    weight: 1,
    published: 75,
    updated: 30,
    links: ['/guides/customer-import'],
  },
  {
    path: '/blog/template-onboarding',
    title: t('新版模板上手体验', 'The new templates, hands on'),
    description: t(
      '导入新版模板后的前三十分钟该做什么：先删除示例数据再导入自己的数据，按团队岗位调整角色和权限，最后邀请同事一起试用并收集反馈。',
      'The first thirty minutes after importing a template: replace sample data, adjust roles, invite colleagues.',
    ),
    sections: [
      [
        t('替换示例数据', 'Replace the sample data'),
        t(
          '先删除示例客户，再用导入功能放入自己的数据。',
          'Delete the sample accounts first, then import your own data.',
        ),
      ],
    ],
    weight: 0.6,
    published: 60,
    updated: 58,
  },
  {
    path: '/blog/workflow-checklist',
    title: t(
      '自动化上线前的检查清单',
      'A checklist before automations go live',
    ),
    description: t(
      '自动化工作流上线前的检查清单：触发条件是否会循环、失败时如何处理和重试、通知发给谁、执行记录保留多久，以及上线后如何观察效果。',
      'Trigger conditions, failure handling, who gets notified and how long executions are kept.',
    ),
    sections: [
      [
        t('避免循环触发', 'Avoid trigger loops'),
        t(
          '更新记录的工作流要限定触发字段，否则会反复触发自己。',
          'A workflow that updates records must restrict its trigger fields or it will keep firing itself.',
        ),
      ],
    ],
    weight: 0.7,
    published: 100,
    updated: 95,
  },
  {
    path: '/blog/self-hosted-crm',
    title: t(
      '自建 CRM 前要回答的五个问题',
      'Five questions before building your own CRM',
    ),
    description: t(
      '自建 CRM 之前先回答五个问题：谁来维护、数据从哪里来、权限怎么按岗位划分、如何与邮件和电话集成，以及怎样才算上线成功。',
      'Who maintains it, where data comes from, how permissions split, how it meets email and phone, and what success looks like.',
    ),
    sections: [
      [
        t('谁来维护', 'Who maintains it'),
        t(
          '指定一位熟悉业务的负责人，每月整理一次字段和流程的修改需求。',
          'Name an owner who knows the business and gathers field and process changes once a month.',
        ),
      ],
      [
        t('权限怎么分', 'How permissions split'),
        t(
          '先按岗位列出谁能看、谁能改，再落到角色和数据范围。',
          'List who may see and who may change what by job, then turn it into roles and data scopes.',
        ),
      ],
    ],
    weight: 1.1,
    published: 6,
    changes: [{ kind: 'launch', at: 6, ramp: 6 }],
    links: ['/solutions/crm', '/templates/crm'],
  },
  {
    path: '/blog/permission-design',
    title: t(
      '设计权限的三条原则',
      'Three principles for designing permissions',
    ),
    description: t(
      '设计权限的三条原则：只授予完成工作所需的最小权限，按岗位而不是按人建角色，并定期复核权限分配，人员变动时只需调整角色。',
      'Least privilege, roles by job rather than by person, and regular reviews.',
    ),
    sections: [
      [
        t('按岗位而不是按人', 'By job, not by person'),
        t(
          '为每个岗位建一个角色，人员变动时只需调整角色分配。',
          'One role per job, so staff changes only move role assignments.',
        ),
      ],
    ],
    weight: 0.7,
    published: 140,
    updated: 9,
    links: ['/docs/permissions'],
  },
  {
    path: '/changelog',
    title: t('更新日志', 'Changelog'),
    description: t(
      'NocoBase 每个版本的更新日志：新功能、改进和问题修复按版本列出，包括审批退回保留附件、大表格虚拟滚动、工作流节点超时等最新变化。',
      'New features, improvements and fixes in every release.',
    ),
    sections: [
      [
        t('v2.0.3', 'v2.0.3'),
        t(
          '修复审批退回后附件丢失的问题，改进大表格的滚动性能。',
          'Fixed attachments lost after an approval return; smoother scrolling in large tables.',
        ),
      ],
      [
        t('v2.0.2', 'v2.0.2'),
        t(
          '工作流 HTTP 节点支持超时设置；修复移动端日期选择器。',
          'Workflow HTTP nodes get a timeout; fixed the mobile date picker.',
        ),
      ],
    ],
    weight: 1.3,
    published: 600,
    updated: 3,
  },
  {
    path: '/community/approval-roles',
    title: t(
      '社区精选：多角色审批怎么配置',
      'Community picks: approvals with several roles',
    ),
    description: t(
      '社区精选的多角色审批配置：审批人选择发起人的部门主管，部门没有主管时转给上级部门，休假期间开启代理审批，以及离职时的待办交接。',
      'Verified setups for department heads, delegation and staff leaving.',
    ),
    sections: [
      [
        t('部门主管审批', 'Department head approval'),
        t(
          '审批人选择「发起人的部门主管」，部门没有主管时转给上级部门。',
          'Choose "requester\'s department head" as approver; when a department has none, it goes to the parent department.',
        ),
      ],
    ],
    weight: 0.5,
    published: 40,
    updated: 14,
  },
  {
    path: '/compare/airtable',
    title: t('NocoBase 与 Airtable 对比', 'NocoBase vs Airtable'),
    description: t(
      'NocoBase 与 Airtable 的对比：私有部署与云端托管、字段和记录级权限、记录数量限制、扩展方式和成本，帮助你判断哪种方式适合团队。',
      'How self-hosting, permission granularity, record limits and extensibility differ.',
    ),
    sections: [
      [
        t('部署', 'Deployment'),
        t(
          'NocoBase 可以部署在自己的服务器上，数据不出内网。',
          'NocoBase runs on your own servers, so data stays inside your network.',
        ),
      ],
      [
        t('权限', 'Permissions'),
        t(
          '支持字段级和记录级权限，适合多部门共用一套数据。',
          'Field- and record-level permissions suit several departments sharing one dataset.',
        ),
      ],
    ],
    weight: 1,
    published: 260,
    updated: 120,
    flags: ['no-h1'],
  },
  {
    path: '/compare/retool',
    title: t('NocoBase 与 Retool 对比', 'NocoBase vs Retool'),
    description: t(
      'NocoBase 与 Retool 的对比：一个从数据模型出发生成界面，一个从界面和查询出发组装工具，两种方式在维护成本和适用团队上的差异。',
      'Data model first or interface first, and the teams each approach suits.',
    ),
    sections: [
      [
        t('出发点不同', 'Different starting points'),
        t(
          'Retool 从界面和查询开始，NocoBase 从数据模型开始，界面基于数据生成。',
          'Retool starts from screens and queries; NocoBase starts from the data model and builds screens on it.',
        ),
      ],
    ],
    weight: 0.8,
    published: 240,
    updated: 150,
  },
  {
    path: '/integrations',
    title: t('集成', 'Integrations'),
    description: t(
      'NocoBase 的集成方式：工作流可以把通知发到企业微信、钉钉、飞书、Slack 和邮件，也可以通过 Webhook 和 HTTP 节点与外部系统同步数据。',
      'Send workflow notifications to WeCom, DingTalk, Lark, Slack and email, and sync with other systems through webhooks.',
    ),
    sections: [
      [
        t('通知渠道', 'Notification channels'),
        t(
          '工作流可以把通知发送到即时通讯工具、邮件或站内信。',
          'Workflows send notifications to chat tools, email or the in-app inbox.',
        ),
      ],
    ],
    weight: 0.6,
    published: 300,
    updated: 90,
    flags: ['missing-alt'],
  },
  {
    path: '/security',
    title: t('安全', 'Security'),
    description: t('安全与合规说明。', 'Security and compliance.'),
    sections: [
      [
        t('漏洞报告', 'Reporting a vulnerability'),
        t('请发送邮件给安全团队。', 'Please email the security team.'),
      ],
    ],
    weight: 0.4,
    published: 500,
    flags: ['thin'],
  },
  {
    path: '/legacy/v1-docs',
    title: t('1.x 文档（已归档）', '1.x documentation (archived)'),
    description: t(
      'NocoBase 1.x 版本的旧文档入口，内容已停止更新，仅供仍在使用 1.x 的团队查阅；新项目请直接参考 2.0 文档，并尽快完成升级。',
      'The old documentation, kept for teams still on 1.x.',
    ),
    sections: [
      [
        t('已归档', 'Archived'),
        t(
          '1.x 文档不再更新，请尽快升级到 2.0。',
          'The 1.x docs are no longer updated; please upgrade to 2.0.',
        ),
      ],
    ],
    weight: 0.1,
    published: 900,
    index: 'noindex',
    flags: ['noindex'],
  },
];

export const MAIN_SITE: Site = {
  name: 'NocoBase',
  domain: 'nocobase.example',
  tagline: t(
    '数据模型驱动的开源无代码平台',
    'The open-source, data-model-driven no-code platform',
  ),
  sessions: { zh: 1800, en: 1900 },
  pages,
  missing: ['/docs/import-data', '/docs/workflow/loops-old'],
};
