'use client';

import React, { useEffect, useState, useRef } from 'react';

type AnimatedCounterProps = {
    value: number;
    duration?: number;
    formatFn?: (value: number) => string;
    className?: string;
};

export function AnimatedCounter({
    value,
    duration = 500,
    formatFn = (v) => v.toLocaleString('pt-BR'),
    className = '',
}: AnimatedCounterProps) {
    const [displayValue, setDisplayValue] = useState(value);
    const previousValue = useRef(value);
    const animationRef = useRef<number | null>(null);

    useEffect(() => {
        const startValue = previousValue.current;
        const endValue = value;
        const diff = endValue - startValue;

        if (diff === 0) return;

        const startTime = performance.now();

        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Easing function (ease-out cubic)
            const easeOut = 1 - Math.pow(1 - progress, 3);

            const currentValue = startValue + diff * easeOut;
            setDisplayValue(Math.round(currentValue));

            if (progress < 1) {
                animationRef.current = requestAnimationFrame(animate);
            } else {
                setDisplayValue(endValue);
                previousValue.current = endValue;
            }
        };

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [value, duration]);

    return <span className={className}>{formatFn(displayValue)}</span>;
}

type AnimatedCurrencyProps = {
    value: number;
    duration?: number;
    className?: string;
};

export function AnimatedCurrency({
    value,
    duration = 500,
    className = '',
}: AnimatedCurrencyProps) {
    return (
        <AnimatedCounter
            value={value}
            duration={duration}
            formatFn={(v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            className={className}
        />
    );
}
