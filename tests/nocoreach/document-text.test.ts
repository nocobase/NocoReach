// @vitest-environment node
import { expect, it } from 'vitest';
import * as xlsx from 'xlsx';
import { documentText } from '../../server/nocoreach/document-text';

it('extracts spreadsheet knowledge in the worker with real line breaks', async () => {
  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(
    book,
    xlsx.utils.aoa_to_sheet([
      ['标题', '内容'],
      ['测试', '项目知识'],
    ]),
    '资料',
  );
  const text = await documentText(
    '.xlsx',
    xlsx.write(book, { type: 'buffer', bookType: 'xlsx' }),
  );
  expect(text).toContain('资料\n');
  expect(text).toContain('项目知识');
  expect(text).not.toContain('\\n');
});
it('rejects malformed office documents without stopping the server', async () => {
  await expect(
    documentText('.docx', Buffer.from('invalid document')),
  ).rejects.toThrow('Document parsing failed');
}, 30000);
