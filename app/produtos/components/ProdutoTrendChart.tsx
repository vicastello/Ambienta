import React from "react";
import { MicroTrendChart } from "../../dashboard/components/charts/MicroTrendChart";
import type { ProdutoTrendDatum } from "../types";

type Props = {
  data: ProdutoTrendDatum[];
  containerClassName?: string;
};

/**
 * Wrapper for MicroTrendChart that displays product trend data.
 * Note: ProdutoTrendDatum has { label, receita, quantidade } but MicroTrendChart
 * expects SparkDatum with optional fields like hoje, ontem, quantidade, etc.
 * The components are compatible since quantidade is present in both, though
 * receita won't be used by the chart.
 */
export const ProdutoTrendChart: React.FC<Props> = ({ data, containerClassName }) => {
  return (
    <div className={containerClassName}>
      <MicroTrendChart data={data} />
    </div>
  );
};

export default ProdutoTrendChart;
