'use client';

import { useState } from 'react';
import { DollarSign, Settings, Bell, Brain } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import ConfigFinanceiro from './tabs/ConfigFinanceiro';
import ConfigGeral from './tabs/ConfigGeral';
import ConfigAI from './tabs/ConfigAI';

type TabId = 'financeiro' | 'geral' | 'ia' | 'notificacoes';

const tabs = [
  {
    id: 'financeiro' as TabId,
    label: 'Financeiro',
    icon: DollarSign,
  },
  {
    id: 'geral' as TabId,
    label: 'Geral',
    icon: Settings,
  },
  {
    id: 'ia' as TabId,
    label: 'IA',
    icon: Brain,
  },
  {
    id: 'notificacoes' as TabId,
    label: 'Notificações',
    icon: Bell,
  },
];

export default function ConfiguracoesPage() {
  const [activeTab, setActiveTab] = useState<TabId>('financeiro');

  return (
    <AppLayout title="Configurações">
      <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-main mb-2">
            Configurações
          </h1>
          <p className="text-muted">
            Customize o comportamento da plataforma
          </p>
        </div>

        {/* Tabs */}
        <div className="glass-panel glass-tint rounded-[24px] overflow-hidden border border-white/10 shadow-xl shadow-black/5">
          <div className="flex border-b border-white/10 overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-6 py-4 font-semibold transition-all whitespace-nowrap
                    ${isActive
                      ? 'text-accent border-b-2 border-accent bg-accent/5'
                      : 'text-muted hover:text-main hover:bg-white/5'
                    }
                  `}
                >
                  <Icon className="w-5 h-5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="p-6 sm:p-8">
            {activeTab === 'financeiro' && <ConfigFinanceiro />}

            {activeTab === 'geral' && <ConfigGeral />}

            {activeTab === 'ia' && <ConfigAI />}

            {activeTab === 'notificacoes' && (
              <div className="text-center py-16 text-muted">
                <div className="w-16 h-16 rounded-full bg-white/5 mx-auto mb-4 flex items-center justify-center">
                  <Bell className="w-8 h-8 opacity-40" />
                </div>
                <h3 className="text-lg font-medium text-main mb-1">Notificações</h3>
                <p>Configurações de alertas em breve</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
