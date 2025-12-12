"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { Link as LinkIcon, FileText, TrendingUp, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function RelatoriosPage() {
  const reports = [
    {
      title: "Relatório de Vendas",
      description: "Relatório completo de vendas com agrupamento por pedido, SKU ou canal. Alterne entre visão unitária ou por kits.",
      href: "/relatorios/vendas-mensais",
      icon: TrendingUp,
      color: "green",
      features: [
        "Agrupar por pedido, SKU ou canal",
        "Alternar entre unitário e kits (expandido)",
        "Ranking de produtos mais vendidos",
        "Gráficos de faturamento e distribuição",
        "Exportação CSV, Excel e PDF",
        "Alertas de pedidos não vinculados",
      ],
    },
    {
      title: "Vincular Pedidos",
      description: "Vincule pedidos dos marketplaces (Magalu, Shopee, Mercado Livre) com pedidos do Tiny para relatórios precisos.",
      href: "/relatorios/vinculos",
      icon: LinkIcon,
      color: "blue",
      features: [
        "Visualização de pedidos não vinculados",
        "Busca e filtros avançados",
        "Estatísticas de vinculação",
        "Gestão de vínculos existentes",
      ],
    },
  ];

  const getColorClasses = (color: string) => {
    switch (color) {
      case "blue":
        return {
          bg: "bg-blue-50 dark:bg-blue-950/20",
          border: "border-blue-200 dark:border-blue-800",
          icon: "text-blue-600 dark:text-blue-400",
          hover: "hover:border-blue-400 dark:hover:border-blue-600",
          button: "bg-blue-600 hover:bg-blue-700 text-white",
        };
      case "green":
        return {
          bg: "bg-green-50 dark:bg-green-950/20",
          border: "border-green-200 dark:border-green-800",
          icon: "text-green-600 dark:text-green-400",
          hover: "hover:border-green-400 dark:hover:border-green-600",
          button: "bg-green-600 hover:bg-green-700 text-white",
        };
      default:
        return {
          bg: "bg-gray-50 dark:bg-gray-950/20",
          border: "border-gray-200 dark:border-gray-800",
          icon: "text-gray-600 dark:text-gray-400",
          hover: "hover:border-gray-400 dark:hover:border-gray-600",
          button: "bg-gray-600 hover:bg-gray-700 text-white",
        };
    }
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <FileText className="w-8 h-8" />
            Relatórios
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Acesse relatórios detalhados e ferramentas de análise de dados
          </p>
        </div>

        {/* Reports Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {reports.map((report) => {
            const Icon = report.icon;
            const colors = getColorClasses(report.color);

            return (
              <div
                key={report.href}
                className={`${colors.bg} ${colors.border} ${colors.hover} border rounded-lg p-6 transition-all duration-200 hover:shadow-lg`}
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className={`p-3 rounded-lg ${colors.bg} ${colors.border} border`}>
                    <Icon className={`w-6 h-6 ${colors.icon}`} />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold mb-2">{report.title}</h2>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                      {report.description}
                    </p>
                  </div>
                </div>

                <div className="mb-4">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Recursos:
                  </h3>
                  <ul className="space-y-1">
                    {report.features.map((feature, index) => (
                      <li
                        key={index}
                        className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${colors.icon}`} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                <Link
                  href={report.href}
                  className={`${colors.button} inline-flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors`}
                >
                  Acessar
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            );
          })}
        </div>

        {/* Info Box */}
        <div className="mt-8 bg-[#009DA8]/10 dark:bg-[#009DA8]/20 border border-[#009DA8]/30 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#009DA8]" />
            Dicas de Uso
          </h3>
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <p>
              <strong>Relatório de Vendas:</strong> Escolha entre ver produtos como foram vendidos (unitário) 
              ou com kits expandidos em componentes individuais. Use a visão por kit para controle de estoque.
            </p>
            <p>
              <strong>Vincular Pedidos:</strong> Antes de gerar relatórios, vincule os pedidos dos marketplaces 
              com os pedidos do Tiny. Pedidos não vinculados aparecem como alerta no relatório.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
