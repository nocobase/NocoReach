import {describe,expect,it} from 'vitest';
import {chipOf} from '../src/pages/strategy/insights-view';
import type {Signal} from '../src/pages/strategy/model';
// Signals stored before chips existed get the same coloured tag from their wording (synthetic examples).
const s=(title:string,facts:string[]=[],chip?:Signal['chip']):Signal=>({key:title,type:'change',source:'gsc',title,facts,strength:1,...(chip?{chip}:{})}) as Signal;
describe('chipOf',()=>{
 it('prefers the server chip',()=>expect(chipOf(s('任意',[],{tone:'violet',text:'预发布'}))).toEqual({tone:'violet',text:'预发布'}));
 it('reads direction and size without a double sign',()=>{
  expect(chipOf(s('/a 搜索点击下降 -76%'))).toEqual({tone:'red',text:'↓ 76%'});
  expect(chipOf(s('全站搜索曝光上升 18%，点击只涨 3.6%'))).toEqual({tone:'green',text:'↑ 18%'});
 });
 it('covers the attention and category rules',()=>{
  expect(chipOf(s('近 30 天有 9 个社区主题，其中 8 个未标记为已解决'))).toEqual({tone:'amber',text:'8 个未解决'});
  expect(chipOf(s('Docs 内容很短',['正文约 92 字']))).toEqual({tone:'amber',text:'正文 92 字'});
  expect(chipOf(s('「Q」分类讨论增加',['近 14 天 9 个主题，此前 14 天 3 个']))).toEqual({tone:'green',text:'↑ 3.0 倍'});
  expect(chipOf(s('「Q」分类讨论增加',['近 14 天 6 个主题，此前 14 天 0 个']))).toEqual({tone:'green',text:'↑ 6 个'});
 });
 it('returns null when nothing is recognisable',()=>expect(chipOf(s('没有数字的一句话'))).toBeNull());
});
