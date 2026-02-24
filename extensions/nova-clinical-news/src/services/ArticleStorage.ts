import { ClinicalArticle, NewsPreferences } from './types';

const STORAGE_KEY_ARTICLES = 'nova-clinical-news-articles';
const STORAGE_KEY_PREFS = 'nova-clinical-news-preferences';
const MAX_STORED_ARTICLES = 50;
const DISMISSED_EXPIRY_DAYS = 30;

const DEFAULT_PREFERENCES: NewsPreferences = {
  enabled: true,
  maxStoredArticles: MAX_STORED_ARTICLES,
  fetchIntervalMinutes: 120,
  lastFetchTimestamp: '',
  dismissedPmids: [],
  showPopupNotifications: true,
};

export default class ArticleStorage {
  getArticles(): ClinicalArticle[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_ARTICLES);
      if (!raw) {
        return [];
      }
      return JSON.parse(raw) as ClinicalArticle[];
    } catch {
      return [];
    }
  }

  saveArticles(articles: ClinicalArticle[]): void {
    const sorted = [...articles].sort(
      (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
    );

    const now = Date.now();
    const cleaned = sorted.filter(article => {
      if (article.isDismissed) {
        const fetchedAt = new Date(article.fetchedAt).getTime();
        const daysSinceFetch = (now - fetchedAt) / (1000 * 60 * 60 * 24);
        return daysSinceFetch < DISMISSED_EXPIRY_DAYS;
      }
      return true;
    });

    const trimmed = cleaned.slice(0, MAX_STORED_ARTICLES);

    try {
      localStorage.setItem(STORAGE_KEY_ARTICLES, JSON.stringify(trimmed));
    } catch (e) {
      console.warn('[ArticleStorage] Error saving articles:', e);
    }
  }

  addArticles(newArticles: ClinicalArticle[]): ClinicalArticle[] {
    const existing = this.getArticles();
    const existingPmids = new Set(existing.map(a => a.pmid));

    const unique = newArticles.filter(a => !existingPmids.has(a.pmid));
    if (unique.length === 0) {
      return [];
    }

    const merged = [...unique, ...existing];
    this.saveArticles(merged);
    return unique;
  }

  markAsRead(pmid: string): void {
    const articles = this.getArticles();
    const article = articles.find(a => a.pmid === pmid);
    if (article) {
      article.isRead = true;
      this.saveArticles(articles);
    }
  }

  markAsDismissed(pmid: string): void {
    const articles = this.getArticles();
    const article = articles.find(a => a.pmid === pmid);
    if (article) {
      article.isDismissed = true;
      this.saveArticles(articles);
    }
  }

  getUnreadCount(): number {
    return this.getArticles().filter(a => !a.isRead && !a.isDismissed).length;
  }

  getPreferences(): NewsPreferences {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PREFS);
      if (!raw) {
        return { ...DEFAULT_PREFERENCES };
      }
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_PREFERENCES };
    }
  }

  savePreferences(prefs: Partial<NewsPreferences>): void {
    const current = this.getPreferences();
    const updated = { ...current, ...prefs };
    try {
      localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(updated));
    } catch (e) {
      console.warn('[ArticleStorage] Error saving preferences:', e);
    }
  }

  clearAll(): void {
    localStorage.removeItem(STORAGE_KEY_ARTICLES);
    localStorage.removeItem(STORAGE_KEY_PREFS);
  }
}
