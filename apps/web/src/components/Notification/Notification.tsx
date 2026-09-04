// @ts-nocheck
import React, { useState, useEffect } from "react";
import { Dropdown, Badge, Button } from "react-bootstrap";
import { FaBell } from "react-icons/fa";
import { API_BASE_URL } from "../../config/constants";
import "./Notification.scss";

const Notification = ({ adminInfo }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      const token = localStorage.getItem("admin_token");
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/notifications/my`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (data.EC === 0) {
        setNotifications(data.DT || []);
      }
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  };

  // Fetch unread count
  const fetchUnreadCount = async () => {
    try {
      const token = localStorage.getItem("admin_token");
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/notifications/count`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (data.EC === 0) {
        setUnreadCount(data.DT || 0);
      }
    } catch (error) {
      console.error("Error fetching unread count:", error);
    }
  };

  // Mark notification as read
  const markAsRead = async (notificationId) => {
    try {
      const token = localStorage.getItem("admin_token");
      if (!token) return;

      const response = await fetch(
        `${API_BASE_URL}/notifications/${notificationId}/read`,
        {
            method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();
      if (data.EC === 0) {
        setNotifications((prev) =>
          prev.map((notif) =>
            notif.id === notificationId ? { ...notif, isRead: true } : notif
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    try {
      const token = localStorage.getItem("admin_token");
      if (!token) return;

      const unreadNotifications = notifications.filter((n) => !n.isRead);
      for (const notification of unreadNotifications) {
        await markAsRead(notification.id);
      }
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
    }
  };

  // Format date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Vừa xong";
    if (minutes < 60) return `${minutes} phút trước`;
    if (hours < 24) return `${hours} giờ trước`;
    if (days < 7) return `${days} ngày trước`;
    return date.toLocaleDateString("vi-VN");
  };

  // Fetch on mount and set up polling
  useEffect(() => {
    if (adminInfo) {
      fetchNotifications();
      fetchUnreadCount();

      // Poll for new notifications every 30 seconds
      const interval = setInterval(() => {
        fetchUnreadCount();
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [adminInfo]);

  // Refresh notifications when dropdown opens
  useEffect(() => {
    if (showDropdown) {
      fetchNotifications();
    }
  }, [showDropdown]);

  if (!adminInfo) return null;

  return (
    <Dropdown
      show={showDropdown}
      onToggle={setShowDropdown}
      align="end"
      className="notification-dropdown-wrapper"
    >
      <Dropdown.Toggle
        variant="link"
        className="notification-toggle position-relative"
      >
        <FaBell />
        {unreadCount > 0 && (
          <Badge bg="danger" className="notification-badge" pill>
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
        )}
      </Dropdown.Toggle>

      <Dropdown.Menu className="notification-menu">
        <div className="notification-header">
          <h6 className="mb-0">Thông báo</h6>
          {unreadCount > 0 && (
            <Button
              variant="link"
              size="sm"
              className="mark-all-read-btn"
              onClick={(e) => {
                e.stopPropagation();
                markAllAsRead();
              }}
            >
              Đánh dấu tất cả đã đọc
            </Button>
          )}
        </div>

        <div className="notification-list">
          {notifications.length > 0 ? (
            notifications.slice(0, 10).map((notification) => (
              <Dropdown.Item
                key={notification.id}
                className={`notification-item ${
                  !notification.isRead ? "unread" : ""
                }`}
                onClick={() => {
                  if (!notification.isRead) {
                    markAsRead(notification.id);
                  }
                }}
              >
                <div className="notification-content">
                  <div className="notification-title">{notification.title}</div>
                  <div className="notification-text">
                    {notification.content}
                  </div>
                  <div className="notification-time">
                    {formatDate(notification.createdAt)}
                  </div>
                </div>
                {!notification.isRead && (
                  <div className="notification-indicator"></div>
                )}
              </Dropdown.Item>
            ))
          ) : (
            <div className="notification-empty">
              <p>Chưa có thông báo nào</p>
            </div>
          )}
        </div>

        {notifications.length > 10 && (
          <div className="notification-footer">
            <Button variant="link" size="sm" className="w-100">
              Xem tất cả thông báo
            </Button>
          </div>
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
};

export default Notification;
