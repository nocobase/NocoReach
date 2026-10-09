import { envString, type AppConfigFactory } from '@nocobase/app-server/config';
import {
  defineAIConfig,
  type AIApplicationConfig,
} from '@nocobase/app-plugin-ai-employee/server/config';

const ai: AppConfigFactory<AIApplicationConfig> = defineAIConfig({
  // Map a secret onto the field of one service it sets, keyed by that
  // service's name, such as
  // `OPENAI_API_KEY: envString('llmServices.openai.options.apiKey')` or
  // `GITHUB_MCP_TOKEN: envString('mcpServers.github.headers.Authorization')`.
  //
  // NocoReach's online AI is the `deepseek` service config.example.yml declares (docs/PORT-PLAN.md: the classic
  // DeepSeek model). A deployment that cannot write config.yml, such as a Studio app, sets its key here.
  env: {
    DEEPSEEK_API_KEY: envString('llmServices.deepseek.options.apiKey', {
      description:
        'The DeepSeek API key of the deepseek service NocoReach’s online AI (Atlas, the daily analysis) calls.',
      secret: true,
      required: false,
    }),
  },
  defaults: () => ({
    storage: {},
    aiEmployee: { storage: {} },
    aiKnowledgeBase: {
      storage: {},
      vectorDatabases: [],
      manifests: [],
    },
    llmServices: {},
    skills: { paths: [] },
    mcpServers: {},
  }),
});

export default ai;
