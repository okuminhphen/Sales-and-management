// @ts-nocheck
import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import {
  getProductById,
  getRecommendProducts,
  getRecommendProductsForUser,
} from "../../services/productService";
import { fetchSizes } from "../../store/slices/sizeSlice";
import { addReview, getReviewsByProductId } from "../../services/reviewService";
import { useDispatch, useSelector } from "react-redux";
import { addToCartAsync } from "../../store/slices/cartSlice";
import { toast } from "react-toastify";
import {
  FaStar,
  FaRegStar,
  FaPlus,
  FaMinus,
  FaShoppingCart,
  FaInfoCircle,
  FaPaperPlane,
  FaBox,
  FaHeart,
  FaRegHeart,
} from "react-icons/fa";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  addViewAPI,
  toggleLikeAPI,
  getLikeStatusAPI,
} from "../../services/behaviorService";
import "./ProductDetails.scss";

dayjs.extend(utc);
dayjs.extend(timezone);
const ProductDetail = () => {
  const dispatch = useDispatch<any>();
  const userId = useSelector((state: any) => state.user.currentUser?.userId);
  const { sizes } = useSelector((state: any) => state.size);

  const { id } = useParams(); // Lấy ID sản phẩm từ URL
  const [product, setProduct] = useState({
    description: [], // Initialize with empty array
  });
  const [quantity, setQuantity] = useState(1);
  const [selectedSizeId, setSelectedSizeId] = useState(null); // Size được chọn
  const [selectedStock, setSelectedStock] = useState(null);
  const [productSize, setProductSize] = useState(null);
  const [mainImage, setMainImage] = useState(null); // Ảnh chính
  const navigate = useNavigate();

  // Các state cho đánh giá và bình luận
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [reviews, setReviews] = useState([]);

  // State cho sản phẩm gợi ý
  const [recommendedProducts, setRecommendedProducts] = useState([]);

  // State cho sản phẩm bạn có thể thích
  const [topProducts, setTopProducts] = useState([]);

  // State cho nút thích
  const [isLiked, setIsLiked] = useState(false);
  const [isTogglingLike, setIsTogglingLike] = useState(false);

  const getProductDetails = useCallback(async () => {
    try {
      let response = await getProductById(id);
      if (response && response.data.EC === 0) {
        let productData = response.data.DT;
        console.log(productData);
        // Parse description từ JSON string
        try {
          if (productData.description) {
            const parsedDescription = JSON.parse(productData.description);
            productData.description = Array.isArray(parsedDescription)
              ? parsedDescription
              : [];
          } else {
            productData.description = [];
          }
        } catch (error) {
          console.error("Error parsing description:", error);
          productData.description = [];
        }
        setProduct(productData);
        setProductSize(productData.sizes);
      }
    } catch (e) {
      console.log(e);
    }
  }, [id]);

  const getReviews = useCallback(async () => {
    try {
      let response = await getReviewsByProductId(id);

      if (response && response.data.EC === 0) {
        setReviews(response.data.DT);
      }
    } catch (e) {
      console.log(e);
    }
  }, [id]);

  const getRecommendedProducts = useCallback(async () => {
    try {
      const response = await getRecommendProducts(id);
      if (response && response.data.DT) {
        // Lấy 5 sản phẩm đầu tiên trong danh sách gợi ý từ Flask
        const top5 = response.data.DT.slice(0, 5);
        setRecommendedProducts(top5);
      }
    } catch (error) {
      console.error("Lỗi lấy gợi ý sản phẩm:", error);
    }
  }, [id]);

  const getTopProductsData = useCallback(async () => {
    try {
      const response = await getRecommendProductsForUser(userId);
      console.log(response.data.DT);
      if (response && response.data.EC === 0) {
        setTopProducts(response.data.DT);
      }
    } catch (error) {
      console.error("Lỗi lấy top sản phẩm:", error);
    }
  }, [userId]);

  const addView = useCallback(async () => {
    try {
      const storedUser = sessionStorage.getItem("user"); // user được lưu khi login
      const user = storedUser ? JSON.parse(storedUser) : null;
      const userId = user?.userId;

      if (!userId) return; // Nếu chưa đăng nhập thì bỏ qua

      const response = await addViewAPI(id);
      console.log("✅ View recorded for product", response);
    } catch (error) {
      console.error("❌ Error adding view:", error);
    }
  }, [id]);

  const handleToggleLike = async () => {
    try {
      const storedUser = sessionStorage.getItem("user");
      const user = storedUser ? JSON.parse(storedUser) : null;
      const userId = user?.userId;

      if (!userId) {
        toast.warning("Bạn cần đăng nhập để thích sản phẩm!");
        navigate("/login");
        return;
      }

      setIsTogglingLike(true);
      const response = await toggleLikeAPI(id);

      if (response && response.data.EC === 0) {
        // Fetch lại trạng thái thích từ server để đảm bảo đồng bộ
        const oldLikeStatus = isLiked;
        await fetchLikeStatus();
        toast.success(
          oldLikeStatus ? "Đã bỏ thích sản phẩm" : "Đã thích sản phẩm"
        );
      } else {
        toast.error("Có lỗi xảy ra khi thích sản phẩm");
      }
    } catch (error) {
      console.error("❌ Error toggling like:", error);
      toast.error("Có lỗi xảy ra khi thích sản phẩm");
    } finally {
      setIsTogglingLike(false);
    }
  };

  const fetchLikeStatus = useCallback(async () => {
    try {
      const storedUser = sessionStorage.getItem("user");
      const user = storedUser ? JSON.parse(storedUser) : null;
      const userId = user?.userId;

      if (!userId) {
        setIsLiked(false);
        return;
      }

      const response = await getLikeStatusAPI(id);

      console.log("Like status response:", response.data);

      if (response && response.data.EC === 0) {
        setIsLiked(response.data.DT || false);
      } else {
        setIsLiked(false);
      }
    } catch (error) {
      console.error("❌ Error fetching like status:", error);
      setIsLiked(false);
    }
  }, [id]);

  useEffect(() => {
    getProductDetails();
    dispatch(fetchSizes());
    getReviews();
    getRecommendedProducts(id);
    getTopProductsData();
    addView();
    fetchLikeStatus();
    window.scrollTo(0, 0);
  }, [
    id,
    getProductDetails,
    getReviews,
    getRecommendedProducts,
    getTopProductsData,
    addView,
    fetchLikeStatus,
    dispatch,
  ]);

  const getProductImages = (images) => {
    if (!images) return [];
    let parsedImages = [];

    try {
      parsedImages = JSON.parse(images);
      if (typeof parsedImages === "string") {
        parsedImages = JSON.parse(parsedImages);
      }
    } catch (error) {
      console.error("Lỗi parse JSON:", error);
      return [];
    }

    // Chuẩn hóa: luôn trả về mảng object có dạng { url: string }
    if (!Array.isArray(parsedImages)) return [];

    return parsedImages
      .map((item) => {
        if (!item) return null;
        if (typeof item === "string") {
          return { url: item };
        }
        if (item.url) {
          return { url: item.url };
        }
        return null;
      })
      .filter(Boolean);
  };

  const handleQuantityChange = (change) => {
    if (change < 0 && quantity === 1) {
      return; // Không cho phép giảm dưới 1
    }

    const newQuantity = quantity + change;
    if (selectedStock !== null && newQuantity > selectedStock) {
      toast.warning(`Bạn chỉ có thể mua tối đa ${selectedStock} sản phẩm`);
      return;
    }

    setQuantity(newQuantity);
  };

  const handleQuantityInput = (e) => {
    const value = parseInt(e.target.value) || 1;
    if (value < 1) {
      setQuantity(1);
    } else if (selectedStock !== null && value > selectedStock) {
      setQuantity(selectedStock);
      toast.warning(`Bạn chỉ có thể mua tối đa ${selectedStock} sản phẩm`);
    } else {
      setQuantity(value);
    }
  };

  const handleAddToCart = async () => {
    if (!selectedSizeId) {
      toast.warning("Vui lòng chọn size!");
      return;
    }

    // Prepare cart item with product info
    const cartItem = {
      productId: product.id,
      sizeId: selectedSizeId,
      quantity: quantity,
      price: product.price,
      name: product.name,
      images: product.images,
      sizeName: sizes.find((s) => s.id === selectedSizeId)?.name || "",
    };

    // If user is logged in, include userId
    if (userId) {
      cartItem.userId = userId;
      cartItem.id = product.id;
    }

    // Add to cart (will use API if logged in, localStorage if not)
    dispatch(addToCartAsync(cartItem));
    toast.success("Đã thêm sản phẩm vào giỏ hàng!");
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!userId) {
      toast.warning("Bạn cần đăng nhập để đánh giá sản phẩm!");
      navigate("/login");
      return;
    }

    if (rating === 0) {
      toast.warning("Vui lòng chọn số sao đánh giá!");
      return;
    }

    const newReview = {
      productId: product.id,
      rating: rating,
      comment: comment,
      date: new Date().toISOString().split("T")[0],
    };

    let response = await addReview(newReview);

    if (response && response.data && +response.data.EC === 0) {
      await getReviews();
    }

    setRating(0);
    setComment("");
    toast.success("Cảm ơn bạn đã đánh giá sản phẩm!");
  };

  const renderStarRating = (value) => {
    return [...Array(5)].map((star, index) => {
      const ratingValue = index + 1;
      return (
        <span
          key={index}
          style={{
            color: ratingValue <= value ? "#ffc107" : "#e4e5e9",
            cursor: "pointer",
            fontSize: "1.2rem",
          }}
        >
          {ratingValue <= value ? <FaStar /> : <FaRegStar />}
        </span>
      );
    });
  };

  if (!product)
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p className="text-lg">Loading...</p>
      </div>
    );

  return (
    <div className="product-details-page">
      <div className="container">
        {/* Main Product Section */}
        <div className="product-main-section">
          <div className="row g-4">
            {/* Main Product Image & Thumbnails - Bên trái */}
            <div className="col-md-5">
              <div className="main-product-image">
                <img
                  src={
                    mainImage || getProductImages(product.images)[0]?.url || ""
                  }
                  alt={product.name}
                />
              </div>
              <div className="thumbnail-images">
                {getProductImages(product.images).map((img, index) => (
                  <img
                    key={index}
                    src={img.url}
                    alt={`Ảnh ${index + 1}`}
                    className={mainImage === img.url ? "active" : ""}
                    onClick={() => setMainImage(img.url)}
                  />
                ))}
              </div>
            </div>

            {/* Product Info - Bên phải */}
            <div className="col-md-6">
              <div className="product-info-section">
                <h1 className="product-title">{product.name}</h1>

                <div className="price-section">
                  <span className="price">
                    {product.price
                      ? product.price.toLocaleString("vi-VN")
                      : "0"}{" "}
                    VND
                  </span>
                  <span className="stock-badge">Còn hàng</span>
                </div>

                {/* Size Selection */}
                <div className="size-selection">
                  <h3>Chọn Size:</h3>
                  <div className="size-buttons">
                    {sizes.map((size, idx) => {
                      // Tìm size trong productSize (từ service: { sizeId, sizeName, stock })
                      const productSizeItem = productSize?.find(
                        (ps) => ps.sizeId === size.id
                      );
                      const stock = productSizeItem?.stock || 0;
                      const isAvailable = stock > 0;

                      return (
                        <button
                          key={idx}
                          type="button"
                          className={
                            selectedSizeId === size.id ? "selected" : ""
                          }
                          onClick={() => {
                            if (isAvailable) {
                              setSelectedSizeId(size.id);
                              setSelectedStock(stock);
                              setQuantity(1);
                            }
                          }}
                          disabled={!isAvailable}
                        >
                          {size.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Stock Info */}
                {selectedSizeId && selectedStock !== null && (
                  <div className="stock-info">
                    <FaBox />
                    <span>Số lượng tồn kho: {selectedStock}</span>
                  </div>
                )}

                {/* Quantity Selection */}
                <div className="quantity-selection">
                  <h3>Số lượng:</h3>
                  <div className="quantity-controls">
                    <button
                      onClick={() => handleQuantityChange(-1)}
                      disabled={quantity <= 1}
                    >
                      <FaMinus />
                    </button>
                    <input
                      type="number"
                      value={quantity}
                      onChange={handleQuantityInput}
                      min="1"
                      max={selectedStock || 1}
                    />
                    <button
                      onClick={() => handleQuantityChange(1)}
                      disabled={
                        selectedStock !== null && quantity >= selectedStock
                      }
                    >
                      <FaPlus />
                    </button>
                  </div>
                </div>

                {/* Add to Cart and Like Buttons */}
                <div className="action-buttons">
                  <button onClick={handleAddToCart} className="add-to-cart-btn">
                    <FaShoppingCart />
                    Thêm vào giỏ hàng
                  </button>

                  <button
                    onClick={handleToggleLike}
                    disabled={isTogglingLike}
                    className={`like-btn ${isLiked ? "liked" : ""}`}
                    title={isLiked ? "Bỏ thích" : "Thích sản phẩm"}
                  >
                    {isTogglingLike ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current"></div>
                    ) : isLiked ? (
                      <FaHeart />
                    ) : (
                      <FaRegHeart />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Product Description */}
        <div className="description-section">
          <div className="section-header">
            <FaInfoCircle />
            Mô tả sản phẩm
          </div>
          <div className="section-content">
            {Array.isArray(product.description) &&
            product.description.length > 0 ? (
              product.description.map((desc, index) => (
                <div key={index} className="description-item">
                  <div className="description-title">{desc.title}</div>
                  <div className="description-content">{desc.content}</div>
                </div>
              ))
            ) : (
              <p className="text-muted">Chưa có mô tả cho sản phẩm này.</p>
            )}
          </div>
        </div>

        {/* Reviews Section */}
        <div className="reviews-section">
          <div className="section-header">
            <FaStar />
            Đánh giá sản phẩm
          </div>
          <div className="section-content">
            {/* Review Form */}
            <div className="review-form">
              <h3>Viết đánh giá của bạn</h3>
              <form onSubmit={handleSubmitReview}>
                <div className="star-rating">
                  {[...Array(5)].map((star, index) => {
                    const ratingValue = index + 1;
                    return (
                      <span
                        key={index}
                        onClick={() => setRating(ratingValue)}
                        onMouseEnter={() => setHover(ratingValue)}
                        onMouseLeave={() => setHover(0)}
                        className="star"
                      >
                        {ratingValue <= (hover || rating) ? (
                          <FaStar style={{ color: "#ffc107" }} />
                        ) : (
                          <FaRegStar style={{ color: "#e0e0e0" }} />
                        )}
                      </span>
                    );
                  })}
                </div>

                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Chia sẻ trải nghiệm của bạn về sản phẩm này"
                  rows={3}
                />

                <button type="submit" className="submit-btn">
                  <FaPaperPlane />
                  Gửi đánh giá
                </button>
              </form>
            </div>

            {/* Reviews List */}
            <div>
              <h3 style={{ marginBottom: "1.5rem", fontWeight: 600 }}>
                Đánh giá từ khách hàng
              </h3>
              {reviews.length === 0 ? (
                <p className="text-muted">
                  Chưa có đánh giá nào cho sản phẩm này
                </p>
              ) : (
                <div>
                  {reviews.map((review) => (
                    <div key={review.id} className="review-item">
                      <div className="review-header">
                        <span className="reviewer-name">
                          {review.user?.username || "Ẩn danh"}
                        </span>
                        <span className="review-date">
                          {dayjs(review.createdAt)
                            .tz("Asia/Ho_Chi_Minh")
                            .format("DD/MM/YYYY HH:mm")}
                        </span>
                      </div>
                      <div className="review-rating">
                        <div className="flex gap-1">
                          {renderStarRating(review.rating)}
                        </div>
                        <span className="rating-badge">{review.rating}/5</span>
                      </div>
                      <p className="review-text">{review.reviewText}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recommended Products */}
        <div className="recommended-section">
          <div className="section-header">Sản phẩm gợi ý</div>
          <div className="section-content">
            {Array.isArray(recommendedProducts) &&
            recommendedProducts.length > 0 ? (
              <div className="products-grid">
                {recommendedProducts.map((recProduct, index) => (
                  <div
                    key={recProduct.product_id || `rec-${index}`}
                    className="product-card"
                    onClick={() =>
                      navigate(`/product/${recProduct.product_id}`)
                    }
                  >
                    <img
                      src={
                        getProductImages(recProduct.images)?.[0]?.url ||
                        "/uploads/default.jpg"
                      }
                      alt={recProduct.name}
                      className="product-image"
                    />
                    <div className="product-info">
                      <div className="product-name">{recProduct.name}</div>
                      <div className="product-price">
                        {recProduct.price?.toLocaleString("vi-VN")} VND
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted">Không có sản phẩm gợi ý.</p>
            )}
          </div>
        </div>

        {/* Top Products - Sản phẩm bạn có thể thích */}
        {/* <div className="recommended-section">
          <div className="section-header">Sản phẩm bạn có thể thích</div>
          <div className="section-content">
            {Array.isArray(topProducts) && topProducts.length > 0 ? (
              <div className="products-grid">
                {topProducts.map((product, index) => (
                  <div
                    key={product.id || `top-${index}`}
                    className="product-card"
                    onClick={() => navigate(`/product/${product.id}`)}
                  >
                    <img
                      src={
                        getProductImages(product.images)?.[0]?.url ||
                        "/uploads/default.jpg"
                      }
                      alt={product.name}
                      className="product-image"
                    />
                    <div className="product-info">
                      <div className="product-name">{product.name}</div>
                      <div className="product-price">
                        {product.price?.toLocaleString("vi-VN")} VND
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted">Không có sản phẩm nào.</p>
            )}
          </div>
        </div> */}
      </div>
    </div>
  );
};

export default ProductDetail;
