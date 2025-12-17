'use client';

import { useState } from 'react';
import { Link as LinkIcon } from 'lucide-react';

export default function ConfigGeral() {
    const [connecting, setConnecting] = useState(false);

    const handleConnectTiny = () => {
        setConnecting(true);
        window.location.href = "/api/tiny/auth/login";
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div>
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-500/10 ring-1 ring-sky-100 dark:ring-sky-500/20">
                        <LinkIcon className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-main">Integração Tiny ERP</h2>
                        <p className="text-xs text-muted mt-0.5">
                            Conecte sua conta para sincronizar pedidos e produtos automaticamente
                        </p>
                    </div>
                </div>

                <div className="glass-panel glass-tint p-6 rounded-2xl border border-white/10 space-y-5 max-w-xl transition-all hover:border-white/20">
                    <div className="space-y-2">
                        <h3 className="text-base font-semibold text-main">Conexão API v3</h3>
                        <p className="text-sm text-muted leading-relaxed">
                            A integração utiliza o protocolo OAuth2 oficial do Tiny (API v3).
                            Ao clicar no botão abaixo, você será redirecionado para o ambiente seguro do Tiny para autorizar o acesso.
                        </p>
                    </div>

                    <button
                        disabled={connecting}
                        onClick={handleConnectTiny}
                        className="relative overflow-hidden flex items-center justify-center px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold transition-all disabled:opacity-60 disabled:cursor-wait w-full sm:w-auto shadow-lg shadow-sky-500/20"
                    >
                        {connecting ? (
                            <span className="flex items-center gap-2">
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Redirecionando...
                            </span>
                        ) : (
                            "Conectar com Tiny"
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
