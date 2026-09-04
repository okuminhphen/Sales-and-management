import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Container, Card, Button, Spinner } from "react-bootstrap";
import "./PaymentStatus.scss";

interface PaymentInfo {
  orderId: string;
  status: string;
  amount: string;
  transactionNo: string;
  bankCode: string;
  responseCode: string;
}

const PaymentStatus = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setPaymentInfo({
      orderId: params.get("orderId") || "Không có dữ liệu",
      status: params.get("status") || "FAILED",
      amount: params.get("amount") || "0",
      transactionNo: params.get("transactionNo") || "Không có dữ liệu",
      bankCode: params.get("bankCode") || "Không có dữ liệu",
      responseCode: params.get("responseCode") || "Không có dữ liệu",
    });
  }, [location]);

  const getStatusInfo = () => {
    if (!paymentInfo) {
      return {
        title: "Đang tải...",
        icon: "⏳",
        className: "loading",
        message: "Vui lòng đợi...",
      };
    }

    switch (paymentInfo.responseCode) {
      case "00":
        return {
          title: "Thanh toán thành công",
          icon: "✅",
          className: "success",
          message: "Giao dịch đã hoàn tất!",
        };
      case "07":
        return {
          title: "Bị nghi ngờ gian lận",
          icon: "⚠️",
          className: "warning",
          message: "Giao dịch bị từ chối do nghi vấn gian lận.",
        };
      case "09":
        return {
          title: "InternetBanking chưa đăng ký",
          icon: "❌",
          className: "error",
          message: "Thẻ hoặc tài khoản chưa đăng ký InternetBanking.",
        };
      case "10":
        return {
          title: "Xác thực không thành công",
          icon: "❌",
          className: "error",
          message: "Nhập sai thông tin thẻ quá 3 lần.",
        };
      default:
        return {
          title: "Thanh toán thất bại",
          icon: "❌",
          className: "error",
          message: "Có lỗi xảy ra trong quá trình xử lý.",
        };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <Container className="payment-status-container">
      {!paymentInfo ? (
        <div className="loading-container">
          <Spinner animation="border" role="status">
            <span className="visually-hidden">Đang tải...</span>
          </Spinner>
          <p>Đang tải thông tin thanh toán...</p>
        </div>
      ) : (
        <Card className={`payment-status-card ${statusInfo.className}`}>
          <Card.Body className="text-center">
            <div className="status-icon">{statusInfo.icon}</div>
            <Card.Title className="status-title">{statusInfo.title}</Card.Title>
            <Card.Text className="status-message">
              {statusInfo.message}
            </Card.Text>

            <div className="payment-details">
              <div className="detail-item">
                <span className="label">Mã đơn hàng:</span>{" "}
                <span className="value">{paymentInfo.orderId}</span>
              </div>
              <div className="detail-item">
                <span className="label">Số tiền:</span>{" "}
                <span className="value">
                  {new Intl.NumberFormat("vi-VN", {
                    style: "currency",
                    currency: "VND",
                  }).format(Number(paymentInfo.amount))}
                </span>
              </div>
              <div className="detail-item">
                <span className="label">Ngân hàng:</span>{" "}
                <span className="value">{paymentInfo.bankCode}</span>
              </div>
              <div className="detail-item">
                <span className="label">Mã giao dịch:</span>{" "}
                <span className="value">{paymentInfo.transactionNo}</span>
              </div>
              <div className="detail-item">
                <span className="label">Mã phản hồi:</span>{" "}
                <span className="value">{paymentInfo.responseCode}</span>
              </div>
            </div>

            <div className="action-buttons">
              <Button
                variant={
                  statusInfo.className === "success" ? "primary" : "secondary"
                }
                onClick={() =>
                  navigate(`/orders/details/${paymentInfo.orderId}`)
                }
                className="me-3"
              >
                Xem đơn hàng
              </Button>
              <Button variant="outline-primary" onClick={() => navigate("/")}>
                Về trang chủ
              </Button>
            </div>
          </Card.Body>
        </Card>
      )}
    </Container>
  );
};

export default PaymentStatus;
