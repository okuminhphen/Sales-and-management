// @ts-nocheck
import React, { useState } from "react";
import { FaRobot, FaTimes } from "react-icons/fa";
import "./Bot.scss";
import { sendMessage } from "../../services/chatBotService";

const Bot = ({ isOpen: isOpenProp, onToggle, onOpen }) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [products, setProducts] = useState([]);

  // Sử dụng prop từ App.js hoặc fallback về state nội bộ
  const isOpen = isOpenProp !== undefined ? isOpenProp : false;

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (inputMessage.trim()) {
      // Add user message
      setMessages((prev) => [...prev, { text: inputMessage, sender: "user" }]);
      let message = inputMessage;
      setInputMessage("");
      const response = await sendMessage(message);
      console.log("dữ liệu bot:", response.data.products);
      // Simulate bot typing delay
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          { text: response.data.reply, sender: "bot" },
        ]);
        // Update products if available (API trả về field "data")
        if (response.data.products && Array.isArray(response.data.products)) {
          setProducts(response.data.products);
        } else {
          setProducts([]);
        }
      }, 1000);
    }
  };
  const getProductImages = (imagesOrImage) => {
    if (!imagesOrImage) return [];

    // Nếu backend trả về 1 string url đơn (field "image")
    if (typeof imagesOrImage === "string") {
      try {
        // Thử parse JSON trước (phòng khi là chuỗi JSON)
        const parsedJson = JSON.parse(imagesOrImage);
        if (Array.isArray(parsedJson)) {
          return parsedJson
            .map((img) => {
              if (typeof img === "string") return { url: img };
              if (img?.url) return { url: img.url };
              return null;
            })
            .filter(Boolean);
        }
      } catch (e) {
        // Nếu không parse được JSON, coi như 1 url ảnh bình thường
        return [{ url: imagesOrImage }];
      }
    }

    let parsed = imagesOrImage;

    try {
      while (typeof parsed === "string") {
        parsed = JSON.parse(parsed);
      }
    } catch (e) {
      console.error("Parse images error:", e);
      return [];
    }

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((img) => {
        if (typeof img === "string") return { url: img };
        if (img?.url) return { url: img.url };
        return null;
      })
      .filter(Boolean);
  };
  const toggleChat = () => {
    if (onToggle) {
      onToggle(!isOpen);
    }
  };

  return (
    <div className={`chatbot-container ${isOpen ? "open" : ""}`}>
      {isOpen && (
        <div className="chat-window">
          <div className="chat-header">
            <h3>Chat with us</h3>
            <button className="close-button" onClick={toggleChat}>
              <FaTimes />
            </button>
          </div>
          <div className="chat-messages">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`message ${
                  message.sender === "user" ? "user-message" : "bot-message"
                }`}
              >
                {message.text}
              </div>
            ))}
            {products.length > 0 && (
              <div className="products-container">
                <h4>Đề xuất:</h4>
                <div className="products-grid">
                  {products.map((product, index) => {
                    console.log("product:", product);
                    // Ưu tiên dùng field images giống Cart.js, fallback sang image từ chatbot
                    const images = getProductImages(
                      product.images || product.image
                    );

                    return (
                      <div key={index} className="product-card">
                        <a
                          href={`/product/${product.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <img
                            src={images[0]?.url || "/no-image.png"}
                            alt={product.name}
                            className="product-image"
                          />
                        </a>

                        <h5>{product.name}</h5>

                        <p className="product-price">
                          {product.price?.toLocaleString("vi-VN")} VNĐ
                        </p>

                        <p className="product-description">
                          {product.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <form onSubmit={handleSendMessage} className="chat-input-form">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type your message..."
              className="chat-input"
            />
            <button type="submit" className="send-button">
              Send
            </button>
          </form>
        </div>
      )}
      <button
        className="chat-icon"
        onClick={() => {
          if (onOpen) {
            onOpen();
          } else {
            toggleChat();
          }
        }}
      >
        <FaRobot />
      </button>
    </div>
  );
};

export default Bot;
