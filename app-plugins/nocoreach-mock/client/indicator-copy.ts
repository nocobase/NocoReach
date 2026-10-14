const en = {
  indicator: 'Demo data',
  indicatorBody: 'This project uses demo data.',
  indicatorDisabled: 'Demo environment; simulation is paused for this project.',
  unknown: 'Simulation status could not be verified',
  retry: 'Retry',
};
const zh = {
  indicator: '演示数据',
  indicatorBody: '当前项目使用演示数据。',
  indicatorDisabled: '演示环境，当前项目已暂停模拟。',
  unknown: '无法确认模拟状态',
  retry: '重试',
};

export const indicatorCopy = (locale: string) =>
  locale.toLowerCase().startsWith('zh') ? zh : en;
