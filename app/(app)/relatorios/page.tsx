"use client";

import { AppLayout } from "@/components/layout/AppLayout";
import { Link as LinkIcon, FileText, TrendingUp, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function RelatoriosPage() {
  const reports = [
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
    {
      title: "Vendas Mensais",
      description: "Relatório completo de vendas mensais com breakdown detalhado de kits, variações e componentes individuais.",
      href: "/relatorios/vendas-mensais",
      icon: TrendingUp,
      color: "green",
      features: [
        "Vendas por marketplace",
        "Breakdown por tipo de produto",
        "Expansão de kits para ver componentes",
        "Exportação para CSV",
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
        <div className="mt-8 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Sobre os Relatórios
          </h3>
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <p>
              <strong>Vincular Pedidos:</strong> Antes de gerar relatórios de vendas, é importante
              vincular os pedidos dos marketplaces com os pedidos do Tiny. Isso permite rastrear
              vendas por SKU específico de cada marketplace.
            </p>
            <p>
              <strong>Vendas Mensais:</strong> Após vincular os pedidos, você pode gerar relatórios
              mensais completos que mostram não apenas os produtos vendidos, mas também expandem
              kits para mostrar seus componentes individuais - essencial para controle de estoque
              e pedidos de compra.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
