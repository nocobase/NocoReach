import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';

/** Parse untrusted office files off the server thread, with a bounded lifetime. */
export function documentText(
  extension: string,
  buffer: Buffer,
): Promise<string> {
  const require = createRequire(import.meta.url);
  const modulePath = require.resolve(
    extension === '.doc'
      ? 'word-extractor'
      : ['.xls', '.xlsx'].includes(extension)
        ? 'xlsx'
        : 'officeparser',
  );
  return new Promise((resolve, reject) => {
    let answered = false;
    const worker = new Worker(
      `
      const { parentPort, workerData } = require('node:worker_threads');
      (async () => {
        const bytes = Buffer.from(workerData.bytes);
        if (workerData.extension === '.doc') {
          const Extractor = require(workerData.modulePath);
          return (await new Extractor().extract(bytes)).getBody();
        }
        if (['.xls', '.xlsx'].includes(workerData.extension)) {
          const xlsx = require(workerData.modulePath);
          const book = xlsx.read(bytes, { type: 'buffer' });
          return book.SheetNames.map(name => name + '\\n' + xlsx.utils.sheet_to_csv(book.Sheets[name])).join('\\n\\n');
        }
        const { OfficeParser } = require(workerData.modulePath);
        const ast = await OfficeParser.parseOffice(bytes, { extractAttachments: false, ocr: false });
        return ast.toText();
      })().then(text => parentPort.postMessage({ text }), () => parentPort.postMessage({ error: true }));
    `,
      {
        eval: true,
        workerData: { extension, bytes: buffer, modulePath },
        resourceLimits: { maxOldGenerationSizeMb: 256 },
      },
    );
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error('Document parsing timed out'));
    }, 120000);
    worker.once('message', (result: { text?: string; error?: boolean }) => {
      answered = true;
      clearTimeout(timer);
      void worker.terminate();
      if (result.error) reject(new Error('Document parsing failed'));
      else resolve(result.text || '');
    });
    worker.once('error', (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
    worker.once('exit', () => {
      clearTimeout(timer);
      if (!answered) reject(new Error('Document parser stopped'));
    });
  });
}
