import { configureStore } from "@reduxjs/toolkit";
import productReducer from "./slices/productSlice";
import cartReducer from "./slices/cartSlice"; // Nếu bạn có giỏ hàng
import userReducer from "./slices/userSlice";
import orderReducer from "./slices/orderSlice";
import branchReducer from "./slices/branchSlice";
import adminReducer from "./slices/adminSlice";
import adminAccountReducer from "./slices/adminAccountSlice";
import sizeReducer from "./slices/sizeSlice";
import inventoryReducer from "./slices/inventorySlice";
import employeeReducer from "./slices/employeeSlice";
import stockRequestReducer from "./slices/stockRequestSlice";
import transferReceiptReducer from "./slices/transferReceiptSlice";

const store = configureStore({
  reducer: {
    product: productReducer,
    cart: cartReducer, // Thêm nếu có giỏ hàng
    user: userReducer,
    orders: orderReducer,
    branch: branchReducer,
    admin: adminReducer,
    adminAccounts: adminAccountReducer,
    size: sizeReducer,
    inventory: inventoryReducer,
    employee: employeeReducer,
    stockRequest: stockRequestReducer,
    transferReceipt: transferReceiptReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;
