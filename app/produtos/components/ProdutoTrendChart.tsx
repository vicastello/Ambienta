import React from "react";
import { MicroTrendChart } from "../../dashboard/components/charts/MicroTrendChart";
import type { ProdutoTrendDatum } from "../types";

type Props = {
  data: ProdutoTrendDatum[];
  containerClassName?: string;
};

export const ProdutoTrendChart: React.FC<Props> = ({ data, containerClassName }) => {
  return (
    <div className={containerClassName}>
      <MicroTrendChart data={data} />
    </div>
  );
};

export default ProdutoTrendChart;
