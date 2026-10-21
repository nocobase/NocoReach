import {
  $legacyText,
  $t,
  $tj,
  getCurrentLocale,
  useNocoReachLocale,
} from '#i18n';
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  FileTextIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
} from 'lucide-react';
import { confirmAction } from '#components/reach/confirm';
import { InfoTip } from '#components/reach/info-tip';
import {
  EmptyState,
  InlineError,
  ListSkeleton,
  LoadError,
} from '#components/reach/states';
import { Tag } from '#components/reach/tag';
import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { useBusinessAccess } from '#hooks/use-business-access';
import { toast } from '#lib/toast';
import { help } from '../glossary';
import {
  categoryName,
  day,
  getCategories,
  kindName,
  request,
  type Item,
  type ProjectKnowledgeContext,
} from './model';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';

// What the knowledge tab gives the drawer and the add dialog opened over it.
export type KnowledgeTabContext = ProjectKnowledgeContext & {
  /** Asks, deletes, reloads the list and puts focus on the search box; true when it was deleted. */
  remove: (item: Item) => Promise<boolean>;
};

// 知识库 tab: material the Agent looks up when it needs to. Search, category and date order live in the URL, so the
// drawer and the add dialog open over the same list and closing returns to it.
export default function KnowledgeTab(): ReactElement {
  useNocoReachLocale();
  const context = useOutletContext<ProjectKnowledgeContext>();
  const { project, items, itemsError, reloadItems } = context;
  const location = useLocation(),
    navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const category = params.get('category') ?? '',
    oldest = params.get('sort') === 'oldest';
  const searchRef = useRef<HTMLInputElement>(null);
  const { can: canSuggest } = useBusinessAccess(
      'nrKnowledgeAdd.suggest',
      project.id,
    ),
    { can: canConfirm } = useBusinessAccess(
      'nrKnowledgeAdd.confirm',
      project.id,
    ),
    { can: canRemove } = useBusinessAccess('nrKnowledge.remove', project.id);
  const canAdd = canSuggest && canConfirm;
  const setParam = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (items || []).filter(
      (i) =>
        (!category || i.category === category) &&
        (!needle || `${i.title} ${i.summary}`.toLowerCase().includes(needle)),
    );
    return oldest ? list.slice().reverse() : list;
  }, [items, q, category, oldest]);
  const remove = useCallback(
    async (item: Item) => {
      if (
        !(await confirmAction({
          title: () =>
            $t('projectKnowledge.deleteKnowledgeBase', { 0: item.title }),
          description: () => $t('projectKnowledge.laterTasksCannotReadAnymore'),
          action: 'common.delete',
        }))
      )
        return false;
      try {
        await request('remove', project.id, { itemId: item.id });
      } catch (e) {
        toast.error(() =>
          e instanceof Error
            ? $legacyText(e.message)
            : $t('common.notDeletedTryAgain'),
        );
        return false;
      }
      toast.success(() =>
        $t('projectKnowledge.deletedName', { 0: item.title }),
      );
      // The row and whatever opened the deletion are gone once the list is read again: focus goes to the search box
      // (guideline A6), after a drawer that opened the deletion has closed.
      void reloadItems().then(() =>
        requestAnimationFrame(() => searchRef.current?.focus()),
      );
      return true;
    },
    [project.id, reloadItems],
  );
  const tabContext = useMemo<KnowledgeTabContext>(
    () => ({ ...context, remove }),
    [context, remove],
  );
  const filtered = Boolean(q.trim() || category);
  const clearFilters = () => {
    setQ('');
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('q');
        next.delete('category');
        return next;
      },
      { replace: true },
    );
  };
  const open = (i: Item) =>
    void navigate({ pathname: i.id, search: location.search });
  const addLink = <Link to={{ pathname: 'new', search: location.search }} />;
  return (
    <div className='flex flex-col gap-4' data-knowledge-tab>
      <div className='flex flex-wrap items-center gap-2'>
        <label className='relative flex min-w-48 flex-1 items-center sm:max-w-72'>
          <SearchIcon
            className='pointer-events-none absolute left-2.5 size-4 text-muted-foreground'
            aria-hidden='true'
          />
          <input
            ref={searchRef}
            aria-label={$t('projectKnowledge.searchKnowledgeBase')}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setParam('q', e.target.value.trim());
            }}
            placeholder={$t('projectKnowledge.searchTitleSummary')}
            className='w-full pl-8!'
          />
        </label>
        <Select
          value={category || 'all'}
          onValueChange={(v) =>
            setParam('category', v === 'all' ? '' : String(v))
          }
        >
          <SelectTrigger
            className='w-full sm:w-40'
            aria-label={$t('projectKnowledge.filterCategory')}
          >
            <SelectValue>
              {(v: string) =>
                v === 'all'
                  ? $t('projectKnowledge.categories')
                  : (getCategories().find(([k]) => k === v)?.[1] ?? v)
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal'>
            <SelectItem value='all'>
              {$t('projectKnowledge.categories')}
            </SelectItem>
            {getCategories().map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtered ? (
          <Button size='sm' variant='ghost' onClick={clearFilters}>
            {$t('projectKnowledge.clearFilters')}
          </Button>
        ) : null}
        <InfoTip label={$t('projectKnowledge.whatKnowledgeBase')}>
          <p>{help($t('projectKnowledge.knowledgeBase'))}</p>
          <p>{$t('projectKnowledge.scopeHelp')}</p>
        </InfoTip>
        {/* An empty list offers adding in its empty state instead. */}
        {canAdd && items?.length ? (
          <Button className='ml-auto' nativeButton={false} render={addLink}>
            <PlusIcon />
            {$t('projectKnowledge.addMaterial')}
          </Button>
        ) : null}
      </div>
      {itemsError && !items ? (
        <LoadError
          title={$t('projectKnowledge.notLoadKnowledgeBase')}
          message={itemsError}
          onRetry={() => void reloadItems()}
        />
      ) : !items ? (
        <ListSkeleton rows={4} />
      ) : null}
      {items && itemsError ? (
        <InlineError
          action={
            <Button
              size='xs'
              variant='outline'
              className='ml-auto'
              onClick={() => void reloadItems()}
            >
              {$t('common.retry')}
            </Button>
          }
        >
          {itemsError}
        </InlineError>
      ) : null}
      {!items ? null : !items.length ? (
        <EmptyState
          icon={<FileTextIcon />}
          title={$t('projectKnowledge.noMaterialYet')}
          description={$t('projectKnowledge.noMaterialYetHelp')}
          action={
            canAdd ? (
              <Button nativeButton={false} render={addLink}>
                <PlusIcon />
                {$t('projectKnowledge.addMaterial')}
              </Button>
            ) : undefined
          }
        />
      ) : !visible.length ? (
        <div className='flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground'>
          <p>{$t('projectKnowledge.noMatchingMaterial')}</p>
          <Button size='sm' variant='outline' onClick={clearFilters}>
            {$t('projectKnowledge.clearFilters')}
          </Button>
        </div>
      ) : (
        <div className='relative overflow-x-auto rounded-lg border bg-card'>
          <table
            className='w-full table-fixed border-collapse text-sm sm:min-w-[40rem]'
            aria-label={$t('projectKnowledge.knowledgeBaseMaterial')}
          >
            <colgroup>
              <col />
              <col className='w-24' />
              <col className='hidden w-32 sm:table-column' />
              <col className='hidden w-24 sm:table-column' />
              <col className='w-12' />
            </colgroup>
            <thead className='text-xs text-muted-foreground'>
              <tr>
                <th className='px-3 py-2 text-left'>
                  {$t('projectKnowledge.titleSummary')}
                </th>
                <th className='px-3 py-2 text-left'>{$t('common.category')}</th>
                <th className='hidden px-3 py-2 text-left sm:table-cell'>
                  {$t('common.type')}
                </th>
                <th
                  className='hidden px-3 py-2 text-left sm:table-cell'
                  aria-sort={oldest ? 'ascending' : 'descending'}
                >
                  <button
                    type='button'
                    className='inline-flex items-center gap-1'
                    onClick={() => setParam('sort', oldest ? '' : 'oldest')}
                  >
                    {$t('projectKnowledge.added')}
                    {oldest ? (
                      <ArrowUpIcon className='size-3.5' aria-hidden='true' />
                    ) : (
                      <ArrowDownIcon className='size-3.5' aria-hidden='true' />
                    )}
                  </button>
                </th>
                <th>
                  <span className='sr-only'>{$t('common.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => (
                <tr
                  key={i.id}
                  data-item-id={i.id}
                  className='cursor-pointer border-t transition-colors hover:bg-muted/40'
                  onClick={() => open(i)}
                >
                  <td className='px-3 py-2.5'>
                    <Link
                      className='block truncate font-medium hover:underline'
                      to={{ pathname: i.id, search: location.search }}
                      onClick={(e) => e.stopPropagation()}
                      title={i.title}
                    >
                      {i.title}
                    </Link>
                    <p
                      className='truncate text-xs text-muted-foreground'
                      title={i.summary}
                    >
                      {i.summary}
                    </p>
                  </td>
                  <td className='px-3 py-2.5'>
                    <Tag tone='grey'>{categoryName(i.category)}</Tag>
                  </td>
                  <td className='hidden px-3 py-2.5 text-xs text-muted-foreground sm:table-cell'>
                    <span className='block'>{kindName(i)}</span>
                    <span className='block tabular-nums'>
                      {$tj('common.characters', {
                        0: i.chars.toLocaleString(getCurrentLocale()),
                      })}
                    </span>
                  </td>
                  <td className='hidden px-3 py-2.5 text-xs text-muted-foreground tabular-nums sm:table-cell'>
                    {day(i.addedAt)}
                  </td>
                  <td
                    className='px-1 py-2.5 text-center'
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            size='icon-sm'
                            variant='ghost'
                            aria-label={$t('projectKnowledge.actionsFor', {
                              0: i.title,
                            })}
                          />
                        }
                      >
                        <MoreHorizontalIcon />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align='end'
                        className='w-auto min-w-40'
                      >
                        <DropdownMenuItem onClick={() => open(i)}>
                          {$t('projectKnowledge.open')}
                        </DropdownMenuItem>
                        {canRemove ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant='destructive'
                              onClick={() => void remove(i)}
                            >
                              {$t('common.delete')}
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Outlet context={tabContext} />
    </div>
  );
}
