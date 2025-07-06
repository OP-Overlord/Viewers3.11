import { Types } from '@ohif/core';

type MatchingRule = Types.HangingProtocol.MatchingRule;

export const studyWithImages: MatchingRule[] = [
  {
    id: 'OneOrMoreSeries',
    weight: 250,
    attribute: 'numberOfDisplaySetsWithImages',
    constraint: {
      greaterThan: 0,
    },
  },
];
