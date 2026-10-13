import { $t } from '#i18n';
import { Input } from '#components/ui/input';
import { Field, FieldLabel, FieldDescription } from '#components/ui/field';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from '#components/ui/select';
import { MOCK_SCENARIOS } from '../../../app-plugins/nocoreach-mock/server/types.js';
import type { MockProfileSettings } from './api';

export function MockProfileFields({
  value,
  disabled,
  errors,
  onChange,
}: {
  value: MockProfileSettings;
  disabled: boolean;
  errors: Record<string, string>;
  onChange: (value: MockProfileSettings) => void;
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor='mock-scenario'>
          {$t('networkProfiles.scenario')}
        </FieldLabel>
        <Select
          value={value.scenario}
          disabled={disabled}
          onValueChange={(scenario) => {
            const valid = MOCK_SCENARIOS.find((item) => item === scenario);
            if (valid) onChange({ ...value, scenario: valid });
          }}
        >
          <SelectTrigger id='mock-scenario' className='w-full'>
            <SelectValue>
              {$t(`networkProfiles.scenarios.${value.scenario}`)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {MOCK_SCENARIOS.map((scenario) => (
                <SelectItem key={scenario} value={scenario}>
                  {$t(`networkProfiles.scenarios.${scenario}`)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>{$t('networkProfiles.noFallback')}</FieldDescription>
      </Field>
      {(['seed', 'clock'] as const).map((key) => (
        <Field key={key} data-invalid={!!errors[key]}>
          <FieldLabel htmlFor={`mock-${key}`}>
            {$t(`networkProfiles.${key}`)}
          </FieldLabel>
          <Input
            id={`mock-${key}`}
            name={key}
            value={value[key]}
            disabled={disabled}
            required
            maxLength={key === 'seed' ? 128 : 64}
            aria-invalid={!!errors[key]}
            aria-describedby={`mock-${key}-help`}
            onChange={(event) =>
              onChange({ ...value, [key]: event.target.value })
            }
          />
          <FieldDescription id={`mock-${key}-help`}>
            {$t(errors[key] || `networkProfiles.${key}Help`)}
          </FieldDescription>
        </Field>
      ))}
    </>
  );
}
