export interface SizeDto {
  id: string;
  name: string;
}

export interface CreateSizeInput {
  name: string;
}

export interface UpdateSizeInput extends CreateSizeInput {
  id: string;
}

export interface ProductDto {
  id: string;
  name: string;
  description?: string | null;
  price: number | string;
  images?: string[] | string | null;
  categoryId?: string | null;
  sizes?: SizeDto[];
}

export interface RecommendationProductDto {
  product_id: string;
  name: string;
  description: string;
  price: string;
  images?: string[] | string | null;
  category_name: string;
}
