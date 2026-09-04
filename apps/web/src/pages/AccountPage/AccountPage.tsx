// @ts-nocheck
import React, { useState, useEffect } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import { useSelector, useDispatch } from "react-redux";
import { useParams } from "react-router-dom";
import { getUserById } from "../../services/userService";
import {
  updateUserThunk,
  updatePasswordThunk,
} from "../../store/slices/userSlice";
import { toast } from "react-toastify";
import "./AccountPage.scss";
const AccountPage = () => {
  const { userId } = useParams();
  const dispatch = useDispatch<any>();
  const defaultValidPassword = {
    isValidCurrentPassword: true,
    isValidNewPassword: true,
    isValidConfirmPassword: true,
  };
  const [validPassword, setValidPassword] = useState(defaultValidPassword);
  const [userInfo, setUserInfo] = useState({
    username: "",
    fullname: "",
    email: "",
    phone: "",
    address: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    fetchUserInfo();
  }, [userId]);

  const fetchUserInfo = async () => {
    const response = await getUserById(userId);
    const data = response.data.DT;

    setUserInfo({
      username: data.username || "",
      fullname: data.fullname || "",
      email: data.email || "",
      phone: data.phone || "",
      address: data.address || "",
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setUserInfo((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleUpdateProfile = (e) => {
    e.preventDefault();
    // TODO: Implement API call to update profile
    const updatedData = {
      fullname: userInfo.fullname,
      email: userInfo.email,
      phone: userInfo.phone,
      address: userInfo.address,
    };
    dispatch(updateUserThunk({ userId: Number(userId), updatedData }));
    toast.success("Thông tin cá nhân đã được cập nhật thành công!");
  };

  const handleUpdatePassword = (e) => {
    e.preventDefault();
    if (userInfo.currentPassword === "") {
      setValidPassword((prev) => ({
        ...prev,
        isValidCurrentPassword: false,
      }));
      toast.error("Mật khẩu hiện tại không được để trống!");
      return;
    }
    if (userInfo.newPassword === "") {
      setValidPassword((prev) => ({
        ...prev,
        isValidNewPassword: false,
      }));
      toast.error("Mật khẩu mới không được để trống!");
      return;
    }
    if (userInfo.confirmPassword === "") {
      setValidPassword((prev) => ({
        ...prev,
        isValidConfirmPassword: false,
      }));
      toast.error("Mật khẩu xác nhận không được để trống!");
      return;
    }

    // TODO: Implement API call to update password
    const updatedPassword = {
      currentPassword: userInfo.currentPassword,
      newPassword: userInfo.newPassword,
      confirmPassword: userInfo.confirmPassword,
    };
    if (updatedPassword.currentPassword === updatedPassword.newPassword) {
      toast.error("Mật khẩu mới không được trùng với mật khẩu hiện tại!");
      return;
    } else if (
      updatedPassword.newPassword !== updatedPassword.confirmPassword
    ) {
      toast.error("Mật khẩu mới và xác nhận mật khẩu không khớp!");
      return;
    }
    dispatch(updatePasswordThunk({ userId: Number(userId), updatedPassword }));
    setValidPassword(defaultValidPassword);
  };

  return (
    <div className="account-page">
      <div className="container">
        <div className="page-header">
          <h2>Thông tin tài khoản</h2>
          <p>Quản lý thông tin cá nhân và bảo mật tài khoản</p>
        </div>

        <div className="row">
          <div className="col-lg-8">
            <div className="account-card">
              <div className="card-header">
                <h5>Thông tin cá nhân</h5>
              </div>
              <div className="card-body">
                <form onSubmit={handleUpdateProfile}>
                  <div className="row">
                    <div className="col-md-6">
                      <div className="form-group">
                        <label>Tên đăng nhập</label>
                        <input
                          type="text"
                          className="form-control"
                          value={userInfo.username}
                          disabled
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <label>Họ và tên</label>
                        <input
                          type="text"
                          className="form-control"
                          name="fullname"
                          value={userInfo.fullname}
                          onChange={handleInputChange}
                          placeholder="Nhập họ và tên"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="row">
                    <div className="col-md-6">
                      <div className="form-group">
                        <label>Số điện thoại</label>
                        <input
                          type="text"
                          className="form-control"
                          name="phone"
                          value={userInfo.phone}
                          onChange={handleInputChange}
                          placeholder="Nhập số điện thoại"
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <label>Email</label>
                        <input
                          type="email"
                          className="form-control"
                          name="email"
                          value={userInfo.email}
                          onChange={handleInputChange}
                          placeholder="Nhập địa chỉ email"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Địa chỉ</label>
                    <textarea
                      className="form-control"
                      name="address"
                      rows="3"
                      value={userInfo.address}
                      onChange={handleInputChange}
                      placeholder="Nhập địa chỉ của bạn"
                    ></textarea>
                  </div>

                  <button type="submit" className="btn btn-primary">
                    Cập nhật thông tin
                  </button>
                </form>
              </div>
            </div>
          </div>

          <div className="col-lg-4">
            <div className="account-card">
              <div className="card-header">
                <h5>Đổi mật khẩu</h5>
              </div>
              <div className="card-body">
                <form onSubmit={handleUpdatePassword}>
                  <div className="form-group">
                    <label>Mật khẩu hiện tại</label>
                    <input
                      type="password"
                      className={`form-control ${
                        !validPassword.isValidCurrentPassword
                          ? "is-invalid"
                          : ""
                      }`}
                      name="currentPassword"
                      value={userInfo.currentPassword}
                      onChange={handleInputChange}
                      placeholder="Nhập mật khẩu hiện tại"
                    />
                  </div>

                  <div className="form-group">
                    <label>Mật khẩu mới</label>
                    <input
                      type="password"
                      className={`form-control ${
                        !validPassword.isValidNewPassword ? "is-invalid" : ""
                      }`}
                      name="newPassword"
                      value={userInfo.newPassword}
                      onChange={handleInputChange}
                      placeholder="Nhập mật khẩu mới"
                    />
                  </div>

                  <div className="form-group">
                    <label>Xác nhận mật khẩu mới</label>
                    <input
                      type="password"
                      className={`form-control ${
                        !validPassword.isValidConfirmPassword
                          ? "is-invalid"
                          : ""
                      }`}
                      name="confirmPassword"
                      value={userInfo.confirmPassword}
                      onChange={handleInputChange}
                      placeholder="Nhập lại mật khẩu mới"
                    />
                  </div>

                  <button type="submit" className="btn btn-primary w-100">
                    Đổi mật khẩu
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountPage;
