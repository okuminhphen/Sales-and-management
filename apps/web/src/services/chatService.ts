import axios from "../middlewares/axiosConfig";
import type { EntityId, RequestPayload } from "../types/http";

// Conversation APIs
const createConversation = () => {
  return axios.post("/conversation/create");
};

const getUserConversation = (userId: EntityId) => {
  return axios.get(`/conversation/user/${userId}`);
};

const getAllConversations = () => {
  return axios.get("/conversation/admin");
};

// Message APIs
const sendMessage = (conversationId: EntityId, data: RequestPayload) => {
  return axios.post(`/message/send/${conversationId}`, data);
};

const getMessages = (conversationId: EntityId) => {
  return axios.get(`/message/get/${conversationId}`);
};

export {
  createConversation,
  getUserConversation,
  getAllConversations,
  sendMessage,
  getMessages,
};
