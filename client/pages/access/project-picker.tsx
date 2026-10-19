import { useState } from 'react';
import { $t } from '#i18n';
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from '#components/ui/combobox';

/** A chips multi-select over project ids. */
export function ProjectPicker({
  id,
  projects,
  value,
  onChange,
  disabled = false,
  invalid = false,
}: {
  id?: string;
  projects: { id: string; name: string }[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const anchor = useComboboxAnchor();
  const [input, setInput] = useState('');
  const names = new Map(projects.map((project) => [project.id, project.name]));
  const label = (item: string) => names.get(item) ?? item;
  return (
    <Combobox
      multiple
      autoHighlight
      items={projects.map((project) => project.id)}
      value={value}
      disabled={disabled}
      itemToStringLabel={label}
      inputValue={input}
      onInputValueChange={setInput}
      onValueChange={(next: string[]) => onChange(next)}
    >
      <ComboboxChips ref={anchor} className='min-h-9'>
        <ComboboxValue>
          {value.map((item) => (
            <ComboboxChip key={item}>{label(item)}</ComboboxChip>
          ))}
        </ComboboxValue>
        <ComboboxChipsInput
          id={id}
          aria-label={$t('accessMembers.projects')}
          aria-invalid={invalid || undefined}
          placeholder={
            value.length ? undefined : $t('accessMembers.chooseProjects')
          }
        />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>{$t('accessMembers.noProjects')}</ComboboxEmpty>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem key={item} value={item}>
              {label(item)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
