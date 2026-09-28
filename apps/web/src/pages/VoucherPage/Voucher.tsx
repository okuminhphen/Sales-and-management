import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Card, Spinner, Table } from "react-bootstrap";
import { FaTicketAlt } from "react-icons/fa";
import { getAllVouchers } from "../../services/voucherService";
import "./Voucher.scss";

type Voucher = {
  id: string;
  code: string;
  description: string | null;
  discount_type: "percent" | "fixed";
  discount_value: string;
  min_order_value: string;
  max_discount_amount: string | null;
  quantity: number | null;
  expires_at: string;
};

const formatMoney = (value: string): string =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(Number(value));

const isVoucher = (value: unknown): value is Voucher => {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.code === "string"
    && (item.description === null || typeof item.description === "string")
    && (item.discount_type === "percent" || item.discount_type === "fixed")
    && typeof item.discount_value === "string" && typeof item.min_order_value === "string"
    && (item.max_discount_amount === null || typeof item.max_discount_amount === "string")
    && (item.quantity === null || (typeof item.quantity === "number" && Number.isSafeInteger(item.quantity)))
    && typeof item.expires_at === "string";
};

const VoucherPage = () => {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getAllVouchers();
      const data = response.data as { EC?: unknown; DT?: unknown };
      if (data.EC !== 0 || !Array.isArray(data.DT) || !data.DT.every(isVoucher)) {
        throw new Error("Invalid voucher response");
      }
      setVouchers(data.DT);
    } catch {
      setError("Không thể tải danh sách voucher đang hoạt động.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="voucher-page" aria-labelledby="voucher-title">
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <h2 id="voucher-title" className="mb-1"><FaTicketAlt aria-hidden /> Voucher hoạt động</h2>
          <p className="text-muted mb-0">
            Danh sách chỉ đọc. Điều kiện và lượt dùng luôn được xác minh lại khi checkout.
          </p>
        </div>
        <Badge bg="dark">{vouchers.length} mã</Badge>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      <Card className="voucher-table-card">
        <Card.Body>
          {loading ? (
            <div className="text-center py-5"><Spinner animation="border" role="status" /></div>
          ) : (
            <Table responsive hover className="voucher-table mb-0">
              <thead><tr>
                <th>Mã</th><th>Mô tả</th><th>Ưu đãi</th><th>Đơn tối thiểu</th>
                <th>Lượt còn lại</th><th>Hết hạn</th>
              </tr></thead>
              <tbody>
                {vouchers.map((voucher) => (
                  <tr key={voucher.id}>
                    <td className="voucher-code">{voucher.code}</td>
                    <td>{voucher.description ?? "—"}</td>
                    <td>{voucher.discount_type === "percent"
                      ? `${Number(voucher.discount_value)}%`
                      : formatMoney(voucher.discount_value)}</td>
                    <td>{formatMoney(voucher.min_order_value)}</td>
                    <td>{voucher.quantity ?? "Không giới hạn"}</td>
                    <td>{new Date(voucher.expires_at).toLocaleString("vi-VN")}</td>
                  </tr>
                ))}
                {vouchers.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-muted py-5">
                    Hiện chưa có voucher online đang hiệu lực.
                  </td></tr>
                )}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>
    </section>
  );
};

export default VoucherPage;
