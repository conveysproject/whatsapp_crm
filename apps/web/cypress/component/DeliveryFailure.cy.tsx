import React from 'react';
import { FailedTick, NotDeliveredNote } from '../../components/inbox/DeliveryFailure';
import { LogStatusBadge } from '../../components/messages/LogStatusBadge';

const err = { code: 131049, title: 'Healthy ecosystem', message: 'Blocked', details: 'engagement' };

describe('Message Log status badge', () => {
  it('shows Meta code and title with the full reason as a tooltip on failed rows', () => {
    cy.mount(<LogStatusBadge status="failed" deliveryError={err} />);
    cy.contains('failed');
    cy.get('[data-testid="delivery-error"]')
      .should('contain.text', 'Healthy ecosystem (code 131049)')
      .and('have.attr', 'title', '131049: Healthy ecosystem — Blocked (engagement)');
  });
  it('shows nothing extra for failed rows without a reason and for other statuses', () => {
    cy.mount(<LogStatusBadge status="failed" deliveryError={null} />);
    cy.get('[data-testid="delivery-error"]').should('not.exist');
    cy.mount(<LogStatusBadge status="delivered" deliveryError={err} />);
    cy.get('[data-testid="delivery-error"]').should('not.exist');
  });
});

describe('Inbox failed message', () => {
  it('renders a visible text reason and a tooltip on the red mark', () => {
    cy.mount(<div><FailedTick deliveryError={err} /><NotDeliveredNote status="failed" deliveryError={err} /></div>);
    cy.get('[data-testid="not-delivered"]').should('have.text', 'Not delivered: Healthy ecosystem (code 131049)');
    cy.get('span[title]').should('have.attr', 'title', '131049: Healthy ecosystem — Blocked (engagement)');
  });
  it('renders no note when there is no reason or the message did not fail', () => {
    cy.mount(<NotDeliveredNote status="failed" deliveryError={null} />);
    cy.get('[data-testid="not-delivered"]').should('not.exist');
    cy.mount(<NotDeliveredNote status="sent" deliveryError={err} />);
    cy.get('[data-testid="not-delivered"]').should('not.exist');
  });
});
