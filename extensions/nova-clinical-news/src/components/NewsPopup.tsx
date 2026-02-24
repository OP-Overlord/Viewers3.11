import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSystem } from '@ohif/core';
import ArticleCard from './ArticleCard';
import { ClinicalArticle } from '../services/types';
import ClinicalNewsService from '../services/ClinicalNewsService';
import './NewsPopup.css';

type FilterType = 'unread' | 'relevant' | 'all';

interface NewsPopupProps {
  onClose: () => void;
  anchorRef: React.RefObject<HTMLDivElement>;
}

function NewsPopup({ onClose, anchorRef }: NewsPopupProps) {
  const { servicesManager } = useSystem();
  const [articles, setArticles] = useState<ClinicalArticle[]>([]);
  const [filterCounts, setFilterCounts] = useState({ unread: 0, relevant: 0, all: 0 });
  const [filter, setFilter] = useState<FilterType>('unread');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  const clinicalNewsService = servicesManager.services
    .clinicalNewsService as ClinicalNewsService;

  const loadArticles = useCallback(() => {
    if (!clinicalNewsService) {
      return;
    }
    const all = clinicalNewsService.getArticles().filter(a => !a.isDismissed);
    const unread = all.filter(a => !a.isRead);
    const relevant = clinicalNewsService.getRelevantArticles(30);

    setFilterCounts({ unread: unread.length, relevant: relevant.length, all: all.length });

    let displayed: ClinicalArticle[];
    switch (filter) {
      case 'relevant':
        displayed = relevant;
        break;
      case 'unread':
        displayed = unread;
        break;
      default:
        displayed = all;
    }
    setArticles(displayed);
  }, [clinicalNewsService, filter]);

  useEffect(() => {
    if (!clinicalNewsService) {
      return;
    }
    loadArticles();

    const sub = clinicalNewsService.subscribe(
      ClinicalNewsService.EVENTS.ARTICLES_UPDATED,
      () => loadArticles()
    );
    return () => sub.unsubscribe();
  }, [clinicalNewsService, loadArticles]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, anchorRef]);

  // Cerrar con Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleRefresh = async () => {
    if (!clinicalNewsService || isRefreshing) {
      return;
    }
    setIsRefreshing(true);
    try {
      await clinicalNewsService.forceRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleMarkAsRead = (pmid: string) => {
    clinicalNewsService?.markAsRead(pmid);
  };

  const handleDismiss = (pmid: string) => {
    clinicalNewsService?.markAsDismissed(pmid);
    setArticles(prev => prev.filter(a => a.pmid !== pmid));
  };

  // Posicionar popup debajo del botón bell
  const anchorRect = anchorRef.current?.getBoundingClientRect();
  const popupStyle: React.CSSProperties = {
    position: 'fixed',
    top: anchorRect ? anchorRect.bottom + 8 : 60,
    right: Math.max(16, window.innerWidth - (anchorRect?.right || window.innerWidth)),
    zIndex: 10000,
  };

  const filterConfig: { key: FilterType; label: string }[] = [
    { key: 'unread', label: 'Sin leer' },
    { key: 'relevant', label: 'Relevantes' },
    { key: 'all', label: 'Todos' },
  ];

  const emptyMessages: Record<FilterType, { icon: string; title: string; subtitle: string }> = {
    unread: {
      icon: '✓',
      title: 'Todo al día',
      subtitle: 'No hay artículos sin leer',
    },
    relevant: {
      icon: '🔍',
      title: 'Sin resultados relevantes',
      subtitle: 'No hay artículos que coincidan\ncon el estudio actual',
    },
    all: {
      icon: '📭',
      title: 'Sin artículos',
      subtitle: 'Actualiza para buscar nueva literatura',
    },
  };

  const empty = emptyMessages[filter];

  return (
    <div ref={popupRef} style={popupStyle} className="nova-news-popup">
      {/* Header */}
      <div className="nova-news-popup-header">
        <div className="nova-news-header-left">
          <h3>Literatura Clínica</h3>
          <span className="nova-news-pubmed-badge">PubMed</span>
        </div>
        <div className="nova-news-header-actions">
          <button
            className={`nova-news-icon-btn ${isRefreshing ? 'spinning' : ''}`}
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Actualizar"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
          <button className="nova-news-icon-btn" onClick={onClose} title="Cerrar">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Filtros – tab con subrayado */}
      <div className="nova-news-popup-filters">
        {filterConfig.map(({ key, label }) => (
          <button
            key={key}
            className={`nova-news-filter-btn ${filter === key ? 'active' : ''}`}
            onClick={() => setFilter(key)}
          >
            {label}
            <span className="nova-news-filter-count">{filterCounts[key]}</span>
          </button>
        ))}
      </div>

      {/* Lista de artículos */}
      <div className="nova-news-popup-list">
        {articles.length === 0 ? (
          <div className="nova-news-empty">
            <div className="nova-news-empty-icon">{empty.icon}</div>
            <p className="nova-news-empty-title">{empty.title}</p>
            <p className="nova-news-empty-subtitle">{empty.subtitle}</p>
          </div>
        ) : (
          articles.map(article => (
            <ArticleCard
              key={article.pmid}
              article={article}
              onRead={() => handleMarkAsRead(article.pmid)}
              onDismiss={() => handleDismiss(article.pmid)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="nova-news-popup-footer">
        <span className="nova-news-footer-text">
          PubMed · {filterCounts.all} artículo{filterCounts.all !== 1 ? 's' : ''} disponibles
        </span>
      </div>
    </div>
  );
}

export default NewsPopup;
