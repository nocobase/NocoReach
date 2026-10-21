import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, } from 'react';
import { DEMO_MODE_NAMESPACE, DEMO_SERVER_TIMING_METRIC, } from '../namespace.js';
const REFUSED_TOAST_ID = 'demo-mode-refused';
/** Whether a finished request's response says the server refused one of its writes. */
function isRefusedEntry(entry) {
    const serverTiming = entry
        .serverTiming;
    return (serverTiming?.some((metric) => metric.name === DEMO_SERVER_TIMING_METRIC) ??
        false);
}
/**
 * Tells visitors of a read-only demo, with a toast, whenever the server refuses a change. Refusals are read from
 * finished requests' `Server-Timing`, so this works whichever client made the request and however the application
 * shows its own errors.
 */
export function DemoModeNotice({ children }) {
    const api = useApiClient();
    const toaster = useToaster();
    const { t } = useTranslation(DEMO_MODE_NAMESPACE);
    const [mode, setMode] = useState('off');
    useEffect(() => {
        let active = true;
        api
            .request({ path: '/demoMode/status' })
            .then((payload) => {
            if (active)
                setMode(payload.data.mode);
        })
            // Without the status no toast is shown; the server still refuses writes.
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, [api]);
    useEffect(() => {
        if (mode !== 'read-only' || typeof PerformanceObserver === 'undefined') {
            return;
        }
        const observer = new PerformanceObserver((list) => {
            if (!list.getEntries().some(isRefusedEntry))
                return;
            toaster.show({
                id: REFUSED_TOAST_ID,
                type: 'warning',
                title: t('refused.title'),
                description: t('refused.description'),
            });
        });
        observer.observe({ type: 'resource' });
        return () => observer.disconnect();
    }, [mode, toaster, t]);
    return _jsx(_Fragment, { children: children });
}
//# sourceMappingURL=demo-mode-notice.js.map