import { ClinicalArticle, PubMedSearchResult, PubMedSummaryResult } from './types';

const PUBMED_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

const HIGH_IMPACT_JOURNALS = [
  // RSNA journals
  'Radiology',
  'Radiographics',
  'Radiology. Artificial intelligence',
  'Radiology. Cardiothoracic imaging',
  'Radiology. Imaging cancer',
  // ESR / European Radiology journals
  'European radiology',
  'European radiology experimental',
  'Insights into imaging',
  // Other high-impact radiology
  'AJR. American journal of roentgenology',
  'Journal of the American College of Radiology',
  'The British journal of radiology',
  'Academic radiology',
  'Investigative radiology',
  'Journal of computer assisted tomography',
  'Journal of magnetic resonance imaging',
  'Neuroradiology',
  'Pediatric radiology',
  'Skeletal radiology',
  'Clinical radiology',
  'Korean journal of radiology',
  'Diagnostic and interventional radiology',
  // General medicine (high impact)
  'JAMA',
  'The New England journal of medicine',
  'The Lancet',
];

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default class PubMedApi {
  private _lastRequestTime = 0;

  private async _rateLimitedFetch(url: string): Promise<Response> {
    const now = Date.now();
    const elapsed = now - this._lastRequestTime;
    if (elapsed < 340) {
      await delay(340 - elapsed);
    }
    this._lastRequestTime = Date.now();
    return fetch(url);
  }

  async searchArticles(query: string, maxResults = 15): Promise<string[]> {
    const params = new URLSearchParams({
      db: 'pubmed',
      retmode: 'json',
      retmax: String(maxResults),
      sort: 'date',
      datetype: 'pdat',
      reldate: '90',
      term: query,
    });

    try {
      const response = await this._rateLimitedFetch(`${PUBMED_BASE}/esearch.fcgi?${params}`);
      if (!response.ok) {
        console.warn('[PubMedApi] Search failed:', response.status);
        return [];
      }
      const data: PubMedSearchResult = await response.json();
      return data.esearchresult?.idlist || [];
    } catch (error) {
      console.warn('[PubMedApi] Search error:', error);
      return [];
    }
  }

  async fetchSummaries(pmids: string[]): Promise<ClinicalArticle[]> {
    if (pmids.length === 0) {
      return [];
    }

    const params = new URLSearchParams({
      db: 'pubmed',
      retmode: 'json',
      id: pmids.join(','),
    });

    try {
      const response = await this._rateLimitedFetch(`${PUBMED_BASE}/esummary.fcgi?${params}`);
      if (!response.ok) {
        console.warn('[PubMedApi] Summary fetch failed:', response.status);
        return [];
      }
      const data: PubMedSummaryResult = await response.json();

      if (!data.result?.uids) {
        return [];
      }

      const articles: ClinicalArticle[] = [];
      const now = new Date().toISOString();

      for (const uid of data.result.uids) {
        const entry = data.result[uid];
        if (!entry || !entry.title) {
          continue;
        }

        const journal = (entry.fulljournalname || entry.source || '').toLowerCase();
        const isHighImpact = HIGH_IMPACT_JOURNALS.some(
          j => journal.includes(j.toLowerCase())
        );

        if (!isHighImpact) {
          continue;
        }

        const authors = (entry.authors || []).map((a: any) => a.name || '');
        const doi = entry.elocationid || '';
        const pubDate = entry.sortpubdate || entry.pubdate || '';

        articles.push({
          pmid: uid,
          title: entry.title,
          authors,
          journal: entry.fulljournalname || entry.source || '',
          pubDate,
          abstract: '',
          doi,
          url: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`,
          keywords: [],
          relevanceScore: 0,
          fetchedAt: now,
          isRead: false,
          isDismissed: false,
          matchedModalities: [],
          matchedBodyParts: [],
        });
      }

      return articles;
    } catch (error) {
      console.warn('[PubMedApi] Summary error:', error);
      return [];
    }
  }

  buildRadiologyQuery(): string {
    const journalFilter = HIGH_IMPACT_JOURNALS.slice(0, 14)
      .map(j => `"${j}"[Journal]`)
      .join(' OR ');

    return [
      '(radiology[MeSH] OR diagnostic imaging[MeSH] OR radiography[MeSH])',
      `AND (${journalFilter})`,
      'AND (Review[pt] OR Journal Article[pt])',
      'NOT Letter[pt] NOT Editorial[pt] NOT Comment[pt]',
      'AND English[lang]',
    ].join(' ');
  }

  buildContextualQuery(modality?: string, bodyPart?: string): string {
    const parts: string[] = [];

    if (modality) {
      const modalityTerms: Record<string, string> = {
        CT: '"computed tomography"[MeSH]',
        MR: '"magnetic resonance imaging"[MeSH]',
        CR: '"radiography"[MeSH]',
        DX: '"radiography"[MeSH]',
        US: '"ultrasonography"[MeSH]',
        MG: '"mammography"[MeSH]',
        NM: '"nuclear medicine"[MeSH]',
        PT: '"positron emission tomography"[MeSH]',
        XA: '"angiography"[MeSH]',
      };
      const term = modalityTerms[modality];
      if (term) {
        parts.push(term);
      }
    }

    if (bodyPart) {
      const bodyPartTerms: Record<string, string> = {
        CHEST: '"thorax"[MeSH]',
        ABDOMEN: '"abdomen"[MeSH]',
        HEAD: '"brain"[MeSH]',
        PELVIS: '"pelvis"[MeSH]',
        SPINE: '"spine"[MeSH]',
        NECK: '"neck"[MeSH]',
        EXTREMITY: '"extremities"[MeSH]',
        BREAST: '"breast"[MeSH]',
        HEART: '"heart"[MeSH]',
      };
      const normalizedPart = bodyPart.toUpperCase();
      const term = bodyPartTerms[normalizedPart];
      if (term) {
        parts.push(term);
      }
    }

    if (parts.length === 0) {
      return this.buildRadiologyQuery();
    }

    const journalFilter = HIGH_IMPACT_JOURNALS.slice(0, 14)
      .map(j => `"${j}"[Journal]`)
      .join(' OR ');

    return [
      `(${parts.join(' AND ')})`,
      `AND (${journalFilter})`,
      'AND (Review[pt] OR Journal Article[pt])',
      'NOT Letter[pt] NOT Editorial[pt]',
      'AND English[lang]',
    ].join(' ');
  }
}
