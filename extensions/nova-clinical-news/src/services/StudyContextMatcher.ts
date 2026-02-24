import { ClinicalArticle, StudyContext } from './types';

const MODALITY_TERMS: Record<string, string[]> = {
  CT: ['computed tomography', 'ct scan', 'ct imaging', 'tomografia'],
  MR: ['magnetic resonance', 'mri', 'resonancia'],
  CR: ['radiography', 'x-ray', 'plain film', 'radiografia'],
  DX: ['digital radiography', 'x-ray', 'radiografia'],
  US: ['ultrasonography', 'ultrasound', 'ecografia'],
  MG: ['mammography', 'breast imaging', 'mamografia'],
  NM: ['nuclear medicine', 'scintigraphy', 'gammagrafia'],
  PT: ['positron emission tomography', 'pet', 'pet/ct', 'pet-ct'],
  XA: ['angiography', 'angiografia'],
  RF: ['fluoroscopy', 'fluoroscopia'],
  OT: [],
};

const BODY_PART_TERMS: Record<string, string[]> = {
  CHEST: ['chest', 'thorax', 'lung', 'pulmonary', 'thoracic', 'mediastin'],
  ABDOMEN: ['abdomen', 'abdominal', 'liver', 'hepatic', 'kidney', 'renal', 'pancrea', 'spleen'],
  HEAD: ['brain', 'head', 'cranial', 'intracranial', 'cerebr'],
  PELVIS: ['pelvis', 'pelvic', 'hip', 'bladder', 'prostat', 'uter'],
  SPINE: ['spine', 'spinal', 'vertebr', 'lumbar', 'cervical', 'thoracic spine'],
  NECK: ['neck', 'cervical', 'thyroid', 'laryn', 'pharyn'],
  EXTREMITY: ['extremit', 'musculoskeletal', 'bone', 'fractur', 'joint'],
  LSPINE: ['lumbar', 'lumbar spine', 'lumbosacr'],
  CSPINE: ['cervical spine', 'cervical'],
  TSPINE: ['thoracic spine'],
  BREAST: ['breast', 'mammary'],
  HEART: ['heart', 'cardiac', 'coronar', 'cardiovascular'],
  KNEE: ['knee', 'rodilla', 'meniscus', 'ligament'],
  SHOULDER: ['shoulder', 'hombro', 'rotator cuff'],
  ANKLE: ['ankle', 'tobillo'],
  WRIST: ['wrist', 'muñeca', 'carpal'],
  HAND: ['hand', 'mano', 'finger'],
  FOOT: ['foot', 'pie', 'metatars'],
  ELBOW: ['elbow', 'codo'],
  HIP: ['hip', 'cadera', 'femoral'],
};

export default class StudyContextMatcher {
  extractStudyContext(displaySets: any[]): StudyContext {
    if (!displaySets || displaySets.length === 0) {
      return {
        modality: '',
        bodyPartExamined: '',
        studyDescription: '',
        seriesDescriptions: [],
      };
    }

    const firstDS = displaySets[0];
    const firstInstance = firstDS?.instances?.[0];

    const modality = firstDS?.Modality || firstInstance?.Modality || '';
    const bodyPartExamined =
      firstInstance?.BodyPartExamined || firstDS?.BodyPartExamined || '';
    const studyDescription =
      firstInstance?.StudyDescription || firstDS?.StudyDescription || '';

    const seriesDescriptions = displaySets
      .map(ds => ds.SeriesDescription || ds.instances?.[0]?.SeriesDescription || '')
      .filter(Boolean);

    return {
      modality,
      bodyPartExamined,
      studyDescription,
      seriesDescriptions,
    };
  }

  scoreArticle(article: ClinicalArticle, context: StudyContext): number {
    if (!context.modality && !context.bodyPartExamined && !context.studyDescription) {
      return 0;
    }

    const titleLower = article.title.toLowerCase();
    const journalLower = article.journal.toLowerCase();
    const textToSearch = `${titleLower} ${article.keywords.join(' ').toLowerCase()}`;

    let score = 0;
    const matchedModalities: string[] = [];
    const matchedBodyParts: string[] = [];

    // Score por modalidad (hasta 35 puntos)
    if (context.modality) {
      const terms = MODALITY_TERMS[context.modality] || [];
      for (const term of terms) {
        if (textToSearch.includes(term.toLowerCase())) {
          score += 35;
          matchedModalities.push(context.modality);
          break;
        }
      }
    }

    // Score por parte del cuerpo (hasta 35 puntos)
    if (context.bodyPartExamined) {
      const normalizedPart = context.bodyPartExamined.toUpperCase();
      const terms = BODY_PART_TERMS[normalizedPart] || [];
      for (const term of terms) {
        if (textToSearch.includes(term.toLowerCase())) {
          score += 35;
          matchedBodyParts.push(context.bodyPartExamined);
          break;
        }
      }
    }

    // Score por descripción del estudio (hasta 20 puntos)
    if (context.studyDescription) {
      const descWords = context.studyDescription
        .toLowerCase()
        .split(/[\s\/\\,;]+/)
        .filter(w => w.length > 3);

      let descMatches = 0;
      for (const word of descWords) {
        if (textToSearch.includes(word)) {
          descMatches++;
        }
      }
      if (descMatches > 0) {
        score += Math.min(20, descMatches * 7);
      }
    }

    // Score por descripción de series (hasta 10 puntos)
    if (context.seriesDescriptions.length > 0) {
      for (const desc of context.seriesDescriptions) {
        const seriesWords = desc
          .toLowerCase()
          .split(/[\s\/\\,;]+/)
          .filter(w => w.length > 3);
        for (const word of seriesWords) {
          if (textToSearch.includes(word)) {
            score += 5;
            break;
          }
        }
      }
      score = Math.min(score, 100);
    }

    // Bonus por journal de alto impacto en radiología
    const topRadiologyJournals = ['radiology', 'radiographics', 'european radiology'];
    if (topRadiologyJournals.some(j => journalLower.includes(j))) {
      score = Math.min(100, score + 5);
    }

    article.matchedModalities = matchedModalities;
    article.matchedBodyParts = matchedBodyParts;

    return Math.min(100, score);
  }
}
