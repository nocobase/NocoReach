import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChatAgent } from '@nocobase/app-plugin-agents/shared/conversations';
import { expect, it, vi } from 'vitest';
import { AgentPicker } from '../../client/components/agent-picker';

it('selects Runner-discovered agents and explains personal-runner availability', async () => {
  const agent: ChatAgent = {
    id: 'claude-model',
    name: 'Claude · Model',
    description: null,
    nameText: null,
    descriptionText: null,
    avatar: null,
    isSystemDefault: false,
    isMyDefault: false,
    personalOnly: true,
    availability: { online: false, reason: 'othersPersonal' },
  };
  const select = vi.fn();
  const user = userEvent.setup();
  render(<AgentPicker agents={[agent]} value={null} onSelect={select} />);
  screen.getByRole('button', { name: /Agent:/ }).focus();
  await user.keyboard('{ArrowDown}');
  expect(await screen.findByText('Personal runners only')).toBeVisible();
  expect(
    screen.getByLabelText('Only available on other people’s personal runners'),
  ).toBeInTheDocument();
  await user.click(await screen.findByRole('menuitem', { name: /Claude/ }));
  expect(select).toHaveBeenCalledWith('claude-model');
});
