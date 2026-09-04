export interface SizeDto {
  id: number;
  name: string;
}

export interface CreateSizeInput {
  name: string;
}

export interface UpdateSizeInput extends CreateSizeInput {
  id: number;
}

export interface ProductDto {
  id: number;
  name: string;
  description?: string | null;
  price: number | string;
  images?: string[] | string | null;
  categoryId?: number | null;
  sizes?: SizeDto[];
}
