import { act, renderHook } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, expect, it } from 'vitest';
import { setDictionary, useMessageState } from '../../client/i18n/index.js';
import english from '../../shared/i18n/en.json';

afterEach(() => setDictionary(null));
it('keeps message setters stable across updates and locale switches without reloading effects', () => {
  setDictionary(null);
  let loads = 0;
  const hook = renderHook(() => {
    const [message, setMessage] = useMessageState();
    useEffect(() => {
      loads++;
      setMessage('分析失败');
    }, [setMessage]);
    return { message, setMessage };
  });
  const setter = hook.result.current.setMessage;
  expect(hook.result.current.message).toBe('分析失败');
  act(() => setDictionary(english));
  expect(hook.result.current.message).toBe('Analysis failed');
  hook.rerender();
  expect(hook.result.current.setMessage).toBe(setter);
  expect(loads).toBe(1);
  hook.unmount();
});
