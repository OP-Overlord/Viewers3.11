import React from 'react';
import { ClinicalArticle } from '../services/types';

interface ArticleCardProps {
  article: ClinicalArticle;
  onRead: () => void;
  onDismiss: () => void;
}

function ArticleCard({ article, onRead, onDismiss }: ArticleCardProps) {
  const handleOpenArticle = () => {
    onRead();
    window.open(article.url, '_blank', 'noopener,noreferrer');
  };

  const getRelevance = (score: number) => {
    if (score >= 70) {
      return {
        dot: 'nova-news-relevance-dot-high',
        label: 'nova-news-relevance-label-high',
        text: 'Alta',
      };
    }
    if (score >= 30) {
      return {
        dot: 'nova-news-relevance-dot-mid',
        label: 'nova-news-relevance-label-mid',
        text: 'Media',
      };
    }
    return {
      dot: 'nova-news-relevance-dot-low',
      label: 'nova-news-relevance-label-low',
      text: 'Baja',
    };
  };

  const relevance = getRelevance(article.relevanceScore);
  const pubDate = article.pubDate
    ? new Date(article.pubDate).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '';

  return (
    <div
      className={`nova-news-card ${article.isRead ? 'nova-news-card-read' : 'nova-news-card-unread'}`}
    >
      {/* Dismiss X button – visible on card hover */}
      <button
        className="nova-news-card-dismiss"
        onClick={onDismiss}
        title="Ocultar artículo"
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Meta row */}
      <div className="nova-news-card-meta">
        {article.relevanceScore > 0 && (
          <>
            <span className={`nova-news-relevance-dot ${relevance.dot}`} />
            <span className={`nova-news-relevance-label ${relevance.label}`}>{relevance.text}</span>
            <span className="nova-news-meta-sep">·</span>
          </>
        )}
        <span className="nova-news-journal">{article.journal}</span>
        {pubDate && <span className="nova-news-date">{pubDate}</span>}
      </div>

      {/* Title */}
      <h4 className="nova-news-title" onClick={handleOpenArticle}>
        {article.title}
      </h4>

      {/* Authors */}
      <p className="nova-news-authors">
        {article.authors.slice(0, 3).join(', ')}
        {article.authors.length > 3 ? ' et al.' : ''}
      </p>

      {/* Tags */}
      {(article.matchedModalities.length > 0 || article.matchedBodyParts.length > 0) && (
        <div className="nova-news-tags">
          {article.matchedModalities.map(m => (
            <span key={m} className="nova-news-tag nova-news-tag-modality">
              {m}
            </span>
          ))}
          {article.matchedBodyParts.map(b => (
            <span key={b} className="nova-news-tag nova-news-tag-body">
              {b}
            </span>
          ))}
        </div>
      )}

      {/* Read link */}
      <div className="nova-news-card-footer">
        <button className="nova-news-read-link" onClick={handleOpenArticle}>
          Leer artículo
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default ArticleCard;
