'use client';

import { useEffect, useState, useCallback } from 'react';
import {
    AlertTriangle,
    TrendingUp,
    TrendingDown,
    Lightbulb,
    X,
    ChevronRight,
    Sparkles,
    RefreshCw,
} from 'lucide-react';
import type { ProactiveInsight, InsightType, InsightPriority } from '@/lib/ai/proactive-insights';

interface ProactiveInsightsBannerProps {
    dashboardData?: unknown;
    className?: string;
}

const ICON_MAP: Record<InsightType, typeof AlertTriangle> = {
    stock_alert: AlertTriangle,
    sales_drop: TrendingDown,
    sales_spike: TrendingUp,
    channel_growth: TrendingUp,
    opportunity: Lightbulb,
    trend: TrendingUp,
    risk: AlertTriangle,
};

const PRIORITY_COLORS: Record<InsightPriority, string> = {
    critical: 'bg-red-500/20 border-red-500/40 text-red-300',
    high: 'bg-orange-500/20 border-orange-500/40 text-orange-300',
    medium: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300',
    low: 'bg-blue-500/20 border-blue-500/40 text-blue-300',
};

const PRIORITY_ICON_COLORS: Record<InsightPriority, string> = {
    critical: 'text-red-400',
    high: 'text-orange-400',
    medium: 'text-yellow-400',
    low: 'text-blue-400',
};

export function ProactiveInsightsBanner({
    dashboardData,
    className = ''
}: ProactiveInsightsBannerProps) {
    const [insights, setInsights] = useState<ProactiveInsight[]>([]);
    const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);

    const fetchInsights = useCallback(async () => {
        if (!dashboardData) return;

        setIsLoading(true);
        try {
            const response = await fetch('/api/ai/proactive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dashboardData, includeAI: false }),
            });

            if (response.ok) {
                const data = await response.json();
                setInsights(data.insights || []);
                setCurrentIndex(0);
            }
        } catch (error) {
            console.error('[ProactiveInsights] Error fetching:', error);
        } finally {
            setIsLoading(false);
        }
    }, [dashboardData]);

    useEffect(() => {
        fetchInsights();
    }, [fetchInsights]);

    const handleDismiss = (id: string) => {
        setDismissedIds(prev => new Set([...prev, id]));
        // Move to next insight
        if (currentIndex < visibleInsights.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    };

    const visibleInsights = insights.filter(i => !dismissedIds.has(i.id));
    const currentInsight = visibleInsights[currentIndex];

    if (!currentInsight || visibleInsights.length === 0) {
        return null;
    }

    const Icon = ICON_MAP[currentInsight.type] || Lightbulb;
    const priorityClass = PRIORITY_COLORS[currentInsight.priority];
    const iconColor = PRIORITY_ICON_COLORS[currentInsight.priority];

    return (
        <div className={`relative ${className}`}>
            <div
                className={`
          flex items-center gap-3 px-4 py-3 rounded-xl border
          ${priorityClass}
          transition-all duration-300
        `}
            >
                {/* Icon */}
                <div className={`flex-shrink-0 ${iconColor}`}>
                    <Icon size={20} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                            {currentInsight.title}
                        </span>
                        {currentInsight.metric?.change != null && (
                            <span className={`text-xs font-mono ${currentInsight.metric.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {currentInsight.metric.change >= 0 ? '+' : ''}{currentInsight.metric.change.toFixed(1)}%
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-white/70 truncate mt-0.5">
                        {currentInsight.body}
                    </p>
                </div>

                {/* Navigation */}
                {visibleInsights.length > 1 && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-xs text-white/50">
                            {currentIndex + 1}/{visibleInsights.length}
                        </span>
                        <button
                            onClick={() => setCurrentIndex(prev => (prev + 1) % visibleInsights.length)}
                            className="p-1 hover:bg-white/10 rounded-md transition-colors"
                            aria-label="Próximo insight"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                )}

                {/* Action button */}
                {currentInsight.action && (
                    <a
                        href={currentInsight.action.href}
                        className="flex-shrink-0 text-xs px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                    >
                        {currentInsight.action.label}
                    </a>
                )}

                {/* Dismiss */}
                <button
                    onClick={() => handleDismiss(currentInsight.id)}
                    className="flex-shrink-0 p-1 hover:bg-white/10 rounded-md transition-colors"
                    aria-label="Dispensar"
                >
                    <X size={16} />
                </button>
            </div>

            {/* Refresh indicator */}
            {isLoading && (
                <div className="absolute top-1 right-1">
                    <RefreshCw size={12} className="animate-spin text-white/30" />
                </div>
            )}
        </div>
    );
}

/**
 * Compact pill version for header/navbar
 */
export function ProactiveInsightsPill({
    dashboardData
}: { dashboardData?: unknown }) {
    const [insights, setInsights] = useState<ProactiveInsight[]>([]);
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        if (!dashboardData) return;

        fetch('/api/ai/proactive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dashboardData, includeAI: false }),
        })
            .then(r => r.json())
            .then(data => setInsights(data.insights || []))
            .catch(() => { });
    }, [dashboardData]);

    const criticalCount = insights.filter(i => i.priority === 'critical' || i.priority === 'high').length;

    if (insights.length === 0) return null;

    return (
        <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={`
        flex items-center gap-2 px-3 py-1.5 rounded-full text-sm
        transition-all duration-200
        ${criticalCount > 0
                    ? 'bg-orange-500/20 text-orange-300 hover:bg-orange-500/30'
                    : 'bg-accent/20 text-accent hover:bg-accent/30'
                }
      `}
        >
            <Sparkles size={14} />
            <span>{insights.length} insight{insights.length > 1 ? 's' : ''}</span>
            {criticalCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
            )}
        </button>
    );
}

export default ProactiveInsightsBanner;
