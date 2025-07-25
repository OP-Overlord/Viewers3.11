const priorStudyMatchingRules = [
  {
    // The priorInstance is a study counter that indicates what position this study is in
    // and the value comes from the options parameter.
    attribute: 'studyInstanceUIDsIndex',
    from: 'options',
    required: true,
    constraint: {
      equals: { value: 1 },
    },
  },
];

const currentStudyMatchingRules = [
  {
    // The priorInstance is a study counter that indicates what position this study is in
    // and the value comes from the options parameter.
    attribute: 'studyInstanceUIDsIndex',
    from: 'options',
    required: true,
    constraint: {
      equals: { value: 0 },
    },
  },
];

const LCCSeriesMatchingRules = [
  {
    weight: 10,
    attribute: 'ViewCode',
    constraint: {
      contains: 'SCT:399162004',
    },
  },
  {
    weight: 5,
    attribute: 'PatientOrientation',
    constraint: {
      contains: ['A', 'R'],
    },
  },
  {
    attribute: 'PatientOrientation',
    constraint: {
      doesNotEqual: ['P', 'L'],
    },
    required: true,
  },
  {
    weight: 20,
    attribute: 'SeriesDescription',
    constraint: {
      contains: 'L CC',
    },
  },
];

const RCCSeriesMatchingRules = [
  {
    weight: 10,
    attribute: 'ViewCode',
    constraint: {
      contains: 'SCT:399162004',
    },
  },
  {
    weight: 5,
    attribute: 'PatientOrientation',
    constraint: {
      equals: ['P', 'L'],
    },
  },
  {
    attribute: 'PatientOrientation',
    constraint: {
      doesNotEqual: ['A', 'R'],
    },
    required: true,
  },
  {
    weight: 20,
    attribute: 'SeriesDescription',
    constraint: {
      contains: 'R CC',
    },
  },
];

const LMLOSeriesMatchingRules = [
  {
    weight: 10,
    attribute: 'ViewCode',
    constraint: {
      contains: 'SCT:399368009',
    },
  },
  {
    attribute: 'ViewCode',
    constraint: {
      doesNotEqual: 'SCT:399162004',
    },
    required: true,
  },
  {
    weight: 10,
    attribute: 'PatientOrientation',
    constraint: {
      equals: ['A', 'FR'],
    },
  },
  {
    attribute: 'PatientOrientation',
    constraint: {
      doesNotEqual: ['P', 'FL'],
    },
    required: true,
  },
  {
    weight: 20,
    attribute: 'SeriesDescription',
    constraint: {
      contains: 'L MLO',
    },
  },
  {
    attribute: 'SeriesDescription',
    required: true,
    constraint: {
      doesNotContain: 'CC',
    },
  },
  {
    attribute: 'SeriesDescription',
    required: true,
    constraint: {
      doesNotContain: 'R MLO',
    },
  },
];

const RMLOSeriesMatchingRules = [
  {
    weight: 10,
    attribute: 'ViewCode',
    constraint: {
      contains: 'SCT:399368009',
    },
  },
  {
    attribute: 'ViewCode',
    constraint: {
      doesNotEqual: 'SCT:399162004',
    },
    required: true,
  },
  {
    weight: 10,
    attribute: 'PatientOrientation',
    constraint: {
      equals: ['P', 'FL'],
    },
  },
  {
    attribute: 'PatientOrientation',
    constraint: {
      doesNotEqual: ['A', 'FR'],
    },
    required: true,
  },
  {
    weight: 20,
    attribute: 'SeriesDescription',
    constraint: {
      contains: 'R MLO',
    },
  },
  {
    attribute: 'SeriesDescription',
    required: true,
    constraint: {
      doesNotContain: 'CC',
    },
  },
  {
    attribute: 'SeriesDescription',
    required: true,
    constraint: {
      doesNotContain: 'L MLO',
    },
  },
];

const RCC = {
  seriesMatchingRules: RCCSeriesMatchingRules,
  studyMatchingRules: currentStudyMatchingRules,
};

const RCCPrior = {
  seriesMatchingRules: RCCSeriesMatchingRules,
  studyMatchingRules: priorStudyMatchingRules,
};

const LCC = {
  seriesMatchingRules: LCCSeriesMatchingRules,
  studyMatchingRules: currentStudyMatchingRules,
};

const LCCPrior = {
  seriesMatchingRules: LCCSeriesMatchingRules,
  studyMatchingRules: priorStudyMatchingRules,
};

const RMLO = {
  seriesMatchingRules: RMLOSeriesMatchingRules,
  studyMatchingRules: currentStudyMatchingRules,
};

const RMLOPrior = {
  seriesMatchingRules: RMLOSeriesMatchingRules,
  studyMatchingRules: priorStudyMatchingRules,
};

const LMLO = {
  seriesMatchingRules: LMLOSeriesMatchingRules,
  studyMatchingRules: currentStudyMatchingRules,
};

const LMLOPrior = {
  seriesMatchingRules: LMLOSeriesMatchingRules,
  studyMatchingRules: priorStudyMatchingRules,
};

export { RCC, LCC, RMLO, LMLO, RCCPrior, LCCPrior, RMLOPrior, LMLOPrior };
