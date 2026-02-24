export interface ClinicalArticle {
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  pubDate: string;
  abstract: string;
  doi: string;
  url: string;
  keywords: string[];
  relevanceScore: number;
  fetchedAt: string;
  isRead: boolean;
  isDismissed: boolean;
  matchedModalities: string[];
  matchedBodyParts: string[];
}

export interface StudyContext {
  modality: string;
  bodyPartExamined: string;
  studyDescription: string;
  seriesDescriptions: string[];
}

export interface NewsPreferences {
  enabled: boolean;
  maxStoredArticles: number;
  fetchIntervalMinutes: number;
  lastFetchTimestamp: string;
  dismissedPmids: string[];
  showPopupNotifications: boolean;
}

export interface PubMedSearchResult {
  esearchresult: {
    idlist: string[];
    count: string;
  };
}

export interface PubMedSummaryResult {
  result: {
    uids: string[];
    [pmid: string]: any;
  };
}
