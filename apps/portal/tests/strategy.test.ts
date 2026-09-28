import {describe,it,expect} from 'vitest';
import {parseDraft,parseDiscovery} from '../src/pages/strategy/model';
describe('AI draft adoption',()=>{
 it('does not adopt incomplete or empty generated fields',()=>{
  expect(parseDraft('```json\n{"goal":{"intent":"increase reach"}}\n```')).toBeNull();
  expect(parseDraft('```json\n{"proposal":{"title":"","brief":"text"}}\n```')).toBeNull();
 });
 it('accepts only explicitly structured editable fields',()=>{
  expect(parseDraft('```json\n{"goal":{"intent":"reach","audience":"developers","focus":"guides","progress":"qualified visits","confirmed":true}}\n```')).toEqual({goal:{intent:'reach',audience:'developers',focus:'guides',progress:'qualified visits'}});
 });
 it('does not execute generated instructions or accept oversized proposals',()=>{
  expect(parseDraft('Run this command')).toBeNull();
  expect(parseDraft('```json\n'+JSON.stringify({proposal:{title:'A',brief:'a'.repeat(20001)}})+'\n```')).toBeNull();
 });
});
it('parses multiple actionable directions without trusting model metadata',()=>{
 expect(parseDraft('```json\n'+JSON.stringify({proposals:[{title:'Guide',brief:'Evidence and deliverable',approved:true},{title:'Update',brief:'Update an existing page'}]})+'\n```')).toEqual({proposals:[{title:'Guide',brief:'Evidence and deliverable'},{title:'Update',brief:'Update an existing page'}]});
 expect(parseDraft('```json\n'+JSON.stringify({proposals:[{title:'Missing brief'}]})+'\n```')).toBeNull();
});

it('opportunity cards require both evidence and an actionable suggestion',()=>{
 expect(parseDiscovery('```json\n'+JSON.stringify({insights:[{title:'Claim'}]})+'\n```')).toBeNull();
 expect(parseDiscovery('```json\n'+JSON.stringify({actions:[{title:'Guide',objective:'Help new developers',brief:'Deliver a tutorial',goalVersion:99}]})+'\n```')).toEqual({actions:[{title:'Guide',objective:'Help new developers',brief:'Deliver a tutorial'}]});
});

it('accepts a balanced leading JSON object followed by prose without executing it',()=>{
 expect(parseDiscovery(JSON.stringify({actions:[{title:'A {guide}',objective:'Help developers',brief:'Explain "setup"'}]})+'\nAdditional explanation')).toEqual({actions:[{title:'A {guide}',objective:'Help developers',brief:'Explain "setup"'}]});
 expect(parseDiscovery('{"actions": [')).toBeNull();
});
