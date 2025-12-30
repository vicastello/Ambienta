'use client';

import React, { useRef, useState, useCallback } from 'react';
import { Upload, FileText, X, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FileUploadZoneProps {
    /** Callback when a file is selected */
    onFileSelect: (file: File | null) => void;
    /** Currently selected file */
    file: File | null;
    /** Accepted file types (e.g., '.csv', '.xlsx') */
    acceptedTypes?: string;
    /** Maximum file size in bytes */
    maxSize?: number;
    /** Whether the upload zone is disabled */
    disabled?: boolean;
    /** Custom placeholder text */
    placeholder?: string;
    /** Format hint text */
    formatHint?: string;
    /** Error message to display */
    error?: string;
    /** Additional class names */
    className?: string;
}

export function FileUploadZone({
    onFileSelect,
    file,
    acceptedTypes = '.csv,.xlsx',
    maxSize = 10 * 1024 * 1024, // 10MB default
    disabled = false,
    placeholder = 'Arraste o arquivo aqui ou clique para selecionar',
    formatHint,
    error,
    className,
}: FileUploadZoneProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);

    const displayError = error || localError;

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) {
            setIsDragOver(true);
        }
    }, [disabled]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    }, []);

    const validateFile = useCallback((file: File): string | null => {
        // Check file type
        const extension = '.' + file.name.split('.').pop()?.toLowerCase();
        const acceptedList = acceptedTypes.split(',').map(t => t.trim().toLowerCase());
        if (!acceptedList.includes(extension)) {
            return `Formato inválido. Aceito: ${acceptedTypes}`;
        }

        // Check file size
        if (file.size > maxSize) {
            return `Arquivo muito grande. Máximo: ${(maxSize / 1024 / 1024).toFixed(1)}MB`;
        }

        return null;
    }, [acceptedTypes, maxSize]);

    const handleFile = useCallback((file: File) => {
        setLocalError(null);
        const validationError = validateFile(file);
        if (validationError) {
            setLocalError(validationError);
            return;
        }
        onFileSelect(file);
    }, [validateFile, onFileSelect]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        if (disabled) return;

        const droppedFile = e.dataTransfer.files?.[0];
        if (droppedFile) {
            handleFile(droppedFile);
        }
    }, [disabled, handleFile]);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            handleFile(selectedFile);
        }
    }, [handleFile]);

    const handleClick = useCallback(() => {
        if (!disabled) {
            inputRef.current?.click();
        }
    }, [disabled]);

    const handleClear = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setLocalError(null);
        onFileSelect(null);
        if (inputRef.current) {
            inputRef.current.value = '';
        }
    }, [onFileSelect]);

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    };

    return (
        <div
            onClick={handleClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
                'upload-zone',
                isDragOver && 'upload-zone-dragover',
                file && !displayError && 'upload-zone-has-file',
                displayError && 'upload-zone-error',
                disabled && 'upload-zone-disabled',
                className
            )}
        >
            <input
                ref={inputRef}
                type="file"
                accept={acceptedTypes}
                onChange={handleInputChange}
                disabled={disabled}
                className="hidden"
            />

            {file && !displayError ? (
                // File selected state
                <div className="flex flex-col items-center gap-3">
                    <div className="relative">
                        <FileText className="upload-zone-icon text-success" />
                        <button
                            onClick={handleClear}
                            className="absolute -top-2 -right-2 p-1 rounded-full bg-white dark:bg-neutral-800 shadow-md hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                        >
                            <X className="w-3.5 h-3.5 text-neutral-500" />
                        </button>
                    </div>
                    <div>
                        <p className="text-main font-medium">{file.name}</p>
                        <p className="text-sm text-muted">{formatFileSize(file.size)}</p>
                    </div>
                </div>
            ) : (
                // Empty state
                <div className="flex flex-col items-center gap-3">
                    {displayError ? (
                        <AlertCircle className="upload-zone-icon text-error" />
                    ) : (
                        <Upload className="upload-zone-icon" />
                    )}
                    <div>
                        <p className={cn(
                            "font-medium mb-1",
                            displayError ? "text-error" : "text-main"
                        )}>
                            {displayError || placeholder}
                        </p>
                        {formatHint && !displayError && (
                            <p className="text-sm text-muted">{formatHint}</p>
                        )}
                        {!displayError && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                                ⚠️ Máximo 500 registros por arquivo
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default FileUploadZone;
