import { $t } from '#i18n';
import { Label } from '#components/ui/label';
import { Segmented } from '#components/reach/segmented';
import {
  WECHAT_FONT_SIZES,
  WECHAT_LINE_HEIGHTS,
  type WechatLayout,
} from '../../../shared/wechat-layout.js';

/**
 * Brand and templates › WeChat layout: the body's font size and line height for What to make › WeChat layout. Headings,
 * bold text and references take the brand color of Brand basics.
 */
export function WechatLayoutFields({
  value,
  onChange,
  disabled,
}: {
  value: WechatLayout;
  onChange: (next: WechatLayout) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className='space-y-3' disabled={disabled} data-wechat-layout=''>
      <legend className='w-full border-t pt-4 text-sm font-semibold'>
        {$t('workshop.wechatLayout')}
      </legend>
      <p className='text-sm text-muted-foreground'>
        {$t('workshop.wechatLayoutHint')}
      </p>
      <div className='flex flex-wrap gap-x-8 gap-y-3'>
        <div className='space-y-1.5'>
          <Label>{$t('workshop.wechatFontSize')}</Label>
          <Segmented
            label={$t('workshop.wechatFontSize')}
            options={WECHAT_FONT_SIZES.map((n) => ({
              id: String(n),
              label: `${n}px`,
              disabled,
            }))}
            value={String(value.fontSize)}
            onChange={(id) =>
              onChange({
                ...value,
                fontSize:
                  WECHAT_FONT_SIZES.find((n) => String(n) === id) ??
                  value.fontSize,
              })
            }
          />
        </div>
        <div className='space-y-1.5'>
          <Label>{$t('workshop.wechatLineHeight')}</Label>
          <Segmented
            label={$t('workshop.wechatLineHeight')}
            options={WECHAT_LINE_HEIGHTS.map((n) => ({
              id: String(n),
              label: n.toFixed(2).replace(/0$/, ''),
              disabled,
            }))}
            value={String(value.lineHeight)}
            onChange={(id) =>
              onChange({
                ...value,
                lineHeight:
                  WECHAT_LINE_HEIGHTS.find((n) => String(n) === id) ??
                  value.lineHeight,
              })
            }
          />
        </div>
      </div>
    </fieldset>
  );
}
