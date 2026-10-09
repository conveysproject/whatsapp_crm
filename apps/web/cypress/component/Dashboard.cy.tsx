import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardBody } from '../../components/dashboard/DashboardView';
import '../support/css-marker';
import '../../app/globals.css';
import type { DashRange } from '../../lib/dashboard';

const EVIL = '<img src=x onerror=alert(1)>';

const ADMIN = { id: 'u1', fullName: 'Ada Admin', email: 'a@x.com', role: 'admin', permissions: {} };
const NO_ANALYTICS = { id: 'u2', fullName: 'Al Agent', email: 'b@x.com', role: 'agent', permissions: { inbox_access: 'allow' } };
const CUSTOM = { id: 'u3', fullName: 'Cy Custom', email: 'c@x.com', role: 'custom', permissions: { analytics_access: 'allow' } };

const FUNNEL = { id: 'c1', name: 'Diwali Promo', sentAt: '2026-10-01T00:00:00.000Z', sent: 100, delivered: 80, read: 40, failed: 5 };

function body(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    data: {
      range: '7d',
      tz: 'UTC',
      generatedAt: '2026-10-10T10:00:00.000Z',
      attention: [
        { key: 'unanswered', severity: 'warning', count: 4, label: 'Unanswered chats', href: '/inbox' },
        { key: 'sla_at_risk', severity: 'critical', count: 2, label: 'SLA at risk', href: '/inbox' },
      ],
      kpis: {
        openConversations: { value: 3 },
        newConversations: { value: 5, previous: 4, deltaPct: 25 },
        newContacts: { value: 1, previous: 2, deltaPct: -50 },
        messages: { value: 10, previous: 5, deltaPct: 100, inbound: 6, outbound: 4 },
        firstReplySecs: { value: 125, previous: null, deltaPct: null },
        campaignsSent: { value: 0, previous: 0, deltaPct: null },
      },
      campaignFunnel: { current: FUNNEL, previous: null },
      ...over,
    },
  };
}

function stubUser(user: Record<string, unknown> | null = ADMIN): void {
  cy.intercept({ method: 'GET', pathname: '/api/v1/users/me' }, user ? { body: { data: user } } : { statusCode: 500, body: {} });
}

function stubDashboard(reply: Record<string, unknown> = body()): void {
  cy.intercept({ method: 'GET', pathname: '/v1/analytics/dashboard' }, { body: reply }).as('dash');
}

function Harness({ initial = '7d' as DashRange }: { initial?: DashRange }): React.JSX.Element {
  const [range, setRange] = useState<DashRange>(initial);
  return (
    <DashboardBody
      getToken={async () => 'tok'}
      range={range}
      onRangeChange={setRange}
      slots={{
        myWork: <div data-testid="slot-mywork">my work</div>,
        volumeChart: (days) => <div data-testid="slot-chart">chart {days}</div>,
        activity: <div data-testid="slot-activity">activity</div>,
      }}
    />
  );
}

function mount(initial: DashRange = '7d'): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cy.mount(
    <QueryClientProvider client={qc}>
      <Harness initial={initial} />
    </QueryClientProvider>,
  );
}

