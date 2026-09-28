import axios from "../middlewares/axiosConfig";
import type { ProductDto, RecommendationProductDto } from "../types/catalog";
import type { ApiEnvelope, EntityId } from "../types/http";

type ProductMutationResult = { id: string };
type SelectedSize = { sizeId: string | number };

const requiredText = (data: FormData, key: string): string => {
  const value = data.get(key);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`Missing product field: ${key}`);
  }
  return value;
};

const selectedSizes = (data: FormData): SelectedSize[] => {
  const value = data.get("sizes");
  if (typeof value !== "string") return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new TypeError("Invalid product sizes");
  return parsed.map((entry) => {
    if (!entry || typeof entry !== "object" || !("sizeId" in entry)) {
      throw new TypeError("Invalid product size");
    }
    const sizeId = (entry as { sizeId: unknown }).sizeId;
    if (!(typeof sizeId === "string" || typeof sizeId === "number")) {
      throw new TypeError("Invalid product size ID");
    }
    return { sizeId };
  });
};

const productMetadata = (data: FormData) => ({
  name: requiredText(data, "name"),
  price: requiredText(data, "price"),
  categoryId: requiredText(data, "categoryId"),
  description: typeof data.get("description") === "string"
    ? data.get("description") as string
    : null,
});

const productImages = (data: FormData): File[] =>
  data.getAll("images").filter((value): value is File => value instanceof File);

const variantSku = (productId: string, sizeId: string | number): string =>
  `HAPPY-${productId}-${String(sizeId)}`;

const syncVariants = async (productId: string, sizes: SelectedSize[]): Promise<void> => {
  const current = await axios.get<ApiEnvelope<Array<{ id: string; sizeId: string }>>>(
    `/product/${productId}/variants`,
  );
  const desired = new Set(sizes.map(({ sizeId }) => String(sizeId)));
  const existing = new Map(current.data.DT.map((variant) => [variant.sizeId, variant.id]));
  await Promise.all([
    ...sizes.filter(({ sizeId }) => !existing.has(String(sizeId))).map(({ sizeId }) =>
      axios.post(`/product/${productId}/variants`, {
        sizeId: String(sizeId),
        sku: variantSku(productId, sizeId),
        status: "active",
      })),
    ...current.data.DT.filter(({ sizeId }) => !desired.has(sizeId)).map(({ id }) =>
      axios.delete(`/product/${productId}/variants/${id}`)),
  ]);
};

const replaceImages = async (productId: string, images: File[]): Promise<void> => {
  if (images.length === 0) return;
  const media = new FormData();
  images.forEach((image) => media.append("images", image));
  await axios.put(`/product/${productId}/images`, media, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

const getProducts = () => {
  return axios.get<ApiEnvelope<ProductDto[]>>("/product/read");
};

const getProductById = (idProduct: EntityId) => {
  return axios.get<ApiEnvelope<ProductDto>>(`/product/${idProduct}`);
};

const deleteProduct = (productId: EntityId) => {
  return axios.delete<ApiEnvelope<null>>("/product/delete", { data: { id: productId } });
};

const updateProductAPI = (id: EntityId, formData: FormData) => {
  const productId = String(id);
  return axios.put<ApiEnvelope<ProductMutationResult>>(
    `/product/update/${productId}`,
    productMetadata(formData),
  ).then(async (response) => {
    await syncVariants(productId, selectedSizes(formData));
    await replaceImages(productId, productImages(formData));
    return response;
  });
};

const fetchCategory = () => {
  return axios.get("/category/read");
};

const createNewProduct = (formData: FormData) => {
  return axios.post<ApiEnvelope<ProductMutationResult>>("/product/create", {
    ...productMetadata(formData),
    status: "active",
  }).then(async (response) => {
    const productId = response.data.DT.id;
    try {
      await syncVariants(productId, selectedSizes(formData));
      await replaceImages(productId, productImages(formData));
      return response;
    } catch (error) {
      await axios.delete("/product/delete", { data: { id: productId } }).catch(() => undefined);
      throw error;
    }
  });
};

const getRecommendProducts = (productId: EntityId) => {
  return axios.get<ApiEnvelope<RecommendationProductDto[]>>(`/product/recommend/${productId}`);
};

const getRecommendProductsForUser = () => {
  return axios.get<ApiEnvelope<RecommendationProductDto[]>>("/recommend-product", {
    params: { num: 10 },
  });
};

export {
  createNewProduct,
  getProducts,
  fetchCategory,
  deleteProduct,
  updateProductAPI,
  getProductById,
  getRecommendProducts,
  getRecommendProductsForUser,
};
