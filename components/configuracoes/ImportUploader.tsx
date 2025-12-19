'use client';

import { useState } from 'react';
import { Upload, FileCheck, AlertTriangle, X } from 'lucide-react';

interface ImportUploaderProps {
    onImportComplete: (configs: any) => void;
    onClose: () => void;
}

interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    preview?: {
        marketplace: string;
        changes: Array<{
            field: string;
            oldValue: any;
            newValue: any;
            status: 'ok' | 'warning' | 'error';
        }>;
    }[];
}

export function ImportUploader({ onImportComplete, onClose }: ImportUploaderProps) {
    const [file, setFile] = useState<File | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [validation, setValidation] = useState<ValidationResult | null>(null);
    const [loading, setLoading] = useState(false);

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
        }
    };

    const handleFile = async (selectedFile: File) => {
        setFile(selectedFile);
        setValidation(null);
        setLoading(true);

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('preview', 'true');

            const response = await fetch('/api/configuracoes/taxas-marketplace/import', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                setValidation({
                    isValid: false,
                    errors: [data.error || 'Erro ao processar arquivo'],
                    warnings: [],
                });
            } else {
                setValidation(data);
            }
        } catch (error) {
            setValidation({
                isValid: false,
                errors: ['Erro ao fazer upload do arquivo'],
                warnings: [],
            });
        } finally {
            setLoading(false);
        }
    };

    const handleApply = async () => {
        if (!file) return;

        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('preview', 'false');

            const response = await fetch('/api/configuracoes/taxas-marketplace/import', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (response.ok && data.success) {
                onImportComplete(data.configs);
            } else {
                alert(data.error || 'Erro ao importar configurações');
            }
        } catch (error) {
            alert('Erro ao importar configurações');
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status: 'ok' | 'warning' | 'error') => {
        switch (status) {
            case 'ok':
                return 'text-green-600 dark:text-green-400';
            case 'warning':
                return 'text-yellow-600 dark:text-yellow-400';
            case 'error':
                return 'text-red-600 dark:text-red-400';
        }
    };

    const getStatusIcon = (status: 'ok' | 'warning' | 'error') => {
        switch (status) {
            case 'ok':
                return '✓';
            case 'warning':
                return '⚠';
            case 'error':
                return '✗';
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-main">Importar Configurações</h2>
                    <p className="text-sm text-muted">Restaure configurações de um arquivo JSON ou CSV</p>
                </div>
                <button
                    onClick={onClose}
                    className="text-muted hover:text-main transition-colors"
                >
                    <X className="w-6 h-6" />
                </button>
            </div>

            {/* Upload Area */}
            {!file && (
                <div
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    className={`glass-card rounded-xl p-12 border-2 border-dashed transition-all ${dragActive
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-white/20 dark:border-white/10 hover:border-blue-500/50'
                        }`}
                >
                    <div className="flex flex-col items-center gap-4">
                        <div className="p-4 bg-blue-500/10 rounded-full">
                            <Upload className="w-8 h-8 text-blue-500" />
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-medium text-main mb-1">
                                Arraste um arquivo ou clique para selecionar
                            </p>
                            <p className="text-xs text-muted">JSON ou CSV (máx. 5MB)</p>
                        </div>
                        <input
                            type="file"
                            accept=".json,.csv"
                            onChange={handleChange}
                            className="hidden"
                            id="file-upload"
                        />
                        <label
                            htmlFor="file-upload"
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium cursor-pointer transition-all"
                        >
                            Selecionar Arquivo
                        </label>
                    </div>
                </div>
            )}

            {/* File Info */}
            {file && (
                <div className="glass-card rounded-xl p-4 border border-white/20 dark:border-white/10">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <FileCheck className="w-5 h-5 text-blue-500" />
                            <div>
                                <p className="text-sm font-medium text-main">{file.name}</p>
                                <p className="text-xs text-muted">
                                    {(file.size / 1024).toFixed(1)} KB • {file.type || 'Arquivo de texto'}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                setFile(null);
                                setValidation(null);
                            }}
                            className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-sm font-medium"
                        >
                            Remover
                        </button>
                    </div>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                    <p className="text-sm text-muted mt-3">Processando arquivo...</p>
                </div>
            )}

            {/* Validation Errors */}
            {validation && !validation.isValid && (
                <div className="glass-card rounded-xl p-4 border-2 border-red-500/30 bg-red-500/10">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm font-bold text-red-700 dark:text-red-300 mb-2">
                                Erros de Validação
                            </p>
                            <ul className="text-xs text-red-600 dark:text-red-400 space-y-1">
                                {validation.errors.map((error, idx) => (
                                    <li key={idx}>• {error}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {/* Preview */}
            {validation && validation.isValid && validation.preview && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <FileCheck className="w-5 h-5 text-green-500" />
                        <h3 className="text-sm font-bold text-main">Preview de Mudanças</h3>
                    </div>

                    {validation.preview.map((marketplace) => (
                        <div
                            key={marketplace.marketplace}
                            className="glass-card rounded-xl p-4 border border-white/20 dark:border-white/10"
                        >
                            <p className="text-sm font-bold text-main mb-3 capitalize">
                                {marketplace.marketplace === 'mercado_livre' ? 'Mercado Livre' : marketplace.marketplace}
                            </p>

                            <div className="space-y-2">
                                {marketplace.changes.map((change, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-center justify-between text-xs p-2 rounded-lg bg-white/5"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className={getStatusColor(change.status)}>
                                                {getStatusIcon(change.status)}
                                            </span>
                                            <span className="text-muted font-medium">{change.field}:</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-red-600 dark:text-red-400 line-through">
                                                {JSON.stringify(change.oldValue)}
                                            </span>
                                            <span className="text-muted">→</span>
                                            <span className={getStatusColor(change.status)}>
                                                {JSON.stringify(change.newValue)}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}

                    {validation.warnings.length > 0 && (
                        <div className="glass-card rounded-xl p-4 border border-yellow-500/30 bg-yellow-500/10">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-sm font-bold text-yellow-700 dark:text-yellow-300 mb-2">
                                        Avisos
                                    </p>
                                    <ul className="text-xs text-yellow-600 dark:text-yellow-400 space-y-1">
                                        {validation.warnings.map((warning, idx) => (
                                            <li key={idx}>• {warning}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Actions */}
            {validation && validation.isValid && (
                <div className="flex gap-3 justify-end pt-4 border-t border-white/10">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleApply}
                        disabled={loading}
                        className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-slate-500 text-white text-sm font-medium transition-all"
                    >
                        Aplicar Mudanças
                    </button>
                </div>
            )}
        </div>
    );
}
