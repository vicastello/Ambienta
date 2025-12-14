import React from "react";
import { MicroTrendChart } from "../../dashboard/components/charts/MicroTrendChart";

type Props = {
  data: any;
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
