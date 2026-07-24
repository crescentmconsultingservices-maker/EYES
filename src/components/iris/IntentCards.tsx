'use client';

import React from 'react';
import UnderstandingCard from './UnderstandingCard';

interface Receipt {
  source_url: string;
  span?: string;
  sender?: string;
  timestamp?: string;
  confidence?: number;
  validity?: string;
  [key: string]: any;
}

interface IntentCardsProps {
  intent: string;
  intentData: any[];
  onReceiptClick: (receipt: Receipt) => void;
}

export default function IntentCards({ intent, intentData, onReceiptClick }: IntentCardsProps) {
  if (intent === 'none') {
    return null;
  }

  const hasData = intentData && intentData.length > 0;

  const buildReceipt = (edge: any, defaultText: string): Receipt => ({
    source_url: edge?.source_url || '/iris?view=timeline',
    span: edge?.memory_content || edge?.head?.name || defaultText,
    sender: edge?.head?.name || 'EYES Memory Graph',
    timestamp: edge?.valid_from ? new Date(edge.valid_from).toISOString() : '2026-07-24 · 10:00 UTC',
    confidence: edge?.confidence || 0.98,
    validity: edge?.valid_from ? `believed since ${new Date(edge.valid_from).toLocaleDateString()} · still current` : 'still current'
  });

  return (
    <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {!hasData ? (
        <UnderstandingCard
          title={`No ${intent} records found`}
          body="The EYES Understanding API scanned your connected platforms. No matching belief items surfaced."
          kicker="INTENT CARD · SHOW"
          statusBadge="Clean"
          badgeType="slate"
        />
      ) : (
        <>
          {intent === 'commitment' && intentData.map((edge, i) => {
            const head = edge.head?.name || 'Task / Obligation';
            const tail = edge.tail?.name || 'Recipient';
            const dateStr = edge.valid_from ? new Date(edge.valid_from).toLocaleDateString() : 'Active';
            return (
              <UnderstandingCard
                key={i}
                title={`Commitment to ${tail}`}
                body={`Committed obligation: "${head}". Active in graph since ${dateStr}.`}
                kicker="INTENT · COMMITMENT"
                statusBadge="Active"
                badgeType="good"
                timestamp={`Since ${dateStr}`}
                receipt={buildReceipt(edge, `Committed to ${tail}: ${head}`)}
              />
            );
          })}

          {intent === 'slippage' && intentData.map((edge, i) => {
            const head = edge.head?.name || 'Item';
            const tail = edge.tail?.name || 'Blocker / Dependency';
            const dateStr = edge.valid_from ? new Date(edge.valid_from).toLocaleDateString() : 'Recent';
            return (
              <UnderstandingCard
                key={i}
                title={`${head} delayed on ${tail}`}
                body={`Check-in: This item has not moved since ${dateStr} — still current or resolved?`}
                kicker="INTENT · SLIPPAGE"
                statusBadge="Check-in Needed"
                badgeType="accent"
                timestamp={`Delayed since ${dateStr}`}
                receipt={buildReceipt(edge, `${head} delayed on ${tail}`)}
              />
            );
          })}

          {intent === 'change' && intentData.map((edge, i) => {
            const head = edge.head?.name || 'Entity';
            const tail = edge.tail?.name || 'Property';
            const dateStr = edge.valid_to ? new Date(edge.valid_to).toLocaleDateString() : 'Recent';
            return (
              <UnderstandingCard
                key={i}
                title={`Belief Change: ${head}`}
                body={`Before state superseded on ${dateStr}. Updated graph relationship: ${head} → ${edge.relation_label?.replace(/_/g, ' ') || 'updated'} → ${tail}.`}
                kicker="INTENT · CHANGE"
                statusBadge="Superseded"
                badgeType="slate"
                timestamp={`Updated ${dateStr}`}
                receipt={buildReceipt(edge, `Belief update: ${head} to ${tail}`)}
              />
            );
          })}
        </>
      )}
    </div>
  );
}
