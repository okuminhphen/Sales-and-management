import { type FormEvent, useState } from "react";
import { FaRobot, FaTimes } from "react-icons/fa";
import { sendMessage } from "../../services/chatBotService";
import type { ChatbotProductPayload } from "../../types/chatbot";
import "./Bot.scss";

type BotProps = {
  isOpen: boolean;
  onToggle: (open: boolean) => void;
  onOpen: () => void;
};

type ProductCard = {
  id: number;
  name: string;
  description: string;
  price: number | null;
  imageUrl: string | null;
};

type ChatMessage = {
  id: string;
  sender: "user" | "bot";
  text: string;
  products?: ProductCard[];
};

const toImageUrl = (value: unknown): string | null => {
  if (typeof value === "string") {
    try {
      return toImageUrl(JSON.parse(value));
    } catch {
      return value.trim() || null;
    }
  }

  if (Array.isArray(value)) return toImageUrl(value[0]);
  if (value && typeof value === "object" && "url" in value) {
    const url = (value as { url?: unknown }).url;
    return typeof url === "string" && url.trim() ? url : null;
  }
  return null;
};

const toProductCard = (product: ChatbotProductPayload): ProductCard | null => {
  const id = product.id ?? product.product_id;
  if (typeof id !== "number" || !Number.isInteger(id) || !product.name) return null;

  const parsedPrice = Number(product.price);
  return {
    id,
    name: product.name,
    description: product.description ?? "",
    price: Number.isFinite(parsedPrice) ? parsedPrice : null,
    imageUrl: toImageUrl(product.images ?? product.image),
  };
};

const Bot = ({ isOpen, onToggle, onOpen }: BotProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSendMessage = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const message = inputMessage.trim();
    if (!message || isSending) return;

    setMessages((previous) => [
      ...previous,
      { id: crypto.randomUUID(), text: message, sender: "user" },
    ]);
    setInputMessage("");
    setErrorMessage(null);
    setIsSending(true);

    try {
      const response = await sendMessage(message);
      const products = response.data.products.map(toProductCard).filter(
        (product): product is ProductCard => product !== null,
      );
      setMessages((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          text: response.data.reply,
          sender: "bot",
          products,
        },
      ]);
    } catch {
      setErrorMessage("Không thể kết nối trợ lý lúc này. Vui lòng thử lại sau.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className={`chatbot-container ${isOpen ? "open" : ""}`}>
      {isOpen && (
        <section className="chat-window" aria-label="Trợ lý tư vấn sản phẩm">
          <header className="chat-header">
            <h3>Trợ lý sản phẩm</h3>
            <button
              type="button"
              className="close-button"
              aria-label="Đóng trợ lý"
              onClick={() => onToggle(false)}
            >
              <FaTimes />
            </button>
          </header>
          <div className="chat-messages" aria-live="polite">
            {messages.map((message) => (
              <div key={message.id}>
                <div
                  className={`message ${
                    message.sender === "user" ? "user-message" : "bot-message"
                  }`}
                >
                  {message.text}
                </div>
                {message.products && message.products.length > 0 && (
                  <div className="products-container">
                    <h4>Gợi ý phù hợp</h4>
                    <div className="products-grid">
                      {message.products.map((product) => (
                        <article key={product.id} className="product-card">
                          <a href={`/product/${product.id}`}>
                            <img
                              src={product.imageUrl ?? "/no-image.png"}
                              alt={product.name}
                              className="product-image"
                            />
                          </a>
                          <h5>{product.name}</h5>
                          {product.price !== null && (
                            <p className="product-price">
                              {product.price.toLocaleString("vi-VN")} VNĐ
                            </p>
                          )}
                          {product.description && (
                            <p className="product-description">{product.description}</p>
                          )}
                        </article>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {isSending && <div className="message bot-message">Đang tìm sản phẩm phù hợp…</div>}
            {errorMessage && <p className="chat-error" role="alert">{errorMessage}</p>}
          </div>
          <form onSubmit={handleSendMessage} className="chat-input-form">
            <input
              type="text"
              value={inputMessage}
              onChange={(event) => setInputMessage(event.target.value)}
              placeholder="Ví dụ: tìm đồ mặc nhà dưới 300.000đ"
              className="chat-input"
              disabled={isSending}
              maxLength={2_000}
            />
            <button type="submit" className="send-button" disabled={isSending}>
              Gửi
            </button>
          </form>
        </section>
      )}
      <button
        type="button"
        className="chat-icon"
        aria-label="Mở trợ lý sản phẩm"
        onClick={onOpen}
      >
        <FaRobot />
      </button>
    </div>
  );
};

export default Bot;
