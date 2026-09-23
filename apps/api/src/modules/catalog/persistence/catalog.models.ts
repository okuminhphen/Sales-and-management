import {
    DataTypes,
    Model,
    type Optional,
    type Sequelize,
} from "sequelize";
import {
    v2ModelOptions,
    type V2PersistenceModule,
} from "../../../database/v2/persistence.js";

type Timestamps = { createdAt: Date; updatedAt: Date };
type BigIntId = string;
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type CategoryAttributes = Timestamps & {
    id: BigIntId; parentId: BigIntId | null; code: string; name: string; slug: string;
    description: string | null;
};
export type ProductAttributes = Timestamps & {
    id: BigIntId; categoryId: BigIntId; name: string; slug: string; description: string | null;
    basePrice: string; images: JsonValue | null; status: "draft" | "active" | "inactive";
};
export type SizeAttributes = Timestamps & { id: BigIntId; name: string };
export type ProductVariantAttributes = Timestamps & {
    id: BigIntId; productId: BigIntId; sizeId: BigIntId; sku: string;
    status: "draft" | "active" | "inactive";
};
export type ReviewAttributes = Timestamps & {
    id: BigIntId; customerId: BigIntId; productId: BigIntId; orderItemId: BigIntId | null;
    rating: number; reviewText: string | null;
};
export type BannerAttributes = Timestamps & {
    id: BigIntId; name: string; image: JsonValue | null; targetUrl: string | null;
    status: "draft" | "active" | "inactive";
};

type New<Attributes extends { id: unknown }> = Optional<Attributes, "id">;

const bigintId = () => ({ type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false });
const timestamps = {
    createdAt: { type: DataTypes.DATE, allowNull: false, field: "created_at" },
    updatedAt: { type: DataTypes.DATE, allowNull: false, field: "updated_at" },
};
const productStatus = () => DataTypes.ENUM("draft", "active", "inactive");

export const createCatalogPersistenceModule = (sequelize: Sequelize): V2PersistenceModule => {
    const Category = sequelize.define<Model<CategoryAttributes, New<CategoryAttributes>>>("Category", {
        id: bigintId(),
        parentId: { type: DataTypes.BIGINT, allowNull: true, field: "parent_id" },
        code: { type: DataTypes.STRING(50), allowNull: false },
        name: { type: DataTypes.STRING(255), allowNull: false },
        slug: { type: DataTypes.STRING(255), allowNull: false },
        description: { type: DataTypes.TEXT, allowNull: true },
        ...timestamps,
    }, v2ModelOptions("categories"));
    const Product = sequelize.define<Model<ProductAttributes, New<ProductAttributes>>>("Product", {
        id: bigintId(),
        categoryId: { type: DataTypes.BIGINT, allowNull: false, field: "category_id" },
        name: { type: DataTypes.STRING(255), allowNull: false },
        slug: { type: DataTypes.STRING(255), allowNull: false },
        description: { type: DataTypes.TEXT, allowNull: true },
        basePrice: { type: DataTypes.DECIMAL(19, 4), allowNull: false, field: "base_price" },
        images: { type: DataTypes.JSON, allowNull: true },
        status: { type: productStatus(), allowNull: false },
        ...timestamps,
    }, v2ModelOptions("products"));
    const Size = sequelize.define<Model<SizeAttributes, New<SizeAttributes>>>("Size", {
        id: bigintId(), name: { type: DataTypes.STRING(100), allowNull: false }, ...timestamps,
    }, v2ModelOptions("sizes"));
    const ProductVariant = sequelize.define<Model<ProductVariantAttributes, New<ProductVariantAttributes>>>("ProductVariant", {
        id: bigintId(),
        productId: { type: DataTypes.BIGINT, allowNull: false, field: "product_id" },
        sizeId: { type: DataTypes.BIGINT, allowNull: false, field: "size_id" },
        sku: { type: DataTypes.STRING(100), allowNull: false },
        status: { type: productStatus(), allowNull: false },
        ...timestamps,
    }, v2ModelOptions("product_variants"));
    const Review = sequelize.define<Model<ReviewAttributes, New<ReviewAttributes>>>("Review", {
        id: bigintId(),
        customerId: { type: DataTypes.BIGINT, allowNull: false, field: "customer_id" },
        productId: { type: DataTypes.BIGINT, allowNull: false, field: "product_id" },
        orderItemId: { type: DataTypes.BIGINT, allowNull: true, field: "order_item_id" },
        rating: { type: DataTypes.INTEGER, allowNull: false },
        reviewText: { type: DataTypes.TEXT, allowNull: true, field: "review_text" },
        ...timestamps,
    }, v2ModelOptions("reviews"));
    const Banner = sequelize.define<Model<BannerAttributes, New<BannerAttributes>>>("Banner", {
        id: bigintId(), name: { type: DataTypes.STRING(255), allowNull: false },
        image: { type: DataTypes.JSON, allowNull: true },
        targetUrl: { type: DataTypes.STRING(1000), allowNull: true, field: "target_url" },
        status: { type: productStatus(), allowNull: false },
        ...timestamps,
    }, v2ModelOptions("banners"));

    return {
        name: "catalog",
        models: [
            { name: "Category", model: Category }, { name: "Product", model: Product },
            { name: "Size", model: Size }, { name: "ProductVariant", model: ProductVariant },
            { name: "Review", model: Review }, { name: "Banner", model: Banner },
        ],
        associate: () => {
            Category.belongsTo(Category, { foreignKey: "parentId", as: "parent" });
            Category.hasMany(Category, { foreignKey: "parentId", as: "children" });
            Category.hasMany(Product, { foreignKey: "categoryId", as: "products" });
            Product.belongsTo(Category, { foreignKey: "categoryId", as: "category" });
            Product.hasMany(ProductVariant, { foreignKey: "productId", as: "variants" });
            ProductVariant.belongsTo(Product, { foreignKey: "productId", as: "product" });
            Size.hasMany(ProductVariant, { foreignKey: "sizeId", as: "productVariants" });
            ProductVariant.belongsTo(Size, { foreignKey: "sizeId", as: "size" });
            Product.hasMany(Review, { foreignKey: "productId", as: "reviews" });
            Review.belongsTo(Product, { foreignKey: "productId", as: "product" });
        },
    };
};
