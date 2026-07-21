export interface ValuationInputs {
  leakType: string;
  daysSilent: number;
  valueTier?: string | null;
  estValueEur?: number | null;
  quantity?: number | null;
  unitPrice?: number | null;
  defaultFee: number;
}

export interface ValuationOutputs {
  grossValue: number;
  recoverableValue: number;
  rankScore: number;
  finalTier: string;
}

export function getRecoveryProbability(leakType: string, daysSilent: number): number {
  let base = 0.2; // UNANSWERED_INBOUND
  if (leakType === 'OPEN_PROPOSAL') base = 0.6;
  else if (leakType === 'DROPPED_COMMITMENT') base = 0.4;
  else if (leakType === 'GHOSTED_CLIENT') base = 0.3;

  let decay = 0.05;
  if (daysSilent < 14) decay = 1.0;
  else if (daysSilent < 30) decay = 0.8;
  else if (daysSilent < 60) decay = 0.5;
  else if (daysSilent < 90) decay = 0.2;

  return base * decay;
}

export function calculateValuation(inputs: ValuationInputs): ValuationOutputs {
  const { leakType, daysSilent, valueTier, estValueEur, quantity, unitPrice, defaultFee } = inputs;
  
  let grossValue = defaultFee;
  let finalTier = valueTier || 'T3';

  if (valueTier === 'T1' || valueTier === 'T2') {
    grossValue = estValueEur || (quantity && unitPrice ? quantity * unitPrice : defaultFee);
    finalTier = valueTier;
  } else {
    finalTier = 'T3'; // fallback applied
  }

  const probability = getRecoveryProbability(leakType, daysSilent);
  const recoverableValue = Math.round(grossValue * probability);
  const recencyScore = Math.max(0, 180 - daysSilent);
  
  const rankScore = recoverableValue * recencyScore;

  return {
    grossValue,
    recoverableValue,
    rankScore,
    finalTier
  };
}
