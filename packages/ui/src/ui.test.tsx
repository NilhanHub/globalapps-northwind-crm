// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge, Button, RelationshipThread } from './index';

describe('Northwind UI primitives', () => {
  it('renders labelled controls and relationship context without unsafe HTML', () => {
    render(
      <>
        <Button>Save route</Button>
        <Badge tone="sage">Active</Badge>
        <RelationshipThread target="Paul Dunk" mutual="Siobhan Devall" owner="Jeremy" stage="Intro requested" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Save route' })).toBeVisible();
    expect(screen.getByText('Active')).toBeVisible();
    expect(screen.getByRole('img', { name: /Paul Dunk via Siobhan Devall/ })).toBeVisible();
  });
});
