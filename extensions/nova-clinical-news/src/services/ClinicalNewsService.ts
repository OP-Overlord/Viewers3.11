import { PubSubService } from '@ohif/core';
import PubMedApi from './PubMedApi';
import ArticleStorage from './ArticleStorage';
import StudyContextMatcher from './StudyContextMatcher';
import { ClinicalArticle, StudyContext } from './types';

const EVENTS = {
  ARTICLES_UPDATED: 'event::clinicalNewsService:articlesUpdated',
  UNREAD_COUNT_CHANGED: 'event::clinicalNewsService:unreadCountChanged',
  RELEVANT_ARTICLE_FOUND: 'event::clinicalNewsService:relevantArticleFound',
};

export default class ClinicalNewsService extends PubSubService {
  static EVENTS = EVENTS;

  static REGISTRATION = {
    name: 'clinicalNewsService',
    altName: 'ClinicalNewsService',
    create: () => new ClinicalNewsService(),
  };

  private _pubMedApi: PubMedApi;
  private _storage: ArticleStorage;
  private _matcher: StudyContextMatcher;
  private _fetchTimer: ReturnType<typeof setInterval> | null = null;
  private _currentContext: StudyContext | null = null;
  private _servicesManager: any = null;
  private _displaySetSubscription: any = null;
  private _isFetching = false;

  constructor() {
    super(EVENTS);
    this._pubMedApi = new PubMedApi();
    this._storage = new ArticleStorage();
    this._matcher = new StudyContextMatcher();
  }

  init(servicesManager: any): void {
    this._servicesManager = servicesManager;
    this._subscribeToDisplaySetChanges();
    this._startPeriodicFetch();
  }

  private _subscribeToDisplaySetChanges(): void {
    if (!this._servicesManager) {
      return;
    }
    const { displaySetService } = this._servicesManager.services;
    if (!displaySetService) {
      return;
    }

    this._displaySetSubscription = displaySetService.subscribe(
      displaySetService.EVENTS.DISPLAY_SETS_ADDED,
      () => {
        this._updateStudyContext();
        this._checkRelevanceForCurrentStudy();
      }
    );
  }

  private _updateStudyContext(): void {
    if (!this._servicesManager) {
      return;
    }
    const { displaySetService } = this._servicesManager.services;
    if (!displaySetService) {
      return;
    }
    const displaySets = displaySetService.getActiveDisplaySets();
    this._currentContext = this._matcher.extractStudyContext(displaySets);
  }

  private _startPeriodicFetch(): void {
    const prefs = this._storage.getPreferences();
    if (!prefs.enabled) {
      return;
    }

    const interval = (prefs.fetchIntervalMinutes || 120) * 60 * 1000;
    const lastFetch = prefs.lastFetchTimestamp
      ? new Date(prefs.lastFetchTimestamp).getTime()
      : 0;
    const now = Date.now();

    if (now - lastFetch >= interval) {
      this._fetchArticles();
    }

    this._fetchTimer = setInterval(() => this._fetchArticles(), interval);
  }

  async _fetchArticles(): Promise<void> {
    if (this._isFetching) {
      return;
    }
    this._isFetching = true;

    try {
      let query = this._pubMedApi.buildRadiologyQuery();

      if (this._currentContext?.modality || this._currentContext?.bodyPartExamined) {
        const contextQuery = this._pubMedApi.buildContextualQuery(
          this._currentContext.modality,
          this._currentContext.bodyPartExamined
        );
        query = `(${query}) OR (${contextQuery})`;
      }

      const pmids = await this._pubMedApi.searchArticles(query);
      if (pmids.length === 0) {
        return;
      }

      const articles = await this._pubMedApi.fetchSummaries(pmids);
      if (articles.length === 0) {
        return;
      }

      // Calcular relevancia antes de almacenar
      if (this._currentContext) {
        for (const article of articles) {
          article.relevanceScore = this._matcher.scoreArticle(article, this._currentContext);
        }
      }

      const newArticles = this._storage.addArticles(articles);

      if (newArticles.length > 0) {
        this._storage.savePreferences({ lastFetchTimestamp: new Date().toISOString() });
        this._broadcastEvent(EVENTS.ARTICLES_UPDATED, { articles: this.getArticles() });
        this._broadcastEvent(EVENTS.UNREAD_COUNT_CHANGED, {
          count: this._storage.getUnreadCount(),
        });

        if (this._currentContext) {
          this._checkRelevanceForNewArticles(newArticles);
        }
      }
    } catch (error) {
      console.warn('[ClinicalNewsService] Error fetching articles:', error);
    } finally {
      this._isFetching = false;
    }
  }

  private _checkRelevanceForNewArticles(articles: ClinicalArticle[]): void {
    if (!this._currentContext) {
      return;
    }

    const prefs = this._storage.getPreferences();
    if (!prefs.showPopupNotifications) {
      return;
    }

    const highlyRelevant = articles.filter(article => article.relevanceScore >= 70);

    if (highlyRelevant.length > 0) {
      this._broadcastEvent(EVENTS.RELEVANT_ARTICLE_FOUND, {
        articles: highlyRelevant,
        context: this._currentContext,
      });
    }
  }

  private _checkRelevanceForCurrentStudy(): void {
    if (!this._currentContext) {
      return;
    }
    const articles = this.getArticles();
    if (articles.length === 0) {
      return;
    }

    const scored = articles.map(a => ({
      ...a,
      relevanceScore: this._matcher.scoreArticle(a, this._currentContext!),
    }));
    this._storage.saveArticles(scored);

    // Notificar artículos muy relevantes no leídos
    const prefs = this._storage.getPreferences();
    if (prefs.showPopupNotifications) {
      const highlyRelevant = scored.filter(
        a => a.relevanceScore >= 70 && !a.isRead && !a.isDismissed
      );
      if (highlyRelevant.length > 0) {
        this._broadcastEvent(EVENTS.RELEVANT_ARTICLE_FOUND, {
          articles: highlyRelevant.slice(0, 1),
          context: this._currentContext,
        });
      }
    }

    this._broadcastEvent(EVENTS.ARTICLES_UPDATED, { articles: scored });
  }

  // === Public API ===

  getArticles(): ClinicalArticle[] {
    return this._storage.getArticles();
  }

  getUnreadCount(): number {
    return this._storage.getUnreadCount();
  }

  getRelevantArticles(minScore = 30): ClinicalArticle[] {
    return this.getArticles().filter(a => a.relevanceScore >= minScore && !a.isDismissed);
  }

  markAsRead(pmid: string): void {
    this._storage.markAsRead(pmid);
    this._broadcastEvent(EVENTS.UNREAD_COUNT_CHANGED, {
      count: this._storage.getUnreadCount(),
    });
  }

  markAsDismissed(pmid: string): void {
    this._storage.markAsDismissed(pmid);
    this._broadcastEvent(EVENTS.ARTICLES_UPDATED, { articles: this.getArticles() });
    this._broadcastEvent(EVENTS.UNREAD_COUNT_CHANGED, {
      count: this._storage.getUnreadCount(),
    });
  }

  updatePreferences(prefs: Partial<any>): void {
    this._storage.savePreferences(prefs);
  }

  async forceRefresh(): Promise<void> {
    await this._fetchArticles();
  }

  destroy(): void {
    if (this._fetchTimer) {
      clearInterval(this._fetchTimer);
      this._fetchTimer = null;
    }
    if (this._displaySetSubscription) {
      this._displaySetSubscription.unsubscribe();
      this._displaySetSubscription = null;
    }
    this._currentContext = null;
    this._servicesManager = null;
  }
}
