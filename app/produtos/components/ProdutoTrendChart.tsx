import React from "react";
import { MicroTrendChart } from "../../dashboard/components/charts/MicroTrendChart";

type SparkDatum = {
  label: string;
  horaIndex?: number;
  valor?: number;
  hoje?: number | null;
  ontem?: number | null;
  quantidade?: number | null;
  quantidadeOntem?: number | null;
};

type Props = {
  data: SparkDatum[];
  containerClassName?: string;
};

export const ProdutoTrendChart: React.FC<Props> = ({ data, containerClassName }) => {
  return <MicroTrendChart data={data} containerClassName={containerClassName} />;
};

export default ProdutoTrendChart;
