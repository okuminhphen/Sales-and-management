import type { Model, ModelStatic, Sequelize } from "sequelize";
import { createCatalogPersistenceModule } from "../../modules/catalog/persistence/catalog.models.js";
import {
    createCommercePersistenceModule,
    createPaymentFulfillmentPersistenceModule,
} from "../../modules/commerce/persistence/commerce-fulfillment.models.js";
import {
    createCommunicationAiPersistenceModule,
    createOutboxPersistenceModule,
    createPersonalizationPersistenceModule,
} from "../../modules/communication-ai/persistence/communication.models.js";
import { createIdentityAccessPersistenceModule } from "../../modules/identity-access/persistence/identity-access.models.js";
import { createInventoryTransferPersistenceModule } from "../../modules/inventory-transfer/persistence/inventory-transfer.models.js";
import {
    createV2Persistence,
    type V2ModelRegistry,
    type V2Persistence,
    type V2PersistenceModule,
} from "./persistence.js";

const persistenceBySequelize = new WeakMap<Sequelize, V2Persistence>();

const model = (registry: V2ModelRegistry, name: string): ModelStatic<Model> => registry.get(name);

const associateCrossModuleRelations = (registry: V2ModelRegistry): void => {
    const belongsTo = (sourceName: string, targetName: string, foreignKey: string, as: string): void => {
        model(registry, sourceName).belongsTo(model(registry, targetName), { foreignKey, as });
    };

    // Identity/access relations omitted from their owning module because the FK target is cross-module.
    belongsTo("AccountRole", "Branch", "branchId", "scopeBranch");

    // Catalog and commerce.
    belongsTo("Review", "Customer", "customerId", "customer");
    belongsTo("Review", "OrderItem", "orderItemId", "orderItem");
    belongsTo("Cart", "Customer", "customerId", "customer");
    belongsTo("CartItem", "ProductVariant", "productVariantId", "productVariant");
    belongsTo("Order", "Customer", "customerId", "customer");
    belongsTo("Order", "Branch", "fulfillmentBranchId", "fulfillmentBranch");
    belongsTo("Order", "Account", "createdByAccountId", "createdBy");
    belongsTo("Order", "Account", "cancelledByAccountId", "cancelledBy");
    belongsTo("OrderItem", "Product", "productId", "product");
    belongsTo("OrderItem", "ProductVariant", "productVariantId", "productVariant");
    belongsTo("OrderStatusHistory", "Account", "changedByAccountId", "changedBy");
    belongsTo("VoucherBranch", "Branch", "branchId", "branch");
    belongsTo("VoucherRedemption", "Customer", "customerId", "customer");

    // Payment and fulfillment.
    belongsTo("Payment", "Order", "orderId", "order");
    belongsTo("Payment", "Account", "collectedByAccountId", "collector");
    belongsTo("Shipment", "Order", "orderId", "order");
    belongsTo("Return", "Order", "orderId", "order");
    belongsTo("Return", "Branch", "receivingBranchId", "receivingBranch");
    belongsTo("Return", "Account", "createdByAccountId", "createdBy");
    belongsTo("Return", "Account", "approvedByAccountId", "approvedBy");
    belongsTo("Return", "Account", "processedByAccountId", "processedBy");
    belongsTo("ReturnItem", "OrderItem", "orderItemId", "orderItem");
    belongsTo("Refund", "Account", "requestedByAccountId", "requestedBy");
    belongsTo("Refund", "Account", "approvedByAccountId", "approvedBy");
    belongsTo("Refund", "Account", "processedByAccountId", "processedBy");

    // Inventory and transfer.
    belongsTo("Inventory", "Branch", "branchId", "branch");
    belongsTo("Inventory", "ProductVariant", "productVariantId", "productVariant");
    belongsTo("StockRequest", "Branch", "fromBranchId", "requestingBranch");
    belongsTo("StockRequest", "Branch", "toBranchId", "supplyingBranch");
    belongsTo("StockRequest", "Account", "createdByAccountId", "createdBy");
    belongsTo("StockRequest", "Account", "approvedByAccountId", "approvedBy");
    belongsTo("StockRequestItem", "ProductVariant", "productVariantId", "productVariant");
    belongsTo("StockRequestHistory", "Account", "performedByAccountId", "performedBy");
    belongsTo("TransferReceipt", "Branch", "fromBranchId", "fromBranch");
    belongsTo("TransferReceipt", "Branch", "toBranchId", "toBranch");
    belongsTo("TransferReceipt", "Account", "createdByAccountId", "createdBy");
    belongsTo("TransferReceipt", "Account", "approvedByAccountId", "approvedBy");
    belongsTo("TransferReceiptItem", "ProductVariant", "productVariantId", "productVariant");
    belongsTo("TransferHistory", "Account", "performedByAccountId", "performedBy");
    belongsTo("InventoryReservation", "OrderItem", "orderItemId", "orderItem");
    belongsTo("InventoryMovement", "Branch", "branchId", "branch");
    belongsTo("InventoryMovement", "ProductVariant", "productVariantId", "productVariant");
    belongsTo("InventoryMovement", "OrderItem", "orderItemId", "orderItem");
    belongsTo("InventoryMovement", "ReturnItem", "returnItemId", "returnItem");
    belongsTo("InventoryMovement", "Account", "createdByAccountId", "createdBy");

    // Communication and personalization.
    belongsTo("Conversation", "Customer", "customerId", "customer");
    belongsTo("Conversation", "Branch", "branchId", "branch");
    belongsTo("Conversation", "Account", "assignedAccountId", "assignedAccount");
    belongsTo("Conversation", "Account", "modeChangedByAccountId", "modeChangedBy");
    belongsTo("Message", "Account", "senderAccountId", "senderAccount");
    belongsTo("ConversationEvent", "Account", "actorAccountId", "actorAccount");
    belongsTo("ConversationEvent", "Account", "fromAssigneeId", "fromAssignee");
    belongsTo("ConversationEvent", "Account", "toAssigneeId", "toAssignee");
    belongsTo("ConversationEvent", "Branch", "fromBranchId", "fromBranch");
    belongsTo("ConversationEvent", "Branch", "toBranchId", "toBranch");
    belongsTo("ConversationReadState", "Account", "accountId", "account");
    belongsTo("Notification", "Account", "recipientAccountId", "recipientAccount");
    belongsTo("BehaviorEvent", "Customer", "customerId", "customer");
    belongsTo("BehaviorEvent", "Product", "productId", "product");
    belongsTo("CustomerProductStat", "Customer", "customerId", "customer");
    belongsTo("CustomerProductStat", "Product", "productId", "product");
};

const createModules = (sequelize: Sequelize): readonly V2PersistenceModule[] => [
    createIdentityAccessPersistenceModule(sequelize),
    createCatalogPersistenceModule(sequelize),
    createInventoryTransferPersistenceModule(sequelize),
    createCommercePersistenceModule(sequelize),
    createPaymentFulfillmentPersistenceModule(sequelize),
    createCommunicationAiPersistenceModule(sequelize),
    createPersonalizationPersistenceModule(sequelize),
    createOutboxPersistenceModule(sequelize),
];

export const createSalesV2Persistence = (sequelize: Sequelize): V2Persistence => {
    const existing = persistenceBySequelize.get(sequelize);
    if (existing) return existing;

    const persistence = createV2Persistence(sequelize, createModules(sequelize));
    associateCrossModuleRelations(persistence.models);
    persistenceBySequelize.set(sequelize, persistence);
    return persistence;
};
