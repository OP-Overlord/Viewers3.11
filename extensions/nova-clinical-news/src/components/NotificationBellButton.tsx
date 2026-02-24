import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useSystem } from '@ohif/core';
import { Icons, Tooltip, TooltipTrigger, TooltipContent } from '@ohif/ui-next';
import NewsPopup from './NewsPopup';
import ClinicalNewsService from '../services/ClinicalNewsService';

function NotificationBellButton() {
  const { servicesManager } = useSystem();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const clinicalNewsService = servicesManager.services
      .clinicalNewsService as ClinicalNewsService;
    if (!clinicalNewsService) {
      return;
    }

    setUnreadCount(clinicalNewsService.getUnreadCount());

    const unreadSub = clinicalNewsService.subscribe(
      ClinicalNewsService.EVENTS.UNREAD_COUNT_CHANGED,
      ({ count }: { count: number }) => setUnreadCount(count)
    );

    const relevanceSub = clinicalNewsService.subscribe(
      ClinicalNewsService.EVENTS.RELEVANT_ARTICLE_FOUND,
      ({ articles }: { articles: any[] }) => {
        const { uiNotificationService } = servicesManager.services;
        if (articles.length > 0 && uiNotificationService) {
          const article = articles[0];
          uiNotificationService.show({
            title: 'Articulo Relevante',
            message: article.title.length > 100
              ? article.title.substring(0, 100) + '...'
              : article.title,
            type: 'info',
            duration: 8000,
            position: 'bottom-right',
            action: {
              label: 'Ver',
              onClick: () => setIsPopupOpen(true),
            },
          });
        }
      }
    );

    return () => {
      unreadSub.unsubscribe();
      relevanceSub.unsubscribe();
    };
  }, [servicesManager]);

  const handleBellClick = useCallback(() => {
    setIsPopupOpen(prev => !prev);
  }, []);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            ref={bellRef}
            className="relative inline-flex cursor-pointer items-center justify-center rounded-lg p-2 text-foreground/80 hover:bg-background hover:text-highlight"
            onClick={handleBellClick}
          >
            <Icons.ByName
              name="notifications-info"
              className="h-5 w-5"
            />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Noticias clinicas{unreadCount > 0 ? ` (${unreadCount} sin leer)` : ''}
        </TooltipContent>
      </Tooltip>

      {isPopupOpen &&
        ReactDOM.createPortal(
          <NewsPopup
            onClose={() => setIsPopupOpen(false)}
            anchorRef={bellRef}
          />,
          document.body
        )}
    </>
  );
}

export default NotificationBellButton;
