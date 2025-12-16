'use client';

import { useState } from 'react';
import { DollarSign, Settings, Bell } from 'lucide-react';
import ConfigFinanceiro from './tabs/ConfigFinanceiro';

type TabId = 'financeiro' | 'geral' | 'notificacoes';

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
    id: 'notificacoes' as TabId,
    label: 'Notificações',
    icon: Bell,
  },
];

export default function ConfiguracoesPage() {
  const [activeTab, setActiveTab] = useState<TabId>('financeiro');

  return (
    <div className="min-h-screen bg-[var(--bg-body)] p-4 sm:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-main mb-2">
            Configurações
          </h1>
          <p className="text-muted">
            Customize o comportamento da plataforma
          </p>
        </div>

        {/* Tabs */}
        <div className="glass-panel glass-tint rounded-t-[36px] overflow-hidden">
          <div className="flex border-b border-white/10">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-6 py-4 font-semibold transition-all
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

            {activeTab === 'geral' && (
              <div className="text-center py-12 text-muted">
                <Settings className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Configurações gerais em breve</p>
              </div>
            )}

            {activeTab === 'notificacoes' && (
              <div className="text-center py-12 text-muted">
                <Bell className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Configurações de notificações em breve</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
