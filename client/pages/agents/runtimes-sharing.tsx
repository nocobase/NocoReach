import { $t } from '#i18n';
import { PageContainer } from '#components/reach/page';

// Under Settings › Runtimes: whose tasks a computer runs, and what sharing it with the team gives away (2026-10-21 user
// decision: say plainly whether others can use my local agent).
export function RuntimesSharing() {
  return (
    <PageContainer className='pt-0 md:pt-0'>
      <section
        aria-label={$t('runtimesPage.sharing')}
        className='rounded-lg bg-muted/50 px-4 py-3 text-sm'
      >
        <h2 className='font-medium'>{$t('runtimesPage.sharing')}</h2>
        <ul className='mt-1 flex flex-col gap-1 text-muted-foreground'>
          <li>{$t('runtimesPage.owner')}</li>
          <li>{$t('runtimesPage.team')}</li>
        </ul>
      </section>
    </PageContainer>
  );
}
