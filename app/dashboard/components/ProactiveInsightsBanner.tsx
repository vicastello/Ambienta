'use client';

import { useEffect, useState, useCallback } from 'react';
import {
    AlertTriangle,
    TrendingUp,
    TrendingDown,
    Lightbulb,
    X,
    ChevronRight,
    ChevronLeft,
    Sparkles,
    RefreshCw,
    Zap,
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

const PRIORITY_STYLES: Record<InsightPriority, { bg: string; border: string; text: string; icon: string }> = {
    critical: {
        bg: 'bg-gradient-to-r from-red-500/20 to-red-500/10',
        border: 'border-red-500/30',
        text: 'text-red-200',
        icon: 'text-red-400',
    },
    high: {
        bg: 'bg-gradient-to-r from-orange-500/20 to-orange-500/10',
        border: 'border-orange-500/30',
        text: 'text-orange-200',
        icon: 'text-orange-400',
    },
    medium: {
        bg: 'bg-gradient-to-r from-yellow-500/15 to-yellow-500/5',
        border: 'border-yellow-500/25',
        text: 'text-yellow-200',
        icon: 'text-yellow-400',
    },
    low: {
        bg: 'bg-gradient-to-r from-blue-500/15 to-blue-500/5',
        border: 'border-blue-500/25',
        text: 'text-blue-200',
        icon: 'text-blue-400',
    },
};

export function ProactiveInsightsBanner({
    dashboardData,
    className = ''
}: ProactiveInsightsBannerProps) {
    const [insights, setInsights] = useState<ProactiveInsight[]>([]);
    const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [hasAttempted, setHasAttempted] = useState(false);

    const fetchInsights = useCallback(async () => {
        if (!dashboardData) return;

        setIsLoading(true);
        setHasAttempted(true);
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
        if (dashboardData && !hasAttempted) {
            fetchInsights();
        }
    }, [dashboardData, hasAttempted, fetchInsights]);

    const handleDismiss = (id: string) => {
        setDismissedIds(prev => new Set([...prev, id]));
        if (currentIndex < visibleInsights.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    };

    const visibleInsights = insights.filter(i => !dismissedIds.has(i.id));
    const currentInsight = visibleInsights[currentIndex];

    // Loading state while fetching
    if (isLoading && insights.length === 0) {
        return (
            <div className={`relative ${className}`}>
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-accent/20 bg-accent/5 animate-pulse">
                    <Zap size={18} className="text-accent animate-pulse" />
                    <span className="text-sm text-muted">Analisando insights...</span>
                </div>
            </div>
        );
    }

    // No insights or all dismissed
    if (!currentInsight || visibleInsights.length === 0) {
        // Don't show anything if no insights after analysis
        if (hasAttempted) return null;

        // Waiting for data
        return (
            <div className={`relative ${className}`}>
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/5 bg-white/5">
                    <Sparkles size={18} className="text-muted" />
                    <span className="text-sm text-muted">Aguardando dados para análise...</span>
                </div>
            </div>
        );
    }

    const Icon = ICON_MAP[currentInsight.type] || Lightbulb;
    const style = PRIORITY_STYLES[currentInsight.priority];

    return (
        <div className={`relative ${className}`}>
            <div
                className={`
                    relative flex items-center gap-3 px-4 py-3 rounded-xl border
                    ${style.bg} ${style.border}
                    transition-all duration-300 animate-fade-scale
                    overflow-hidden
                `}
            >
                {/* Glow line */}
                <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-current to-transparent ${style.icon} opacity-30`} />

                {/* Icon */}
                <div className={`flex-shrink-0 p-2 rounded-lg bg-black/20 ${style.icon}`}>
                    <Icon size={18} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={`font-medium text-sm truncate ${style.text}`}>
                            {currentInsight.title}
                        </span>
                        {currentInsight.metric?.change != null && (
                            <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${currentInsight.metric.change >= 0 ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                                {currentInsight.metric.change >= 0 ? '+' : ''}{currentInsight.metric.change.toFixed(1)}%
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-white/60 truncate mt-0.5">
                        {currentInsight.body}
                    </p>
                </div>

                {/* Navigation */}
                {visibleInsights.length > 1 && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                            onClick={() => setCurrentIndex(prev => (prev - 1 + visibleInsights.length) % visibleInsights.length)}
                            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                            aria-label="Anterior"
                        >
                            <ChevronLeft size={16} className="text-white/50" />
                        </button>
                        <span className="text-xs text-white/40 tabular-nums min-w-[2rem] text-center">
                            {currentIndex + 1}/{visibleInsights.length}
                        </span>
                        <button
                            onClick={() => setCurrentIndex(prev => (prev + 1) % visibleInsights.length)}
                            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                            aria-label="Próximo"
                        >
                            <ChevronRight size={16} className="text-white/50" />
                        </button>
                    </div>
                )}

                {/* Action button */}
                {currentInsight.action && (
                    <a
                        href={currentInsight.action.href}
                        className="flex-shrink-0 text-xs px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors font-medium"
                    >
                        {currentInsight.action.label}
                    </a>
                )}

                {/* Dismiss */}
                <button
                    onClick={() => handleDismiss(currentInsight.id)}
                    className="flex-shrink-0 p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                    aria-label="Dispensar"
                >
                    <X size={16} className="text-white/40" />
                </button>

                {/* Refresh indicator */}
                {isLoading && (
                    <div className="absolute top-2 right-2">
                        <RefreshCw size={10} className="animate-spin text-white/20" />
                    </div>
                )}
            </div>
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
