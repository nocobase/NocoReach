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
  render(<AgentPicker agents={[agent]} value={null} onSelect={select} />);
  await userEvent.click(screen.getByRole('button', { name: /Agent:/ }));
  expect(screen.getByText('Personal runners only')).toBeVisible();
  expect(
    screen.getByLabelText('Only available on other people’s personal runners'),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole('menuitem', { name: /Claude/ }));
  expect(select).toHaveBeenCalledWith('claude-model');
});
