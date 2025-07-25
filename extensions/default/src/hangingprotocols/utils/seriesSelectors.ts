import { Types } from '@ohif/core';

type MatchingRule = Types.HangingProtocol.MatchingRule;

export const seriesWithImages: MatchingRule[] = [
  {
    attribute: 'numImageFrames',
    constraint: {
      greaterThan: { value: 0 },
    },
    weight: 2,
    //required: true,
  },
  // This display set will select the specified items by preference
  // It has no affect if nothing is specified in the URL.
  {
    attribute: 'Rows',
    constraint: {
      greaterThan: { value: 0 },
    },
    weight: 1,
  },
  {
    attribute: 'Columns',
    constraint: {
      greaterThan: { value: 0 },
    },
    weight: 1,
  },
  {
    attribute: 'isDisplaySetFromUrl',
    weight: 20,
    constraint: {
      equals: true,
    },
  },
];
