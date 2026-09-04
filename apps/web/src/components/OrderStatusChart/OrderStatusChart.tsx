import React, { useMemo } from "react";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Pie } from "react-chartjs-2";
import { Card } from "react-bootstrap";
import type { OrderDto } from "../../types/order";

ChartJS.register(ArcElement, Tooltip, Legend);

interface OrderStatusChartProps {
  orders: OrderDto[];
}

const OrderStatusChart = ({ orders }: OrderStatusChartProps) => {
  const chartData = useMemo<ChartData<"pie", number[], string>>(() => {
    if (!orders || orders.length === 0) {
      return {
        labels: [],
        datasets: [],
      };
    }

    // Định nghĩa các trạng thái và màu sắc tương ứng
    const statusConfig = {
      PENDING: {
        label: "Chờ xác nhận",
        color: "rgba(255, 193, 7, 0.8)",
        borderColor: "rgba(255, 193, 7, 1)",
      },
      CONFIRMED: {
        label: "Đã xác nhận",
        color: "rgba(23, 162, 184, 0.8)",
        borderColor: "rgba(23, 162, 184, 1)",
      },
      SHIPPING: {
        label: "Đang giao",
        color: "rgba(0, 123, 255, 0.8)",
        borderColor: "rgba(0, 123, 255, 1)",
      },
      COMPLETED: {
        label: "Đã giao",
        color: "rgba(40, 167, 69, 0.8)",
        borderColor: "rgba(40, 167, 69, 1)",
      },
      CANCELLED: {
        label: "Đã hủy",
        color: "rgba(220, 53, 69, 0.8)",
        borderColor: "rgba(220, 53, 69, 1)",
      },
    };

    // Đếm số lượng đơn hàng theo từng trạng thái
    type DisplayedStatus = keyof typeof statusConfig;
    const statuses = Object.keys(statusConfig) as DisplayedStatus[];
    const statusCount = Object.fromEntries(
      statuses.map((status) => [status, 0]),
    ) as Record<DisplayedStatus, number>;

    orders.forEach((order) => {
      const status = order.status?.toUpperCase();
      if (status && Object.hasOwn(statusCount, status)) {
        statusCount[status as DisplayedStatus]++;
      }
    });

    // Tạo labels và data
    const labels: string[] = [];
    const data: number[] = [];
    const backgroundColor: string[] = [];
    const borderColor: string[] = [];

    statuses.forEach((status) => {
      if (statusCount[status] > 0) {
        labels.push(statusConfig[status].label);
        data.push(statusCount[status]);
        backgroundColor.push(statusConfig[status].color);
        borderColor.push(statusConfig[status].borderColor);
      }
    });

    return {
      labels,
      datasets: [
        {
          label: "Số lượng đơn hàng",
          data,
          backgroundColor,
          borderColor,
          borderWidth: 2,
        },
      ],
    };
  }, [orders]);

  const options: ChartOptions<"pie"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "right",
        labels: {
          padding: 15,
          font: {
            size: 12,
          },
          usePointStyle: true,
          pointStyle: "circle",
        },
      },
      title: {
        display: true,
        text: "Trạng thái đơn hàng",
        font: {
          size: 16,
          weight: "bold",
        },
      },
      tooltip: {
        callbacks: {
          label: function (context) {
            const label = context.label || "";
            const value = context.parsed || 0;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = ((value / total) * 100).toFixed(1);
            return `${label}: ${value} đơn (${percentage}%)`;
          },
        },
      },
    },
  };

  return (
    <Card className="h-100">
      <Card.Body>
        <div style={{ height: "400px", position: "relative" }}>
          {(chartData.labels?.length ?? 0) === 0 ? (
            <div className="d-flex align-items-center justify-content-center h-100">
              <p className="text-center text-muted">
                Không có dữ liệu đơn hàng
              </p>
            </div>
          ) : (
            <Pie data={chartData} options={options} />
          )}
        </div>
      </Card.Body>
    </Card>
  );
};

export default OrderStatusChart;
