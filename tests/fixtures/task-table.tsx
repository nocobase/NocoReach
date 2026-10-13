import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TaskTable, type WorkCard } from '../../client/pages/work-board';
import { setDictionary } from '../../client/i18n';
import english from '../../shared/i18n/en.json';
import '../../client/styles.css';

const params = new URLSearchParams(location.search);
setDictionary(params.get('locale') === 'en' ? english : null);
const tasks: WorkCard[] = [
  '给论坛里没人回复的主题补充关于权限配置的具体解决方法',
  '给论坛里没人回复的主题补充关于数据库迁移的具体解决方法',
  `LongUnbrokenTitle${'x'.repeat(100)}`,
].map((title, index) => ({
  id: index + 2,
  title,
  brief: '',
  status: 'open',
  updatedAt: '2026-10-13',
  evidence: {
    no: index + 2,
    createdBy: { id: 'fixture', name: 'Long owner name' },
  },
}));

export default function Fixture() {
  const [result, setResult] = useState('');
  return (
    <main
      className='nr-page p-6'
      style={{ marginLeft: 'clamp(0px, (100vw - 767px) * 1000, 240px)' }}
    >
      <TaskTable
        tasks={tasks}
        onOpen={(id) => setResult(`open:${id}`)}
        onAction={(task, action) => setResult(`${action}:${task.id}`)}
      />
      <output>{result}</output>
    </main>
  );
}
const root = createRoot(document.getElementById('root')!);
root.render(<Fixture />);
import.meta.hot?.dispose(() => root.unmount());
