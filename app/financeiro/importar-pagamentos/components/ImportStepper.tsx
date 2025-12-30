'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StepperStep {
    id: string;
    label: string;
}

export interface ImportStepperProps {
    /** Array of step definitions */
    steps: StepperStep[];
    /** Current active step ID */
    currentStep: string;
    /** Optional callback when a step is clicked */
    onStepClick?: (stepId: string) => void;
    /** Additional class names */
    className?: string;
}

export function ImportStepper({
    steps,
    currentStep,
    onStepClick,
    className,
}: ImportStepperProps) {
    const currentIndex = steps.findIndex(s => s.id === currentStep);

    const getStepState = (index: number): 'pending' | 'active' | 'complete' => {
        if (index < currentIndex) return 'complete';
        if (index === currentIndex) return 'active';
        return 'pending';
    };

    const getConnectorState = (index: number): 'pending' | 'active' | 'complete' => {
        if (index < currentIndex) return 'complete';
        if (index === currentIndex) return 'active';
        return 'pending';
    };

    return (
        <div className={cn('import-stepper', className)}>
            {steps.map((step, index) => {
                const state = getStepState(index);
                const isClickable = onStepClick && state === 'complete';

                return (
                    <React.Fragment key={step.id}>
                        {/* Step */}
                        <button
                            type="button"
                            onClick={() => isClickable && onStepClick(step.id)}
                            disabled={!isClickable}
                            className={cn(
                                'stepper-step',
                                state === 'pending' && 'stepper-step-pending',
                                state === 'active' && 'stepper-step-active',
                                state === 'complete' && 'stepper-step-complete',
                                isClickable && 'cursor-pointer hover:opacity-90',
                                !isClickable && 'cursor-default'
                            )}
                        >
                            <span className="stepper-step-number">
                                {state === 'complete' ? (
                                    <Check className="w-3 h-3" />
                                ) : (
                                    index + 1
                                )}
                            </span>
                            <span className="hidden sm:inline">{step.label}</span>
                        </button>

                        {/* Connector (not after last step) */}
                        {index < steps.length - 1 && (
                            <div
                                className={cn(
                                    'stepper-connector',
                                    getConnectorState(index) === 'complete' && 'stepper-connector-complete',
                                    getConnectorState(index) === 'active' && 'stepper-connector-active'
                                )}
                            />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
}

export default ImportStepper;
