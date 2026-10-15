import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  TaskTable,
  WorkBoard,
  type WorkCard,
} from '../../client/pages/work-board';
import { setDictionary } from '../../client/i18n';
import english from '../../shared/i18n/en.json';
import '../../client/styles.css';

setDictionary(english);
export default function Fixture() {
  const [tasks, setTasks] = useState<WorkCard[]>([]);
  const read = async () =>
    setTasks((await (await fetch('/timestamp-fixture')).json()) as WorkCard[]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/timestamp-fixture', { signal: controller.signal })
      .then((response) => response.json())
      .then((rows: WorkCard[]) => {
        if (!controller.signal.aborted) setTasks(rows);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) throw error;
      });
    return () => {
      controller.abort();
    };
  }, []);
  return (
    <main className='nr-page p-6'>
      <h1>Task timestamps · isolated SQLite data</h1>
      <button onClick={() => void read()}>Refresh</button>
      <button
        onClick={() =>
          void fetch('/timestamp-fixture', { method: 'POST' }).then(read)
        }
      >
        Update task
      </button>
      <h2>List</h2>
      <TaskTable tasks={tasks} onOpen={() => {}} />
      <h2>Board</h2>
      <WorkBoard
        tasks={tasks}
        busy={false}
        list={false}
        onOpen={() => {}}
        onMove={() => {}}
      />
    </main>
  );
}
const root = createRoot(document.getElementById('root')!);
root.render(<Fixture />);
import.meta.hot?.dispose(() => root.unmount());
