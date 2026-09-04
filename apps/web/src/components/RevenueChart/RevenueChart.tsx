import React, { useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { Card } from "react-bootstrap";
import type { OrderDto } from "../../types/order";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface RevenueChartProps {
  orders: OrderDto[];
}

const RevenueChart = ({ orders }: RevenueChartProps) => {
  // Tính doanh thu theo tháng và năm (12 tháng gần nhất)
  const chartData = useMemo<ChartData<"line", number[], string>>(() => {
    if (!orders || orders.length === 0) {
      return { labels: [], datasets: [] };
    }

    const COMPLETED_STATUSES = ["COMPLETED", "DELIVERED"];

    const completedOrders = orders.filter((order) =>
      COMPLETED_STATUSES.includes(order.status)
    );

    const now = new Date();
    const labels: string[] = [];
    const data: number[] = [];
    const revenueMap: Record<string, number> = {};

    const monthNames = [
      "Tháng 1",
      "Tháng 2",
      "Tháng 3",
      "Tháng 4",
      "Tháng 5",
      "Tháng 6",
      "Tháng 7",
      "Tháng 8",
      "Tháng 9",
      "Tháng 10",
      "Tháng 11",
      "Tháng 12",
    ];

    // Tạo 12 tháng gần nhất
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = date.getMonth();
      const year = date.getFullYear();
      const key = `${month + 1}/${year}`;

      labels.push(`${monthNames[month]}/${year}`);
      revenueMap[key] = 0;
    }

    // Tính doanh thu
    completedOrders.forEach((order) => {
      const dateValue = order.orderDate ?? order.createdAt;
      if (!dateValue) return;
      const date = new Date(dateValue);
      const key = `${date.getMonth() + 1}/${date.getFullYear()}`;

      if (revenueMap[key] !== undefined) {
        revenueMap[key] += Number(order.totalPrice || 0);
      }
    });

    // Map data theo labels
    Object.keys(revenueMap).forEach((key) => {
      data.push(revenueMap[key]);
    });

    return {
      labels,
      datasets: [
        {
          label: "Tổng doanh thu",
          data,
          borderColor: "#4bc0c0",
          backgroundColor: "rgba(75,192,192,0.2)",
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: "#4bc0c0",
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
        },
      ],
    };
  }, [orders]);

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top",
      },
      title: {
        display: true,
        text: "Biểu đồ doanh thu theo tháng (12 tháng gần nhất)",
        font: {
          size: 16,
          weight: "bold",
        },
      },
      tooltip: {
        callbacks: {
          title: function (context) {
            return context[0].label;
          },
          label: function (context) {
            const value = context.parsed.y;
            return `Doanh thu: ${Number(value ?? 0).toLocaleString("vi-VN")} VND`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function (value) {
            return Number(value ?? 0).toLocaleString("vi-VN") + " VND";
          },
        },
        grid: {
          color: "rgba(0, 0, 0, 0.05)",
        },
      },
      x: {
        grid: {
          display: false,
        },
      },
    },
  };

  return (
    <Card className="h-100">
      <Card.Body>
        <div style={{ height: "400px", position: "relative" }}>
          {(chartData.labels?.length ?? 0) === 0 && (
            <p className="text-center text-muted mt-4">
              Không có dữ liệu doanh thu
            </p>
          )}

          <Line data={chartData} options={options} />
        </div>
      </Card.Body>
    </Card>
  );
};

export default RevenueChart;
