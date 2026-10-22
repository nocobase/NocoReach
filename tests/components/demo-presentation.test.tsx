import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { demoSettingsComponents } from '../../client/pages/demo-management/presentation.js';

// This test checks the host section contract; the plugin suite separately checks synthetic header slots.
describe('demo settings presentation', () => {
  it('uses the host section and semantic heading while preserving card content', () => {
    const { Card, CardTitle, CardContent, CardFooter } = demoSettingsComponents;
    if (!Card || !CardTitle || !CardContent || !CardFooter)
      throw new Error('Missing host card adapters');
    const { container } = render(
      <Card>
        <CardTitle>Daily reset</CardTitle>
        <CardContent>Schedule fields</CardContent>
        <CardFooter>Save actions</CardFooter>
      </Card>,
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Daily reset' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Schedule fields')).toBeVisible();
    expect(container.querySelector('section')).toHaveClass(
      'rounded-lg',
      'border',
      'p-4',
    );
    expect(screen.getByText('Save actions')).toHaveClass('flex-wrap');
  });
});
