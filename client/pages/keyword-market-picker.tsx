import { useMemo } from 'react';
import { $t, getCurrentLocale } from '#i18n';
import { cn } from '#lib/utils';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '#components/ui/combobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import {
  KEYWORD_COUNTRIES,
  countryLanguages,
  defaultLanguage,
  type KeywordMarket,
} from '../../shared/keyword-markets.js';
import { countryLabel, languageLabel } from './keyword-api';

/**
 * A market for Keywords › Find keywords and AI suggestions: a country searched by name, then one of the languages
 * DataForSEO has its keyword data in, the country's main one chosen when the country changes. Only pairs DataForSEO
 * supports can be picked.
 */
export function MarketPicker({
  value,
  onChange,
  disabled = false,
  className,
}: {
  value: KeywordMarket;
  onChange: (market: KeywordMarket) => void;
  disabled?: boolean;
  className?: string;
}) {
  const locale = getCurrentLocale();
  const countries = useMemo(() => {
    const collator = new Intl.Collator(locale);
    return KEYWORD_COUNTRIES.map(([code]) => code).sort((a, b) =>
      collator.compare(countryLabel(a), countryLabel(b)),
    );
  }, [locale]);
  const languages = countryLanguages(value.locationCode);
  return (
    <div className={cn('flex gap-2', className)} data-market-picker>
      <Combobox
        items={countries}
        value={value.locationCode}
        disabled={disabled}
        autoHighlight
        itemToStringLabel={(code: number) => countryLabel(code)}
        onValueChange={(code: number | null) => {
          const language = code == null ? null : defaultLanguage(code);
          if (code != null && language && code !== value.locationCode)
            onChange({ locationCode: code, language });
        }}
      >
        <ComboboxInput
          className='min-w-0 flex-1'
          aria-label={$t('keywordMarket.country')}
          placeholder={$t('keywordMarket.searchCountry')}
          disabled={disabled}
          onFocus={(e) => e.currentTarget.select()}
        />
        <ComboboxContent>
          <ComboboxEmpty>{$t('keywordMarket.noCountry')}</ComboboxEmpty>
          <ComboboxList>
            {(code: number) => (
              <ComboboxItem key={code} value={code}>
                {countryLabel(code)}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {/* One language menu per country: a menu kept across countries reported a change back after the country
          changed, turning Malaysia's default Malay into English when Simplified Chinese had been chosen for Singapore. */}
      <Select
        key={value.locationCode}
        value={value.language}
        disabled={disabled || languages.length < 2}
        onValueChange={(language) => {
          if (language)
            onChange({
              locationCode: value.locationCode,
              language: String(language),
            });
        }}
      >
        <SelectTrigger
          className='w-auto shrink-0'
          aria-label={$t('keywordMarket.language')}
        >
          <SelectValue>{(v: string) => languageLabel(v)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {languages.map((l) => (
            <SelectItem key={l} value={l}>
              {languageLabel(l)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
