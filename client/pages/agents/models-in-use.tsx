import { $t } from '#i18n';
import { PageContainer } from '#components/reach/page';
import {
  useOnlineResource,
  type Agent as OnlineAgent,
} from '../../online-agent/api.js';
import type { OnlineModel } from '../../../shared/online-agent.js';

type Catalog = {
  services: {
    name: string;
    title?: string;
    models: { value: string; label: string }[];
  }[];
  defaultModel?: OnlineModel | null;
};

const same = (
  a: OnlineModel | null | undefined,
  service: string,
  model: string,
) => Boolean(a && a.modelService === service && a.model === model);

// Under Agent › Model services: the plugin's table lists services with a model count, so the model named in Who does
// the work (deepseek-v4.1-flash) appeared nowhere here (2026-10-22 user report). Each chat model, its service and who
// uses it: Daily analysis runs on the default model, the chat panel on its own model or else the default.
export function ModelsInUse() {
  const catalog = useOnlineResource<Catalog>('models');
  const definitions = useOnlineResource<OnlineAgent[]>('definitions');
  const services = catalog.data?.services || [];
  const fallback = catalog.data?.defaultModel ?? null;
  const chat = (definitions.data || []).find((agent) => agent.enabled);
  const chatModel = chat?.model ?? fallback;
  const rows = services.flatMap((service) =>
    service.models.map((model) => {
      const users = [
        same(fallback, service.name, model.value)
          ? $t('agentRoles.analysis')
          : '',
        chat && same(chatModel, service.name, model.value)
          ? $t('agentRoles.chat')
          : '',
      ].filter(Boolean);
      return {
        key: `${service.name}/${model.value}`,
        model: model.label,
        service: service.title || service.name,
        users,
      };
    }),
  );
  if (!rows.length) return null;
  return (
    <PageContainer className='pt-0 md:pt-0'>
      <section
        aria-label={$t('modelsInUse.title')}
        className='rounded-lg bg-muted/50 px-4 py-3 text-sm'
      >
        <h2 className='font-medium'>{$t('modelsInUse.title')}</h2>
        <ul className='mt-1 flex flex-col gap-1 text-muted-foreground'>
          {rows.map((row) => (
            <li key={row.key}>
              <span className='text-foreground'>{row.model}</span>
              {` · ${row.service} · `}
              {row.users.length
                ? $t('modelsInUse.usedBy', {
                    0: row.users.join($t('modelsInUse.separator')),
                  })
                : $t('modelsInUse.unused')}
            </li>
          ))}
        </ul>
      </section>
    </PageContainer>
  );
}