describe('Dashboard v2', () => {
  beforeEach(() => stubUser());

  it('renders attention items with severity and links, critical first', () => {
    stubDashboard();
    mount();
    cy.get('[data-testid="attention-item"]').should('have.length', 2);
    cy.get('[data-testid="attention-item"]').first().should('contain', 'Critical').and('contain', 'SLA at risk').and('contain', '2')
      .and('have.attr', 'href', '/inbox');
    cy.get('[data-testid="attention-item"]').last().should('contain', 'Warning').and('contain', 'Unanswered chats');
  });

  it('shows All clear when there are no attention items', () => {
    stubDashboard(body({ attention: [] }));
    mount();
    cy.get('[data-testid="attention-clear"]').should('contain', 'All clear');
    cy.get('[data-testid="attention-item"]').should('not.exist');
  });

  it('shows the disconnected banner when WhatsApp is critical', () => {
    stubDashboard(body({ attention: [{ key: 'whatsapp_disconnected', severity: 'critical', count: 1, label: 'WhatsApp is disconnected', href: '/settings/whatsapp-account' }] }));
    mount();
    cy.get('[data-testid="whatsapp-banner"]').should('contain', 'WhatsApp is disconnected').and('have.attr', 'href', '/settings/whatsapp-account');
    cy.get('[data-testid="attention-clear"]').should('not.exist');
  });

  it('KPI cards show value and delta (up green, down red, null dash) and are links', () => {
    stubDashboard();
    mount();
    cy.get('[data-testid="kpi-new-conversations"]').should('have.attr', 'href', '/inbox')
      .find('[data-testid="kpi-value"]').should('have.text', '5');
    cy.get('[data-testid="kpi-new-conversations"] [data-testid="kpi-delta"]').should('have.attr', 'data-direction', 'up').and('contain', '25%')
      .and('have.class', 'text-green-600');
    cy.get('[data-testid="kpi-new-contacts"] [data-testid="kpi-delta"]').should('have.attr', 'data-direction', 'down').and('contain', '50%')
      .and('have.class', 'text-red-600');
    cy.get('[data-testid="kpi-first-reply"] [data-testid="kpi-delta"]').should('have.text', '—');
    cy.get('[data-testid="kpi-first-reply"] [data-testid="kpi-value"]').should('have.text', '2m 5s');
    cy.get('[data-testid="kpi-messages"]').should('contain', '6 in / 4 out').and('have.attr', 'href', '/messages');
    cy.get('[data-testid="kpi-open"] [data-testid="kpi-delta"]').should('not.exist');
  });

  it('labels the response metric and notes that bot replies are included', () => {
    stubDashboard();
    mount();
    cy.get('[data-testid="kpi-first-reply"]').should('contain', 'Avg time to first reply');
    cy.get('[data-testid="first-reply-info"]').should('have.attr', 'title').and('match', /bot/i);
  });

  it('range picker changes the request', () => {
    stubDashboard();
    mount();
    cy.wait('@dash').its('request.url').should('include', 'range=7d');
    cy.contains('button', 'Today').click();
    cy.wait('@dash').its('request.url').should('include', 'range=today');
    cy.contains('button', 'Today').should('have.attr', 'aria-pressed', 'true');
  });

  it('shows a loading skeleton first', () => {
    cy.intercept({ method: 'GET', pathname: '/v1/analytics/dashboard' }, { delay: 1000, body: body() });
    mount();
    cy.get('[data-testid="dashboard-skeleton"]').should('be.visible');
    cy.get('[data-testid="kpi-open"]').should('be.visible');
    cy.get('[data-testid="dashboard-skeleton"]').should('not.exist');
  });

  it('shows an error with Retry that refetches', () => {
    let calls = 0;
    cy.intercept({ method: 'GET', pathname: '/v1/analytics/dashboard' }, (req) => {
      calls += 1;
      if (calls === 1) req.reply({ statusCode: 500, body: { error: { code: 'INTERNAL', message: 'x' } } });
      else req.reply({ body: body() });
    });
    mount();
    cy.get('[role="alert"]').should('contain', 'Could not load the dashboard');
    cy.contains('button', 'Retry').click();
    cy.get('[data-testid="kpi-open"]').should('be.visible');
    cy.then(() => expect(calls).to.eq(2));
  });

  it('shows the no-access message on 403', () => {
    cy.intercept({ method: 'GET', pathname: '/v1/analytics/dashboard' }, { statusCode: 403, body: { error: { code: 'FORBIDDEN' } } });
    mount();
    cy.get('[role="alert"]').should('contain', 'You do not have access to the dashboard');
    cy.contains('button', 'Retry').should('not.exist');
  });

  it('hides the org section and does not call the API without analytics_access, but keeps My Work', () => {
    stubUser(NO_ANALYTICS);
    let calls = 0;
    cy.intercept({ method: 'GET', pathname: '/v1/analytics/dashboard' }, (req) => { calls += 1; req.reply({ body: body() }); });
    mount();
    cy.contains('You do not have access to the dashboard').should('be.visible');
    cy.get('[data-testid="slot-mywork"]').should('be.visible');
    cy.get('[data-testid="slot-activity"]').should('not.exist');
    cy.then(() => expect(calls).to.eq(0));
  });

  it('a custom role with analytics_access sees the org section', () => {
    stubUser(CUSTOM);
    stubDashboard();
    mount();
    cy.get('[data-testid="kpi-open"]').should('be.visible');
    cy.get('[data-testid="slot-chart"]').should('contain', 'chart 7');
    cy.get('[data-testid="slot-activity"]').should('be.visible');
  });

  it('renders a hostile campaign name as literal text', () => {
    stubDashboard(body({ campaignFunnel: { current: { ...FUNNEL, name: EVIL }, previous: null } }));
    mount();
    cy.get('[data-testid="funnel-name"]').should('have.text', EVIL);
    cy.get('[data-testid="funnel-name"] img').should('not.exist');
    cy.get('img[src="x"]').should('not.exist');
  });

  it('hostile attention labels render as text too', () => {
    stubDashboard(body({ attention: [{ key: 'templates', severity: 'warning', count: 1, label: EVIL, href: '/templates' }] }));
    mount();
    cy.get('[data-testid="attention-item"]').should('have.text', `Warning${EVIL}1`);
    cy.get('img[src="x"]').should('not.exist');
  });

  it('funnel null shows the empty state with a Create link', () => {
    stubDashboard(body({ campaignFunnel: null }));
    mount();
    cy.get('[data-testid="funnel-empty"]').should('have.text', 'No campaigns sent yet');
    cy.contains('a', 'Create a campaign').should('have.attr', 'href', '/campaigns/new');
  });

  it('shows funnel stages with rates', () => {
    stubDashboard();
    mount();
    cy.get('[data-testid="funnel-delivered"]').should('contain', '80 (80%)');
    cy.get('[data-testid="funnel-read"]').should('contain', '40 (40%)');
    cy.get('[data-testid="funnel-failed"]').should('contain', '5 (5%)');
  });

  it('first-reply delta colour is inverted (lower is better)', () => {
    stubDashboard(body({ kpis: { ...(body().data as Record<string, any>).kpis, firstReplySecs: { value: 100, previous: 80, deltaPct: 20 } } }));
    mount();
    cy.get('[data-testid="kpi-first-reply"] [data-testid="kpi-delta"]').should('have.attr', 'data-direction', 'up').and('have.class', 'text-red-600');
  });

  it('first-reply decrease is green', () => {
    stubDashboard(body({ kpis: { ...(body().data as Record<string, any>).kpis, firstReplySecs: { value: 60, previous: 80, deltaPct: -20 } } }));
    mount();
    cy.get('[data-testid="kpi-first-reply"] [data-testid="kpi-delta"]').should('have.attr', 'data-direction', 'down').and('have.class', 'text-green-600');
  });

  it('shows the bot-replies note as visible text', () => {
    stubDashboard();
    mount();
    cy.get('[data-testid="kpi-first-reply"] [data-testid="kpi-note"]').should('be.visible').and('contain', 'Bot replies are included');
  });

  it('a failed /users/me shows a retryable error, not the no-access message', () => {
    stubUser(null);
    stubDashboard();
    mount();
    cy.get('[role="alert"]').should('contain', 'Could not load the dashboard');
    cy.contains('You do not have access to the dashboard').should('not.exist');
    cy.contains('button', 'Retry').should('be.visible');
  });

  it('has no horizontal scroll at 360px', () => {
    cy.viewport(360, 740);
    stubDashboard(body({ campaignFunnel: { current: { ...FUNNEL, name: 'A very long campaign name with_no_breaks_' + 'x'.repeat(80) }, previous: null } }));
    mount();
    cy.get('[data-testid="kpi-open"]').should('be.visible');
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
  });

  it('renders readable text in dark mode', () => {
    cy.wrap(Cypress.automation('remote:debugger:protocol', {
      command: 'Emulation.setEmulatedMedia',
      params: { features: [{ name: 'prefers-color-scheme', value: 'dark' }] },
    }));
    stubDashboard();
    mount();
    cy.get('[data-testid="kpi-open"]').should('be.visible');
    // Every KPI value must differ from its card background (no invisible text).
    cy.get('[data-testid^="kpi-"]').each(($card) => {
      const value = $card.find('[data-testid="kpi-value"]')[0];
      if (!value) return;
      const fg = getComputedStyle(value).color;
      const bg = getComputedStyle($card[0] as HTMLElement).backgroundColor;
      expect(fg).not.to.eq(bg);
    });
    cy.get('[data-testid="kpi-open"]').then(($c) => {
      expect(getComputedStyle($c[0] as HTMLElement).backgroundColor).to.not.eq('rgb(255, 255, 255)');
    });
  });
});
