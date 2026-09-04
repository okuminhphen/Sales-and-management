// @ts-nocheck
import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Card, Form, Button, InputGroup } from "react-bootstrap";
import { FaPaperPlane, FaComments, FaTimes } from "react-icons/fa";
import {
  createConversation,
  getUserConversation,
} from "../../services/chatService";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import { BACKEND_WEBHOOK } from "../../config/constants";
import "./ChatRealTime.scss";

const ChatRealTime = ({ isOpen: isOpenProp, onToggle, onOpen }) => {
  const { currentUser } = useSelector((state: any) => state.user);
  const [socket, setSocket] = useState(null);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const currentUserId = currentUser?.userId;

  // Sử dụng prop từ App.js hoặc fallback về state nội bộ
  const isOpen = isOpenProp !== undefined ? isOpenProp : false;

  // Kết nối socket khi component mount
  useEffect(() => {
    const s = io(BACKEND_WEBHOOK, {
      transports: ["websocket"],
      auth: { token: sessionStorage.getItem("token") },
      withCredentials: true,
    });

    s.on("connect", () => {
      console.log("Connected:", s.id);
    });

    s.on("newMessage", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    setSocket(s);
    return () => s.disconnect();
  }, []);

  // Load conversations khi có user
  useEffect(() => {
    if (currentUserId) {
      loadConversation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  // Join room khi chọn conversation
  useEffect(() => {
    if (!socket || !selectedConversation) return;

    socket.emit("join", selectedConversation.id);

    return () => socket.emit("leave", selectedConversation.id);
  }, [socket, selectedConversation]);

  // Auto scroll to bottom khi có message mới
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadConversation = async () => {
    try {
      setLoading(true);

      const res = await getUserConversation(currentUserId);
      if (res.data.EC !== 0) {
        toast.error("Không thể tải cuộc trò chuyện");
        return;
      }

      // ❗ Chưa có conversation → tạo mới
      if (!res.data.DT) {
        const created = await createConversation();

        if (created.data.EC !== 0) {
          toast.error("Không thể tạo cuộc trò chuyện");
          return;
        }

        setSelectedConversation(created.data.DT);
        setMessages([]);
        return;
      }

      // ✅ Đã có conversation
      setSelectedConversation(res.data.DT);
      setMessages(res.data.DT.messages || []);
    } catch (error) {
      console.error("Error loading conversation:", error);
      toast.error("Không thể tải cuộc trò chuyện");
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !socket) return;

    // Nếu chưa có conversation (user mới) thì tạo trước
    let conversation = selectedConversation;
    if (!conversation && currentUserId) {
      const created = await createConversation();
      if (created.data.EC === 0) {
        conversation = created.data.DT;
        setSelectedConversation(conversation);
      } else {
        toast.error("Không thể tạo cuộc trò chuyện");
        return;
      }
    }

    if (!conversation) return;

    const messageData = {
      conversationId: conversation.id,
      message: newMessage.trim(),
    };
    console.log(messageData);
    try {
      // Gửi qua socket (socket sẽ tự lưu vào DB)
      socket.emit("sendMessage", messageData);

      setNewMessage("");
      scrollToBottom();
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Không thể gửi tin nhắn");
    }
  };

  const formatTime = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return "Vừa xong";
    if (minutes < 60) return `${minutes} phút trước`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} giờ trước`;

    return date.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const isMyMessage = (message) => {
    return message.senderId === currentUserId;
  };

  // Không hiển thị nếu chưa đăng nhập
  if (!currentUserId) return null;

  return (
    <div className={`chat-widget ${isOpen ? "open" : "closed"}`}>
      {/* Nút toggle */}
      {!isOpen && (
        <Button
          className="chat-toggle-btn"
          variant="primary"
          onClick={() => {
            if (onOpen) {
              onOpen();
            } else if (onToggle) {
              onToggle(true);
            }
          }}
        >
          <FaComments size={18} className="me-2" />
          Hỗ trợ
        </Button>
      )}

      {isOpen && (
        <Card className="chat-box shadow">
          <Card.Header className="d-flex justify-content-between align-items-center">
            <div className="d-flex align-items-center">
              <FaComments className="me-2" />
              <div>
                <div className="fw-bold">Hỗ trợ trực tuyến</div>
                <small className="text-muted">Kết nối với hỗ trợ</small>
              </div>
            </div>
            <Button
              size="sm"
              variant="light"
              onClick={() => {
                if (onToggle) {
                  onToggle(false);
                }
              }}
              className="btn-close-chat"
            >
              <FaTimes />
            </Button>
          </Card.Header>

          <Card.Body className="p-0 d-flex flex-column">
            {/* Messages area */}
            <div className="messages-container flex-grow-1 p-3">
              {messages.length > 0 ? (
                messages.map((message, index) => {
                  const isMyMsg = isMyMessage(message);
                  return (
                    <div
                      key={message.id}
                      className={`message-wrapper mb-3 ${
                        isMyMsg ? "my-message" : "other-message"
                      }`}
                    >
                      <div
                        className={`message-bubble ${
                          isMyMsg ? "sent" : "received"
                        }`}
                      >
                        <div className="message-content">{message.message}</div>
                        <div className="message-time">
                          {formatTime(message.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-4 text-muted small">
                  Bắt đầu cuộc trò chuyện với chúng tôi!
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="message-input-area p-3 border-top">
              <Form onSubmit={handleSendMessage}>
                <InputGroup>
                  <Form.Control
                    type="text"
                    placeholder="Nhập tin nhắn..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                  />
                  <Button
                    variant="primary"
                    type="submit"
                    disabled={!newMessage.trim()}
                  >
                    <FaPaperPlane />
                  </Button>
                </InputGroup>
              </Form>
            </div>
          </Card.Body>
        </Card>
      )}
    </div>
  );
};

export default ChatRealTime;
