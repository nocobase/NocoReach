import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import TaskCreatePage from '../../client/pages/task-create.js';
import { TaskMedia } from '../../client/pages/task-detail/media.js';
import { setDictionary } from '../../client/i18n/index.js';
import english from '../../shared/i18n/en.json';

const { request, navigate, state, confirm, warning } = vi.hoisted(() => ({request:vi.fn(),navigate:vi.fn(),confirm:vi.fn(),warning:vi.fn(),state:{project:'1',session:'session-1'}}));
vi.mock('@nocobase/app-client',async(original)=>({...await original<typeof import('@nocobase/app-client')>(),useApiClient:()=>({request})}));
vi.mock('@nocobase/app-plugin-authentication/client',()=>({useAuthentication:()=>({session:{session:{id:state.session},user:{id:'creator'}}})}));
vi.mock('react-router',()=>({useNavigate:()=>navigate,useLocation:()=>({search:'?scope=waiting'})}));
vi.mock('../../client/pages/reach-data.js',()=>({useProject:()=>({project:{id:state.project,name:'Current project'}}),useUnsavedWarning:warning}));
vi.mock('../../client/components/route-dialog.js',()=>({RouteDialog:({children,footer,title}:{children:ReactNode;footer:ReactNode;title:ReactNode})=><div><h1>{title}</h1>{children}{footer}</div>}));
vi.mock('../../client/components/reach/confirm.js',()=>({confirmAction:confirm}));
vi.mock('../../client/components/app-shell/nav-badges.js',()=>({refreshNavBadges:vi.fn()}));
vi.mock('../../client/lib/toast.js',()=>({toast:{success:vi.fn()}}));

beforeEach(()=>{request.mockReset();navigate.mockReset();confirm.mockResolvedValue(true);state.project='1';state.session='session-1';setDictionary(english);});
afterEach(cleanup);
const file = (type='image/png') => new File(['fixture'],type.startsWith('video/')?'safe.webm':'safe.png',{type});
const record={id:'file-1',filename:'safe.png',mimeType:'image/png',size:7,contentUrl:'/main/uploads/task-media/file-1.png'};
function fill() {fireEvent.change(screen.getByLabelText(/Task title/),{target:{value:'Manual UI task'}});fireEvent.change(screen.getByLabelText(/Description and completion/),{target:{value:'Completion criteria\nsecond line'}});}
function paste(files: File[],text='') {
  return fireEvent.paste(screen.getByLabelText(/Description and completion/),{clipboardData:{files,getData:()=>text}});
}

it('validates required fields, submits once and reuses an immutable request after failure',async()=>{
  request.mockRejectedValueOnce(new Error('transport')).mockResolvedValueOnce({data:{id:'42',title:'Manual UI task'}});
  render(<TaskCreatePage/>);
  fireEvent.click(screen.getByRole('button',{name:'Create',exact:true}));
  expect(await screen.findByText(english['manualTask.titleRequired'])).toBeVisible();
  expect(request).not.toHaveBeenCalled();
  fill();fireEvent.click(screen.getByRole('button',{name:'Create',exact:true}));
  expect(await screen.findByRole('alert')).toHaveTextContent(english['manualTask.createFailed']);
  expect(screen.getByLabelText(/Task title/)).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Retry creation'}));
  await waitFor(()=>expect(navigate).toHaveBeenCalledWith('/actions/42',{replace:true}));
  expect(request.mock.calls[0][0].json).toEqual(request.mock.calls[1][0].json);
  expect(request.mock.calls[0][0].json).toMatchObject({projectId:'1',description:'Completion criteria\nsecond line',attachmentIds:[]});
});

it.each(['image/png','video/webm'])('uploads clipboard File %s and blocks creating until uploaded',async(type)=>{
  let finish!: (value:unknown)=>void;
  request.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  render(<TaskCreatePage/>);fill();paste([file(type)]);
  expect(screen.getByRole('button',{name:'Create',exact:true})).toBeDisabled();
  expect(screen.getByText('Uploading…')).toBeVisible();
  expect(request.mock.calls[0][0].body).toBeInstanceOf(FormData);
  finish({data:{...record,mimeType:type}});
  await screen.findByText('Uploaded');
  expect(screen.getByRole('button',{name:'Create',exact:true})).toBeEnabled();
});

it('preserves text paste and copied URLs, offers file picker/drop and reports upload failure',async()=>{
  request.mockRejectedValue(new Error('upload failed'));
  render(<TaskCreatePage/>);fill();
  expect(paste([],'https://example.com/video.mp4')).toBe(true);
  expect(request).not.toHaveBeenCalled();
  const textarea=screen.getByLabelText(/Description and completion/);
  fireEvent.drop(textarea.parentElement!.parentElement!,{dataTransfer:{types:['Files'],files:[file()]}});
  expect(await screen.findByRole('alert')).toHaveTextContent(english['manualTask.uploadFailed']);
  expect(screen.getByRole('button',{name:'Create',exact:true})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Remove'}));
  expect(screen.getByRole('button',{name:'Create',exact:true})).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Upload images or videos'),{target:{files:[file('video/webm')]}});
  expect(await screen.findByRole('alert')).toHaveTextContent(english['manualTask.uploadFailed']);
});

it('invalidates a draft on project/session change and prevents stale creation navigation',async()=>{
  let finish!: (value:unknown)=>void;
  request.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const view=render(<TaskCreatePage/>);fill();fireEvent.click(screen.getByRole('button',{name:'Create',exact:true}));
  await waitFor(()=>expect(request).toHaveBeenCalledTimes(1));
  state.project='2';state.session='session-2';view.rerender(<TaskCreatePage/>);
  expect(screen.getByRole('alert')).toHaveTextContent(english['manualTask.scopeChanged']);
  finish({data:{id:'42',title:'Manual UI task'}});
  await waitFor(()=>expect(screen.getByRole('button',{name:'Retry creation'})).toBeDisabled());
  expect(navigate).not.toHaveBeenCalled();
});

it('renders filenames as text and uses video controls without autoplay after metadata reload',async()=>{
  request.mockResolvedValue({data:[{...record,filename:'<img src=x onerror=alert(1)>',mimeType:'video/webm',contentUrl:'/main/uploads/task-media/file-1.webm'}]});
  const {container}=render(<TaskMedia projectId={1} taskId='42'/>);
  expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeVisible();
  expect(container.querySelector('img')).toBeNull();
  const video=container.querySelector('video')!;
  expect(video.controls).toBe(true);expect(video.autoplay).toBe(false);
  expect(video.src).not.toContain('blob:');
});
